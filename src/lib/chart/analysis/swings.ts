/**
 * Swing (pivot) detection shared by the automatic pattern indicators (Elliott waves, chart patterns).
 * ATR-adaptive zigzag: a swing high/low is confirmed once price retraces from the running extreme by
 * `atrMult` × ATR (or `minPct` percent, whichever is larger). The last pivot is the running extreme and is
 * returned as provisional (`confirmed: false`), so live analysis can use the forming leg.
 */

export interface SwingCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
}

export interface Pivot {
  /** Index of the candle in the input array. */
  i: number;
  t: number;
  p: number;
  type: "H" | "L";
  /** false for the last, still moving extreme. */
  confirmed: boolean;
}

export interface SwingOptions {
  atrPeriod?: number;
  /** Minimum reversal as a multiple of ATR (default 2). Larger = bigger swings = higher wave degree. */
  atrMult?: number;
  /** Minimum reversal as a percentage of price (default 0). */
  minPct?: number;
}

/** Wilder ATR for every candle (index-aligned, first values use the running mean). */
export function atrSeries(c: SwingCandle[], period = 14): number[] {
  const out: number[] = new Array(c.length).fill(0);
  let prevClose = c[0]?.c ?? 0;
  let atr = 0;
  for (let i = 0; i < c.length; i++) {
    const tr = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - prevClose), Math.abs(c[i].l - prevClose));
    atr = i < period ? (atr * i + tr) / (i + 1) : (atr * (period - 1) + tr) / period;
    out[i] = atr;
    prevClose = c[i].c;
  }
  return out;
}

export function zigzag(c: SwingCandle[], opts: SwingOptions = {}): Pivot[] {
  const n = c.length;
  if (n < 3) return [];
  const atr = atrSeries(c, opts.atrPeriod ?? 14);
  const mult = opts.atrMult ?? 2;
  const minPct = (opts.minPct ?? 0) / 100;
  const thr = (i: number, price: number) => Math.max(atr[i] * mult, price * minPct);

  const pivots: Pivot[] = [];
  let dir: 1 | -1 | 0 = 0; // 1 = up leg (tracking a high), -1 = down leg (tracking a low)
  let hiI = 0;
  let loI = 0;

  for (let i = 1; i < n; i++) {
    if (c[i].h > c[hiI].h) hiI = i;
    if (c[i].l < c[loI].l) loI = i;
    if (dir === 0) {
      if (c[hiI].h - c[i].l >= thr(i, c[i].l) && hiI > loI) {
        pivots.push({ i: loI, t: c[loI].t, p: c[loI].l, type: "L", confirmed: true });
        dir = 1;
        loI = i;
      } else if (c[i].h - c[loI].l >= thr(i, c[i].h) && loI > hiI) {
        pivots.push({ i: hiI, t: c[hiI].t, p: c[hiI].h, type: "H", confirmed: true });
        dir = -1;
        hiI = i;
      } else if (c[hiI].h - c[loI].l >= thr(i, c[i].c)) {
        // first leg decided by which extreme came first
        if (loI < hiI) {
          pivots.push({ i: loI, t: c[loI].t, p: c[loI].l, type: "L", confirmed: true });
          dir = 1;
          loI = i;
        } else {
          pivots.push({ i: hiI, t: c[hiI].t, p: c[hiI].h, type: "H", confirmed: true });
          dir = -1;
          hiI = i;
        }
      }
      continue;
    }
    if (dir === 1) {
      // up leg: extreme is the highest high since the last low
      if (c[i].h >= c[hiI].h) {
        hiI = i;
      } else if (c[hiI].h - c[i].l >= thr(i, c[hiI].h)) {
        pivots.push({ i: hiI, t: c[hiI].t, p: c[hiI].h, type: "H", confirmed: true });
        dir = -1;
        loI = i;
      }
    } else {
      if (c[i].l <= c[loI].l) {
        loI = i;
      } else if (c[i].h - c[loI].l >= thr(i, c[loI].l)) {
        pivots.push({ i: loI, t: c[loI].t, p: c[loI].l, type: "L", confirmed: true });
        dir = 1;
        hiI = i;
      }
    }
  }
  if (dir === 1) pivots.push({ i: hiI, t: c[hiI].t, p: c[hiI].h, type: "H", confirmed: false });
  else if (dir === -1) pivots.push({ i: loI, t: c[loI].t, p: c[loI].l, type: "L", confirmed: false });
  return pivots;
}

