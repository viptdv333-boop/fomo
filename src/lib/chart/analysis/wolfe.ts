/**
 * Wolfe Wave detection: pure analysis (no DOM). Candles only; works on any timeframe / source.
 *
 * A Wolfe wave is five zigzag swings 1-2-3-4-5. Bullish (mirror it for bearish), the classic rules:
 *   - 1 low, 2 high, 3 low BELOW point 1, 4 high INSIDE the price range of wave 1-2 (above point 1, below point 2),
 *     5 low BELOW point 3 that normally slightly pierces the 1-3 line;
 *   - the 1-3 line (through the lows) and the 2-4 line (through the highs) converge (the channel narrows to the right);
 *     the nearly parallel channel is accepted as a separate, lower-scored variant (`variant: "parallel"`);
 *   - the "sweet zone" (ideal entry) lies between the 1-3 line extended and the line through point 3 parallel to the 2-4 line;
 *   - waves 1-2 and 3-4 take a comparable time;
 *   - ETA (estimated time of arrival) is the bar where the 1-3 and 2-4 lines meet (the apex), EPA (estimated price at arrival)
 *     is the 1->4 line at that bar. When there is no usable apex (parallel channel, apex too far or already passed) the ETA is
 *     estimated from the 3->5 time instead (`etaApex: false`).
 * Swings come from the shared ATR / percent zigzag (analysis/swings). The last swing is the running extreme (not confirmed), which is
 * what makes a LIVE pattern: point 5 is still forming (or, before the line is pierced, a "setup" with points 1-4 only).
 * A leg may absorb inner pullbacks (it spans 1, 3 or 5 zigzag swings) as long as its end points are the extremes of the leg.
 * Confidence: graded marks (convergence, time symmetry, point 5 in the sweet zone, proportions, the move into point 1, leg clarity,
 * distance to the target) combined as a weighted geometric mean with a baseline subtracted, see score().
 * Cost: one zigzag pass (O(n)) + a pruned search over the swing combinations (at most 81 per starting swing, nearly all of them
 * cut by the first comparisons); only geometrically valid patterns are walked bar by bar.
 */
import { atrSeries, detectSwings, type Pivot, type SwingCandle, type SwingSpec } from "./swings";

export type WolfeDir = 1 | -1;
/** setup: points 1-4 are there, point 5 has not reached the 1-3 line yet. forming: point 5 pierces the line and is still the running extreme.
 *  complete: point 5 is confirmed, the target is neither reached nor failed. hit: price reached the 1->4 line. failed: price went on beyond the sweet zone. */
export type WolfeStatus = "setup" | "forming" | "complete" | "hit" | "failed";
/** classic: the 1-3 and 2-4 lines converge. parallel: they run (nearly) parallel, there is no apex. */
export type WolfeVariant = "classic" | "parallel";

export interface WolfePoint {
  /** 1..5 */
  n: number;
  /** Index in the candle array. */
  i: number;
  t: number;
  p: number;
  confirmed: boolean;
}

/** y = a + b·i (price at candle index i). */
export interface WolfeLine {
  a: number;
  b: number;
}

export interface WolfePattern {
  id: string;
  dir: WolfeDir;
  variant: WolfeVariant;
  /** Points 1..4 always, point 5 unless the pattern is a "setup". */
  pts: WolfePoint[];
  status: WolfeStatus;
  confidence: number;
  /** 1-3 line (support for bullish, resistance for bearish), 2-4 line, 1->4 line (target). */
  l13: WolfeLine;
  l24: WolfeLine;
  l14: WolfeLine;
  /** Outer border of the sweet zone: the line through point 3 parallel to the 2-4 line
   *  (parallel variant: the 1-3 line moved out by a quarter of the channel width). The zone is between l13 and lz, to the right of point 3. */
  lz: WolfeLine;
  /** Estimated bar of arrival (candle index, may be beyond the last candle) and the target price there (the 1->4 line at that bar). */
  eta: number;
  epa: number;
  /** true: eta is the classic one (the apex of the 1-3 and 2-4 lines). false: estimated from the 3->5 time (no usable apex). */
  etaApex: boolean;
  /** Depth of the sweet zone at point 5 (at the last bar for a setup), in price. */
  zone: number;
  /** Where point 5 stopped: 0 on the 1-3 line, 1 on the outer border of the sweet zone (< 0 short of the line, > 1 beyond the zone); NaN for a setup. */
  zonePos: number;
  /** Bar where the 1-3 and 2-4 lines meet (Infinity for the parallel variant). */
  cross: number;
  /** Bar where price reached the target (-1 otherwise). */
  hitIdx: number;
  /** Last bar the pattern belongs to (point 5, or the last candle for a live one). */
  endIdx: number;
}

