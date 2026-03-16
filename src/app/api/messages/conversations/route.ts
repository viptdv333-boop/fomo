import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List user's conversations
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id!;

  const participantRecords = await prisma.directConversationParticipant.findMany({
    where: { userId },
    select: {
      conversationId: true,
      lastReadAt: true,
      conversation: {
        select: {
          id: true,
          updatedAt: true,
          participants: {
            select: {
              user: {
                select: { id: true, displayName: true, avatarUrl: true },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              text: true,
              createdAt: true,
              senderId: true,
            },
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: "desc" } },
  });

  const conversations = participantRecords.map((p) => {
    const conv = p.conversation;
    const otherUser = conv.participants.find(
      (pp) => pp.user.id !== userId
    )?.user;
    const lastMessage = conv.messages[0] || null;
    const unread = lastMessage && p.lastReadAt
      ? new Date(lastMessage.createdAt) > new Date(p.lastReadAt)
      : !!lastMessage && !p.lastReadAt;

    return {
      id: conv.id,
      updatedAt: conv.updatedAt,
      otherUser: otherUser || null,
      lastMessage,
      unread,
    };
  });

  return NextResponse.json(conversations);
}

// POST: Create or get existing conversation with a user
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId: targetUserId } = await request.json();
  const myId = session.user.id!;

  if (targetUserId === myId) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  // Check target user exists and has DM enabled
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, dmEnabled: true },
  });

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!targetUser.dmEnabled) {
    return NextResponse.json({ error: "User has disabled direct messages" }, { status: 403 });
  }

  // Check if conversation already exists
  const existing = await prisma.directConversation.findFirst({
    where: {
      AND: [
        { participants: { some: { userId: myId } } },
        { participants: { some: { userId: targetUserId } } },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ id: existing.id });
  }

  // Create new conversation
  const conversation = await prisma.directConversation.create({
    data: {
      participants: {
        create: [
          { userId: myId },
          { userId: targetUserId },
        ],
      },
    },
    select: { id: true },
  });

  return NextResponse.json({ id: conversation.id }, { status: 201 });
}
