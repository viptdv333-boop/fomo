import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  return NextResponse.json(messages);
}