export interface WolfeOptions {
  /** Swing detection: ATR × devAtr or devPct percent of price. */
  mode: "atr" | "pct";
  devAtr: number;
  devPct: number;
  /** Touch tolerance in ATR (point 5 may stop this close to the 1-3 line and still count). */
  tolAtr: number;
  /** Longest leg may be at most this many times the shortest one (in bars). */
  maxLegRatio: number;
  /** Waves 1-2 and 3-4: the longer one may take at most this many times the bars of the shorter one. */
  symRatio: number;
  /** Bars from point 1 to point 5. */
  minBars: number;
  maxBars: number;
  minConf: number;
  bullish: boolean;
  bearish: boolean;
  /** Accept the parallel-channel variant (no apex, ETA estimated). */
  parallel: boolean;
  /** Inner pullbacks a leg may absorb: 0 = five consecutive swings only, 1 = a leg spans 1 or 3 swings, 2 = 1, 3 or 5. */
  maxSkip: number;
  /** Patterns kept (the newest, after the overlapping weaker ones are dropped). */
  maxShown: number;
  /** Only the last N bars are analysed. */
  window: number;
  /** Keep patterns that are over (target reached / failed / old complete ones). */
  showDone: boolean;
}

export const DEFAULT_WOLFE: WolfeOptions = {
  mode: "atr",
  devAtr: 2,
  devPct: 1,
  tolAtr: 0.3,
  maxLegRatio: 6,
  symRatio: 3,
  minBars: 12,
  maxBars: 400,
  minConf: 50,
  bullish: true,
  bearish: true,
  parallel: true,
  maxSkip: 2,
  maxShown: 3,
  window: 1500,
  showDone: true,
};

/** Channel width at point 4 relative to the width at point 2: up to CONVERGE the lines converge (classic), up to PARALLEL_MAX they are parallel. */
const CONVERGE = 0.93;
const PARALLEL_MAX = 1.07;
/** The apex is a usable ETA when it is at most this many pattern lengths (1->5) ahead of point 5. */
const APEX_MAX_AHEAD = 2.5;
/** Score factor of the parallel variant. */
const PARALLEL_FACTOR = 0.85;

const fin = (v: number) => v === v && v !== Infinity && v !== -Infinity;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Line through two points. */
function through(i0: number, p0: number, i1: number, p1: number): WolfeLine {
  const b = i1 === i0 ? 0 : (p1 - p0) / (i1 - i0);
  return { a: p0 - b * i0, b };
}
const at = (l: WolfeLine, i: number) => l.a + l.b * i;

interface ScoreIn {
  /** Channel width at point 5 / at point 2 (classic), ignored for the parallel variant. */
  narrow: number;
  parallel: boolean;
  /** Point 5 against the 1-3 line (price, > 0: pierced, < 0: short of it), depth of the sweet zone there, channel width at point 4. */
  depth: number;
  zoneDepth: number;
  W: number;
  /** Distance from point 5 to the target, ATR at point 5. */
  reach: number;
  atr: number;
  /** Point 5 is not there yet (setup) / is still the running extreme (its leg is not finished). */
  setup: boolean;
  live: boolean;
  /** Move into point 1: fall from the highest price of the bars before it, how far those bars went beyond point 1 (price);
   *  bars looked at (0: no history, the trend is unknown). */
  drop: number;
  under: number;
  prior: number;
}

/** 0 up to a, 1 from b on, linear in between. */
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
/** 1 inside [b, c], falls to 0 at a and at d. */
const trap = (v: number, a: number, b: number, c: number, d: number) => (v < b ? ramp(v, a, b) : v > c ? 1 - ramp(v, c, d) : 1);

/** Weights of the score components (sum 1): the mark is their weighted geometric mean, so one bad component cannot be bought back by the others. */
const W_CONV = 0.16;
const W_TIME = 0.2;
const W_PIERCE = 0.12;
const W_SHAPE = 0.2;
const W_TREND = 0.14;
const W_CLEAR = 0.12;
const W_REACH = 0.06;
/** Floor of a component (keeps the product from collapsing to 0). */
const C_MIN = 0.03;
/** Baseline: the geometric mean a weak random candidate still collects (measured on random walks: median 0.5, lower quartile 0.4);
 *  it is subtracted, the rest is stretched to 0..1. */
