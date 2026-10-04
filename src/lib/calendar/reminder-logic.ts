/**
 * Pure logic of the server-side calendar reminders («колокольчик»): lead-time math, which rows are due, how many a user may
 * keep, the text of the notification. No I/O, no React, no Next imports: used by server/calendar-reminders.ts (the scheduler),
 * the API route and scripts/check-calendar-reminders.ts.
 */

/** Lead times offered by the bell, minutes before the release (0 = at the time of the release). */
export const LEAD_OPTIONS = [0, 5, 15, 30, 60] as const;
export const DEFAULT_LEAD_MIN = 15;
export const MAX_LEAD_MIN = 1440;

/** Active (not yet sent, event still ahead) reminders one user may hold. */
export const MAX_ACTIVE_REMINDERS = 200;

/** A reminder that was not sent within this long after the release is dropped, not sent late (server was down). */
export const LATE_GRACE_MS = 10 * 60_000;

/** Rows older than this (counted from the event time) are deleted. */
export const KEEP_AFTER_MS = 2 * 24 * 60 * 60_000;

export function isValidLead(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_LEAD_MIN;
}

/** The moment (UTC ms) the reminder is due: `leadMin` minutes before the release. */
export function dueAt(eventTs: number, leadMin: number): number {
  return eventTs - leadMin * 60_000;
}

/** Whole minutes from `now` to the release, never negative (rounded: 14 min 40 s reads as "in 15 minutes"). */
export function minutesLeft(eventTs: number, now: number): number {
  return Math.max(0, Math.round((eventTs - now) / 60_000));
}

export interface ReminderLite {
  id: string;
  eventTs: number;
  leadMin: number;
  /** null = not sent yet */
  notifiedAt: number | null;
}

export type ReminderVerdict = "send" | "wait" | "late" | "done";

/**
 * What to do with one row now.
 *   done = already claimed/sent; wait = its time has not come; late = the release is long gone (drop silently); send = go.
 */
export function verdict(r: ReminderLite, now: number): ReminderVerdict {
  if (r.notifiedAt !== null) return "done";
  if (now > r.eventTs + LATE_GRACE_MS) return "late";
  return now >= dueAt(r.eventTs, r.leadMin) ? "send" : "wait";
}

/** The rows to send in this tick, soonest release first. */
export function selectDue<T extends ReminderLite>(rows: readonly T[], now: number): T[] {
  return rows.filter((r) => verdict(r, now) === "send").sort((a, b) => a.eventTs - b.eventTs || a.id.localeCompare(b.id));
}

/** The oldest moment an unsent reminder can still be worth sending (the DB query lower bound). */
export const candidateFrom = (now: number) => now - LATE_GRACE_MS;
/** A reminder with the longest lead is due at most MAX_LEAD_MIN before the release: the DB query upper bound on eventTs. */
export const candidateTo = (now: number) => now + MAX_LEAD_MIN * 60_000;

/** Would one more active reminder fit under the cap? */
export function canAddReminder(activeCount: number): boolean {
  return activeCount < MAX_ACTIVE_REMINDERS;
}

/** Can a reminder still be set for this event (it has not been released yet)? */
export function canSetReminder(eventTs: number, now: number): boolean {
  return Number.isFinite(eventTs) && eventTs > now;
}

/** UTC calendar day (YYYY-MM-DD) of the release: the anchor of the deep link /calendar#<date>. */
export function eventDayUtc(eventTs: number): string {
  return new Date(eventTs).toISOString().slice(0, 10);
}

export function calendarLink(eventTs: number): string {
  return `/calendar#${eventDayUtc(eventTs)}`;
}

/* ───────────── texts ───────────── */

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** "15 минут" / "1 minute" / "15 分钟": the plural form is chosen by the locale's rules. */
export function minutesText(n: number, locale: string, tr: Tr): string {
  let cat = "other";
  try {
    cat = new Intl.PluralRules(locale === "cn" ? "zh-CN" : locale === "en" ? "en-US" : "ru-RU").select(n);
  } catch {
    /* default form */
  }
  const k = `calrem.min.${cat}`;
  const text = tr(k, { n });
  return text === k ? tr("calrem.min.other", { n }) : text;
}

export interface BodyInput {
  eventTs: number;
  now: number;
  /** already localized country name ("" when unknown) */
  country: string;
  impact: number;
  locale: string;
  /** the one-line «на что влияет» from the glossary, when there is one */
  brief?: string | null;
}

/** «Через 15 минут · США · важность высокая», then the brief on its own line. */
export function reminderBody(i: BodyInput, tr: Tr): string {
  const left = minutesLeft(i.eventTs, i.now);
  const when = left <= 0 ? tr("calrem.now") : tr("calrem.in", { time: minutesText(left, i.locale, tr) });
  const imp = i.impact === 3 || i.impact === 2 || i.impact === 1 ? tr(`calrem.impact.${i.impact}`) : "";
  const head = [when, i.country, imp].filter(Boolean).join(" · ");
  return i.brief ? `${head}\n${i.brief}` : head;
}
