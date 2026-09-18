import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — unread message count per room for the current user. A message counts
// as unread if it's newer than that room's ChatRoomRead.lastReadAt (or the
// room has no row there at all, i.e. never opened), and wasn't posted by the
// user themselves. One aggregate query rather than one per room.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const rows = await prisma.$queryRaw<{ roomId: string; count: bigint }[]>`
    SELECT m."roomId", COUNT(*)::bigint AS count
    FROM "ChatMessage" m
    LEFT JOIN "ChatRoomRead" r ON r."roomId" = m."roomId" AND r."userId" = ${userId}
    WHERE m."isDeleted" = false
      AND m."userId" != ${userId}
      AND m."createdAt" > COALESCE(r."lastReadAt", '1970-01-01'::timestamp)
    GROUP BY m."roomId"
  `;

  const generalRoom = await prisma.chatRoom.findFirst({ where: { isGeneral: true }, select: { id: true } });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.roomId] = Number(row.count);

  return NextResponse.json({ counts, generalRoomId: generalRoom?.id ?? null });
}
