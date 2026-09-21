import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { createNotification } from "@/lib/notifications";
import { rateLimit } from "@/lib/rate-limit";
import { canAccessRoom } from "@/lib/channel-access";
import { notifyChannelTelegramSubscribers, escapeTelegramHtml } from "@/lib/telegram";

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
    return NextResponse.json(
      { error: "Слишком много сообщений. Подождите немного" },
      { status: 429 }
    );
  }

  const sender = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true },
  });
  if (!sender || sender.status === "BANNED") {
    return NextResponse.json({ error: "Аккаунт заблокирован" }, { status: 403 });
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
    const senderName = message.user.displayName;
    const attachmentLabel =
      parsed.data.fileType === "image" ? "🖼 фото" : parsed.data.fileType === "video" ? "🎬 видео" : parsed.data.fileUrl ? "📎 файл" : "";
    const body = [escapeTelegramHtml(parsed.data.text), attachmentLabel].filter(Boolean).join(" ");
    await notifyChannelTelegramSubscribers(
      channelTariff.id,
      `💬 <b>${escapeTelegramHtml(senderName)}</b>: ${body}`
    ).catch(() => {});
  }

  // Check for @mentions
  const text = parsed.data.text;
  const mentionRegex = /@(\S+)/g;
  const mentions = text.match(mentionRegex);
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

    const senderName = message.user.displayName;
    const mentionLink = room.ownerId ? `/rooms/${room.id}` : "/chat";
    for (const u of mentionedUsers) {
      await createNotification({
        userId: u.id,
        type: "chat_mention",
        title: `${senderName} упомянул вас в болталке`,
        body: text.length > 80 ? text.slice(0, 80) + "…" : text,
        link: mentionLink,
      });
    }
  }

  return NextResponse.json(message);
}
