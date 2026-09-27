import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createNotification, notifyRoomSubscribers } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { canAccessRoom } from "@/lib/channel-access";
import { notifyChannelTelegramSubscribers } from "@/lib/telegram";
import { getT } from "@/lib/i18n/server";

const globalForIO = globalThis as unknown as { io: any };

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  // User-created private rooms (ownerId set) require membership. General/topic
  // rooms and paid-channel rooms (ownerId null either way) stay as they were.
  const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (room?.ownerId) {
    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId: session.user.id! } },
    });
    if (!membership) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (!(await canAccessRoom(prisma, roomId, session.user.id!))) {
    return NextResponse.json({ error: "Access denied", needSubscription: true }, { status: 403 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId, isDeleted: false },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          user: { select: { displayName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}

// POST: send message with optional replyToId
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const schema = z
    .object({
      roomId: z.string(),
      text: z.string().max(2000),
      // Only ever set from an /api/upload response, never user-typed — restrict
      // to that endpoint's own relative path shape so a client can't smuggle a
      // javascript:/data: URL in as an "attachment" link for other viewers to click.
      fileUrl: z.string().regex(/^\/uploads\//).optional(),
      fileName: z.string().max(255).optional(),
      fileType: z.enum(["image", "video", "audio", "document"]).optional(),
      replyToId: z.string().optional(),
    })
    .refine((data) => data.text.trim().length > 0 || data.fileUrl, {
      message: "Message text or file required",
    });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Chats were open at any rate a script could manage. 20 a minute is far above
  // human conversation and far below what makes a room unusable.
  const flood = await rateLimit(`chat:${session.user.id}`, 20, 60 * 1000);
  if (!flood.allowed) {
    const { t } = await getT();
    return NextResponse.json(
      { error: t("notif.err.chatFlood") },
      { status: 429 }
    );
  }

  const sender = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true },
  });
  if (!sender || sender.status === "BANNED") {
    const { t } = await getT();
    return NextResponse.json({ error: t("notif.err.accountBanned") }, { status: 403 });
  }

  // Check if room is closed
  const room = await prisma.chatRoom.findUnique({ where: { id: parsed.data.roomId } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.isClosed) {
    return NextResponse.json({ error: "Chat is closed" }, { status: 403 });
  }
  if (room.isArchived) {
    return NextResponse.json({ error: "Chat is archived" }, { status: 403 });
  }
  if (room.ownerId) {
    const membership = await prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: session.user.id! } },
    });
    if (!membership) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }
  if (!(await canAccessRoom(prisma, room.id, session.user.id!))) {
    return NextResponse.json({ error: "Access denied", needSubscription: true }, { status: 403 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      roomId: parsed.data.roomId,
      userId: session.user.id!,
      text: parsed.data.text,
      fileUrl: parsed.data.fileUrl || null,
      fileName: parsed.data.fileName || null,
      fileType: parsed.data.fileType || null,
      replyToId: parsed.data.replyToId || null,
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          user: { select: { displayName: true } },
        },
      },
    },
  });

  // Emit via Socket.IO to room
  const io = globalForIO.io;
  if (io) {
    io.to(parsed.data.roomId).emit("new_message", message);
  }

  // Paid-channel chat rooms (ChatRoom.channelTariff set) forward every
  // message — owner's manual trade/order updates included — to subscribers
  // who opted into Telegram forwarding for that channel.
  const channelTariff = await prisma.subscriptionTariff.findFirst({
    where: { channelRoomId: parsed.data.roomId },
    select: { id: true },
  });
  if (channelTariff) {
    // Rendered per recipient's language in telegram.ts, which also
    // HTML-escapes every var (name/text are raw user content here).
    const senderName = message.user.displayName;
    const attachmentKey =
      parsed.data.fileType === "image"
        ? "notif.tg.attachPhoto"
        : parsed.data.fileType === "video"
          ? "notif.tg.attachVideo"
          : parsed.data.fileUrl
            ? "notif.tg.attachFile"
            : null;
    const msgText = parsed.data.text;
    await notifyChannelTelegramSubscribers(
      channelTariff.id,
      msgText && attachmentKey
        ? { key: "notif.tg.chatMessageAttach", vars: { name: senderName, text: msgText, attachment: { key: attachmentKey } } }
        : { key: "notif.tg.chatMessage", vars: { name: senderName, text: attachmentKey ? { key: attachmentKey } : msgText } }
    ).catch(() => {});
  }

  const text = parsed.data.text;
  const senderName = message.user.displayName;
  const roomLink = room.ownerId ? `/rooms/${room.id}` : `/chat?room=${room.id}`;
  const bodyPreview = text.length > 80 ? text.slice(0, 80) + "…" : text;

  // @mentions — targeted, regardless of whether the mentioned user has the
  // room's bell on.
  const mentionRegex = /@(\S+)/g;
  const mentions = text.match(mentionRegex);
  const mentionedIds = new Set<string>();
  if (mentions) {
    const mentionNames = mentions.map((m: string) => m.slice(1).toLowerCase());
    const mentionedUsers = await prisma.user.findMany({
      where: {
        OR: [
          { displayName: { in: mentionNames, mode: "insensitive" } },
          { fomoId: { in: mentionNames, mode: "insensitive" } },
        ],
        id: { not: session.user.id! },
      },
      select: { id: true },
    });

    for (const u of mentionedUsers) {
      mentionedIds.add(u.id);
      await createNotification({
        userId: u.id,
        type: "chat_mention",
        title: { key: "notif.chatMention.title", vars: { name: senderName } },
        body: bodyPreview,
        link: roomLink,
      });
    }
  }

  // Everyone else who turned the room's bell on (болталка → 🔔) — every
  // message, not just mentions. Skip anyone already notified above.
  await notifyRoomSubscribers(
    room.id,
    [session.user.id!, ...mentionedIds],
    "chat_room_message",
    { key: "notif.roomMessage.title", vars: { name: senderName, room: room.name } },
    bodyPreview,
    roomLink
  ).catch(() => {});

  return NextResponse.json(message);
}