const BASE = 0.3;
/** Score factor of a setup (point 5 is not there yet: its components are not judged). */
const SETUP_FACTOR = 0.88;

/** Score 0..100 of a geometrically valid pattern (y-space: bullish orientation). Every component is graded 0..1 by how far it is from
 *  the textbook picture; a random zigzag that merely passes the rules lands well under 50. */
function score(y: number[], idx: number[], g: ScoreIn): number {
  const full = !g.setup && !g.live; // leg 4-5 is finished
  const l12 = idx[1] - idx[0];
  const l23 = idx[2] - idx[1];
  const l34 = idx[3] - idx[2];
  const l45 = idx[4] - idx[3];
  // 1) convergence: the channel has narrowed to 20..65 % of its width by point 5 (apex neither on top of point 5 nor far away)
  const conv = g.parallel ? 0.55 : trap(g.narrow, 0.02, 0.2, 0.65, 1);
  // 2) time: waves 1-2 and 3-4 equal (the classic requirement), no leg much shorter than the others, 1->3 and 3->5 comparable
  const sym = Math.min(l12, l34) / Math.max(1, l12, l34);
  const lo = full ? Math.min(l12, l23, l34, l45) : Math.min(l12, l23, l34);
  const hi = full ? Math.max(l12, l23, l34, l45) : Math.max(l12, l23, l34);
  const half = full ? Math.min(l12 + l23, l34 + l45) / Math.max(1, l12 + l23, l34 + l45) : 1;
  const timing = ramp(sym, 0.3, 0.8) * ramp(lo / Math.max(1, hi), 0.15, 0.55) * ramp(half, 0.3, 0.7);
  // 3) point 5: inside the sweet zone is ideal, a bare touch is weaker, short of the line weaker still; beyond the zone it turns into a break
  const zEff = Math.max(g.zoneDepth, 0.25 * g.W, 1e-12);
  const rel = g.depth / zEff;
  const far = Math.max(1.0001, g.W / zEff);
  const pierce = g.setup ? 1 : rel < 0 ? 0.5 : rel < 0.1 ? 0.7 + 3 * rel : rel <= 1 ? 1 : clamp01(1 - (0.8 * (rel - 1)) / (far - 1));
  // 4) proportions: 3 a modest new low under 1, 4 retraces 35..80 % of wave 2-3, 5 extends wave 3-4 by 1.15..2.2, no dwarf leg
  const h12 = y[1] - y[0];
  const h23 = y[1] - y[2];
  const h34 = y[3] - y[2];
  const h45 = y[3] - y[4];
  const d3 = trap((y[0] - y[2]) / Math.max(1e-12, h12), 0, 0.15, 0.7, 1.4);
  const p4 = trap(h34 / Math.max(1e-12, h23), 0.15, 0.35, 0.8, 1);
  const e5 = g.setup ? 1 : trap(h45 / Math.max(1e-12, h34), 1, 1.15, 2.2, 3.2);
  const hMin = g.setup ? Math.min(h12, h23, h34) : Math.min(h12, h23, h34, h45);
  const range = y[1] - Math.min(y[2], g.setup ? y[2] : y[4]);
  const share = ramp(hMin / Math.max(1e-12, range), 0.1, 0.28);
  const shape = d3 * p4 * e5 * share;
  // 5) prior trend: the pattern ends a move, so price fell into point 1 at least by the height of wave 1-2 and point 1 is its low
  const trend = g.prior < 3 ? 0.6 : ramp(g.drop / Math.max(1e-12, h12), 0.35, 1.05) * (1 - 0.8 * ramp(g.under / Math.max(1e-12, h12), 0, 0.5));
  // 6) clarity: every leg stands out of the noise
  const clear = ramp(hMin / g.atr, 1.5, 4.5);
  // 7) the target is worth taking: at least 2 ATR away from point 5
  const reach = clamp01(g.reach / 2);
  const f = (c: number, w: number) => Math.pow(Math.max(C_MIN, c), w);
  const q = f(conv, W_CONV) * f(timing, W_TIME) * f(pierce, W_PIERCE) * f(shape, W_SHAPE) * f(trend, W_TREND) * f(clear, W_CLEAR) * f(reach, W_REACH);
  return Math.round(100 * clamp01((q - BASE) / (1 - BASE)) * (g.parallel ? PARALLEL_FACTOR : 1) * (g.setup ? SETUP_FACTOR : 1));
}

