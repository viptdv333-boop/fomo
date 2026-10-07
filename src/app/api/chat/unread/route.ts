import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — unread message count per room for the current user. A message counts
// as unread if it's newer than that room's ChatRoomRead.lastReadAt (or the
// room has no row there at all, i.e. never opened), and wasn't posted by the
// user themselves. One aggregate query rather than one per room.
// ?seen=1 (the app's list): only rooms the user has opened before count — a never-opened room would otherwise
// show every message it ever had (the dock badge leaves those out too). Also answers `mentions`: roomId -> unread
// @mentions / replies to the user (their notifications are read together with the room, see /api/chat/read).
export async function GET(req: Request) {
  const seenOnly = new URL(req.url).searchParams.get("seen") === "1";
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
      AND (${seenOnly}::boolean = false OR r."lastReadAt" IS NOT NULL)
    GROUP BY m."roomId"
  `;

  const generalRoom = await prisma.chatRoom.findFirst({ where: { isGeneral: true }, select: { id: true } });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.roomId] = Number(row.count);

  const mentions: Record<string, number> = {};
  try {
    const notes = await prisma.notification.groupBy({
      by: ["link"],
      where: { userId, isRead: false, type: { in: ["chat_mention", "chat_reply"] }, link: { not: null } },
      _count: { _all: true },
    });
    for (const n of notes) {
      const id = /^\/(?:chat\?room=|rooms\/)([^/?&#]+)/.exec(n.link || "")?.[1];
      if (id && counts[id]) mentions[id] = (mentions[id] || 0) + n._count._all;
    }
  } catch {
    /* the counts still work without the mention marker */
  }

  return NextResponse.json({ counts, mentions, generalRoomId: generalRoom?.id ?? null }, { headers: { "Cache-Control": "no-store" } });
}
