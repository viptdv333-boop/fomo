import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

// POST — a member leaves the room. The owner must delete the room instead,
// so a room can never end up ownerless with orphaned members.
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const membership = await prisma.chatRoomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: session.user.id } },
  });
  if (!membership) return NextResponse.json({ error: "Вы не участник этой группы" }, { status: 404 });
  if (membership.role === "owner") {
    return NextResponse.json(
      { error: "Владелец не может выйти из группы — удалите её вместо этого" },
      { status: 400 }
    );
  }

  await prisma.chatRoomMember.delete({ where: { id: membership.id } });
  return NextResponse.json({ ok: true });
}
