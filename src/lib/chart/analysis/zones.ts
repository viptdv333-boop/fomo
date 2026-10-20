import type { Candle } from "../types";
import * as M from "../indicators/math";
import { DEFAULT_VP_OPTS, buildVp, smoothRows } from "./vprofile";

/* Imbalances and liquidity zones, from candles only (any timeframe, any source). Pure: no DOM, no engine.
     - Fair value gaps (3-candle imbalances), opening gaps, volume imbalances (body gaps), with mitigation;
     - liquidity pools: clusters of equal swing highs / lows (buy-side / sell-side liquidity) that live until swept;
     - high-volume nodes (volume clusters) of the last N bars, by price rows;
     - order blocks: the last opposite candle before an impulse;
     - candle-approximated delta imbalance (bar shape x volume, NOT real aggressor volume).
   Every pass is O(n) times a small constant (active lists are capped), so 5k bars cost a few milliseconds. */

export type SizeUnit = "atr" | "pct";
export type Mitigation = "touch" | "wick" | "close";

const fin = (v: number) => typeof v === "number" && isFinite(v);

/** ATR with the first valid value carried back over the warm-up bars (a zone near the start of the data still gets a size). */
function atrFilled(cs: readonly Candle[], len: number): Float64Array {
  const n = cs.length;
  const h = new Float64Array(n);
  const l = new Float64Array(n);
  const c = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = cs[i].h;
    l[i] = cs[i].l;
    c[i] = cs[i].c;
  }
  const a = M.atr(h, l, c, len);
  let first = -1;
  for (let i = 0; i < n; i++) {
    if (fin(a[i])) {
      first = i;
      break;
    }
  }
  if (first < 0) {
    // too few bars for the ATR: the mean range
    let s = 0;
    for (let i = 0; i < n; i++) s += h[i] - l[i];
    a.fill(n > 0 ? s / n : 0);
    return a;
  }
  for (let i = 0; i < first; i++) a[i] = a[first];
  return a;
}

/** A size in price units from the "× ATR" / "% of price" setting. */
function sizeOf(unit: SizeUnit, k: number, atrV: number, price: number): number {
  return unit === "pct" ? (Math.abs(price) * k) / 100 : k * atrV;
}

/* ───────────── zones: FVG, gaps, volume imbalances, order blocks ───────────── */

export type ZoneKind = "fvg" | "gap" | "vi" | "ob";

export interface Zone {
  kind: ZoneKind;
  /** +1 bullish (support below price), -1 bearish. */
  dir: 1 | -1;
  /** Bar the box starts at (the middle candle of an FVG). */
  i0: number;
  /** Bar that mitigated the zone; -1 while it is alive. */
  i1: number;
  /** Current edges (shrunk by partial mitigation when that option is on). */
  lo: number;
  hi: number;
  /** Original edges. */
  lo0: number;
  hi0: number;
  /** Bar at which the zone became known (the third candle of an FVG). */
  born: number;
  /** Share of the original height that price has already filled, 0..1. */
  filled: number;
}

export interface FvgOptions {
  /** Analyse the last N bars. */
  lookback: number;
  minSize: number;
  unit: SizeUnit;
  atrLen: number;
  mitigation: Mitigation;
  /** Partial mitigation: the box shrinks to what is still unfilled. */
  shrink: boolean;
  /** Opening gaps (low[i] > high[i-1]) that are not part of an FVG. */
  gaps: boolean;
  /** Volume imbalances: gaps between the bodies of neighbouring candles (the wicks overlap). */
  volImb: boolean;
}

export const DEFAULT_FVG: FvgOptions = { lookback: 1000, minSize: 0.25, unit: "atr", atrLen: 14, mitigation: "wick", shrink: true, gaps: false, volImb: false };

const ACTIVE_CAP = 400;

