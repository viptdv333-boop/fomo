import type { Candle, ChartType, TransformParams } from "./types";

/* Chart types whose bars are built from the OHLC data: Renko, Kagi, line break, range bars, Point & Figure.
   Every produced bar is a Candle: `t` is the time of the source candle that started the bar (non-decreasing, not
   uniform), o/h/l/c describe the brick / line / column, `k` carries the Kagi thickness or the P&F column kind. */

export interface TransformResult {
  bars: Candle[];
  /** Box (brick / range / reversal) size actually used, in price units; 0 when the type has none. */
  box: number;
}

const MAX_BARS = 20_000;

/** Wilder's ATR of the last candle; 0 when there is not enough data. */
export function atrOf(candles: Candle[], period: number): number {
  const n = candles.length;
  if (n < 2) return 0;
  const p = Math.max(1, Math.min(period, n - 1));
  let atr = 0;
  let count = 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const pc = candles[i - 1].c;
    const tr = Math.max(c.h - c.l, Math.abs(c.h - pc), Math.abs(c.l - pc));
    if (count < p) {
      atr += tr / p;
      count++;
    } else {
      atr = (atr * (p - 1) + tr) / p;
    }
  }
  return atr;
}

/** The unit size for Renko / range / Kagi / P&F from the user's method. */
export function resolveBox(candles: Candle[], p: TransformParams): number {
  const last = candles[candles.length - 1]?.c ?? 1;
  let box = 0;
  if (p.method === "fixed") box = p.box;
  else if (p.method === "percent") box = (last * p.percent) / 100;
  else box = atrOf(candles, p.atrPeriod);
  if (!isFinite(box) || box <= 0) box = Math.abs(last) * 0.01 || 1;
  return box;
}

function renko(cs: Candle[], b: number): Candle[] {
  const out: Candle[] = [];
  if (cs.length === 0) return out;
  const base = Math.round(cs[0].c / b) * b;
  let top = base;
  let bot = base;
  for (const k of cs) {
    let vol = k.v;
    for (let guard = 0; guard < 5000 && out.length < MAX_BARS; guard++) {
      if (k.c >= top + b - 1e-12) {
        out.push({ t: k.t, o: top, c: top + b, h: top + b, l: top, v: vol });
        bot = top;
        top += b;
      } else if (k.c <= bot - b + 1e-12) {
        out.push({ t: k.t, o: bot, c: bot - b, h: bot, l: bot - b, v: vol });
        top = bot;
        bot -= b;
      } else break;
      vol = 0;
    }
  }
  return out;
}

function rangeBars(cs: Candle[], rangeIn: number): Candle[] {
  const out: Candle[] = [];
  if (cs.length === 0) return out;
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of cs) {
    lo = Math.min(lo, k.l);
    hi = Math.max(hi, k.h);
  }
  const R = Math.max(rangeIn, (hi - lo) / 40_000, 1e-12);
  let cur: Candle | null = null;
  for (const k of cs) {
    const path = k.c >= k.o ? [k.o, k.l, k.h, k.c] : [k.o, k.h, k.l, k.c];
    for (const p of path) {
      if (!cur) {
        cur = { t: k.t, o: p, h: p, l: p, c: p, v: 0 };
        continue;
      }
      for (let guard = 0; guard < 40_000 && out.length < MAX_BARS; guard++) {
        const nh = Math.max(cur.h, p);
        const nl = Math.min(cur.l, p);
        if (nh - nl > R + 1e-12) {
          if (p > cur.h) {
            cur.h = cur.l + R;
            cur.c = cur.h;
          } else {
            cur.l = cur.h - R;
            cur.c = cur.l;
          }
          out.push(cur);
          cur = { t: k.t, o: cur.c, h: cur.c, l: cur.c, c: cur.c, v: 0 };
        } else {
          cur.h = nh;
          cur.l = nl;
          cur.c = p;
          break;
        }
      }
    }
    if (cur) cur.v += k.v;
  }
  if (cur) out.push(cur);
  return out;
}

function lineBreak(cs: Candle[], nLines: number): Candle[] {
  const out: Candle[] = [];
  if (cs.length < 2) return out;
  const n = Math.max(2, Math.round(nLines));
  let prev = cs[0].c;
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i].c;
    const mk = (o: number): Candle => ({ t: cs[i].t, o, c, h: Math.max(o, c), l: Math.min(o, c), v: cs[i].v });
    if (out.length === 0) {
      if (c !== prev) out.push(mk(prev));
      continue;
    }
    const last = out[out.length - 1];
    let hiN = -Infinity;
    let loN = Infinity;
    for (let j = Math.max(0, out.length - n); j < out.length; j++) {
      hiN = Math.max(hiN, out[j].h);
      loN = Math.min(loN, out[j].l);
    }
    if (last.c >= last.o) {
      if (c > last.c) out.push(mk(last.c));
      else if (c < loN) out.push(mk(last.o));
    } else {
      if (c < last.c) out.push(mk(last.c));
      else if (c > hiN) out.push(mk(last.o));
    }
    if (out.length >= MAX_BARS) break;
  }
  return out;
}

