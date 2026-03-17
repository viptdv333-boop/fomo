import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, emoji } = await req.json();
  if (!messageId || !emoji) {
    return NextResponse.json({ error: "messageId and emoji required" }, { status: 400 });
  }

  const userId = session.user.id!;
  const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // reactions is stored as { "emoji": ["userId1", "userId2"] }
  const reactions = (message.reactions as Record<string, string[]>) || {};

  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }

  const index = reactions[emoji].indexOf(userId);
  if (index >= 0) {
    // Remove reaction (toggle off)
    reactions[emoji].splice(index, 1);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    // Add reaction
    reactions[emoji].push(userId);
  }

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      reactions: Object.keys(reactions).length > 0
        ? (reactions as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  return NextResponse.json({ reactions });
}
