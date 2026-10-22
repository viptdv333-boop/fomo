/**
 * Wolfe Wave detection: pure analysis (no DOM). Candles only; works on any timeframe / source.
 *
 * A Wolfe wave is five consecutive zigzag swings 1-2-3-4-5. Bullish (mirror it for bearish):
 *   1 low, 2 high, 3 low BELOW point 1, 4 high BELOW point 2 and above point 3, 5 low that PIERCES the 1-3 line.
 *   - the 1-3 line (through the lows) and the 2-4 line (through the highs) converge (the channel narrows to the right);
 *   - point 4 lies inside the channel: below the parallel to the 1-3 line through point 2 (that is the same as converging);
 *   - point 5 falls below the 1-3 line extended (the "sweet zone": between that line and one channel width, measured at point 4, beyond it);
 *   - the 1->4 line extended is the target (EPA, estimated price at arrival), reached around ETA (estimated time of arrival).
 * Swings come from the shared ATR / percent zigzag (analysis/swings). The last swing is the running extreme (not confirmed), which is
 * what makes a LIVE pattern: point 5 is still forming (or, before the line is pierced, a "setup" with points 1-4 only).
 * Cost: one zigzag pass (O(n)) + one test per window of 5 swings (O(swings)); only the shown patterns are walked bar by bar.
 */
import { atrSeries, detectSwings, type Pivot, type SwingCandle, type SwingSpec } from "./swings";

export type WolfeDir = 1 | -1;
/** setup: points 1-4 are there, point 5 has not reached the 1-3 line yet. forming: point 5 pierces the line and is still the running extreme.
 *  complete: point 5 is confirmed, the target is neither reached nor failed. hit: price reached the 1->4 line. failed: price went on beyond the sweet zone. */
export type WolfeStatus = "setup" | "forming" | "complete" | "hit" | "failed";

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
  /** Points 1..4 always, point 5 unless the pattern is a "setup". */
  pts: WolfePoint[];
  status: WolfeStatus;
  confidence: number;
  /** 1-3 line (support for bullish, resistance for bearish), 2-4 line, 1->4 line (target). */
  l13: WolfeLine;
  l24: WolfeLine;
  l14: WolfeLine;
  /** Estimated bar of arrival (candle index, may be beyond the last candle) and the target price there. */
  eta: number;
  epa: number;
  /** Channel width at point 4, in price: depth of the sweet zone. */
  zone: number;
  /** Bar where the 1-3 and 2-4 lines meet (Infinity when they do not). */
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
  /** Bars from point 1 to point 5. */
  minBars: number;
  maxBars: number;
  minConf: number;
  bullish: boolean;
  bearish: boolean;
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
  minBars: 12,
  maxBars: 400,
  minConf: 50,
  bullish: true,
  bearish: true,
  maxShown: 3,
  window: 1500,
  showDone: true,
};

const fin = (v: number) => v === v && v !== Infinity && v !== -Infinity;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Line through two points. */
function through(i0: number, p0: number, i1: number, p1: number): WolfeLine {
  const b = i1 === i0 ? 0 : (p1 - p0) / (i1 - i0);
  return { a: p0 - b * i0, b };
}
const at = (l: WolfeLine, i: number) => l.a + l.b * i;

/** Score 0..100 of a geometrically valid pattern (y-space: bullish orientation). */
function score(y: number[], idx: number[], g: { g2: number; g5: number; depth: number; W: number; reach: number; live: boolean }): number {
  const legs = [idx[1] - idx[0], idx[2] - idx[1], idx[3] - idx[2], idx[4] - idx[3]];
  const lo = Math.min(...legs);
  const hi = Math.max(...legs);
  // convergence: the channel has narrowed by 30..80 % at point 5
  const conv = clamp01((1 - g.g5 / g.g2) / 0.55);
  // equal-ish time legs
  const timing = clamp01((lo / Math.max(1, hi)) / 0.45);
  // point 5 beyond the 1-3 line, by 5..80 % of the channel width (a touch is weak, a far overshoot is a break)
  const rel = g.depth / Math.max(1e-12, g.W);
  const pierce = g.live && rel < 0 ? 0.35 : rel < 0.05 ? clamp01(0.5 + rel * 10) : rel <= 0.8 ? 1 : clamp01(1 - (rel - 0.8) / 0.6);
  // point 4 retraces 35..85 % of the 2-3 leg (not a flat top, not a new extreme)
  const retr = (y[3] - y[2]) / Math.max(1e-12, y[1] - y[2]);
  const p4 = retr >= 0.35 && retr <= 0.85 ? 1 : clamp01(1 - Math.min(Math.abs(retr - 0.35), Math.abs(retr - 0.85)) / 0.35);
  // the target is worth taking: at least 2 ATR away from point 5
  const reach = clamp01(g.reach / 2);
  const s = 0.24 * conv + 0.2 * timing + 0.24 * pierce + 0.14 * p4 + 0.18 * reach;
  return Math.round(100 * clamp01(0.15 + 0.85 * s));
}

interface Cand {
  dir: WolfeDir;
  k: number;
  pivots: Pivot[];
}

