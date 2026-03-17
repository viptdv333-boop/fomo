import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const messages = await prisma.chatMessage.findMany({
    where: { roomId, isDeleted: false },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          user: { select: { displayName: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json(messages);
}

// POST: send message with optional replyToId
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const schema = z.object({
    roomId: z.string(),
    text: z.string().min(1).max(2000),
    replyToId: z.string().optional(),
  });

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid data" }, { status: 400 });
  }

  // Check if room is closed
  const room = await prisma.chatRoom.findUnique({ where: { id: parsed.data.roomId } });
  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.isClosed) {
    return NextResponse.json({ error: "Chat is closed" }, { status: 403 });
  }
  if (room.isArchived) {
    return NextResponse.json({ error: "Chat is archived" }, { status: 403 });
  }

  const message = await prisma.chatMessage.create({
    data: {
      roomId: parsed.data.roomId,
      userId: session.user.id!,
      text: parsed.data.text,
      replyToId: parsed.data.replyToId || null,
    },
    include: {
      user: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      replyTo: {
        select: {
          id: true,
          text: true,
          user: { select: { displayName: true } },
        },
      },
    },
  });

  return NextResponse.json(message);
}
