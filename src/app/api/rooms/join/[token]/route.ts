import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications";

type RouteContext = { params: Promise<{ token: string }> };

// GET — preview a room by its invite token, before actually joining
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const room = await prisma.chatRoom.findUnique({
    where: { inviteToken: token },
    select: {
      id: true,
      name: true,
      description: true,
      ownerId: true,
      owner: { select: { displayName: true } },
      _count: { select: { members: true } },
    },
  });
  if (!room || !room.ownerId) {
    return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 });
  }

  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
  });

  return NextResponse.json({
    id: room.id,
    name: room.name,
    description: room.description,
    ownerName: room.owner?.displayName || null,
    membersCount: room._count.members,
    alreadyMember: !!membership,
  });
}

// POST — join the room via its invite token
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await params;
  const room = await prisma.chatRoom.findUnique({
    where: { inviteToken: token },
    select: { id: true, name: true, ownerId: true },
  });
  if (!room || !room.ownerId) {
    return NextResponse.json({ error: "Ссылка недействительна" }, { status: 404 });
  }

  const existing = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: session.user.id } },
  });
  if (existing) {
    return NextResponse.json({ roomId: room.id, ok: true });
  }

  await prisma.chatRoomMember.create({
    data: { roomId: room.id, userId: session.user.id, role: "member" },
  });

  if (room.ownerId !== session.user.id) {
    const joiner = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { displayName: true },
    });
    await createNotification({
      userId: room.ownerId,
      type: "room_join",
      title: `${joiner?.displayName || "Пользователь"} присоединился к приватной группе «${room.name}»`,
      link: `/rooms/${room.id}`,
    });
  }

  return NextResponse.json({ roomId: room.id, ok: true });
}
