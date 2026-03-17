import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  // Get all users who have published at least one idea
  const authors = await prisma.user.findMany({
    where: {
      ideas: {
        some: {},
      },
    },
    select: {
      id: true,
      displayName: true,
      avatarUrl: true,
      _count: {
        select: { ideas: true },
      },
    },
    orderBy: { displayName: "asc" },
  });

  return NextResponse.json(
    authors.map((a) => ({
      id: a.id,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      ideasCount: a._count.ideas,
    }))
  );
}
