import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { PrismaClient } from "@prisma/client";

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

    socket.on("join_room", async (roomId: string) => {
      const room = await prisma.chatRoom.findUnique({ where: { id: roomId } });
      if (!room) return;
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
          select: { id: true },
        });

        for (const u of mentionedUsers) {
          await prisma.notification.create({
            data: {
              userId: u.id,
              type: "chat_mention",
              title: `${socket.data.displayName} упомянул вас в болталке`,
              body: text.length > 80 ? text.slice(0, 80) + "…" : text,
              link: "/chat",
            },
          });
          io.to(`user_${u.id}`).emit("new_notification");
        }
      }
    });

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.data.displayName}`);
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

  return io;
}
