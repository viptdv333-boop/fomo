import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived = req.nextUrl.searchParams.get("archived") === "true";

  const rooms = await prisma.chatRoom.findMany({
    where: includeArchived ? {} : { isArchived: false },
    include: {
      instrument: { select: { name: true, slug: true } },
      _count: { select: { messages: true } },
    },
    orderBy: [{ isGeneral: "desc" }, { name: "asc" }],
  });

  // Get unique user counts per room
  const roomIds = rooms.map((r) => r.id);
  const memberCounts = await prisma.chatMessage.groupBy({
    by: ["roomId"],
    where: { roomId: { in: roomIds } },
    _count: { userId: true },
  });

  // Get distinct user count per room
  const memberCountMap: Record<string, number> = {};
  for (const roomId of roomIds) {
    const distinctUsers = await prisma.chatMessage.findMany({
      where: { roomId },
      select: { userId: true },
      distinct: ["userId"],
    });
    memberCountMap[roomId] = distinctUsers.length;
  }

  return NextResponse.json(
    rooms.map((room) => ({
      id: room.id,
      name: room.name,
      isGeneral: room.isGeneral,
      isArchived: room.isArchived,
      isClosed: room.isClosed,
      instrumentSlug: room.instrument?.slug || null,
      messagesCount: room._count.messages,
      membersCount: memberCountMap[room.id] || 0,
    }))
  );
}

// Admin: archive/close/delete room
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { roomId, action } = await req.json();
  if (!roomId || !action) {
    return NextResponse.json({ error: "roomId and action required" }, { status: 400 });
  }

  switch (action) {
    case "archive":
      await prisma.chatRoom.update({ where: { id: roomId }, data: { isArchived: true } });
      break;
    case "unarchive":
      await prisma.chatRoom.update({ where: { id: roomId }, data: { isArchived: false } });
      break;
    case "close":
      await prisma.chatRoom.update({ where: { id: roomId }, data: { isClosed: true } });
      break;
    case "open":
      await prisma.chatRoom.update({ where: { id: roomId }, data: { isClosed: false } });
      break;
    case "delete":
      await prisma.chatRoom.delete({ where: { id: roomId } });
      break;
    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
