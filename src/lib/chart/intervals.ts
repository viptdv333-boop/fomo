import type { Candle } from "./types";

/* Intervals of the terminal. An interval id is one of "D" | "W" | "M" | "Y" or a number of minutes ("1", "45", "120").
   The klines API serves only some of them natively; the others are aggregated on the client from a finer one. */

export const NATIVE_INTERVALS = ["1", "5", "15", "60", "240", "D", "W", "M", "Y"];

/** Ids offered in the interval menu, in display order. */
export const MENU_INTERVALS = ["1", "2", "3", "5", "10", "15", "30", "45", "60", "120", "180", "240", "D", "W", "M", "Y"];

/** Favourites shown as buttons in the toolbar until the user picks their own. */
export const DEFAULT_FAVORITE_INTERVALS = ["1", "5", "15", "60", "240", "D", "W", "M", "Y"];

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

export function isValidInterval(id: string): boolean {
  if (id === "D" || id === "W" || id === "M" || id === "Y") return true;
  if (!/^\d+$/.test(id)) return false;
  const m = Number(id);
  return m >= 1 && m <= 1440 * 3;
}

/** i18n key for a standard interval, or null for custom ones. */
export function standardIntervalKey(id: string): string | null {
  return STD_KEYS[id] ?? null;
}

/** "45м" / "2ч" style label; `t` translates keys. */
export function formatInterval(id: string, t: (key: string) => string): string {
  const std = STD_KEYS[id];
  if (std) return t(std);
  const m = Number(id);
  if (!isFinite(m) || m <= 0) return id;
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440}${t("cs.unit.d")}`;
  if (m >= 60 && m % 60 === 0) return `${m / 60}${t("cs.unit.h")}`;
  return `${m}${t("cs.unit.m")}`;
}

/** Sorted by length so the menu and favourites read naturally. */
export function intervalOrder(id: string): number {
  if (id === "D") return 1440;
  if (id === "W") return 1440 * 7;
  if (id === "M") return 1440 * 30;
  if (id === "Y") return 1440 * 365;
  return Number(id) || 0;
}

export interface IntervalPlan {
  /** Interval requested from /api/klines. */
  base: string;
  /** Source candles per bar; 1 = no aggregation. */
  ratio: number;
  /** Length of a bar in ms (only meaningful when ratio > 1). */
  ms: number;
}

export function intervalPlan(id: string, source: string): IntervalPlan {
  if (NATIVE_INTERVALS.includes(id) || (id === "10" && source === "moex")) return { base: id, ratio: 1, ms: 0 };
  const m = Number(id);
  if (!isFinite(m) || m <= 0) return { base: "D", ratio: 1, ms: 0 };
  for (const b of [240, 60, 15, 5]) {
    if (m > b && m % b === 0) return { base: String(b), ratio: m / b, ms: m * 60_000 };
  }
  return { base: "1", ratio: m, ms: m * 60_000 };
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
