import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { recalculateRating } from "@/lib/rating";
import { notifyLike } from "@/lib/like-notify-server";

type RouteContext = { params: Promise<{ id: string }> };

const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
  // The DESIRED state (offline outbox): true = «this vote must exist», false = «it must not». Without it the call is the old toggle.
  // Idempotent: a replayed request (lost reply, retry) changes nothing and notifies nobody a second time.
  state: z.boolean().optional(),
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

  const { value, state: desired } = parsed.data;
  const userId = session.user.id;

  // Verify idea exists
  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    select: { id: true, authorId: true, title: true },
  });

  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Check existing vote
  const existingVote = await prisma.ideaVote.findUnique({
    where: { userId_ideaId: { userId, ideaId } },
  });

  // a like is a NEW +1 (no vote before, or switched from -1); removing a like or any -1 never notifies
  let becameLike = false;
  if (existingVote) {
    if (desired === true && existingVote.value === value) {
      // already in the desired state: nothing to do
    } else if (desired === false && existingVote.value !== value) {
      // asked to remove a vote the user does not have (it was switched to the other value meanwhile): nothing to do
    } else if (existingVote.value === value) {
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
      becameLike = value === 1;
    }
  } else if (desired !== false) {
    // Create new vote
    await prisma.ideaVote.create({
      data: { userId, ideaId, value },
    });
    becameLike = value === 1;
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

  // Tell the author (not on self-likes; once per liker, bursts merged: src/lib/like-notify.ts). Never delays or fails the vote.
  if (becameLike && idea.authorId !== userId) {
    void notifyLike({ kind: "idea_like", ownerId: idea.authorId, actorId: userId, ideaId, quote: idea.title });
  }

  return NextResponse.json({ voteScore, userVote });
}
