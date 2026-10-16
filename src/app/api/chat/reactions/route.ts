import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recalculateRating } from "@/lib/rating";
import { canAccessRoom } from "@/lib/channel-access";

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
  // A reaction is a write into the room: a paid channel's chat is closed to a lapsed subscriber (and to everyone who is not one).
  if (!(await canAccessRoom(prisma, message.roomId, userId))) {
    return NextResponse.json({ error: "Access denied", needSubscription: true }, { status: 403 });
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

  // Only ❤️/👎 feed into reputation — every other emoji is decorative.
  if (emoji === "❤️" || emoji === "👎") {
    await recalculateRating(message.userId).catch(() => {});
  }

  return NextResponse.json({ reactions });
}
