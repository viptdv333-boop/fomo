/**
 * Calendar reminders («колокольчик» on an economic-calendar event): every ~30 s pick the CalendarReminder rows whose moment
 * (event time minus the lead time) has come, claim each one atomically and send a "calendar_reminder" notification through
 * src/lib/notify-dispatch.ts (bell row + socket ping + Web Push + the user's connected channels, per their event preferences),
 * in the recipient's own language. Rows are dropped two days after the release.
 *
 * Safe with a restart or a second instance: a row is claimed with updateMany({ where: { id, notifiedAt: null } }) and only the
 * instance that changed it (count === 1) sends. If the dispatch itself fails (DB down) the claim is released again, so the
 * reminder is retried on the next tick as long as the release has not passed.
 * Never throws out of the interval; idle (one cheap indexed query) without reminders.
 * Next-free imports only (same rule as alert-scheduler.ts / subscription-expiry.ts: next/headers breaks in this context).
 */

import { prisma } from "../src/lib/prisma";
import { dispatchNotification } from "../src/lib/notify-dispatch";
import { translate } from "../src/lib/i18n/dictionaries";
import { countryName, intlLocale } from "../src/lib/calendar/countries";
import { glossaryBrief } from "../src/lib/calendar/glossary";
import { KEEP_AFTER_MS, calendarLink, reminderBody } from "../src/lib/calendar/reminder-logic";
import { runDueReminders, type ReminderRow, type ReminderStore } from "../src/lib/calendar/reminder-run";

const TICK_MS = 30_000;
const CLEANUP_EVERY_MS = 10 * 60_000;

const g = globalThis as unknown as { calendarReminderTimer?: ReturnType<typeof setInterval>; calendarReminderCleanupAt?: number };

/** The glossary one-liner «на что влияет» (Russian only, like in the calendar rows); MOEX rows have none. */
export function briefFor(row: Pick<ReminderRow, "gk" | "category" | "country">, locale: string): string | null {
  if (locale !== "ru" || row.category === "moex") return null;
  return glossaryBrief(row.gk ?? `~${row.category}`, locale, row.country) ?? glossaryBrief("~other", locale, row.country);
}

async function send(row: ReminderRow, now: number, locale: string) {
  const tr = (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
  const body = reminderBody(
    {
      eventTs: row.eventTs,
      now,
      country: row.country ? countryName(row.country, intlLocale(locale), (k) => translate(locale, k)) : "",
      impact: row.impact,
      locale,
      brief: briefFor(row, locale),
    },
    tr
  );
  await dispatchNotification({
    recipients: [row.userId],
    type: "calendar_reminder",
    title: row.title,
    body,
    link: calendarLink(row.eventTs),
  });
}

/** The CalendarReminder table as a store: the claim is a single conditional UPDATE, so a restart or a second instance cannot double-send. */
const store: ReminderStore = {
  async candidates(fromMs, toMs) {
    const rows = await prisma.calendarReminder.findMany({
      where: { notifiedAt: null, eventTs: { gte: new Date(fromMs), lte: new Date(toMs) } },
      select: { id: true, userId: true, eventTs: true, title: true, country: true, impact: true, category: true, gk: true, leadMin: true },
      take: 2000,
    });
    return rows.map((r) => ({ ...r, eventTs: r.eventTs.getTime() }));
  },
  async claim(id, at) {
    const r = await prisma.calendarReminder.updateMany({ where: { id, notifiedAt: null }, data: { notifiedAt: new Date(at) } });
    return r.count === 1;
  },
  async release(id, at) {
    await prisma.calendarReminder.updateMany({ where: { id, notifiedAt: new Date(at) }, data: { notifiedAt: null } });
  },
};

async function tick() {
  const now = Date.now();
  const locales = new Map<string, string>();
  await runDueReminders(
    store,
    async (row) => {
      let locale = locales.get(row.userId);
      if (locale === undefined) {
        const u = await prisma.user.findUnique({ where: { id: row.userId }, select: { locale: true } });
        locale = u?.locale ?? "ru";
        locales.set(row.userId, locale);
      }
      await send(row, now, locale);
    },
    now,
    (row, err) => console.error("[CalendarReminders] reminder", row.id, err instanceof Error ? err.message : err)
  );

  if (!g.calendarReminderCleanupAt || now - g.calendarReminderCleanupAt > CLEANUP_EVERY_MS) {
    g.calendarReminderCleanupAt = now;
    await prisma.calendarReminder.deleteMany({ where: { eventTs: { lt: new Date(now - KEEP_AFTER_MS) } } });
  }
}

export function startCalendarReminders() {
  if (g.calendarReminderTimer) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error("[CalendarReminders] tick failed:", err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, TICK_MS);
  timer.unref?.();
  g.calendarReminderTimer = timer;
  setTimeout(run, 20_000).unref?.(); // not during boot
  console.log("[CalendarReminders] Started");
}