function evaluate(dir: WolfeDir, P: Pivot[], cs: SwingCandle[], atr: number[], o: WolfeOptions): WolfePattern | null {
  const n = cs.length;
  const y = [dir * P[0].p, dir * P[1].p, dir * P[2].p, dir * P[3].p, dir * P[4].p];
  const idx = [P[0].i, P[1].i, P[2].i, P[3].i, P[4].i];
  // span
  const span = idx[4] - idx[0];
  if (span < o.minBars || span > o.maxBars) return null;
  const a = atr[Math.min(atr.length - 1, idx[4])] || atr[atr.length - 1] || 0;
  if (!(a > 0)) return null;
  const tol = Math.max(0, o.tolAtr) * a;
  const eps = 0.1 * a;
  const tail = P[4]; // the 5th swing: confirmed, or the running extreme of a live pattern
  const live = !tail.confirmed;

  // 1) the classic price rules: 3 beyond 1, 4 inside the range of wave 1-2 (above 1, below 2)
  if (!(y[1] > y[0] && y[3] > y[2])) return null;
  if (!(y[2] < y[0] - eps)) return null;
  if (!(y[3] < y[1] - eps)) return null;
  if (!(y[3] > y[0] + eps)) return null;
  // 2) the 1-3 and 2-4 lines: converging (classic) or nearly parallel (variant); a widening channel is not a Wolfe wave
  const L = through(idx[0], y[0], idx[2], y[2]);
  const U = through(idx[1], y[1], idx[3], y[3]);
  const gap = (i: number) => at(U, i) - at(L, i);
  const g2 = gap(idx[1]);
  const g4 = gap(idx[3]);
  const g5 = gap(idx[4]);
  if (!(g2 > 0 && g4 > 0 && g5 > 0)) return null;
  const narrow24 = g4 / g2;
  if (!(narrow24 <= PARALLEL_MAX)) return null;
  const parallel = narrow24 > CONVERGE;
  if (parallel && !o.parallel) return null;
  let cross = Infinity;
  if (!parallel) {
    cross = (L.a - U.a) / (U.b - L.b);
    if (!fin(cross) || cross <= idx[3]) return null;
  }
  // 3) time: no stub and no giant next to the others (point 5 is still moving for a live pattern), waves 1-2 and 3-4 symmetric
  const legs = [idx[1] - idx[0], idx[2] - idx[1], idx[3] - idx[2], idx[4] - idx[3]];
  const maxRatio = Math.max(1.5, o.maxLegRatio);
  const loLeg = live ? Math.min(legs[0], legs[1], legs[2]) : Math.min(legs[0], legs[1], legs[2], legs[3]);
  const hiLeg = live ? Math.max(legs[0], legs[1], legs[2]) : Math.max(legs[0], legs[1], legs[2], legs[3]);
  if (loLeg < 2) return null;
  if (hiLeg / loLeg > maxRatio) return null;
  if (live && legs[3] < loLeg / maxRatio) return null;
  if (Math.max(legs[0], legs[2]) / Math.min(legs[0], legs[2]) > Math.max(1, o.symRatio)) return null;
  // 4) point 5 against the 1-3 line and the sweet zone
  const x5 = idx[4];
  const W = g4; // channel width at point 4
  const Z: WolfeLine = parallel ? { a: L.a - 0.25 * W, b: L.b } : { a: y[2] - U.b * idx[2], b: U.b };
  const line5 = at(L, x5);
  const zoneDepth = Math.max(0, line5 - at(Z, x5));
  const depth = line5 - y[4]; // > 0: pierced
  const pierced = depth >= -tol && y[4] < y[2]; // at the line (within the tolerance) and beyond point 3
  let status: WolfeStatus;
  if (!pierced) {
    // not there yet: only the running extreme can still get there, and only while it is on its way (not a swing far above the line)
    if (!live) return null;
    if (y[4] - line5 > 1.5 * W) return null;
    status = "setup";
  } else {
    if (depth > Math.max(W, zoneDepth) + tol) return null; // went far beyond the zone: a break, not a Wolfe 5
    status = live ? "forming" : "complete";
  }
  // 5) target: the 1->4 line at ETA. Classic ETA = the apex of the 1-3 and 2-4 lines; without a usable apex: the 3->5 time repeated
  const T = through(idx[0], y[0], idx[3], y[3]);
  const apex = Math.round(cross);
  const etaApex = !parallel && apex >= x5 + 2 && apex - x5 <= APEX_MAX_AHEAD * span;
  const est = x5 + Math.max(4, x5 - idx[2]);
  const eta = etaApex ? apex : Math.max(x5 + 2, parallel ? est : Math.min(apex - 1, est));
  const epa = at(T, eta);
  const reach = (epa - y[4]) / a;
  if (!(reach > 0.5)) return null;
  // the move into point 1: the bars before it, half a pattern long
  const look = Math.max(8, Math.round(span / 2));
  const from = Math.max(0, idx[0] - look);
  let hiBefore = -Infinity;
  let loBefore = Infinity;
  for (let j = from; j < idx[0]; j++) {
    const h = dir === 1 ? cs[j].h : -cs[j].l;
    const l = dir === 1 ? cs[j].l : -cs[j].h;
    if (h > hiBefore) hiBefore = h;
    if (l < loBefore) loBefore = l;
  }
  const prior = idx[0] - from;
  const conf = score(y, idx, {
    narrow: g5 / g2,
    parallel,
    depth,
    zoneDepth,
    W,
    reach,
    atr: a,
    setup: status === "setup",
    live,
    drop: prior > 0 ? hiBefore - y[0] : 0,
    under: prior > 0 ? Math.max(0, y[0] - loBefore) : 0,
    prior,
  });

  // what happened after point 5 (y-space: bullish orientation; a live pattern has the current price only)
  let hitIdx = -1;
  let endIdx = x5;
  let st: WolfeStatus = status;
  if (status !== "setup") {
    const stop = y[4] - 0.5 * W - tol;
    for (let j = x5 + 1; j < n; j++) {
      endIdx = j;
      if ((dir === 1 ? cs[j].h : -cs[j].l) >= at(T, j)) {
        hitIdx = j;
        st = "hit";
        break;
      }
      if ((dir === 1 ? cs[j].l : -cs[j].h) < stop) {
        st = "failed";
        break;
      }
    }
  } else {
    endIdx = n - 1;
  }

  const pts: WolfePoint[] = [];
  const upto = status === "setup" ? 4 : 5;
  for (let m = 0; m < upto; m++) pts.push({ n: m + 1, i: P[m].i, t: P[m].t, p: P[m].p, confirmed: P[m].confirmed });
  const toPrice = (l: WolfeLine): WolfeLine => ({ a: dir * l.a, b: dir * l.b });
  return {
    id: `${dir}:${pts[0].t}:${pts[3].t}`,
    dir,
    variant: parallel ? "parallel" : "classic",
    pts,
    status: st,
    confidence: conf,
    l13: toPrice(L),
    l24: toPrice(U),
    l14: toPrice(T),
    lz: toPrice(Z),
    eta,
    epa: dir * epa,
    etaApex,
    zone: zoneDepth,
    zonePos: status === "setup" ? NaN : depth / Math.max(zoneDepth, 1e-12),
    cross,
    hitIdx,
    endIdx,
  };
}

