import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BADGE_TYPES } from "@/lib/app-badges";
import { IDEA_UNREAD_TYPES, effectiveByType } from "@/lib/app-unread";
import { loadIdeaUnread } from "@/lib/unread-ideas";
import { isTerminalSite } from "@/lib/site-mode";

// GET — unread notifications of the session user grouped by type ({ byType: { new_comment: 2, price_alert: 1 } }), only the types that
// light a tab of the app dock (src/lib/app-badges.ts). One indexed GROUP BY (userId, isRead) for the types that do not point at an idea.
// The idea notifications (comments, replies, channel posts / comments) are counted row by row (their link names the idea):
//   - a comment / reply under a post of a channel is reported as `channel_comment` (it lights «Каналы», where the post and its badge are),
//   - notifications of an idea that no longer exists are dropped (nothing to open, the badge would never clear).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ byType: {} }, { status: 401 });
  const userId = session.user.id;

  // the terminal site has no ideas: only the plain GROUP BY there
  const ideaTypes: string[] = isTerminalSite() ? [] : [...IDEA_UNREAD_TYPES];
  const rows = await prisma.notification.groupBy({
    by: ["type"],
    where: { userId, isRead: false, type: { in: BADGE_TYPES.filter((t) => !ideaTypes.includes(t)) } },
    _count: { _all: true },
  });
  const others: Record<string, number> = {};
  for (const r of rows) others[r.type] = r._count._all;
  if (ideaTypes.length === 0) return NextResponse.json({ byType: others }, { headers: { "Cache-Control": "no-store" } });

  const { rows: ideaRows, tariffByIdea } = await loadIdeaUnread(userId);
  return NextResponse.json({ byType: effectiveByType(others, ideaRows, tariffByIdea) }, { headers: { "Cache-Control": "no-store" } });
}
