import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BADGE_TYPES } from "@/lib/app-badges";

// GET — unread notifications of the session user grouped by type ({ byType: { new_comment: 2, price_alert: 1 } }), only the types that
// light a tab of the app dock (src/lib/app-badges.ts). One indexed GROUP BY (userId, isRead).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ byType: {} }, { status: 401 });

  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId: session.user.id, isRead: false, type: { in: [...BADGE_TYPES] } },
    _count: { _all: true },
  });
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.type] = r._count._all;
  return NextResponse.json({ byType }, { headers: { "Cache-Control": "no-store" } });
}
