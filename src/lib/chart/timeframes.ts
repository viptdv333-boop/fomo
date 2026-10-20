/* The timeframes of the terminal: ONE table (id, group, length, labels) and ONE rule for where the bars of a timeframe come from.
   Pure (no React, no DOM, no Next): the chart, the pickers, /api/klines and scripts/check-timeframes.ts all read it.

   Ids: a number of minutes ("1", "45", "120"), a number of seconds with an "s" ("15s"), or "D" | "W" | "M" | "Y".

   Where the bars come from (see `timeframePlan`):
     native     the upstream serves the timeframe itself (/api/klines passes it through);
     aggregate  /api/klines is asked for a finer "base" timeframe and the CLIENT merges `ratio` of its bars into one (aggregateCandles in intervals.ts).
                The merge is anchored to the FIRST BAR OF EACH EXCHANGE DAY (not to a fixed UTC grid), so bars begin with the session:
                  MOEX    candle times are Moscow wall clock, so the day starts with the session (09:50 / 10:00 MSK shares, 09:00 futures,
                          the evening session starts its own bar at 19:00 / 19:05);
                  Bybit   epoch UTC, the day is 00:00 UTC, which is also the grid Bybit uses for its own 2h / 4h / 6h / 12h bars;
                  FMP / FX  as the data layer delivers (UTC epoch, the first bar of the UTC day).
     live       seconds: no upstream serves second candles, they are folded from trades and never faked from minute bars:
                  Bybit   in the browser from the public trade stream, from the moment the chart is opened (no history);
                  MOEX    the T-Invest tape of trades, folded on the server (server/moex-trades.ts): the last hour as history, then live over the
                          socket. Offered only when the server says so (`setMoexSeconds`, from /api/moex-seconds: token present, MOEX_SECONDS not 0, signed in). */

export type TfGroup = "s" | "m" | "h" | "d";
export type TfLocale = "ru" | "en" | "cn";

export interface Timeframe {
  id: string;
  group: TfGroup;
  /** nominal length of a bar in seconds (W = 7 days, M = 30 days, Y = 365 days, like intervalToMs) */
  seconds: number;
  /** short label per locale ("3м" / "3m" / "3分") */
  labels: Record<TfLocale, string>;
}

const UNIT: Record<"s" | "m" | "h" | "d", Record<TfLocale, string>> = {
  s: { ru: "с", en: "s", cn: "秒" },
  m: { ru: "м", en: "m", cn: "分" },
  h: { ru: "ч", en: "h", cn: "时" },
  d: { ru: "д", en: "d", cn: "天" },
};
const LOCALES: TfLocale[] = ["ru", "en", "cn"];

function lab(n: number, unit: "s" | "m" | "h"): Record<TfLocale, string> {
  return { ru: `${n}${UNIT[unit].ru}`, en: `${n}${UNIT[unit].en}`, cn: `${n}${UNIT[unit].cn}` };
}
const sec = (n: number): Timeframe => ({ id: `${n}s`, group: "s", seconds: n, labels: lab(n, "s") });
const min = (n: number): Timeframe => ({ id: String(n), group: "m", seconds: n * 60, labels: lab(n, "m") });
const hour = (n: number): Timeframe => ({ id: String(n * 60), group: "h", seconds: n * 3600, labels: lab(n, "h") });
const DAY_S = 86_400;

/** Every timeframe of the picker, shortest first. */
export const TIMEFRAMES: readonly Timeframe[] = [
  sec(1),
  sec(5),
  sec(10),
  sec(15),
  sec(30),
  min(1),
  min(2),
  min(3),
  min(5),
  min(10),
  min(15),
  min(20),
  min(30),
  min(45),
  hour(1),
  hour(2),
  hour(3),
  hour(4),
  hour(6),
  hour(8),
  hour(12),
  { id: "D", group: "d", seconds: DAY_S, labels: { ru: "Д", en: "D", cn: "日" } },
  { id: "W", group: "d", seconds: 7 * DAY_S, labels: { ru: "Н", en: "W", cn: "周" } },
  { id: "M", group: "d", seconds: 30 * DAY_S, labels: { ru: "М", en: "M", cn: "月" } },
  { id: "Y", group: "d", seconds: 365 * DAY_S, labels: { ru: "1Г", en: "1Y", cn: "1年" } },
];

