import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fomoId: string }> }
) {
  const { fomoId } = await params;

  const user = await prisma.user.findFirst({
    where: { fomoId },
    select: {
      id: true,
      displayName: true,
      fomoId: true,
      bio: true,
      avatarUrl: true,
      rating: true,
      specializations: true,
      _count: {
        select: {
          followers: true,
          ideas: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user);
}
