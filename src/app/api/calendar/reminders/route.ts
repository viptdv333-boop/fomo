import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { MAX_LEAD_MIN, canAddReminder, canSetReminder, dueAt } from "@/lib/calendar/reminder-logic";

/**
 * Server-side reminders for calendar events («колокольчик»); delivered by server/calendar-reminders.ts as a
 * "calendar_reminder" notification through the user's notification preferences.
 *   GET    ?from=<ms>&to=<ms>                 → { reminders: [...] }   (default: from one hour ago, no upper bound; max 500)
 *   POST   { eventId, eventTs, title, country, impact, category, gk?, leadMin, toggle? }
 *          sets (idempotent) the reminder of the event with this lead time and drops the event's other unsent leads
 *          (one bell = one reminder); toggle:true removes it when it is already set → { reminder | null }
 *   DELETE ?eventId=…[&leadMin=…] | ?id=…     → { ok }   (without leadMin every lead of the event goes)
 */

const RATE = { limit: 90, windowMs: 60_000 };
const READ_CAP = 500;

const postSchema = z.object({
  eventId: z.string().min(1).max(64),
  eventTs: z.number().finite(),
  title: z.string().trim().min(1).max(200),
  country: z.string().max(8).default(""),
  impact: z.number().int().min(1).max(3).default(1),
  category: z.string().max(24).default("other"),
  gk: z.string().max(64).optional(),
  leadMin: z.number().int().min(0).max(MAX_LEAD_MIN),
  toggle: z.boolean().optional(),
});

function serialize(r: { id: string; eventId: string; eventTs: Date; title: string; country: string; impact: number; category: string; leadMin: number; notifiedAt: Date | null }) {
  return {
    id: r.id,
    eventId: r.eventId,
    eventTs: r.eventTs.getTime(),
    title: r.title,
    country: r.country,
    impact: r.impact,
    category: r.category,
    leadMin: r.leadMin,
    notifiedAt: r.notifiedAt ? r.notifiedAt.getTime() : null,
  };
}

const num = (v: string | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const sp = request.nextUrl.searchParams;
  const from = num(sp.get("from")) ?? Date.now() - 3_600_000;
  const to = num(sp.get("to"));
  const rows = await prisma.calendarReminder.findMany({
    where: { userId, eventTs: { gte: new Date(from), ...(to !== null ? { lte: new Date(to) } : {}) } },
    orderBy: { eventTs: "asc" },
    take: READ_CAP,
  });
  return NextResponse.json({ reminders: rows.map(serialize) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const limit = await rateLimit(`calendar-reminders:${userId}`, RATE.limit, RATE.windowMs);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const v = parsed.data;
  const now = Date.now();

  const key = { userId_eventId_leadMin: { userId, eventId: v.eventId, leadMin: v.leadMin } };
  const existing = await prisma.calendarReminder.findUnique({ where: key });

  if (existing && v.toggle) {
    await prisma.calendarReminder.deleteMany({ where: { userId, eventId: v.eventId, leadMin: v.leadMin } });
    return NextResponse.json({ reminder: null });
  }
  if (!canSetReminder(v.eventTs, now)) return NextResponse.json({ error: "Event already released" }, { status: 400 });

  if (!existing) {
    const active = await prisma.calendarReminder.count({ where: { userId, notifiedAt: null, eventTs: { gt: new Date(now) } } });
    if (!canAddReminder(active)) return NextResponse.json({ error: "Reminder limit reached" }, { status: 409 });
  }

  const eventTs = new Date(v.eventTs);
  const display = { eventTs, title: v.title, country: v.country, impact: v.impact, category: v.category, gk: v.gk ?? null };
  // a sent reminder is armed again only when its moment is still ahead (the user set it afresh before the release)
  const rearm = dueAt(v.eventTs, v.leadMin) > now ? { notifiedAt: null } : {};
  const row = await prisma.calendarReminder.upsert({
    where: key,
    create: { userId, eventId: v.eventId, leadMin: v.leadMin, ...display },
    update: { ...display, ...rearm },
  });
  // one bell = one reminder: the event's other, not yet sent leads go away
  await prisma.calendarReminder.deleteMany({ where: { userId, eventId: v.eventId, leadMin: { not: v.leadMin }, notifiedAt: null } });
  return NextResponse.json({ reminder: serialize(row) }, { status: existing ? 200 : 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const limit = await rateLimit(`calendar-reminders:${userId}`, RATE.limit, RATE.windowMs);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  const eventId = sp.get("eventId");
  if (id) {
    if (id.length > 64) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.calendarReminder.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true });
  }
  if (!eventId || eventId.length > 64) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const lead = num(sp.get("leadMin"));
  if (sp.get("leadMin") !== null && (lead === null || !Number.isInteger(lead) || lead < 0 || lead > MAX_LEAD_MIN)) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  await prisma.calendarReminder.deleteMany({ where: { userId, eventId, ...(lead !== null ? { leadMin: lead } : {}) } });
  return NextResponse.json({ ok: true });
}
