import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalculateRating } from "@/lib/rating";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(
  _request: NextRequest,
  context: RouteContext
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: authorId } = await context.params;
  const followerId = session.user.id;

  if (followerId === authorId) {
    return NextResponse.json(
      { error: "Cannot follow yourself" },
      { status: 400 }
    );
  }

  // Verify author exists
  const author = await prisma.user.findUnique({
    where: { id: authorId },
    select: { id: true },
  });

  if (!author) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check existing follow
  const existingFollow = await prisma.follow.findUnique({
    where: { followerId_authorId: { followerId, authorId } },
  });

  let following: boolean;

  if (existingFollow) {
    // Unfollow
    await prisma.follow.delete({ where: { id: existingFollow.id } });
    following = false;
  } else {
    // Follow
    await prisma.follow.create({
      data: { followerId, authorId },
    });
    following = true;
  }

  // Recalculate author rating
  await recalculateRating(authorId);

  const followerCount = await prisma.follow.count({
    where: { authorId },
  });

  return NextResponse.json({ following, followerCount });
}
