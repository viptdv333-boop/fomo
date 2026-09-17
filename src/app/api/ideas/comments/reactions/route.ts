import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { recalculateRating } from "@/lib/rating";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { commentId, emoji } = await req.json();
  if (!commentId || (emoji !== "👍" && emoji !== "👎")) {
    return NextResponse.json({ error: "commentId and emoji (👍 or 👎) required" }, { status: 400 });
  }

  const userId = session.user.id!;
  const comment = await prisma.ideaComment.findUnique({ where: { id: commentId } });
  if (!comment || comment.isDeleted) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const reactions = (comment.reactions as Record<string, string[]>) || {};

  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }

  const index = reactions[emoji].indexOf(userId);
  if (index >= 0) {
    reactions[emoji].splice(index, 1);
    if (reactions[emoji].length === 0) {
      delete reactions[emoji];
    }
  } else {
    reactions[emoji].push(userId);
  }

  await prisma.ideaComment.update({
    where: { id: commentId },
    data: {
      reactions: Object.keys(reactions).length > 0
        ? (reactions as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
  });

  await recalculateRating(comment.userId).catch(() => {});

  return NextResponse.json({ reactions });
}
