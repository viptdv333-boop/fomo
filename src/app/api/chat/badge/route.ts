import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET — the number on the messenger icon in the site header: unread personal messages plus unread messages in the
// болталка rooms the user follows (favourites and rooms with the bell on). Rooms the user never opened are not
// counted wholesale — otherwise a new account would see thousands.
// ?mute=id,id — conversations the user muted on this device (the mute list lives in the browser's localStorage): they do not count.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ dm: 0, rooms: 0, total: 0 });
  const userId = session.user.id;
  const muted = (new URL(req.url).searchParams.get("mute") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s))
    .slice(0, 100);

  const [dmRows, roomRows] = await Promise.all([
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "DirectMessage" m
      JOIN "DirectConversationParticipant" p ON p."conversationId" = m."conversationId" AND p."userId" = ${userId}
      WHERE m."isDeleted" = false
        AND m."senderId" != ${userId}
        AND m."createdAt" > p."lastReadAt"
        AND m."conversationId" <> ALL(${muted}::text[])
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      WITH followed AS (
        SELECT "roomId" FROM "ChatRoomFavorite" WHERE "userId" = ${userId}
        UNION
        SELECT "roomId" FROM "ChatRoomNotify" WHERE "userId" = ${userId}
      )
      SELECT COUNT(*)::bigint AS count
      FROM "ChatMessage" m
      JOIN followed f ON f."roomId" = m."roomId"
      LEFT JOIN "ChatRoomRead" r ON r."roomId" = m."roomId" AND r."userId" = ${userId}
      WHERE m."isDeleted" = false
        AND m."userId" != ${userId}
        AND r."lastReadAt" IS NOT NULL
        AND m."createdAt" > r."lastReadAt"
    `,
  ]);

  const dm = Number(dmRows[0]?.count ?? 0);
  const rooms = Number(roomRows[0]?.count ?? 0);
  return NextResponse.json({ dm, rooms, total: dm + rooms }, { headers: { "Cache-Control": "no-store" } });
}