/** Applies bar j to a live zone. Returns true when the zone is mitigated by this bar. */
function touchZone(z: Zone, c: Candle, j: number, mode: Mitigation, shrink: boolean): boolean {
  const h0 = z.hi0 - z.lo0;
  if (z.dir > 0) {
    // support below price: price comes down into [lo, hi]
    if (!(c.l < z.hi)) return false;
    if (mode === "touch") {
      z.filled = 1;
      z.i1 = j;
      return true;
    }
    const probe = mode === "close" ? c.c : c.l;
    if (probe <= z.lo0) {
      z.filled = 1;
      z.i1 = j;
      return true;
    }
    if (shrink && probe < z.hi) {
      z.hi = Math.max(z.lo0, probe);
      z.filled = h0 > 0 ? (z.hi0 - z.hi) / h0 : 1;
    }
    return false;
  }
  if (!(c.h > z.lo)) return false;
  if (mode === "touch") {
    z.filled = 1;
    z.i1 = j;
    return true;
  }
  const probe = mode === "close" ? c.c : c.h;
  if (probe >= z.hi0) {
    z.filled = 1;
    z.i1 = j;
    return true;
  }
  if (shrink && probe > z.lo) {
    z.lo = Math.min(z.hi0, probe);
    z.filled = h0 > 0 ? (z.lo - z.lo0) / h0 : 1;
  }
  return false;
}

function mkZone(kind: ZoneKind, dir: 1 | -1, i0: number, born: number, lo: number, hi: number): Zone {
  return { kind, dir, i0, i1: -1, lo, hi, lo0: lo, hi0: hi, born, filled: 0 };
}

/** Walks the bars once: new zones are added by `emit` at their birth bar, every live zone is then tested against each later bar. */
function runZones(cs: readonly Candle[], start: number, emit: (i: number, out: Zone[]) => void, mode: Mitigation, shrink: boolean): Zone[] {
  const n = cs.length;
  const all: Zone[] = [];
  let active: Zone[] = [];
  const born: Zone[] = [];
  for (let i = start; i < n; i++) {
    // 1) mitigation of the zones born earlier
    if (active.length) {
      let w = 0;
      for (let k = 0; k < active.length; k++) {
        const z = active[k];
        if (!touchZone(z, cs[i], i, mode, shrink)) active[w++] = z;
      }
      active.length = w;
    }
    // 2) zones born at this bar (their own bar never mitigates them)
    born.length = 0;
    emit(i, born);
    for (const z of born) {
      all.push(z);
      active.push(z);
    }
    if (active.length > ACTIVE_CAP) active = active.slice(active.length - ACTIVE_CAP);
  }
  return all;
}

/** Fair value gaps (+ optional opening gaps and volume imbalances) with mitigation. Oldest first. */
export function detectFvg(cs: readonly Candle[], o: FvgOptions): Zone[] {
  const n = cs.length;
  if (n < 3) return [];
  const start = Math.max(2, n - Math.max(3, Math.floor(o.lookback)));
  const atr = atrFilled(cs, o.atrLen);
  const big = (i: number, size: number, price: number) => size > 0 && size >= sizeOf(o.unit, o.minSize, atr[i], price);
  return runZones(
    cs,
    start,
    (i, out) => {
      const a = cs[i - 2];
      const b = cs[i - 1];
      const c = cs[i];
      if (!fin(a.h) || !fin(a.l) || !fin(b.h) || !fin(b.l) || !fin(c.h) || !fin(c.l)) return;
      let fvgUp = false;
      let fvgDn = false;
      if (c.l > a.h) {
        fvgUp = true;
        if (big(i, c.l - a.h, c.c)) out.push(mkZone("fvg", 1, i - 1, i, a.h, c.l));
      }
      if (c.h < a.l) {
        fvgDn = true;
        if (big(i, a.l - c.h, c.c)) out.push(mkZone("fvg", -1, i - 1, i, c.h, a.l));
      }
      if (o.gaps) {
        if (!fvgUp && c.l > b.h && big(i, c.l - b.h, c.c)) out.push(mkZone("gap", 1, i - 1, i, b.h, c.l));
        if (!fvgDn && c.h < b.l && big(i, b.l - c.h, c.c)) out.push(mkZone("gap", -1, i - 1, i, c.h, b.l));
      }
      if (o.volImb) {
        const bTop = Math.max(b.o, b.c);
        const bBot = Math.min(b.o, b.c);
        const cTop = Math.max(c.o, c.c);
        const cBot = Math.min(c.o, c.c);
        if (cBot > bTop && c.l <= b.h && big(i, cBot - bTop, c.c)) out.push(mkZone("vi", 1, i - 1, i, bTop, cBot));
        if (cTop < bBot && c.h >= b.l && big(i, bBot - cTop, c.c)) out.push(mkZone("vi", -1, i - 1, i, cTop, bBot));
      }
    },
    o.mitigation,
    o.shrink,
  );
}

