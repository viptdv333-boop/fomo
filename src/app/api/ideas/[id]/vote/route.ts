import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { recalculateRating } from "@/lib/rating";

type RouteContext = { params: Promise<{ id: string }> };

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: ideaId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { value } = parsed.data;
  const userId = session.user.id;

  // Verify idea exists
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { id: true, authorId: true },
  });

  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Check existing vote
  const existingVote = await prisma.ideaVote.findUnique({
    where: { userId_ideaId: { userId, ideaId } },
  });

  if (existingVote) {
    if (existingVote.value === value) {
      // Same value: toggle off (remove vote)
      await prisma.ideaVote.delete({
        where: { id: existingVote.id },
      });
    } else {
      // Different value: update
      await prisma.ideaVote.update({
        where: { id: existingVote.id },
        data: { value },
      });
    }
  } else {
    // Create new vote
    await prisma.ideaVote.create({
      data: { userId, ideaId, value },
    });
  }

  // Recalculate author rating
  await recalculateRating(idea.authorId);

  // Get updated vote score and user's current vote
  const votes = await prisma.ideaVote.findMany({
    where: { ideaId },
    select: { value: true, userId: true },
  });

  const voteScore = votes.reduce((sum, v) => sum + v.value, 0);
  const userVote = votes.find((v) => v.userId === userId)?.value ?? null;

  return NextResponse.json({ voteScore, userVote });
}
