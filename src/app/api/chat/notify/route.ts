import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";
import { canAccessRoom } from "@/lib/channel-access";

// GET — every roomId the current user gets "notify on every message" for.
// Fetched once on load (ChatSidebar) instead of per-room, so opening a room
// doesn't need its own round trip to know the bell's state.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.chatRoomNotify.findMany({
    where: { userId: session.user.id },
    select: { roomId: true },
  });
  return NextResponse.json({ roomIds: rows.map((r) => r.roomId) });
}

const bodySchema = z.object({
  roomId: z.string(),
  enabled: z.boolean(),
});

// POST — toggle the bell for one room.
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { roomId, enabled } = parsed.data;
  const userId = session.user.id;

  if (enabled) {
    // Subscribing must require the same access as reading the room — every
    // message's preview text goes into the notification/push payload, so
    // this is a real read path into a private or paid-channel room, not
    // just a UI preference.
    const room = await prisma.chatRoom.findUnique({ where: { id: roomId }, select: { ownerId: true } });
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.ownerId) {
      const membership = await prisma.chatRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!(await canAccessRoom(prisma, roomId, userId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.chatRoomNotify.upsert({
      where: { userId_roomId: { userId, roomId } },
      create: { userId, roomId },
      update: {},
    });
  } else {
    await prisma.chatRoomNotify.deleteMany({ where: { userId, roomId } });
  }

  return NextResponse.json({ ok: true, enabled });
}