function kagi(cs: Candle[], R: number): Candle[] {
  const out: Candle[] = [];
  if (cs.length < 2) return out;
  let dir = 0;
  let start = cs[0].c;
  let end = start;
  let segT = cs[0].t;
  let vol = 0;
  let peak = start;
  let trough = start;
  let thick = true;
  const flush = () => {
    out.push({ t: segT, o: start, c: end, h: Math.max(start, end), l: Math.min(start, end), v: vol, k: thick ? 1 : 0 });
    vol = 0;
  };
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i].c;
    vol += cs[i].v;
    if (dir === 0) {
      if (c >= start + R) {
        dir = 1;
        end = c;
        segT = cs[i].t;
        thick = true;
      } else if (c <= start - R) {
        dir = -1;
        end = c;
        segT = cs[i].t;
        thick = false;
      }
      continue;
    }
    if (dir === 1) {
      if (c > end) end = c;
      else if (c <= end - R) {
        flush();
        peak = end;
        start = end;
        end = c;
        dir = -1;
        segT = cs[i].t;
      }
      if (end > peak) thick = true;
    } else {
      if (c < end) end = c;
      else if (c >= end + R) {
        flush();
        trough = end;
        start = end;
        end = c;
        dir = 1;
        segT = cs[i].t;
      }
      if (end < trough) thick = false;
    }
    if (out.length >= MAX_BARS) break;
  }
  if (dir !== 0) flush();
  return out;
}

function pointFigure(cs: Candle[], B: number, reversal: number): Candle[] {
  const out: Candle[] = [];
  if (cs.length === 0) return out;
  const r = Math.max(1, Math.round(reversal));
  const floorB = (v: number) => Math.floor(v / B + 1e-9) * B;
  const ceilB = (v: number) => Math.ceil(v / B - 1e-9) * B;
  const base = Math.round(cs[0].c / B) * B;
  type Col = { dir: 1 | -1; lo: number; hi: number; t: number; v: number };
  let col: Col | null = null;
  const done: Col[] = [];
  for (const k of cs) {
    if (!col) {
      if (k.h >= base + B - 1e-12 && (k.c >= k.o || k.l > base - B)) col = { dir: 1, lo: base, hi: floorB(k.h), t: k.t, v: k.v };
      else if (k.l <= base - B + 1e-12) col = { dir: -1, hi: base, lo: ceilB(k.l), t: k.t, v: k.v };
      continue;
    }
    col.v += k.v;
    if (col.dir === 1) {
      if (k.h >= col.hi + B - 1e-12) col.hi = Math.max(col.hi, floorB(k.h));
      else if (k.l <= col.hi - r * B + 1e-12) {
        done.push(col);
        col = { dir: -1, hi: col.hi - B, lo: ceilB(k.l), t: k.t, v: 0 };
      }
    } else {
      if (k.l <= col.lo - B + 1e-12) col.lo = Math.min(col.lo, ceilB(k.l));
      else if (k.h >= col.lo + r * B - 1e-12) {
        done.push(col);
        col = { dir: 1, lo: col.lo + B, hi: floorB(k.h), t: k.t, v: 0 };
      }
    }
    if (done.length >= MAX_BARS) break;
  }
  if (col) done.push(col);
  for (const c of done) {
    const x = c.dir === 1;
    out.push({ t: c.t, o: x ? c.lo : c.hi, c: x ? c.hi : c.lo, h: c.hi, l: c.lo, v: c.v, k: x ? 1 : 0 });
  }
  return out;
}

export function transformBars(type: ChartType, candles: Candle[], p: TransformParams): TransformResult {
  if (candles.length === 0) return { bars: [], box: 0 };
  switch (type) {
    case "renko": {
      const box = resolveBox(candles, p);
      return { bars: renko(candles, box), box };
    }
    case "range": {
      const box = resolveBox(candles, p);
      return { bars: rangeBars(candles, box), box };
    }
    case "kagi": {
      const box = resolveBox(candles, p);
      return { bars: kagi(candles, box), box };
    }
    case "pnf": {
      const box = resolveBox(candles, p);
      return { bars: pointFigure(candles, box, p.reversal), box };
    }
    case "linebreak":
      return { bars: lineBreak(candles, p.breakLines), box: 0 };
    default:
      return { bars: candles, box: 0 };
  }
}
