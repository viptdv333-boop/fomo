import type { CalEvent } from "./types";

/* Pure helpers of the chart overlay (no DOM): time basis conversion and marker clustering.
   Chart time = real UTC ms + offsetMs (TradingChart: MOEX candles carry Moscow wall time minus the server zone, others 0). */

export const toChartTime = (utcMs: number, offsetMs: number) => utcMs + offsetMs;
export const fromChartTime = (chartMs: number, offsetMs: number) => chartMs - offsetMs;

/** Real-UTC span [from, to] covered by a chart-time span. */
export function utcSpan(chartFrom: number, chartTo: number, offsetMs: number): { from: number; to: number } {
  return { from: fromChartTime(chartFrom, offsetMs), to: fromChartTime(chartTo, offsetMs) };
}

/** UTC calendar days (YYYY-MM-DD, inclusive) covering a real-UTC span, padded by one day each side; capped to `maxDays`. */
export function spanToDates(fromUtc: number, toUtc: number, maxDays = 31): { from: string; to: string } {
  const day = 86_400_000;
  let a = fromUtc - day;
  const b = Math.min(toUtc + day, a + (maxDays - 1) * day);
  if (!(b >= a)) a = b;
  return { from: new Date(a).toISOString().slice(0, 10), to: new Date(b).toISOString().slice(0, 10) };
}

export interface EventCluster {
  /** x pixel of the cluster centre */
  x: number;
  events: CalEvent[];
  /** highest impact of the cluster */
  impact: 1 | 2 | 3;
}

/** Group events whose markers would overlap (closer than `gap` px). `xOf` maps real UTC ms to x; events must be sorted by ts. */
export function clusterByX(events: readonly CalEvent[], xOf: (utcMs: number) => number, gap: number, maxX: number): EventCluster[] {
  const out: EventCluster[] = [];
  let cur: EventCluster | null = null;
  let sum = 0;
  for (const e of events) {
    const x = xOf(e.ts);
    if (!Number.isFinite(x) || x < -gap || x > maxX + gap) continue;
    if (cur && x - cur.x <= gap) {
      cur.events.push(e);
      sum += x;
      cur.x = sum / cur.events.length;
      if (e.impact > cur.impact) cur.impact = e.impact;
    } else {
      cur = { x, events: [e], impact: e.impact };
      sum = x;
      out.push(cur);
    }
  }
  for (const c of out) c.events.sort((a, b) => b.impact - a.impact || a.ts - b.ts);
  return out;
}

/**
 * Chart time an event marker should sit at: the open time of the bar that contains the event (so it lines up with the
 * candle on any interval), or the exact time when the event is outside the loaded bars (a future release).
 * `bars` are sorted by `t` (chart time), `chartTs` is the event time on the chart basis.
 */
export function snapToBar(bars: readonly { t: number }[], chartTs: number, intervalMs: number): number {
  const n = bars.length;
  if (n === 0 || chartTs < bars[0].t || chartTs >= bars[n - 1].t + intervalMs) return chartTs;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (bars[mid].t <= chartTs) lo = mid;
    else hi = mid - 1;
  }
  // an event in a gap (weekend, session break) keeps its exact time
  return chartTs < bars[lo].t + intervalMs ? bars[lo].t : chartTs;
}

/** Fixed 28-day chunks aligned to Monday 1970-01-05, the unit the overlay fetches: [from, to] inclusive UTC dates. */
export function overlayChunks(fromUtc: number, toUtc: number): { from: string; to: string }[] {
  const DAY = 86_400_000;
  const BASE = Date.UTC(1970, 0, 5);
  const span = 28 * DAY;
  const first = Math.floor((fromUtc - BASE) / span);
  const last = Math.floor((toUtc - BASE) / span);
  const out: { from: string; to: string }[] = [];
  for (let i = first; i <= last && out.length < 4; i++) {
    const a = BASE + i * span;
    out.push({ from: new Date(a).toISOString().slice(0, 10), to: new Date(a + span - DAY).toISOString().slice(0, 10) });
  }
  return out;
}
