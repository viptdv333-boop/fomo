import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

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
