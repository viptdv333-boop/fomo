import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — the last message of every болталка room the user can see (general chat, topic rooms and the user's own private groups).
// Feeds the room rows of the app's chat list («Автор: текст» and the time). Paid-channel rooms and private groups the user does
// not belong to are never included. One DISTINCT ON query, no per-room requests.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const rooms = await prisma.chatRoom.findMany({
    where: {
      isArchived: false,
      OR: [{ ownerId: null, isPrivate: false }, { members: { some: { userId } } }],
    },
    select: { id: true },
  });
  const ids = rooms.map((r) => r.id);
  if (!ids.length) return NextResponse.json({ previews: {} }, { headers: { "Cache-Control": "no-store" } });

  const rows = await prisma.$queryRaw<{ roomId: string; userId: string; text: string; fileName: string | null; createdAt: Date; displayName: string }[]>`
    SELECT DISTINCT ON (m."roomId") m."roomId", m."userId", m."text", m."fileName", m."createdAt", u."displayName"
    FROM "ChatMessage" m
    JOIN "User" u ON u."id" = m."userId"
    WHERE m."isDeleted" = false AND m."roomId" IN (${Prisma.join(ids)})
    ORDER BY m."roomId", m."createdAt" DESC
  `;

  const previews: Record<string, { userId: string; author: string; text: string; fileName: string | null; createdAt: string }> = {};
  for (const r of rows) {
    previews[r.roomId] = {
      userId: r.userId,
      author: r.displayName,
      text: r.text.slice(0, 160),
      fileName: r.fileName,
      createdAt: r.createdAt.toISOString(),
    };
  }
  return NextResponse.json({ previews }, { headers: { "Cache-Control": "no-store" } });
}
