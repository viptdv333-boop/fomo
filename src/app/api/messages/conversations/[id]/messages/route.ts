import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

const globalForIO = globalThis as unknown as { io: any };

type RouteContext = { params: Promise<{ id: string }> };

// GET: List messages in a conversation
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const userId = session.user.id!;

  // Verify user is participant
  const participant = await prisma.directConversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = 50;

  const messages = await prisma.directMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      text: true,
      fileUrl: true,
      fileName: true,
      fileType: true,
      createdAt: true,
      senderId: true,
      replyToId: true,
      isPinned: true,
      isDeleted: true,
      reactions: true,
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          sender: { select: { displayName: true } },
        },
      },
    },
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  // Update lastReadAt
  await prisma.directConversationParticipant.update({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    data: { lastReadAt: new Date() },
  });

  return NextResponse.json({
    messages: messages.reverse(),
    hasMore,
    nextCursor: hasMore ? messages[0]?.id : null,
  });
}

// POST: Send a message
export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  const userId = session.user.id!;

  // Verify user is participant
  const participant = await prisma.directConversationParticipant.findUnique({
    where: {
      conversationId_userId: { conversationId, userId },
    },
  });

  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const { text, replyToId, fileUrl, fileName, fileType } = await request.json();
  if ((!text || typeof text !== "string" || text.trim().length === 0) && !fileUrl) {
    return NextResponse.json({ error: "Text or file required" }, { status: 400 });
  }

  const message = await prisma.directMessage.create({
    data: {
      conversationId,
      senderId: userId,
      text: text?.trim() || "",
      ...(replyToId ? { replyToId } : {}),
      ...(fileUrl ? { fileUrl, fileName, fileType } : {}),
    },
    select: {
      id: true,
      text: true,
      fileUrl: true,
      fileName: true,
      fileType: true,
      createdAt: true,
      senderId: true,
      replyToId: true,
      isPinned: true,
      isDeleted: true,
      reactions: true,
      sender: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          sender: { select: { displayName: true } },
        },
      },
    },
  });

  // Update conversation updatedAt
  await prisma.directConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Update sender's lastReadAt
  await prisma.directConversationParticipant.update({
    where: {
      conversationId_userId: { conversationId, userId },
    },
    data: { lastReadAt: new Date() },
  });

  // Emit via Socket.IO to conversation room
  const io = globalForIO.io;
  if (io) {
    io.to(`conv_${conversationId}`).emit("new_dm", message);
  }

  // Notify other participants about new message
  const otherParticipants = await prisma.directConversationParticipant.findMany({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });

  const senderName = message.sender.displayName;
  const preview = message.text
    ? message.text.length > 80
      ? message.text.slice(0, 80) + "…"
      : message.text
    : "Файл";

  for (const p of otherParticipants) {
    await createNotification({
      userId: p.userId,
      type: "new_message",
      title: `Сообщение от ${senderName}`,
      body: preview,
      link: "/messages",
    });
  }

  return NextResponse.json(message, { status: 201 });
}
