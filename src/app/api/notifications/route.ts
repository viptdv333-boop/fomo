import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { typesForTab } from "@/lib/app-badges";
import { markChannelRead, markIdeaRead } from "@/lib/unread-ideas";
import { isTerminalSite } from "@/lib/site-mode";
import { rateLimit } from "@/lib/rate-limit";
import { INBOX_HIDDEN_TYPES, clampLimit, decodeCursor, encodeCursor } from "@/lib/notif-inbox";

// The bell polls this route every 30 s, so only the app's «Уведомления» list (inbox=1 / cursor / countOnly) and the writes are rate limited.
const READ_RATE = { limit: 240, windowMs: 60_000 };
const WRITE_RATE = { limit: 120, windowMs: 60_000 };
/// ids of one PATCH: a page of the list is 50 rows
const MAX_IDS = 200;

// GET: list user notifications, newest first.
//   ?limit=<1..50>             page size (default 20)
//   ?unreadOnly=true           only unread rows
//   ?inbox=1                   the app's «Уведомления» list: leaves out the chat types the chat badge owns (INBOX_HIDDEN_TYPES), and so does `unreadCount`
//   ?cursor=<createdAt-ms>.<id> the next page: rows older than the last row of the previous one (keyset, stable while new rows arrive); `nextCursor` is
//                              null on the last page, `hasMore` says the same
//   ?countOnly=1               just { unreadCount } (the number on the Профиль row)
// Without inbox / cursor / countOnly the answer is what the bell has always got: { notifications, unreadCount }.
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const countOnly = searchParams.get("countOnly") === "1";
  const rawCursor = searchParams.get("cursor");
  const cursor = decodeCursor(rawCursor);
  const inbox = searchParams.get("inbox") === "1";
  const limit = clampLimit(searchParams.get("limit"));

  if (rawCursor && !cursor) return NextResponse.json({ error: "Bad cursor" }, { status: 400 });

  if (inbox || countOnly || cursor) {
    const rl = await rateLimit(`notifications-read:${userId}`, READ_RATE.limit, READ_RATE.windowMs);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  const scope: Record<string, unknown> = { userId };
  if (inbox || countOnly) scope.type = { notIn: [...INBOX_HIDDEN_TYPES] };
  const unreadWhere = { ...scope, isRead: false };

  if (countOnly) {
    const unreadCount = await prisma.notification.count({ where: unreadWhere });
    return NextResponse.json({ unreadCount }, { headers: { "Cache-Control": "no-store" } });
  }

  const where: Record<string, unknown> = { ...scope };
  if (unreadOnly) where.isRead = false;
  if (cursor) where.OR = [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: cursor.id } }];

  // one extra row tells whether there is a next page
  const [rows, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    // only the first page reports the unread count (later pages do not change it)
    cursor ? Promise.resolve(undefined) : prisma.notification.count({ where: unreadWhere }),
  ]);
  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;
  const last = notifications[notifications.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

  return NextResponse.json({ notifications, unreadCount, hasMore, nextCursor }, { headers: { "Cache-Control": "no-store" } });
}

// PATCH: mark notifications as read
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wr = await rateLimit(`notifications-write:${session.user.id}`, WRITE_RATE.limit, WRITE_RATE.windowMs);
  if (!wr.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(wr.retryAfterSec) } });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { ids, markAllRead, tab, ideaId, channelId } = body as {
    ids?: string[];
    markAllRead?: boolean;
    /// An idea was opened: its comment / post notifications are read (per-item read of the app badges, src/lib/app-unread.ts).
    ideaId?: string;
    /// A channel the viewer cannot open: its post / comment notifications are read (they could never be cleared otherwise).
    channelId?: string;
    /// App dock tab ("feed" | "terminal" | "calendar" | "channels" | "chat"): marks that tab's unread notifications read.
    tab?: string;
  };

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false },
      data: { isRead: true },
    });
  } else if (typeof ideaId === "string" && ideaId && ideaId.length <= 64) {
    const marked = isTerminalSite() ? 0 : await markIdeaRead(session.user.id, ideaId);
    return NextResponse.json({ ok: true, marked });
  } else if (typeof channelId === "string" && channelId && channelId.length <= 64) {
    const marked = isTerminalSite() ? 0 : await markChannelRead(session.user.id, channelId);
    return NextResponse.json({ ok: true, marked });
  } else if (typeof tab === "string" && typesForTab(tab).length > 0) {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, isRead: false, type: { in: typesForTab(tab) } },
      data: { isRead: true },
    });
  } else if (Array.isArray(ids) && ids.length > 0) {
    const clean = ids.filter((i): i is string => typeof i === "string" && i.length > 0 && i.length <= 64).slice(0, MAX_IDS);
    await prisma.notification.updateMany({
      where: { id: { in: clean }, userId: session.user.id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