/**
 * All valid patterns of one direction. Points are picked among the swings with an odd step (1, 3, 5: the swing types keep alternating),
 * a longer step means the leg absorbs inner pullbacks; that is allowed only when the end points are the extremes of the leg.
 */
function search(dir: WolfeDir, pivots: Pivot[], cs: SwingCandle[], atr: number[], o: WolfeOptions, out: WolfePattern[]): void {
  const m = pivots.length;
  const maxGap = 1 + 2 * Math.max(0, Math.min(2, Math.floor(o.maxSkip) || 0));
  const Y = new Float64Array(m);
  for (let k = 0; k < m; k++) Y[k] = dir * pivots[k].p;
  const lowType = dir === 1 ? "L" : "H";
  // leg from swing a to swing b: every swing in between stays strictly inside the range of the end points
  const leg = (a: number, b: number): boolean => {
    const lo = Math.min(Y[a], Y[b]);
    const hi = Math.max(Y[a], Y[b]);
    for (let j = a + 1; j < b; j++) if (Y[j] <= lo || Y[j] >= hi) return false;
    return true;
  };
  const P: Pivot[] = new Array(5);
  for (let k0 = 0; k0 + 4 < m; k0++) {
    if (pivots[k0].type !== lowType) continue;
    const y0 = Y[k0];
    for (let k1 = k0 + 1; k1 <= k0 + maxGap && k1 + 3 < m; k1 += 2) {
      const y1 = Y[k1];
      if (!(y1 > y0) || !leg(k0, k1)) continue;
      for (let k2 = k1 + 1; k2 <= k1 + maxGap && k2 + 2 < m; k2 += 2) {
        if (!(Y[k2] < y0) || !leg(k1, k2)) continue; // point 3 beyond point 1
        for (let k3 = k2 + 1; k3 <= k2 + maxGap && k3 + 1 < m; k3 += 2) {
          const y3 = Y[k3];
          if (!(y3 < y1 && y3 > y0) || !leg(k2, k3)) continue; // point 4 inside wave 1-2
          // only point 5 may be the unconfirmed swing (k3 + 1 < m keeps points 1-4 confirmed)
          for (let k4 = k3 + 1; k4 <= k3 + maxGap && k4 < m; k4 += 2) {
            if (!leg(k3, k4)) continue;
            P[0] = pivots[k0];
            P[1] = pivots[k1];
            P[2] = pivots[k2];
            P[3] = pivots[k3];
            P[4] = pivots[k4];
            const p = evaluate(dir, P, cs, atr, o);
            if (p) out.push(p);
          }
        }
      }
    }
  }
}

