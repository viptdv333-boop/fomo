import type { Candle } from "./types";

/* Candles reach the chart from outside: the klines API (MOEX ISS / Bybit / FMP), live quotes, the replay.
   Whatever comes in must be drawable, because the engine draws a body from `o` to `c` and a wick from `l` to `h`:
   a bar with `o = null` is `o = 0` for the canvas, i.e. a solid body from the close down to the bottom of the pane,
   while the auto-scale (which only looks at `l` and `h`) does not move at all. The same happens for `o = 0`. */

type Num = number;

const isNum = (x: unknown): x is Num => typeof x === "number" && Number.isFinite(x);
/** A usable price: a real number other than 0 (`isFinite(null)` is true and `Math.max(0, null)` is 0, so null / "" / false must not pass). */
const isPrice = (x: unknown): x is Num => isNum(x) && x !== 0;

/** Already a drawable bar: finite time and prices, `l <= min(o, c)` and `h >= max(o, c)`, a sane volume. */
export function isDrawable(c: Candle): boolean {
  return (
    isNum(c.t) &&
    isPrice(c.o) &&
    isPrice(c.h) &&
    isPrice(c.l) &&
    isPrice(c.c) &&
    c.l <= c.o &&
    c.l <= c.c &&
    c.h >= c.o &&
    c.h >= c.c &&
    isNum(c.v) &&
    c.v >= 0
  );
}

/**
 * One bar from outside -> a drawable bar, or null when it cannot be repaired (no time or no close).
 * A missing / zero open becomes the previous close (the bar opens where the last one ended), a missing high / low becomes the
 * extreme of open and close, and the high / low are stretched over open and close (the exchange feed delivers a forming bar
 * field by field, so its close can sit a tick outside the high / low for a moment).
 */
export function cleanCandle(raw: { t?: unknown; o?: unknown; h?: unknown; l?: unknown; c?: unknown; v?: unknown; k?: unknown }, prevClose?: number): Candle | null {
  if (!isNum(raw.t) || !isPrice(raw.c)) return null;
  const c = raw.c;
  const o = isPrice(raw.o) ? raw.o : isPrice(prevClose) ? prevClose : c;
  const h = Math.max(isPrice(raw.h) ? raw.h : o, o, c);
  const l = Math.min(isPrice(raw.l) ? raw.l : o, o, c);
  const out: Candle = { t: raw.t, o, h, l, c, v: isNum(raw.v) && raw.v > 0 ? raw.v : 0 };
  if (isNum(raw.k)) out.k = raw.k;
  return out;
}

/** A whole series (ascending): the same array when every bar is already drawable, else a repaired copy without the hopeless bars. */
export function cleanCandles(list: Candle[]): Candle[] {
  let all = true;
  for (let i = 0; i < list.length; i++) {
    if (!isDrawable(list[i])) {
      all = false;
      break;
    }
  }
  if (all) return list;
  const out: Candle[] = [];
  let prev: number | undefined;
  for (const raw of list) {
    const c = cleanCandle(raw, prev);
    if (!c) continue;
    out.push(c);
    prev = c.c;
  }
  return out;
}

export type MergeResult = "none" | "last" | "append" | "older";

/** How many bars back a refreshed bar may still replace its old version (a bar finished a moment ago gets its final numbers). */
export const MERGE_LOOKBACK = 12;

/**
 * Puts a bar into the ascending series in place: the newest bar is replaced, a newer one is appended, and an older one replaces
 * the bar with the same time when that is among the last MERGE_LOOKBACK bars (its final numbers arrive after the next bar has
 * already been opened from a quote). Anything else is ignored. Returns what happened.
 */
export function mergeCandle(list: Candle[], raw: { t?: unknown; o?: unknown; h?: unknown; l?: unknown; c?: unknown; v?: unknown }): MergeResult {
  const n = list.length;
  if (n === 0) return "none";
  const last = list[n - 1];
  if (!isNum(raw.t)) return "none";
  if (raw.t === last.t) {
    const c = cleanCandle(raw, n > 1 ? list[n - 2].c : undefined);
    if (!c) return "none";
    list[n - 1] = c;
    return "last";
  }
  if (raw.t > last.t) {
    const c = cleanCandle(raw, last.c);
    if (!c) return "none";
    list.push(c);
    return "append";
  }
  for (let i = n - 2; i >= 0 && i >= n - 1 - MERGE_LOOKBACK; i--) {
    if (list[i].t === raw.t) {
      const c = cleanCandle(raw, i > 0 ? list[i - 1].c : undefined);
      if (!c) return "none";
      list[i] = c;
      return "older";
    }
    if (list[i].t < raw.t) break;
  }
  return "none";
}
