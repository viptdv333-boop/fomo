import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// GET — room info for a member (used by the room's chat page)
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.chatRoom.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      isClosed: true,
      isArchived: true,
      ownerId: true,
      inviteToken: true,
      _count: { select: { members: true } },
    },
  });
  if (!room || !room.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const isOwner = room.ownerId === session.user.id;
  return NextResponse.json({
    id: room.id,
    name: room.name,
    description: room.description,
    isClosed: room.isClosed,
    isArchived: room.isArchived,
    membersCount: room._count.members,
    isOwner,
    inviteToken: isOwner ? room.inviteToken : undefined,
  });
}

// DELETE — owner deletes the room (cascades members + messages)
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const room = await prisma.chatRoom.findUnique({ where: { id }, select: { ownerId: true } });
  if (!room || !room.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (room.ownerId !== session.user.id) {
    return NextResponse.json({ error: "Только владелец может удалить комнату" }, { status: 403 });
  }

  await prisma.chatRoom.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
