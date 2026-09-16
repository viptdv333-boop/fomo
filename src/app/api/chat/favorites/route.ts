import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const favorites = await prisma.chatRoomFavorite.findMany({
    where: { userId: session.user.id! },
    include: {
      room: {
        select: { id: true, name: true, isGeneral: true, ownerId: true, asset: { select: { slug: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    favorites
      .filter((f) => f.room)
      .map((f) => ({
        roomId: f.room.id,
        name: f.room.name,
        isPrivate: Boolean(f.room.ownerId),
        assetSlug: f.room.asset?.slug ?? null,
      }))
  );
}

const bodySchema = z.object({ roomId: z.string().min(1) });

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const room = await prisma.chatRoom.findUnique({ where: { id: parsed.data.roomId }, select: { id: true } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  await prisma.chatRoomFavorite.upsert({
    where: { userId_roomId: { userId: session.user.id!, roomId: parsed.data.roomId } },
    create: { userId: session.user.id!, roomId: parsed.data.roomId },
    update: {},
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomId = request.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  await prisma.chatRoomFavorite.deleteMany({
    where: { userId: session.user.id!, roomId },
  });

  return NextResponse.json({ ok: true });
}
