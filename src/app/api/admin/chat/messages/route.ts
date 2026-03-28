import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

// GET: List messages in a room (paginated)
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });

  const page = parseInt(request.nextUrl.searchParams.get("page") || "1");
  const limit = 50;

  const [messages, total] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    }),
    prisma.chatMessage.count({ where: { roomId } }),
  ]);

  return NextResponse.json({ messages, total, page, pages: Math.ceil(total / limit) });
}

// DELETE: Delete a specific message
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.chatMessage.delete({ where: { id } });

  return NextResponse.json({ message: "Deleted" });
}
