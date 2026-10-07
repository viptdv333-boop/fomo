import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET ?roomId= — where the user stopped reading that room (ChatRoomRead.lastReadAt; null = never opened). The app asks it BEFORE
// opening the room (opening marks it read) to put «Новые сообщения» above the first unread message.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });
  const row = await prisma.chatRoomRead.findUnique({ where: { userId_roomId: { userId: session.user.id, roomId } }, select: { lastReadAt: true } });
  return NextResponse.json({ lastReadAt: row?.lastReadAt ?? null }, { headers: { "Cache-Control": "no-store" } });
}

// POST — mark a room read up to now for the current user.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { roomId } = await req.json().catch(() => ({}));
  if (!roomId || typeof roomId !== "string") {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  await prisma.chatRoomRead.upsert({
    where: { userId_roomId: { userId: session.user.id, roomId } },
    create: { userId: session.user.id, roomId },
    update: { lastReadAt: new Date() },
  });

  // the mentions / replies of this room are read together with the room (they light the «Болталка» dock badge)
  await prisma.notification
    .updateMany({
      where: { userId: session.user.id, isRead: false, type: { in: ["chat_mention", "chat_reply"] }, link: { in: [`/chat?room=${roomId}`, `/rooms/${roomId}`] } },
      data: { isRead: true },
    })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
