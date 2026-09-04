import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod/v4";

const createRoomSchema = z.object({
  name: z.string().min(1).max(60),
  description: z.string().max(300).optional(),
});

// GET — the current user's private rooms (owned + joined)
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const memberships = await prisma.chatRoomMember.findMany({
    where: { userId: session.user.id },
    include: {
      room: {
        select: {
          id: true,
          name: true,
          description: true,
          inviteToken: true,
          ownerId: true,
          _count: { select: { members: true } },
        },
      },
    },
    orderBy: { joinedAt: "desc" },
  });

  const rooms = memberships
    .filter((m) => m.room.ownerId) // defensive: this table is only ever populated for owned rooms
    .map((m) => {
      const isOwner = m.room.ownerId === session.user.id;
      return {
        id: m.room.id,
        name: m.room.name,
        description: m.room.description,
        membersCount: m.room._count.members,
        isOwner,
        inviteToken: isOwner ? m.room.inviteToken : undefined,
      };
    });

  return NextResponse.json(rooms);
}

// POST — create a new private room (any registered user)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Укажите название группы" }, { status: 400 });
  }

  const inviteToken = randomBytes(16).toString("base64url");

  const room = await prisma.chatRoom.create({
    data: {
      name: parsed.data.name.trim(),
      description: parsed.data.description?.trim() || null,
      isPrivate: true,
      ownerId: session.user.id,
      inviteToken,
      members: {
        create: { userId: session.user.id, role: "owner" },
      },
    },
  });

  return NextResponse.json(
    {
      id: room.id,
      name: room.name,
      description: room.description,
      inviteToken: room.inviteToken,
      membersCount: 1,
      isOwner: true,
    },
    { status: 201 }
  );
}
