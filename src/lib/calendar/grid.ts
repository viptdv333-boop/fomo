import { addDays, eventDay, weekday, zonedDayStart } from "./time";
import type { CalEvent } from "./types";

/* Pure helpers of the month grid (squares view). */

export interface GridCell {
  date: string;
  weekend: boolean;
  today: boolean;
  past: boolean;
  /** first day of a month (label shows the month name) */
  first: boolean;
}

/** Monday of the week a date is in. */
export function monthWindowStart(date: string): string {
  return addDays(date, -weekday(date));
}

/** `count` day cells starting at a Monday. */
export function buildMonthCells(start: string, today: string, count = 35): GridCell[] {
  const out: GridCell[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDays(start, i);
    const wd = weekday(date);
    out.push({ date, weekend: wd >= 5, today: date === today, past: date < today, first: date.endsWith("-01") });
  }
  return out;
}

export interface DayBucket {
  total: number;
  /** counts by impact level 1..3 */
  byImpact: [number, number, number];
  events: CalEvent[];
}

/** Events grouped by calendar day in a zone (already sorted by time). */
export function dayCounts(events: readonly CalEvent[], zone: string): Map<string, DayBucket> {
  const m = new Map<string, DayBucket>();
  for (const e of events) {
    const d = eventDay(e, zone);
    let b = m.get(d);
    if (!b) {
      b = { total: 0, byImpact: [0, 0, 0], events: [] };
      m.set(d, b);
    }
    b.total++;
    b.byImpact[e.impact - 1]++;
    b.events.push(e);
  }
  return m;
}

/** At most `max` events for a square: the most important ones (then the earliest), shown in time order, plus how many are hidden. */
export function pickForCell(events: readonly CalEvent[], max: number): { shown: CalEvent[]; more: number; total: number } {
  if (events.length <= max) return { shown: events.slice(), more: 0, total: events.length };
  const ranked = events.map((e, i) => ({ e, i })).sort((a, b) => b.e.impact - a.e.impact || a.e.ts - b.e.ts || a.i - b.i);
  const shown = ranked.slice(0, max).map((r) => r.e).sort((a, b) => a.ts - b.ts || b.impact - a.impact);
  return { shown, more: events.length - max, total: events.length };
}

/** True when the whole day lies outside the span a provider covers (Forex Factory: this + next week). */
export function outsideCoverage(date: string, coverage: { from: number; to: number } | null, zone: string): boolean {
  if (!coverage) return false;
  const start = zonedDayStart(date, zone);
  const end = zonedDayStart(addDays(date, 1), zone);
  return end <= coverage.from || start >= coverage.to;
}