export interface ObOptions {
  lookback: number;
  /** Impulse size, × ATR. */
  impulse: number;
  atrLen: number;
  /** The impulse has to happen within this many bars after the candle. */
  within: number;
  mitigation: Mitigation;
}

export const DEFAULT_OB: ObOptions = { lookback: 1000, impulse: 1.5, atrLen: 14, within: 3, mitigation: "close" };

/** Order blocks: the last down candle before an up impulse (bullish) / the last up candle before a down impulse (bearish). Oldest first. */
export function detectOrderBlocks(cs: readonly Candle[], o: ObOptions): Zone[] {
  const n = cs.length;
  if (n < 4) return [];
  const within = Math.max(1, Math.floor(o.within));
  const start = Math.max(0, n - Math.max(5, Math.floor(o.lookback)));
  const atr = atrFilled(cs, o.atrLen);
  // an order block is only known once its impulse is complete: it is "born" at the bar that completes the impulse
  const found: { dir: 1 | -1; idx: number; born: number }[] = [];
  let lastBull = -1e9;
  let lastBear = -1e9;
  for (let i = start; i < n - 1; i++) {
    const c = cs[i];
    if (!fin(c.o) || !fin(c.c)) continue;
    const next = cs[i + 1];
    const need = o.impulse * atr[i];
    if (c.c < c.o && next.c > next.o && i - lastBull > within) {
      // last down candle, followed by an up candle that closes above its high
      const top = Math.min(n - 1, i + within);
      for (let j = i + 1; j <= top; j++) {
        if (cs[j].c > c.h && cs[j].c - c.l >= need) {
          found.push({ dir: 1, idx: i, born: j });
          lastBull = i;
          break;
        }
      }
    } else if (c.c > c.o && next.c < next.o && i - lastBear > within) {
      const top = Math.min(n - 1, i + within);
      for (let j = i + 1; j <= top; j++) {
        if (cs[j].c < c.l && c.h - cs[j].c >= need) {
          found.push({ dir: -1, idx: i, born: j });
          lastBear = i;
          break;
        }
      }
    }
  }
  if (!found.length) return [];
  found.sort((a, b) => a.born - b.born);
  let k = 0;
  return runZones(
    cs,
    found[0].born,
    (i, out) => {
      while (k < found.length && found[k].born === i) {
        const f = found[k++];
        const c = cs[f.idx];
        out.push(mkZone("ob", f.dir, f.idx, i, c.l, c.h));
      }
    },
    o.mitigation,
    false,
  );
}

/* ───────────── liquidity pools: equal highs / lows ───────────── */

export interface LiqOptions {
  lookback: number;
  /** Bars on each side of a swing. */
  pivot: number;
  tol: number;
  unit: SizeUnit;
  atrLen: number;
  /** Swings in a pool to count as a liquidity pool (1 = every swing). */
  minTouches: number;
  /** "wick": a high above the pool is a sweep; "close": a close above it. */
  sweep: "wick" | "close";
}

export const DEFAULT_LIQ: LiqOptions = { lookback: 1000, pivot: 3, tol: 0.15, unit: "atr", atrLen: 14, minTouches: 2, sweep: "wick" };

export interface Pool {
  /** +1 buy-side liquidity (stops above equal highs), -1 sell-side (below equal lows). */
  side: 1 | -1;
  /** The extreme of the cluster (highest high / lowest low): where the stops are. */
  level: number;
  /** Other edge of the cluster band. */
  edge: number;
  /** Swing bars of the cluster. */
  pts: number[];
  /** First swing / last swing bars. */
  i0: number;
  iLast: number;
  /** Bar at which the last swing was confirmed (the pool is known from there). */
  known: number;
  /** Bar that swept the pool; -1 while it is alive. */
  swept: number;
  tol: number;
}

