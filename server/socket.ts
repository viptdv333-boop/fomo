import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { PrismaClient } from "@prisma/client";
import { priceStreamer } from "./price-streamer";
import { startAlertScheduler } from "./alert-scheduler";
import { startSubscriptionExpiryNotices } from "./subscription-expiry";
import { startCalendarReminders } from "./calendar-reminders";
import { canAccessRoom } from "../src/lib/channel-access";
import { translate } from "../src/lib/i18n/dictionaries";
import { dispatchNotification } from "../src/lib/notify-dispatch";

const prisma = new PrismaClient();

// Store io instance globally so API routes can access it
const globalForIO = globalThis as unknown as { io: SocketIOServer | undefined; onlineUsers: Map<string, number> | undefined };

/** Map<userId, connectionCount> — tracks which users are currently connected */
export function getOnlineUsers(): Map<string, number> {
  if (!globalForIO.onlineUsers) globalForIO.onlineUsers = new Map();
  return globalForIO.onlineUsers;
}

export function getIOInstance(): SocketIOServer | null {
  return globalForIO.io ?? null;
}

export function initSocket(httpServer: HTTPServer) {
  const io = new SocketIOServer(httpServer, {
    path: "/api/socketio",
    addTrailingSlash: false,
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  // Store globally
  globalForIO.io = io;

  io.use(async (socket, next) => {
    const userId = socket.handshake.auth.userId;
    if (!userId) {
      return next(new Error("Authentication required"));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, displayName: true, status: true },
    });

    if (!user || user.status !== "APPROVED") {
      return next(new Error("User not approved"));
    }

    socket.data.userId = user.id;
    socket.data.displayName = user.displayName;
    next();
  });

  io.on("connection", (socket) => {
    console.log(`User connected: ${socket.data.displayName}`);

    // Track online presence
    const onlineUsers = getOnlineUsers();
    const uid = socket.data.userId as string;
    onlineUsers.set(uid, (onlineUsers.get(uid) || 0) + 1);
    io.emit("user_online", uid);

    // Price streaming subscriptions
    const subscribedTickers = new Set<string>();

    socket.on("subscribe_prices", (tickers: string[]) => {
      if (!Array.isArray(tickers)) return;
      const valid = tickers.filter(t => typeof t === "string" && t.length > 0 && t.length < 20);
      for (const ticker of valid) {
        socket.join(`price_${ticker}`);
        subscribedTickers.add(ticker);
      }
      priceStreamer.subscribe(socket.id, valid);
    });

    socket.on("unsubscribe_prices", (tickers: string[]) => {
      if (!Array.isArray(tickers)) return;
      for (const ticker of tickers) {
        socket.leave(`price_${ticker}`);
        subscribedTickers.delete(ticker);
      }
      priceStreamer.unsubscribe(socket.id, tickers);
    });

    socket.on("join_room", async (roomId: string) => {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room) return;
      // User-created private rooms require membership; other room types
      // (general/topic, paid-channel) keep their existing open-by-id behavior.
      if (room.ownerId) {
        const membership = await prisma.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId, userId: socket.data.userId } },
        });
        if (!membership) return;
      }
      if (!(await canAccessRoom(prisma, roomId, socket.data.userId))) return;
      socket.join(roomId);
    });

    socket.on("leave_room", (roomId: string) => {
      socket.leave(roomId);
    });

    // Join personal notification room
    socket.join(`user_${socket.data.userId}`);

    // Join DM conversation rooms
    socket.on("join_conversation", (conversationId: string) => {
      socket.join(`conv_${conversationId}`);
    });

    socket.on("leave_conversation", (conversationId: string) => {
      socket.leave(`conv_${conversationId}`);
    });

    socket.on("send_message", async (data: { roomId: string; text: string }) => {
      const { roomId, text } = data;
      if (!text?.trim()) return;

      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room) return;

      const message = await prisma.chatMessage.create({
        data: {
          roomId,
          userId: socket.data.userId,
          text: text.trim(),
        },
        include: {
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
      });

      io.to(roomId).emit("new_message", message);

      // Check for @mentions in message text
      const mentionRegex = /@(\S+)/g;
      const mentions = text.match(mentionRegex);
      if (mentions) {
        const mentionNames = mentions.map((m) => m.slice(1).toLowerCase());
        const mentionedUsers = await prisma.user.findMany({
          where: {
            OR: [
              { displayName: { in: mentionNames, mode: "insensitive" } },
              { fomoId: { in: mentionNames, mode: "insensitive" } },
            ],
            id: { not: socket.data.userId },
          },
          select: { id: true, locale: true },
        });

        for (const u of mentionedUsers) {
          // Bell + push + the user's channels per their "mention" preferences
          // (the dispatcher also pings the socket room).
          await dispatchNotification({
            recipients: [u.id],
            type: "chat_mention",
            // In the mentioned user's own language (User.locale).
            title: translate(u.locale, "notif.chatMention.title", { name: socket.data.displayName }),
            body: text.length > 80 ? text.slice(0, 80) + "…" : text,
            link: "/chat",
          });
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.displayName}`);
      // Cleanup price subscriptions
      if (subscribedTickers.size > 0) {
        priceStreamer.unsubscribe(socket.id, [...subscribedTickers]);
      }
      const online = getOnlineUsers();
      const count = (online.get(uid) || 1) - 1;
      if (count <= 0) {
        online.delete(uid);
        io.emit("user_offline", uid);
      } else {
        online.set(uid, count);
      }
    });
  });

  // Real-time price streaming (Tinkoff poll every 2 s). No page subscribes to it right now
  // (the terminal is switched off), so it stays off unless PRICE_STREAM=1 is set.
  if (process.env.PRICE_STREAM === "1") priceStreamer.start(io);

  // Terminal price / line alerts (evaluates active PriceAlert rows every ~15 s; idle without any).
  if (process.env.ALERT_SCHEDULER !== "0") startAlertScheduler();

  // "Subscription ending soon" reminders (opt-in: SUBSCRIPTION_EXPIRY_NOTICE=1).
  startSubscriptionExpiryNotices();

  // Calendar reminders («колокольчик» on an event): sends "calendar_reminder" notifications when their time comes
  // (CalendarReminder rows; idle without any). CALENDAR_REMINDERS=0 switches it off.
  if (process.env.CALENDAR_REMINDERS !== "0") startCalendarReminders();

  return io;
}