function evaluate(c: Cand, cs: SwingCandle[], atr: number[], o: WolfeOptions): WolfePattern | null {
  const { dir, k, pivots } = c;
  const n = cs.length;
  const P = pivots.slice(k, k + 5);
  const y = P.map((q) => dir * q.p);
  const idx = P.map((q) => q.i);
  const a = atr[Math.min(atr.length - 1, P[P.length - 1].i)] || atr[atr.length - 1] || 0;
  if (!(a > 0)) return null;
  const tol = Math.max(0, o.tolAtr) * a;
  const tail = P[4]; // the 5th swing: confirmed, or the running extreme of a live pattern
  const live = !tail.confirmed;

  // span
  const span = idx[4] - idx[0];
  if (span < o.minBars || span > o.maxBars) return null;
  // 1) point 3 beyond point 1, point 4 below point 2 (and above 3 by construction of the zigzag)
  if (!(y[2] < y[0] - 0.1 * a)) return null;
  if (!(y[3] < y[1] - 0.1 * a)) return null;
  if (!(y[1] > y[0] && y[3] > y[2])) return null;
  // 2) converging lines
  const L = through(idx[0], y[0], idx[2], y[2]);
  const U = through(idx[1], y[1], idx[3], y[3]);
  if (!(U.b < L.b - 1e-12)) return null;
  const gap = (i: number) => at(U, i) - at(L, i);
  const g2 = gap(idx[1]);
  const g4 = gap(idx[3]);
  const g5 = gap(idx[4]);
  if (!(g2 > 0 && g4 > 0)) return null;
  const cross = (L.a - U.a) / (U.b - L.b);
  if (!(fin(cross)) || cross <= idx[3]) return null;
  if (!(g5 > 0) || g5 / g2 > 0.9) return null;
  // 3) legs: no stub and no giant next to the others (point 5 is still moving for a live pattern)
  const legs = [idx[1] - idx[0], idx[2] - idx[1], idx[3] - idx[2], idx[4] - idx[3]];
  const need = live ? legs.slice(0, 3) : legs;
  if (Math.min(...need) < 2) return null;
  if (Math.max(...need) / Math.min(...need) > Math.max(1.5, o.maxLegRatio)) return null;
  if (live && legs[3] < Math.min(...legs.slice(0, 3)) / Math.max(1.5, o.maxLegRatio)) return null;
  // 4) point 5 against the 1-3 line
  const line5 = at(L, idx[4]);
  const W = at(U, idx[3]) - at(L, idx[3]); // channel width at point 4 = depth of the sweet zone
  const depth = line5 - y[4]; // > 0: pierced
  const pierced = depth >= -tol;
  let status: WolfeStatus;
  if (!pierced) {
    // not there yet: only the running extreme can still get there, and only while it is on its way (not a swing far above the line)
    if (!live) return null;
    if (y[4] - line5 > 1.5 * W) return null;
    status = "setup";
  } else {
    if (depth > W + tol) return null; // went far beyond the zone: a break, not a Wolfe 5
    status = live ? "forming" : "complete";
  }
  // target: the 1->4 line, reached around ETA (the 3->5 time repeated, but before the lines meet)
  const T = through(idx[0], y[0], idx[3], y[3]);
  const x5 = idx[4];
  const eta = Math.max(x5 + 2, Math.min(Math.round(cross) - 1, x5 + Math.max(4, idx[4] - idx[2])));
  const epa = at(T, eta);
  const reach = (epa - y[4]) / a;
  if (!(reach > 0.5)) return null;
  const conf = score(y, idx, { g2, g5, depth: Math.max(0, depth), W, reach, live: status === "setup" });

  // what happened after point 5 (y-space: bullish orientation; a live pattern has the current price only)
  let hitIdx = -1;
  let endIdx = x5;
  let st: WolfeStatus = status;
  if (status !== "setup") {
    for (let j = x5 + 1; j < n; j++) {
      endIdx = j;
      if ((dir === 1 ? cs[j].h : -cs[j].l) >= at(T, j)) {
        hitIdx = j;
        st = "hit";
        break;
      }
      if ((dir === 1 ? cs[j].l : -cs[j].h) < y[4] - 0.5 * W - tol) {
        st = "failed";
        break;
      }
    }
  } else {
    endIdx = n - 1;
  }

  const pts: WolfePoint[] = P.map((q, m) => ({ n: m + 1, i: q.i, t: q.t, p: q.p, confirmed: q.confirmed }));
  const toPrice = (l: WolfeLine): WolfeLine => ({ a: dir * l.a, b: dir * l.b });
  const upto = status === "setup" ? 4 : 5;
  return {
    id: `${dir}:${pts[0].t}:${pts[3].t}`,
    dir,
    pts: pts.slice(0, upto),
    status: st,
    confidence: conf,
    l13: toPrice(L),
    l24: toPrice(U),
    l14: toPrice(T),
    eta,
    epa: dir * epa,
    zone: W,
    cross,
    hitIdx,
    endIdx,
  };
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
  for (let k = 0; k + 4 < pivots.length; k++) {
    // only the last window of 5 may end in the unconfirmed swing
    if (pivots[k + 3].confirmed === false) break;
    const t0 = pivots[k].type;
    if (t0 === "L" && o.bullish) {
      const p = evaluate({ dir: 1, k, pivots }, sub, atr, o);
      if (p) found.push(p);
    }
    if (t0 === "H" && o.bearish) {
      const p = evaluate({ dir: -1, k, pivots }, sub, atr, o);
      if (p) found.push(p);
    }
  }
  // overlapping candidates (the same structure seen from the neighbouring swings): the more confident one stays
  found.sort((x, y) => y.confidence - x.confidence || y.pts[3].i - x.pts[3].i);
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