export function detectLiquidity(cs: readonly Candle[], o: LiqOptions): Pool[] {
  const n = cs.length;
  const L = Math.max(1, Math.floor(o.pivot));
  if (n < 2 * L + 2) return [];
  const start = Math.max(0, n - Math.max(2 * L + 2, Math.floor(o.lookback)));
  const atr = atrFilled(cs, o.atrLen);
  const all: Pool[] = [];
  let alive: Pool[] = [];
  for (let j = start; j < n; j++) {
    const bar = cs[j];
    // 1) sweeps
    if (alive.length) {
      let w = 0;
      for (let k = 0; k < alive.length; k++) {
        const p = alive[k];
        const probe = p.side > 0 ? (o.sweep === "close" ? bar.c : bar.h) : o.sweep === "close" ? bar.c : bar.l;
        const through = p.side > 0 ? probe > p.level + p.tol : probe < p.level - p.tol;
        if (through) p.swept = j;
        else alive[w++] = p;
      }
      alive.length = w;
    }
    // 2) the swing confirmed at this bar (L bars have closed after it)
    const s = j - L;
    if (s - L < start) continue;
    const sh = cs[s].h;
    const sl = cs[s].l;
    let isH = fin(sh);
    let isL = fin(sl);
    for (let q = s - L; q <= s + L && (isH || isL); q++) {
      if (q === s) continue;
      if (isH && (q < s ? cs[q].h >= sh : cs[q].h > sh)) isH = false;
      if (isL && (q < s ? cs[q].l <= sl : cs[q].l < sl)) isL = false;
    }
    for (const side of [1, -1] as const) {
      if (side > 0 ? !isH : !isL) continue;
      const price = side > 0 ? sh : sl;
      const tol = sizeOf(o.unit, o.tol, atr[s], price);
      // a swing that is already beyond a later bar (swept before confirmation) does not make a pool of its own
      let joined: Pool | null = null;
      for (const p of alive) {
        if (p.side !== side) continue;
        if (Math.abs(price - p.level) <= Math.max(p.tol, tol)) {
          joined = p;
          break;
        }
      }
      if (joined) {
        joined.pts.push(s);
        joined.iLast = s;
        joined.known = j;
        if (side > 0) {
          joined.level = Math.max(joined.level, price);
          joined.edge = Math.min(joined.edge, price);
        } else {
          joined.level = Math.min(joined.level, price);
          joined.edge = Math.max(joined.edge, price);
        }
      } else {
        const p: Pool = { side, level: price, edge: price, pts: [s], i0: s, iLast: s, known: j, swept: -1, tol };
        alive.push(p);
        all.push(p);
        if (alive.length > 96) alive.splice(0, alive.length - 96);
      }
    }
  }
  return all.filter((p) => p.pts.length >= Math.max(1, Math.floor(o.minTouches)));
}

/* ───────────── high-volume nodes ───────────── */

export interface HvnOptions {
  /** Window: the last N bars. */
  lookback: number;
  rows: number;
  smooth: number;
  /** Nodes to return. */
  top: number;
  /** A row belongs to a node while its volume is at least this % of the node's peak. */
  width: number;
  /** A peak counts as a node when its volume is at least this % of the POC volume. */
  minVol: number;
}

export const DEFAULT_HVN: HvnOptions = { lookback: 300, rows: 50, smooth: 1, top: 3, width: 60, minVol: 40 };

export interface HvnNode {
  lo: number;
  hi: number;
  /** Price row of the peak. */
  peak: number;
  /** Share of the window's volume inside the node, %. */
  share: number;
  /** 1 = strongest node (the POC). */
  rank: number;
}

export interface HvnResult {
  /** Window bars. */
  a: number;
  b: number;
  poc: number;
  nodes: HvnNode[];
  /** Volume per row (for the tests / tips). */
  rowLo: number;
  rowStep: number;
  rows: Float64Array;
}

