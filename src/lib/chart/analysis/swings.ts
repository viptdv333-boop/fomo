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
