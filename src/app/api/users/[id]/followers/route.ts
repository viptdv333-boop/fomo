import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (session.user.id !== id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const follows = await prisma.follow.findMany({
    where: { authorId: id },
    include: {
      follower: {
        select: { id: true, displayName: true, avatarUrl: true, fomoId: true, rating: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    follows.map((f) => ({
      id: f.follower.id,
      displayName: f.follower.displayName,
      avatarUrl: f.follower.avatarUrl,
      fomoId: f.follower.fomoId,
      rating: Number(f.follower.rating),
      followedAt: f.createdAt,
    }))
  );
}
