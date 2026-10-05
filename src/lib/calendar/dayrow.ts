import { dayCounts, outsideCoverage, type GridCell } from "./grid";
import type { CalEvent } from "./types";

/* Pure helpers of the phone calendar: one row per day (date block + a summary), quiet stretches folded into one slim row. */

export type DayLayer = "moex" | "commodity" | "ru" | "corp";
/** The order the layer dots are drawn in. */
export const DAY_LAYERS: readonly DayLayer[] = ["moex", "commodity", "ru", "corp"];

export interface DaySummary {
  total: number;
  /** events of the highest importance (3) */
  high: number;
  /** layers present in the day, in DAY_LAYERS order */
  layers: DayLayer[];
  /** the most important titles to show in the row */
  top: CalEvent[];
}

/** Bond-coupon rows come in dozens and say little: they rank last. */
const weight = (e: CalEvent) => (e.gk === "corp.coupon" ? -1 : e.impact);

/** The `n` most important events (bond coupons last, then the earliest), most important first. */
export function pickTopEvents(events: readonly CalEvent[], n = 2): CalEvent[] {
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => weight(b.e) - weight(a.e) || a.e.ts - b.e.ts || a.i - b.i)
    .slice(0, Math.max(0, n))
    .map((r) => r.e);
}

export function summarizeDay(events: readonly CalEvent[], topN = 2): DaySummary {
  let high = 0;
  const present = new Set<string>();
  for (const e of events) {
    if (e.impact === 3) high++;
    present.add(e.category);
  }
  return { total: events.length, high, layers: DAY_LAYERS.filter((l) => present.has(l)), top: pickTopEvents(events, topN) };
}

export type DayRow =
  /** the first row of a month: «October 2026» */
  | { kind: "month"; date: string }
  /** a day to read and tap: it has events, or it is today */
  | { kind: "day"; cell: GridCell; summary: DaySummary; events: readonly CalEvent[] }
  /** a quiet stretch (consecutive days with nothing in them) folded into one slim row; `noData`: the provider has no data for them */
  | { kind: "gap"; from: string; to: string; days: number; noData: boolean };

/**
 * The day rows of a window of cells. Days with events and today are rows of their own; consecutive empty days are folded into one
 * slim row (a gap never crosses the first of a month, and days without source data are not mixed with plainly empty ones). A month
 * row precedes the first day of every month, so the dates stay continuous and scannable.
 */
export function buildDayRows(cells: readonly GridCell[], events: readonly CalEvent[], zone: string, coverage: { from: number; to: number } | null): DayRow[] {
  const by = dayCounts(events, zone);
  const rows: DayRow[] = [];
  let month = "";
  for (const c of cells) {
    const mk = c.date.slice(0, 7);
    if (mk !== month) {
      month = mk;
      rows.push({ kind: "month", date: c.date });
    }
    const noData = outsideCoverage(c.date, coverage, zone);
    const b = noData ? undefined : by.get(c.date);
    if ((b && b.total > 0) || (c.today && !noData)) {
      const evs = b?.events ?? [];
      rows.push({ kind: "day", cell: c, summary: summarizeDay(evs), events: evs });
      continue;
    }
    const last = rows[rows.length - 1];
    if (last && last.kind === "gap" && last.noData === noData && c.date.slice(8) !== "01") {
      last.to = c.date;
      last.days++;
    } else rows.push({ kind: "gap", from: c.date, to: c.date, days: 1, noData });
  }
  return rows;
}