/** Least-squares line through pivots: y = a + b·x with x = candle index. */
export function fitLine(points: { i: number; p: number }[]): { a: number; b: number; r2: number } {
  const n = points.length;
  if (n < 2) return { a: points[0]?.p ?? 0, b: 0, r2: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const q of points) {
    sx += q.i;
    sy += q.p;
    sxx += q.i * q.i;
    sxy += q.i * q.p;
    syy += q.p * q.p;
  }
  const den = n * sxx - sx * sx || 1;
  const b = (n * sxy - sx * sy) / den;
  const a = (sy - b * sx) / n;
  const ssTot = syy - (sy * sy) / n || 1;
  let ssRes = 0;
  for (const q of points) ssRes += (q.p - (a + b * q.i)) ** 2;
  return { a, b, r2: Math.max(0, 1 - ssRes / ssTot) };
}

/* ───────────── additional swing modes (Double ZigZag indicator) ───────────── */

/**
 * Pine-style pivots (`ta.pivothigh / ta.pivotlow`): bar i is a swing high when its high is strictly above the `left` bars before it
 * and not below the `right` bars after it (symmetrically for lows), so the pivot is confirmed `right` bars later and never repaints.
 * Consecutive pivots of the same type are merged (the more extreme one wins), so the result alternates H / L. The last pivot is
 * the pending extreme of the opposite type after the last confirmed one (`confirmed: false`).
 */
export function pivotSwings(c: SwingCandle[], left = 5, right = left): Pivot[] {
  const n = c.length;
  left = Math.max(1, Math.floor(left) || 1);
  right = Math.max(1, Math.floor(right) || 1);
  if (n < left + right + 1) return [];
  const out: Pivot[] = [];
  const push = (i: number, type: "H" | "L") => {
    const p = type === "H" ? c[i].h : c[i].l;
    if (!(p === p) || p === Infinity || p === -Infinity) return;
    const last = out[out.length - 1];
    if (last && last.type === type) {
      if (type === "H" ? p > last.p : p < last.p) out[out.length - 1] = { i, t: c[i].t, p, type, confirmed: true };
      return;
    }
    out.push({ i, t: c[i].t, p, type, confirmed: true });
  };
  for (let i = left; i <= n - 1 - right; i++) {
    const hi = c[i].h;
    const lo = c[i].l;
    let isH = hi === hi;
    let isL = lo === lo;
    for (let j = i - left; (isH || isL) && j < i; j++) {
      if (!(c[j].h < hi)) isH = false;
      if (!(c[j].l > lo)) isL = false;
    }
    for (let j = i + 1; (isH || isL) && j <= i + right; j++) {
      if (!(c[j].h <= hi)) isH = false;
      if (!(c[j].l >= lo)) isL = false;
    }
    if (isH && isL) {
      // an outside bar is both: put the type that continues the alternation first
      const last = out[out.length - 1];
      const lowFirst = last ? last.type === "H" : c[i].c >= c[i].o;
      if (lowFirst) {
        push(i, "L");
        push(i, "H");
      } else {
        push(i, "H");
        push(i, "L");
      }
    } else if (isH) push(i, "H");
    else if (isL) push(i, "L");
  }
  const last = out[out.length - 1];
  if (last && last.i < n - 1) {
    let k = -1;
    for (let j = last.i + 1; j < n; j++) {
      if (last.type === "H" ? (k < 0 || c[j].l < c[k].l) : (k < 0 || c[j].h > c[k].h)) k = j;
    }
    if (k >= 0) out.push({ i: k, t: c[k].t, p: last.type === "H" ? c[k].l : c[k].h, type: last.type === "H" ? "L" : "H", confirmed: false });
  }
  return out;
}

export type SwingMode = "pivot" | "pct" | "atr";

export interface SwingSpec {
  mode: SwingMode;
  /** pivot: bars to each side. */
  bars?: number;
  /** pct: reversal in percent of price. */
  pct?: number;
  /** atr: reversal in ATR multiples. */
  atr?: number;
  atrPeriod?: number;
}

/** Swing detection by the chosen mode: Pivot bars, Deviation % or ATR × k (all return alternating H/L, the last one provisional). */
export function detectSwings(c: SwingCandle[], spec: SwingSpec): Pivot[] {
  if (c.length < 3) return [];
  if (spec.mode === "pivot") return pivotSwings(c, spec.bars ?? 5, spec.bars ?? 5);
  if (spec.mode === "pct") return zigzag(c, { atrMult: 0, minPct: Math.max(1e-6, spec.pct ?? 1), atrPeriod: spec.atrPeriod });
  return zigzag(c, { atrMult: Math.max(1e-6, spec.atr ?? 2), atrPeriod: spec.atrPeriod });
}
