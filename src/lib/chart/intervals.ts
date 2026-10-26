import type { Candle } from "./types";

/* Intervals of the terminal (the table and the per-source rules live in timeframes.ts). An interval id is "D" | "W" | "M" | "Y", a number of minutes
   ("1", "45", "120") or a number of seconds ("15s"). The klines API serves only some of them natively; the others are aggregated on the client from a
   finer one; seconds are built live from the trade stream. */

export { MENU_INTERVALS, SECOND_INTERVALS, DEFAULT_FAVORITE_INTERVALS, isValidInterval, intervalOrder, isSecondsInterval, secondsIntervalMs, secondsSupported, secondsPending, pickerIntervals, usableInterval, tfRowIds, type IntervalPlan } from "./timeframes";
import { isSecondsInterval, timeframePlan, timeframeLabel, type IntervalPlan } from "./timeframes";

/** What the klines API serves natively for every source but MOEX / Bybit (see timeframes.ts for the per-source sets). */
export const NATIVE_INTERVALS = ["1", "5", "15", "60", "240", "D", "W", "M", "Y"];

const STD_KEYS: Record<string, string> = {
  "1": "inst.period.1m",
  "5": "inst.period.5m",
  "15": "inst.period.15m",
  "60": "inst.period.1h",
  "240": "inst.period.4h",
  D: "inst.period.D",
  W: "inst.period.W",
  M: "inst.period.M",
  Y: "inst.period.Y",
};

/** i18n key for a standard interval, or null for custom ones. */
export function standardIntervalKey(id: string): string | null {
  return STD_KEYS[id] ?? null;
}

/** "45м" / "2ч" / "15с" style label; `t` translates keys. */
export function formatInterval(id: string, t: (key: string) => string): string {
  const std = STD_KEYS[id];
  if (std) return t(std);
  if (isSecondsInterval(id)) return `${id.slice(0, -1)}${t("cs.unit.s")}`;
  const m = Number(id);
  if (!isFinite(m) || m <= 0) return id;
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440}${t("cs.unit.d")}`;
  if (m >= 60 && m % 60 === 0) return `${m / 60}${t("cs.unit.h")}`;
  return `${m}${t("cs.unit.m")}`;
}

/** The label from the timeframe table (no translator needed): the same text formatInterval gives with the dictionary of that locale. */
export const intervalLabel = timeframeLabel;

/** How the bars of an interval are obtained for a source: native, merged from a finer one, or (seconds) built live. */
export function intervalPlan(id: string, source: string): IntervalPlan {
  return timeframePlan(id, source);
}

const DAY = 86_400_000;

/** Merge finer candles into bars of `ms`, anchored to the first candle of each day (so bars start with the session). */
export function aggregateCandles(src: Candle[], ms: number): Candle[] {
  const out: Candle[] = [];
  let curDay = NaN;
  let dayFirst = 0;
  let cur: Candle | null = null;
  for (const c of src) {
    const day = Math.floor(c.t / DAY);
    if (day !== curDay) {
      curDay = day;
      dayFirst = c.t;
    }
    const bucket = dayFirst + Math.floor((c.t - dayFirst) / ms) * ms;
    if (!cur || cur.t !== bucket) {
      cur = { t: bucket, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
      out.push(cur);
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
    }
  }
  return out;
}
