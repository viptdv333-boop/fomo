import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { typesForTab } from "@/lib/app-badges";
import { markChannelRead, markIdeaRead } from "@/lib/unread-ideas";
import { isTerminalSite } from "@/lib/site-mode";

// GET: list user notifications
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20", 10));

  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.isRead = false;

  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.notification.count({
      where: { userId: session.user.id, isRead: false },
    }),
  ]);

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH: mark notifications as read
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
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
  } else if (ids && ids.length > 0) {
    await prisma.notification.updateMany({
      where: { id: { in: ids }, userId: session.user.id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
}