const BY_ID = new Map(TIMEFRAMES.map((t) => [t.id, t]));

export const timeframeById = (id: string): Timeframe | undefined => BY_ID.get(id);

export const isSecondsInterval = (id: string): boolean => /^\d+s$/.test(id);

/** Length of a seconds timeframe in ms ("15s" -> 15000), 0 for anything else. */
export function secondsIntervalMs(id: string): number {
  return isSecondsInterval(id) ? Number(id.slice(0, -1)) * 1000 : 0;
}

/** Ids of the seconds timeframes. */
export const SECOND_INTERVALS: string[] = TIMEFRAMES.filter((t) => t.group === "s").map((t) => t.id);

/** Ids of every other timeframe (minutes, hours, days and up), shortest first: the interval menu. */
export const MENU_INTERVALS: string[] = TIMEFRAMES.filter((t) => t.group !== "s").map((t) => t.id);

/** Favourites on the chip row until the user pins their own. */
export const DEFAULT_FAVORITE_INTERVALS: string[] = ["1", "5", "15", "60", "240", "D"];

/** A valid interval id: a timeframe of the table or a custom number of minutes (the «Свой интервал» form), up to 3 days. */
export function isValidInterval(id: string): boolean {
  if (typeof id !== "string") return false;
  if (BY_ID.has(id)) return true;
  if (!/^\d+$/.test(id)) return false;
  const m = Number(id);
  return m >= 1 && m <= 1440 * 3;
}

/** Order key (seconds) so menus and favourites read short to long; unknown ids sort by their minutes. */
export function intervalOrder(id: string): number {
  const tf = BY_ID.get(id);
  if (tf) return tf.seconds;
  return (Number(id) || 0) * 60;
}

/** Label of a timeframe in a locale: table ids from the table, custom minutes as "45м" / "2ч" / "1д". */
export function timeframeLabel(id: string, locale: TfLocale): string {
  const tf = BY_ID.get(id);
  if (tf) return tf.labels[locale];
  const m = Number(id);
  if (!Number.isFinite(m) || m <= 0) return id;
  if (m >= 1440 && m % 1440 === 0) return `${m / 1440}${UNIT.d[locale]}`;
  if (m >= 60 && m % 60 === 0) return `${m / 60}${UNIT.h[locale]}`;
  return `${m}${UNIT.m[locale]}`;
}

export const TIMEFRAME_LOCALES = LOCALES;

/* ── where the bars come from ── */

/** Intervals every source serves as they are (the klines API; MOEX 5 / 15 / 240 are built from 1 / 60 on the server). */
const COMMON_NATIVE = ["1", "5", "15", "60", "240", "D", "W", "M", "Y"];

const NATIVE: Record<string, string[]> = {
  // ISS candles are 1, 10, 60, D, W, M (24 / 7 / 31); 5, 15, 240 are resampled on the server, Y is built from M
  moex: [...COMMON_NATIVE, "10"],
  // Bybit v5 kline: 1 3 5 15 30 60 120 240 360 720 D W M; Y is built from M on the server
  bybit: ["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M", "Y"],
};

/** What /api/klines accepts for a source: the native set plus the 30-minute bars the FMP and FX layers also serve themselves. */
export function serverIntervals(source: string): string[] {
  if (source === "fmp" || source === "forex") return [...COMMON_NATIVE, "30"];
  return NATIVE[source] ?? COMMON_NATIVE;
}

/** Does the upstream of `source` serve this interval itself (no client merge)? */
export function isNativeInterval(id: string, source: string): boolean {
  return (NATIVE[source] ?? COMMON_NATIVE).includes(id);
}

/* MOEX seconds exist only when the server can serve them (a T-Invest token, the kill switch MOEX_SECONDS off, a signed-in viewer):
   the client asks /api/moex-seconds once and tells the answer here. null = not asked yet (nothing is offered, but a saved seconds
   timeframe is not thrown away either). A plain module-level flag, like a feature switch: useMoexSeconds() (moex-seconds-client.ts) re-renders on a change. */
let moexSecondsFlag: boolean | null = null;
const moexSecondsListeners = new Set<() => void>();

