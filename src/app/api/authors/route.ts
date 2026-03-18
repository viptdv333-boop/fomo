import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const authors = await prisma.user.findMany({
    where: {
      ideas: { some: {} },
    },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      fomoId: true,
      rating: true,
      bio: true,
      createdAt: true,
      _count: {
        select: {
          ideas: true,
          subscriptionsReceived: true,
        },
      },
    },
    orderBy: { rating: "desc" },
  });

  return NextResponse.json(
    authors.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      fomoId: a.fomoId,
      rating: a.rating,
      bio: a.bio,
      createdAt: a.createdAt,
      ideasCount: a._count.ideas,
      subscribersCount: a._count.subscriptionsReceived,
    }))
  );
}
