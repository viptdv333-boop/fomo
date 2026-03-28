import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/roles";

// GET: List all chat rooms with message counts
export async function GET() {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rooms = await prisma.chatRoom.findMany({
    orderBy: [{ isGeneral: "desc" }, { categoryLabel: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { messages: true } },
      instrument: { select: { id: true, name: true, ticker: true } },
    },
  });

  return NextResponse.json(rooms);
}

// POST: Create a new chat room
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { name, categoryLabel, sortOrder } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const room = await prisma.chatRoom.create({
    data: {
      name,
      categoryLabel: categoryLabel || null,
      sortOrder: sortOrder || 0,
    },
  });

  return NextResponse.json(room, { status: 201 });
}

// PUT: Update a chat room
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { id, name, categoryLabel, sortOrder, isArchived, isClosed } = body;

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const room = await prisma.chatRoom.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(categoryLabel !== undefined && { categoryLabel }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isArchived !== undefined && { isArchived }),
      ...(isClosed !== undefined && { isClosed }),
    },
  });

  return NextResponse.json(room);
}

// DELETE: Delete a chat room (and all its messages)
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user || !isAdmin(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Prevent deleting general chat
  const room = await prisma.chatRoom.findUnique({ where: { id } });
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.isGeneral) return NextResponse.json({ error: "Cannot delete general chat" }, { status: 400 });

  // Delete all messages first
  await prisma.chatMessage.deleteMany({ where: { roomId: id } });
  await prisma.chatRoom.delete({ where: { id } });

  return NextResponse.json({ message: "Deleted" });
}
