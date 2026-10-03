/* Joins ALGOPACK rows onto chart bars (pure, no canvas, no network).

   SuperCandles are 5-minute bars. A chart bar of 5 minutes or more takes all rows that BEGIN inside it; a bar shorter than
   5 minutes takes the one row that covers it (its value repeats over the bars of that interval).
   FUTOI snapshots and HI2 days are point-in-time: a bar sees the last value that was already published when the bar closed
   (as-of join), so a bar never looks into its own future. */

export const SC_STEP_MS = 5 * 60_000;

interface Bar {
  t: number;
}

/** First index with arr[i] >= x. */
export function lowerBound(arr: ArrayLike<number>, x: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] < x) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** End of bar i: the next bar's start, but never later than start + the nominal interval. */
export function barEnd(candles: readonly Bar[], i: number, intervalMs: number): number {
  const start = candles[i].t;
  const nominal = start + (intervalMs > 0 ? intervalMs : SC_STEP_MS);
  return i + 1 < candles.length ? Math.min(candles[i + 1].t, nominal) : nominal;
}

export interface Ranges {
  lo: Int32Array;
  /** exclusive; hi <= lo means "no rows" */
  hi: Int32Array;
}

/** For every bar the [lo, hi) range of rows (ascending row times `rowT`, each row covering `stepMs`). */
export function barRanges(candles: readonly Bar[], intervalMs: number, rowT: ArrayLike<number>, stepMs = SC_STEP_MS): Ranges {
  const n = candles.length;
  const lo = new Int32Array(n);
  const hi = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const start = candles[i].t;
    const end = barEnd(candles, i, intervalMs);
    if (end - start >= stepMs) {
      lo[i] = lowerBound(rowT, start);
      hi[i] = lowerBound(rowT, end);
    } else {
      // shorter than a row: the row that contains the bar start
      const k = lowerBound(rowT, start + 1) - 1;
      if (k >= 0 && start < rowT[k] + stepMs) {
        lo[i] = k;
        hi[i] = k + 1;
      } else {
        lo[i] = 0;
        hi[i] = 0;
      }
    }
  }
  return { lo, hi };
}

/** Sum of a column over each bar's rows (NaN when the bar has no row or only NaN). */
export function sumCol(r: Ranges, col: ArrayLike<number>): Float64Array {
  const n = r.lo.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let any = false;
    for (let k = r.lo[i]; k < r.hi[i]; k++) {
      const v = col[k];
      if (v === v) {
        s += v;
        any = true;
      }
    }
    if (any) out[i] = s;
  }
  return out;
}

/** Value of the last row of each bar that has one (NaN when none). */
export function lastCol(r: Ranges, col: ArrayLike<number>): Float64Array {
  const n = r.lo.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    for (let k = r.hi[i] - 1; k >= r.lo[i]; k--) {
      const v = col[k];
      if (v === v) {
        out[i] = v;
        break;
      }
    }
  }
  return out;
}

/** Plain mean of a column over each bar's rows. */
export function meanCol(r: Ranges, col: ArrayLike<number>): Float64Array {
  const n = r.lo.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = r.lo[i]; k < r.hi[i]; k++) {
      const v = col[k];
      if (v === v) {
        s += v;
        c++;
      }
    }
    if (c) out[i] = s / c;
  }
  return out;
}

/**
 * As-of join: for each bar the last row whose time + `delayMs` is <= the bar end (`delayMs`: how long after its stamp the row is
 * published; FUTOI 0, HI2 one trading day). Rows older than `maxStaleMs` before the bar start are not used.
 */
export function asOfCol(candles: readonly Bar[], intervalMs: number, rowT: ArrayLike<number>, col: ArrayLike<number>, delayMs = 0, maxStaleMs = 4 * 86_400_000): Float64Array {
  const n = candles.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const end = barEnd(candles, i, intervalMs);
    // last row with t + delay <= end  <=>  t <= end - delay
    let k = lowerBound(rowT, end - delayMs + 1) - 1;
    // skip rows without a value
    while (k >= 0 && !(col[k] === col[k])) k--;
    if (k >= 0 && rowT[k] + delayMs >= candles[i].t - maxStaleMs) out[i] = col[k];
  }
  return out;
}

/** Simple moving average that ignores nothing: windows with a NaN give NaN only when `strict`. length <= 1 returns the input. */
export function smooth(data: Float64Array, length: number): Float64Array {
  if (length <= 1) return data;
  const n = data.length;
  const out = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = Math.max(0, i - length + 1); k <= i; k++) {
      const v = data[k];
      if (v === v) {
        s += v;
        c++;
      }
    }
    if (c) out[i] = s / c;
  }
  return out;
}

/** Index of the bar that contains time t (the last bar starting at or before t, within its extent), -1 if none. */
export function barIndexAt(candles: readonly Bar[], intervalMs: number, t: number): number {
  const n = candles.length;
  if (n === 0) return -1;
  let lo = 0;
  let hi = n - 1;
  let found = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (candles[m].t <= t) {
      found = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  if (found < 0) return -1;
  return t < barEnd(candles, found, intervalMs) ? found : -1;
}
