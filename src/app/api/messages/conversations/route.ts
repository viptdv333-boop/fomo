import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateConversation } from "@/lib/direct-conversation";

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
                select: { id: true, displayName: true, avatarUrl: true, dmEnabled: true },
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

  // How many messages of the other side are unread per conversation (the app's list prints a number, the site only a dot).
  const unreadCounts = new Map<string, number>();
  try {
    const rows = await prisma.$queryRaw<{ conversationId: string; count: bigint }[]>`
      SELECT m."conversationId", COUNT(*)::bigint AS count
      FROM "DirectMessage" m
      JOIN "DirectConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
      WHERE m."isDeleted" = false AND m."senderId" != ${userId} AND m."createdAt" > p."lastReadAt"
      GROUP BY m."conversationId"
    `;
    for (const r of rows) unreadCounts.set(r.conversationId, Number(r.count));
  } catch {
    /* the list still works with the unread flag alone */
  }

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
      unreadCount: unreadCounts.get(conv.id) ?? 0,
    };
  });

  // one row per person: empty duplicate conversations of the same pair (left by the old race in creating them) are not listed while the pair has another one
  const byOther = new Map<string, typeof conversations>();
  for (const c of conversations) {
    const k = c.otherUser?.id ?? c.id;
    byOther.set(k, [...(byOther.get(k) ?? []), c]);
  }
  const listed = new Set<string>();
  for (const group of byOther.values()) {
    const filled = group.filter((c) => c.lastMessage);
    for (const c of filled.length > 0 ? filled : group.slice(0, 1)) listed.add(c.id);
  }
  return NextResponse.json(conversations.filter((c) => listed.has(c.id)));
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

  // the existing conversation of the pair, or a new one (serialized: two simultaneous requests cannot create two)
  const conv = await getOrCreateConversation(myId, targetUserId);
  return NextResponse.json({ id: conv.id }, conv.created ? { status: 201 } : undefined);
}