export function setMoexSeconds(on: boolean | null): void {
  if (on === moexSecondsFlag) return;
  moexSecondsFlag = on;
  for (const fn of [...moexSecondsListeners]) fn();
}
export const getMoexSeconds = (): boolean | null => moexSecondsFlag;
export function subscribeMoexSeconds(fn: () => void): () => void {
  moexSecondsListeners.add(fn);
  return () => {
    moexSecondsListeners.delete(fn);
  };
}

/** Seconds are folded from trades: Bybit spot / perpetual / inverse always, MOEX shares and futures when the server serves them. */
export function secondsSupported(source: string): boolean {
  return source === "bybit" || (source === "moex" && moexSecondsFlag === true);
}

/** MOEX: the server has not been asked yet, so nobody knows whether seconds exist (a saved seconds timeframe must survive that moment). */
export function secondsPending(source: string): boolean {
  return source === "moex" && moexSecondsFlag === null;
}

export interface IntervalPlan {
  /** Interval requested from /api/klines. */
  base: string;
  /** Source candles per bar; 1 = no aggregation. */
  ratio: number;
  /** Length of a bar in ms (only meaningful when ratio > 1, 0 otherwise). */
  ms: number;
  /** seconds: nothing is requested, the bars are built live in the browser */
  live?: boolean;
}

/** How the bars of interval `id` are obtained for `source`: native, merged from a finer native interval, or built live (seconds). */
export function timeframePlan(id: string, source: string): IntervalPlan {
  if (isSecondsInterval(id)) return { base: id, ratio: 1, ms: 0, live: true };
  const natives = NATIVE[source] ?? COMMON_NATIVE;
  if (natives.includes(id)) return { base: id, ratio: 1, ms: 0 };
  const m = Number(id);
  if (!isFinite(m) || m <= 0) return { base: "D", ratio: 1, ms: 0 };
  // the coarsest native minute interval that divides it
  const bases = natives
    .filter((n) => /^\d+$/.test(n))
    .map(Number)
    .sort((a, b) => b - a);
  for (const b of bases) {
    if (m > b && m % b === 0) return { base: String(b), ratio: m / b, ms: m * 60_000 };
  }
  return { base: "1", ratio: m, ms: m * 60_000 };
}

/** Intervals offered for a source (seconds only where they can be built). */
export function pickerIntervals(source: string): string[] {
  return secondsSupported(source) ? [...SECOND_INTERVALS, ...MENU_INTERVALS] : MENU_INTERVALS.slice();
}

/** The interval to use for a source: seconds fall back to 1 minute where they cannot be built. */
export function usableInterval(id: string, source: string): string {
  return isSecondsInterval(id) && !secondsSupported(source) && !secondsPending(source) ? "1" : id;
}

/**
 * What a person typed into the «go to timeframe» field -> an interval id, or null when it is not one this source can show.
 *   "15" / "15m" / "15м" -> 15 minutes     "2h" / "2ч" -> 2 hours     "30s" / "30с" -> 30 seconds (only where seconds exist)
 *   "d" / "1d" / "д" -> D                  "w" / "н" -> W             "M" (capital) -> month        "y" / "г" -> year
 * A number of minutes that is a whole day is D.
 */
export function parseTypedInterval(text: string, source = ""): string | null {
  const m = text.trim().match(/^(\d+)?\s*([A-Za-zА-Яа-яЁё]?)$/);
  if (!m) return null;
  const n = m[1] === undefined ? NaN : Number(m[1]);
  const u = m[2];
  const withN = Number.isFinite(n);
  let id: string | null = null;
  if (!u) {
    if (!withN) return null;
    id = String(n);
  } else if (u === "M") {
    if (!withN || n === 1) id = "M";
  } else {
    switch (u.toLowerCase()) {
      case "m":
      case "м":
        if (withN) id = String(n);
        break;
      case "h":
      case "ч":
        if (withN) id = String(n * 60);
        break;
      case "s":
      case "с":
        if (withN) id = `${n}s`;
        break;
      case "d":
      case "д":
        id = !withN || n === 1 ? "D" : String(n * 1440);
        break;
      case "w":
      case "н":
        if (!withN || n === 1) id = "W";
        break;
      case "y":
      case "г":
        if (!withN || n === 1) id = "Y";
        break;
    }
  }
  if (id === null) return null;
  if (id === "1440") id = "D";
  if (isSecondsInterval(id) && (!secondsSupported(source) || !BY_ID.has(id))) return null;
  return isValidInterval(id) ? id : null;
}