function overlap(a: WolfePattern, b: WolfePattern): number {
  const a0 = a.pts[0].i;
  const a1 = a.pts[a.pts.length - 1].i;
  const b0 = b.pts[0].i;
  const b1 = b.pts[b.pts.length - 1].i;
  const o = Math.min(a1, b1) - Math.max(a0, b0);
  if (o <= 0) return 0;
  return o / Math.max(1, Math.min(a1 - a0, b1 - b0));
}

export function detectWolfe(cs: SwingCandle[], opts: Partial<WolfeOptions> = {}): WolfePattern[] {
  const o: WolfeOptions = { ...DEFAULT_WOLFE, ...opts };
  const nAll = cs.length;
  if (nAll < 30) return [];
  const start = Math.max(0, nAll - Math.max(60, Math.floor(o.window)));
  const sub = start > 0 ? cs.slice(start) : cs;
  const spec: SwingSpec = o.mode === "pct" ? { mode: "pct", pct: Math.max(0.01, o.devPct) } : { mode: "atr", atr: Math.max(0.1, o.devAtr) };
  const pivots = detectSwings(sub, spec);
  if (pivots.length < 5) return [];
  const atr = atrSeries(sub, 14);
  const found: WolfePattern[] = [];
  if (o.bullish) search(1, pivots, sub, atr, o, found);
  if (o.bearish) search(-1, pivots, sub, atr, o, found);
  // overlapping candidates (the same structure seen from the neighbouring swings, with or without the absorbed pullbacks):
  // the more confident one stays; equal marks: the classic variant, then the newer one
  found.sort(
    (x, y) => y.confidence - x.confidence || Number(x.variant === "parallel") - Number(y.variant === "parallel") || y.pts[3].i - x.pts[3].i || y.pts[0].i - x.pts[0].i,
  );
  const kept: WolfePattern[] = [];
  for (const p of found) {
    if (p.confidence < o.minConf) continue;
    if (!o.showDone && (p.status === "hit" || p.status === "failed")) continue;
    if (kept.some((q) => overlap(p, q) > 0.35)) continue;
    kept.push(p);
  }
  kept.sort((x, y) => y.endIdx - x.endIdx || y.confidence - x.confidence);
  const out = kept.slice(0, Math.max(1, Math.floor(o.maxShown)));
  // back to the indices of the full candle array
  if (start > 0) {
    const sh = (l: WolfeLine): WolfeLine => ({ a: l.a - l.b * start, b: l.b });
    for (const p of out) {
      for (const q of p.pts) q.i += start;
      p.l13 = sh(p.l13);
      p.l24 = sh(p.l24);
      p.l14 = sh(p.l14);
      p.lz = sh(p.lz);
      p.eta += start;
      p.cross += start;
      if (p.hitIdx >= 0) p.hitIdx += start;
      p.endIdx += start;
    }
  }
  out.sort((x, y) => x.endIdx - y.endIdx);
  return out;
}

/** Price levels worth an alert: the target and the 1-3 line at the next bar. */
export function wolfeLevels(p: WolfePattern, lastIdx: number): { epa: number; line13: number } {
  return { epa: p.epa, line13: at(p.l13, lastIdx + 1) };
}

export const lineAt = at;