export function detectHvn(cs: readonly Candle[], o: HvnOptions): HvnResult | null {
  const n = cs.length;
  if (n < 2) return null;
  const b = n - 1;
  const a = Math.max(0, n - Math.max(2, Math.floor(o.lookback)));
  const vp = buildVp(cs as Candle[], a, b, null, { ...DEFAULT_VP_OPTS, rowMode: "rows", rows: Math.max(5, Math.floor(o.rows)), smooth: 0, useFlow: false });
  if (!vp) return null;
  const tot = o.smooth > 0 ? smoothRows(vp.tot, Math.floor(o.smooth)) : vp.tot;
  const m = tot.length;
  let max = 0;
  let pocRow = 0;
  let total = 0;
  for (let k = 0; k < m; k++) {
    total += tot[k];
    if (tot[k] > max) {
      max = tot[k];
      pocRow = k;
    }
  }
  if (!(max > 0)) return null;
  const step = vp.grid.step;
  const base = vp.grid.lo;
  // local maxima (plateaus count once, at their first row)
  const peaks: number[] = [];
  for (let k = 0; k < m; k++) {
    const v = tot[k];
    if (!(v > 0) || v < (max * o.minVol) / 100) continue;
    const l = k > 0 ? tot[k - 1] : 0;
    const r = k < m - 1 ? tot[k + 1] : 0;
    if (v > l && v >= r) peaks.push(k);
  }
  peaks.sort((x, y) => tot[y] - tot[x]);
  const taken = new Uint8Array(m);
  const nodes: HvnNode[] = [];
  const limitFrac = Math.min(0.99, Math.max(0.05, o.width / 100));
  for (const pk of peaks) {
    if (nodes.length >= Math.max(1, Math.floor(o.top))) break;
    if (taken[pk]) continue;
    const lim = tot[pk] * limitFrac;
    let r0 = pk;
    let r1 = pk;
    while (r0 > 0 && tot[r0 - 1] >= lim && !taken[r0 - 1]) r0--;
    while (r1 < m - 1 && tot[r1 + 1] >= lim && !taken[r1 + 1]) r1++;
    let sum = 0;
    for (let k = r0; k <= r1; k++) {
      taken[k] = 1;
      sum += tot[k];
    }
    nodes.push({ lo: base + r0 * step, hi: base + (r1 + 1) * step, peak: base + (pk + 0.5) * step, share: total > 0 ? (100 * sum) / total : 0, rank: nodes.length + 1 });
  }
  return { a, b, poc: base + (pocRow + 0.5) * step, nodes, rowLo: base, rowStep: step, rows: tot };
}

/* ───────────── delta imbalance (candle approximation) ───────────── */

export interface DeltaOptions {
  /** |delta| / volume needed for an imbalance bar. */
  ratio: number;
  /** Consecutive same-side imbalance bars that make a stack. */
  stack: number;
  /** Bar volume must be at least this × its average. */
  volMult: number;
  maLen: number;
}

export const DEFAULT_DELTA: DeltaOptions = { ratio: 0.6, stack: 3, volMult: 1, maLen: 20 };

export interface DeltaResult {
  /** Approximate delta per bar: volume x clamp((close - open) / (high - low)). */
  delta: Float64Array;
  /** +1 buy imbalance, -1 sell imbalance, 0 none. */
  imb: Int8Array;
  /** 1 when the bar belongs to a stack of at least `stack` imbalance bars of one side. */
  stacked: Uint8Array;
}

export function detectDeltaImbalance(cs: readonly Candle[], o: DeltaOptions): DeltaResult {
  const n = cs.length;
  const delta = new Float64Array(n);
  const imb = new Int8Array(n);
  const stacked = new Uint8Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = cs[i].v;
  const ma = M.sma(v, Math.max(1, Math.floor(o.maLen)));
  for (let i = 0; i < n; i++) {
    const c = cs[i];
    const range = c.h - c.l || 1;
    const k = Math.max(-1, Math.min(1, (c.c - c.o) / range));
    delta[i] = c.v * k;
    const avg = fin(ma[i]) ? ma[i] : c.v;
    if (c.v > 0 && Math.abs(k) >= o.ratio && c.v >= avg * o.volMult) imb[i] = k > 0 ? 1 : -1;
  }
  let run = 0;
  for (let i = 0; i <= n; i++) {
    const s = i < n ? imb[i] : 0;
    if (s !== 0 && i > 0 && s === imb[i - 1]) run++;
    else {
      if (run >= o.stack) for (let q = i - run; q < i; q++) stacked[q] = 1;
      run = s !== 0 ? 1 : 0;
    }
  }
  return { delta, imb, stacked };
}
