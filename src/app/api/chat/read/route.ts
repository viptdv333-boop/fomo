import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
