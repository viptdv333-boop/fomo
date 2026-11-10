/**
 * Automatic Elliott wave analysis (pure, no DOM).
 *
 * Pipeline: ATR zigzag pivots of the chosen wave degree -> candidate counts (impulse 1-2-3-4-5 with hard rules, leading /
 * ending diagonals, corrective zigzag / flat / expanded flat A-B-C, contracting triangle A-B-C-D-E, double three W-X-Y) ->
 * score 0..100 by Fibonacci relations, channel parallelism and time proportions -> the best non-overlapping chain of
 * counts ending at the live edge, plus projections (targets, retracement zones, invalidation) for the forming wave.
 *
 * Everything here is a HYPOTHESIS with a confidence, never a certainty. The last zigzag pivot is provisional (the running
 * extreme), so the last leg of a live count is "forming" and the whole count may repaint on the next tick.
 */

import { atrSeries, zigzag, type Pivot, type SwingCandle } from "./swings";

export type ElliottDegree = "minor" | "intermediate" | "primary";
export type CountKind =
  | "impulse"
  | "leading_diagonal"
  | "ending_diagonal"
  | "expanding_leading_diagonal"
  | "expanding_ending_diagonal"
  | "zigzag"
  | "flat"
  | "expanded_flat"
  | "running_flat"
  | "triangle"
  | "triangle_barrier"
  | "triangle_running"
  | "triangle_expanding"
  | "double_zigzag"
  | "double_three"
  | "triple_zigzag"
  | "triple_three";

export const isMotive = (k: CountKind) => k === "impulse" || k.endsWith("diagonal");
export const isDiagonal = (k: CountKind) => k.endsWith("diagonal");
export const isTriangle = (k: CountKind) => k.startsWith("triangle");
export const isComplex = (k: CountKind) => k.startsWith("double") || k.startsWith("triple");
export const isAbc = (k: CountKind) => k === "zigzag" || k.endsWith("flat");

export const DEGREES: readonly ElliottDegree[] = ["minor", "intermediate", "primary"];
/** Zigzag reversal threshold, in ATRs, of each degree at sensitivity 5. */
export const DEGREE_ATR: Record<ElliottDegree, number> = { minor: 2, intermediate: 4, primary: 8 };

export interface ElliottOptions {
  degree: ElliottDegree;
  /** 1..10, 5 = neutral. Higher = more (smaller) swings. */
  sensitivity: number;
  /** Counts below this confidence (0..100) are dropped. */
  minConfidence: number;
  allowDiagonals: boolean;
  /** Also try double threes (W-X-Y). */
  allowComplex: boolean;
  /** Only the last `window` bars are analysed. */
  window: number;
  /** Counts kept on screen (the live one + the previous ones). */
  maxCounts: number;
  showAlternate: boolean;
}

export const DEFAULT_OPTIONS: ElliottOptions = {
  degree: "intermediate",
  sensitivity: 5,
  minConfidence: 40,
  allowDiagonals: true,
  allowComplex: false,
  window: 1500,
  maxCounts: 1,
  showAlternate: false,
};

export interface RatioInfo {
  /** i18n-free short key, e.g. "w2/w1". */
  k: string;
  v: number;
}

export interface WaveCount {
  key: string;
  degree: ElliottDegree;
  kind: CountKind;
  /** +1 when the first leg goes up. */
  dir: 1 | -1;
  /** Origin pivot (wave 0) followed by one pivot per wave. */
  pivots: Pivot[];
  /** Labels of pivots[1..]. */
  labels: string[];
  /** The last pivot is the provisional running extreme, so the last wave is still forming. */
  forming: boolean;
  /** The pattern has all of its waves (the last one may still be forming). */
  complete: boolean;
  /** Fibonacci / structure score 0..100 before the evidence discount. */
  score: number;
  /** Final confidence 0..100. */
  conf: number;
  ratios: RatioInfo[];
  /** Pivot index range inside the degree's pivot list. */
  startK: number;
  endK: number;
  /** Truncated fifth / truncated C: the last wave failed to pass the end of the previous same-direction wave. */
  truncated?: boolean;
}

export interface ProjLevel {
  price: number;
  /** Display ratio, e.g. "1.618" or "0→3 0.618". */
  tag: string;
  /** Part of the main target / retracement zone. */
  core: boolean;
}

export type Phase = "w2" | "w3" | "w4" | "w5" | "w5done" | "wB" | "wC" | "wCdone" | "wD" | "wE" | "wEdone" | "wX" | "wY" | "wYdone" | "wXX" | "wZ" | "wZdone";

export interface Projection {
  phase: Phase;
  /** "retrace": levels are pullback depths, "target": extensions. */
  mode: "retrace" | "target" | "none";
  /** Direction the forming wave is expected to travel (+1 up). */
  dir: 1 | -1;
  anchorI: number;
  anchorP: number;
  levels: ProjLevel[];
  invalid: { price: number; fromI: number } | null;
  /** Next level the price has not reached yet. */
  next: ProjLevel | null;
}

export interface LiveCount {
  count: WaveCount;
  proj: Projection;
}

export interface DegreeResult {
  degree: ElliottDegree;
  pivotCount: number;
  /** Chain of counts, oldest first; the last one is the live one when `live` is set. */
  counts: WaveCount[];
  alt: WaveCount | null;
  live: LiveCount | null;
}

export interface ElliottResult {
  degrees: DegreeResult[];
  /** Index into `degrees` of the live count shown in the summary, -1 if none. */
  focus: number;
  precision: number;
  /** Bars analysed (for the tooltip). */
  analysed: number;
  minConfidence: number;
  multi: boolean;
}

/* ───────────────────────── helpers ───────────────────────── */

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
/** 0 outside (a, d), 1 on [b, c], linear ramps in between. */
function trap(x: number, a: number, b: number, c: number, d: number): number {
  if (!(x > a) || !(x < d)) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}
const near = (x: number, target: number, tol: number) => clamp01(1 - Math.abs(x - target) / tol);
const f3 = (v: number) => (Math.round(v * 1000) / 1000).toString();

const BASELINE = 0.58;
const PRIOR_W = 8;

class Acc {
  private sum = 0;
  private wsum = 0;
  ratios: RatioInfo[] = [];
  add(w: number, s: number, k?: string, v?: number) {
    this.sum += w * clamp01(s);
    this.wsum += w;
    if (k !== undefined && v !== undefined && isFinite(v)) this.ratios.push({ k, v: Math.round(v * 1000) / 1000 });
  }
  /** Weighted mean of the component scores, minus what a random swing sequence scores on average (BASELINE). */
  score(): number {
    if (!(this.wsum > 0)) return 0;
    // a few pseudo-components at the baseline: a count with one or two measurable ratios cannot look perfect
    return 100 * clamp01(((this.sum + PRIOR_W * BASELINE) / (this.wsum + PRIOR_W) - BASELINE) / (1 - BASELINE));
  }
}

/** How much a count is trusted given how many waves are known (a lone 1-2 is nearly meaningless). */
const EVIDENCE: Record<number, number> = { 2: 0.5, 3: 0.8, 4: 0.9, 5: 1 };
/** A three-leg move is only weakly evidenced by itself (random swings produce comparable legs); a context bonus applies after an impulse. */
const CORR_EVIDENCE = { 2: 0.4, 3: 0.6, ctx3: 0.8, ctx2: 0.5 };
/** Calibration: squeezes mediocre scores down so that random swings stay under the default threshold. */
const calib = (x: number) => 100 * Math.pow(clamp01(x / 100), 1.3);

/** Normalised slope between points: price in units of the pattern height, time in units of the pattern span. */
function nslope(t: number[], q: number[], idx: number[], H: number, T: number): number {
  if (idx.length < 2 || H <= 0 || T <= 0) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const j of idx) {
    const x = t[j] / T;
    const y = q[j] / H;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const n = idx.length;
  const den = n * sxx - sx * sx;
  return Math.abs(den) < 1e-12 ? 0 : (n * sxy - sx * sy) / den;
}

/** Legs of a real wave are not blips: every leg should take a fair share of the pattern's time span. */
function legShare(t: number[]): number {
  const span = t[t.length - 1] - t[0];
  if (span <= 0) return 0;
  let min = Infinity;
  for (let j = 1; j < t.length; j++) min = Math.min(min, t[j] - t[j - 1]);
  return clamp01(min / span / 0.07);
}

/* ───────────────────────── impulse ───────────────────────── */

interface Ctx {
  degree: ElliottDegree;
  P: Pivot[];
  /** Bar indices of the pivots of the next finer zigzag (sorted): used to count the subwaves of a leg. */
  F: number[];
  allowDiagonals: boolean;
  allowComplex: boolean;
}

/** Every merged leg (one that swallows smaller swings of the same degree) costs a little: fewer free parameters = more trust. */
const MERGE_PENALTY = 0.96;
/** Weight of the momentum components of an impulse. */
const MOM_W = 14;

function mk(ctx: Ctx, kind: CountKind, idx: number[], labels: string[], complete: boolean, forming: boolean, score: number, conf: number, ratios: RatioInfo[], truncated = false): WaveCount {
  const piv = idx.map((j) => ctx.P[j]);
  const m = idx.length - 1;
  let merged = 0;
  for (let j = 1; j <= m; j++) if (idx[j] - idx[j - 1] > 1) merged++;
  const cf = conf * Math.pow(MERGE_PENALTY, merged);
  const wc: WaveCount = {
    key: `${ctx.degree}|${kind}|${piv.map((p) => p.i).join(",")}`,
    degree: ctx.degree,
    kind,
    dir: piv[0].type === "L" ? 1 : -1,
    pivots: piv,
    labels: labels.slice(0, m),
    forming,
    complete,
    score: Math.round(score),
    conf: Math.max(0, Math.min(100, Math.round(cf))),
    ratios,
    startK: idx[0],
    endK: idx[m],
  };
  if (truncated) wc.truncated = true;
  return wc;
}

/** Number of subwaves of the leg between pivots a and b: the swings of the same degree inside it, or (if more) those of the finer zigzag. Always odd. */
function subLegs(ctx: Ctx, a: number, b: number): number {
  const span = b - a;
  const lo = ctx.P[a].i;
  const hi = ctx.P[b].i;
  const F = ctx.F;
  // first index with F > lo
  let l = 0, r = F.length;
  while (l < r) {
    const mid = (l + r) >> 1;
    if (F[mid] <= lo) l = mid + 1;
    else r = mid;
  }
  let cnt = 0;
  for (let j = l; j < F.length && F[j] < hi; j++) cnt++;
  let fine = cnt + 1;
  if (fine % 2 === 0) fine -= 1;
  return Math.max(span, fine, 1);
}

/** How well a subwave count fits a motive leg (5, or 9 / 13 with an extension). 1 subwave = unknown (null). */
function motiveFit(n: number): number | null {
  if (n <= 1) return null;
  if (n === 5) return 1;
  if (n === 9 || n === 13) return 0.85;
  if (n === 3) return 0.25;
  return n >= 15 ? 0.6 : 0.3;
}
/** Same for a corrective leg (3, or 7 / 11 for a double / triple). */
function corrFit(n: number): number | null {
  if (n <= 1) return null;
  if (n === 3) return 1;
  if (n === 7 || n === 11) return 0.8;
  if (n === 5) return 0.3;
  return 0.6;
}
/** Adds the internal-structure components: `want[j]` is "5" (motive) or "3" (corrective) for leg j+1. The forming leg is skipped. */
function addStructure(acc: Acc, ctx: Ctx, idx: number[], want: string, forming: boolean, w = 4): void {
  const m = idx.length - 1;
  for (let j = 1; j <= m; j++) {
    if (forming && j === m) continue;
    const ch = want[j - 1];
    if (!ch) break;
    const n = subLegs(ctx, idx[j - 1], idx[j]);
    const s = ch === "5" ? motiveFit(n) : ch === "3" ? corrFit(n) : n > 1 ? 0.8 : null;
    if (s !== null) acc.add(w, s);
  }
}

function series(ctx: Ctx, idx: number[]): { d: 1 | -1; q: number[]; t: number[] } {
  const P = ctx.P;
  const d = P[idx[0]].type === "L" ? 1 : -1;
  const q: number[] = [];
  const t: number[] = [];
  for (const j of idx) {
    q.push(d * P[j].p);
    t.push(P[j].i);
  }
  return { d, q, t };
}

function evalImpulse(ctx: Ctx, idx: number[], live: boolean): WaveCount | null {
  const P = ctx.P;
  const k = idx[0];
  const m = idx.length - 1;
  const { d, q, t } = series(ctx, idx);
  const forming = live;
  const w1 = q[1] - q[0];
  if (!(w1 > 0)) return null;
  let w2 = 0, r2 = NaN, w3 = 0, x3 = NaN, w4 = 0, r4 = NaN, w5 = 0, x5 = NaN;
  let diag = false;
  if (m >= 2) {
    w2 = q[1] - q[2];
    if (!(w2 > 0) || q[2] <= q[0]) return null; // wave 2 never beyond the start of wave 1
    r2 = w2 / w1;
  }
  if (m >= 3) {
    w3 = q[3] - q[2];
    if (!(w3 > 0)) return null;
    if (!(forming && m === 3) && q[3] <= q[1]) return null; // wave 3 passes the end of wave 1
    x3 = w3 / w1;
  }
  if (m >= 4) {
    w4 = q[3] - q[4];
    if (!(w4 > 0) || q[4] <= q[2]) return null; // wave 4 never beyond the start of wave 3
    r4 = w4 / w3;
    if (q[4] <= q[1]) {
      // overlap with the territory of wave 1: only a diagonal may do that
      if (!ctx.allowDiagonals) return null;
      diag = true;
    }
  }
  if (m >= 5) {
    w5 = q[5] - q[4];
    if (!(w5 > 0)) return null;
    x5 = w5 / w1;
    if (w3 < w1 && w3 < w5) return null; // wave 3 is never the shortest
  }
  // a diagonal is a wedge: contracting (1 > 3 > 5, 2 > 4) or expanding (1 < 3 < 5, 2 < 4); anything else with an overlap is no motive wave
  let expanding = false;
  if (diag) {
    const con = w3 < w1 && w4 < w2 && (m < 5 || w5 < w3);
    const exp = w3 > w1 && w4 > w2 && (m < 5 || forming || (w5 > w3 && q[5] > q[3]));
    if (!con && !exp) return null;
    expanding = !con;
  }
  // truncated fifth: only a finished wave 5 can be called that, and only after a strong, extended wave 3
  const trunc = m === 5 && !forming && q[5] <= q[3];
  if (trunc && (diag || !(w3 >= w1 && w3 >= w5 && x3 >= 1.382))) return null;

  const acc = new Acc();
  // wave 2
  if (m >= 2) {
    const f = forming && m === 2;
    let s = diag ? trap(r2, 0.3, 0.5, 0.9, 0.99) : 0.85 * trap(r2, 0.2, 0.382, 0.786, 0.9) + 0.15 * Math.max(near(r2, 0.5, 0.15), near(r2, 0.618, 0.15));
    if (f && r2 < 0.382) s = Math.max(s, 0.7); // may still deepen
    acc.add(14, s, "w2/w1", r2);
  }
  // wave 3
  if (m >= 3) {
    const f = forming && m === 3;
    let s: number;
    if (x3 >= 1.618 && x3 <= 2.618) s = 1;
    else if (x3 >= 1) s = x3 < 1.618 ? 0.45 + (0.55 * (x3 - 1)) / 0.618 : Math.max(0.4, 1 - (0.5 * (x3 - 2.618)) / 1.618);
    else s = x3 > 0.6 ? (0.45 * (x3 - 0.6)) / 0.4 : 0;
    if (f && x3 < 1.618) s = Math.max(s, 0.55); // may still extend
    // a wedge: every motive leg is a fair fraction (contracting) or multiple (expanding) of the one before
    if (diag) s = expanding ? trap(x3, 1, 1.05, 1.7, 2.3) : trap(x3, 0.45, 0.6, 0.95, 1);
    acc.add(22, s, "w3/w1", x3);
  }
  // wave 4
  if (m >= 4) {
    const f = forming && m === 4;
    let s = diag ? trap(r4, 0.2, 0.382, 0.9, 0.99) : 0.9 * trap(r4, 0.15, 0.236, 0.5, 0.65) + 0.1 * near(r4, 0.382, 0.12);
    if (f && r4 < 0.236) s = Math.max(s, 0.75);
    acc.add(12, s, "w4/w3", r4);
    // alternation of waves 2 and 4 (depth)
    acc.add(6, f ? 0.6 : 0.35 + 0.65 * clamp01(Math.abs(r2 - r4) / 0.25));
  }
  // wave 5
  if (m >= 5) {
    const net = q[3] - q[0];
    const y = net > 0 ? w5 / net : 0;
    let s = Math.max(near(x5, 1, 0.35), near(x5, 0.618, 0.2), y >= 0.382 && y <= 1 ? 0.85 : 0, 0.8 * near(x5, 1.618, 0.3));
    if (forming && x5 < 0.618) s = Math.max(s, 0.6);
    if (diag) {
      const z = w5 / w3;
      s = expanding ? trap(z, 1, 1.05, 1.7, 2.3) : trap(z, 0.4, 0.55, 0.95, 1);
      if (forming) s = Math.max(s, 0.6);
    }
    acc.add(14, s, "w5/w1", x5);
  }
  // channel parallelism of the 0-2-4 and 1-3-5 lines
  const H = Math.max(...q) - Math.min(...q);
  const T = t[m] - t[0];
  if (m >= 3 && !diag) {
    const lo = m >= 4 ? [0, 2, 4] : [0, 2];
    const up = m >= 5 ? [1, 3, 5] : [1, 3];
    const sL = nslope(t, q, lo, H, T);
    const sU = nslope(t, q, up, H, T);
    acc.add(m >= 4 ? 10 : 6, 1 - clamp01(Math.abs(sL - sU) / 0.9));
  }
  if (diag) {
    // a wedge: contracting (1 > 3 > 5) or expanding, with converging boundary lines 1-3-5 and 2-4
    const sU = nslope(t, q, m >= 5 ? [1, 3, 5] : [1, 3], H, T);
    const sL = nslope(t, q, [2, 4], H, T);
    const shape = expanding ? sL < sU : sL > sU;
    acc.add(14, (expanding ? 0.4 : 0.5) + (shape ? 0.5 : 0.1));
  }
  // time proportions
  if (m >= 3) {
    const u1 = t[1] - t[0];
    const u2 = t[2] - t[1];
    const u3 = t[3] - t[2];
    acc.add(4, trap(u3 / Math.max(1, u1), 0.3, 0.7, 3.5, 8));
    if (m >= 4) {
      const u4 = t[4] - t[3];
      acc.add(3, 0.5 + 0.5 * clamp01(Math.abs(Math.log(Math.max(1, u4) / Math.max(1, u2))) / 0.7));
    }
  }
  if (m >= 3) acc.add(8, legShare(t));
  // momentum: wave 3 is the strongest move (not slower than wave 1), corrections are slower than the motive wave before them.
  // Random swings do the opposite: a bigger swing is a slower one, a smaller one is faster.
  if (m >= 3 && !diag) {
    const vel = (j: number) => Math.abs(q[j] - q[j - 1]) / Math.max(1, t[j] - t[j - 1]);
    const v1 = vel(1);
    // an extended wave 3 holds its own pullbacks: its momentum is that of its fastest subwave
    let vmax = vel(3);
    for (let j = idx[2] + 1; j <= idx[3]; j += 2) {
      vmax = Math.max(vmax, Math.abs(P[j].p - P[j - 1].p) / Math.max(1, P[j].i - P[j - 1].i));
    }
    const v3 = vmax;
    if (!(forming && m === 3) || x3 >= 1) acc.add(MOM_W, clamp01((v3 / v1 - 0.5) / 0.5));
    let cs = clamp01((1.7 - vel(2) / v1) / 0.7);
    let cn = 1;
    if (m >= 5 || (m === 4 && !forming)) {
      cs += clamp01((1.7 - vel(4) / v3) / 0.7);
      cn++;
    }
    acc.add(MOM_W * 0.6, cs / cn);
  }
  // extension: normally wave 3 is the extended one
  if (m >= 3 && !diag) {
    let s: number;
    if (m === 3) s = forming ? (x3 >= 1.618 ? 1 : 0.6) : x3 >= 1.2 ? 1 : 0.3;
    else if (m === 4) s = w3 >= w1 ? 1 : 0.35;
    else s = w3 >= w1 && w3 >= w5 ? 1 : w5 >= w1 && w5 > w3 ? 0.7 : 0.55;
    acc.add(8, s);
  }

  let kind: CountKind = "impulse";
  if (diag) {
    // ending diagonals (wave 5 / C) follow a strong advance in the same direction that was only partly retraced; leading ones (wave 1 / A) start a move
    const prior = k >= 2 ? d * (P[k - 1].p - P[k - 2].p) : 0;
    const pull = k >= 1 ? d * (P[k - 1].p - P[k].p) : 0;
    const ending = prior >= 0.8 * (q[m] - q[0]) && pull < 0.8 * prior;
    kind = ending ? (expanding ? "expanding_ending_diagonal" : "ending_diagonal") : expanding ? "expanding_leading_diagonal" : "leading_diagonal";
    // ending: 3-3-3-3-3; leading: 5-3-5-3-5 or all threes (only the corrective legs are checked)
    addStructure(acc, ctx, idx, ending ? "33333" : " 3 3 ", forming);
  } else {
    addStructure(acc, ctx, idx, "53535", forming);
    // alternation of structure: a simple wave 2 against a complex wave 4 (or the reverse)
    if (m >= 5 || (m === 4 && !forming)) {
      const n2 = subLegs(ctx, idx[1], idx[2]);
      const n4 = subLegs(ctx, idx[3], idx[4]);
      if (n2 > 1 || n4 > 1) acc.add(3, n2 !== n4 ? 1 : 0.5);
    }
  }

  const score = acc.score();
  let conf = calib(score) * EVIDENCE[m];
  if (trunc) conf *= 0.85;
  // a count whose last wave is still running has one confirmed pivot less than its label count suggests
  if (forming && m >= 4 && !diag) conf *= 0.9;
  if (diag) conf = Math.min(75, conf * (expanding ? 0.7 : kind === "ending_diagonal" ? 0.78 : 0.68) * (forming ? 0.92 : 1));
  const labels = ["1", "2", "3", "4", "5"];
  return mk(ctx, kind, idx, labels, m === 5, forming, score, conf, acc.ratios, trunc);
}

/* ───────────────────────── corrections ───────────────────────── */

function evalCorrective(ctx: Ctx, idx: number[], live: boolean): WaveCount | null {
  const m = idx.length - 1;
  const { q, t } = series(ctx, idx);
  const a = q[1] - q[0];
  if (!(a > 0)) return null;
  const b = q[1] - q[2];
  if (!(b > 0)) return null;
  const rb = b / a;
  if (rb > 2.0 || rb < 0.15) return null;
  // zigzag: B retraces a part of A; flat: B returns to the start of A (0.9..1.05); expanded / running flat: B goes beyond it
  let kind: CountKind = rb < 0.9 ? "zigzag" : rb <= 1.05 ? "flat" : "expanded_flat";
  const forming = live;
  const acc = new Acc();
  let rc = NaN;
  let trunc = false;
  let mult = 1;
  if (m === 3) {
    const c = q[3] - q[2];
    if (!(c > 0)) return null;
    rc = c / a;
    const e = (q[3] - q[1]) / a; // how far C ends beyond the end of A
    if (!forming) {
      if (kind === "zigzag" && e <= 0) {
        // truncated C: rare, and only when C is still a fair part of A
        if (rc < 0.618) return null;
        trunc = true;
        mult = 0.8;
      } else if (kind === "flat" && e < -0.12) {
        if (rc < 0.618) return null;
        trunc = true;
        mult = 0.8;
      } else if (kind === "expanded_flat" && e <= 0) {
        // running flat: B beyond the start of A, C fails to reach the end of A
        if (rc < 0.5) return null;
        kind = "running_flat";
        mult = 0.85;
      }
    }
    if (kind === "flat" && e > 0.25) kind = "expanded_flat";
  }
  const f = forming && m === 3;
  if (kind === "zigzag") {
    acc.add(35, trap(rb, 0.2, 0.382, 0.786, 0.9), "B/A", rb);
    if (m === 3) {
      let s = 0.75 * trap(rc, 0.45, 0.8, 1.7, 2.4) + 0.25 * Math.max(near(rc, 1, 0.25), near(rc, 1.618, 0.25), near(rc, 0.618, 0.12));
      if (f && rc < 1) s = Math.max(s, 0.55);
      acc.add(40, s, "C/A", rc);
      acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
      acc.add(15, q[3] > q[1] ? 1 : 0.3);
    }
  } else if (kind === "running_flat") {
    acc.add(35, trap(rb, 1.0, 1.05, 1.382, 2.0), "B/A", rb);
    acc.add(40, trap(rc, 0.5, 0.618, 1.0, 1.3), "C/A", rc);
    acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
  } else if (kind === "flat") {
    acc.add(35, 0.2 + 0.8 * near(rb, 0.95, 0.12), "B/A", rb);
    if (m === 3) {
      const e = (q[3] - q[1]) / a;
      acc.add(40, f && e < 0 ? 0.6 : near(e, 0.03, 0.2), "C/A", rc);
      acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
    }
  } else {
    acc.add(35, trap(rb, 1.0, 1.05, 1.382, 2.0), "B/A", rb);
    if (m === 3) {
      let s = trap(rc, 1.0, 1.272, 2.0, 2.8);
      if (f && rc < 1.272) s = Math.max(s, 0.5);
      acc.add(40, s, "C/A", rc);
      acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
    }
  }
  if (m === 3) acc.add(8, legShare(t));
  // internal structure: zigzag 5-3-5, flats 3-3-5
  addStructure(acc, ctx, idx, kind === "zigzag" ? "535" : "335", forming, 6);
  const score = acc.score();
  const conf = calib(score) * (m === 2 ? CORR_EVIDENCE[2] : CORR_EVIDENCE[3]) * mult;
  return mk(ctx, kind, idx, ["A", "B", "C"], m === 3, forming, score, conf, acc.ratios, trunc);
}

/**
 * Combinations: W-X-Y (double zigzag / double three) and W-X-Y-X-Z (triple). "Zigzag" combinations make progress (every X is a
 * partial retracement, Y and Z pass the previous ends); "threes" go sideways. m = 2..5 known legs; m = 3 and m = 5 are complete.
 */
function evalComplex(ctx: Ctx, idx: number[], live: boolean): WaveCount | null {
  const m = idx.length - 1;
  const { q, t } = series(ctx, idx);
  const w = q[1] - q[0];
  const x = q[1] - q[2];
  if (!(w > 0) || !(x > 0)) return null;
  const rx = x / w;
  if (rx < 0.3 || rx > 1.4) return null;
  const acc = new Acc();
  let known = 0;
  const nW = subLegs(ctx, idx[0], idx[1]);
  const sW = corrFit(nW);
  if (sW !== null) {
    acc.add(8, sW);
    known++;
  }
  acc.add(25, trap(rx, 0.3, 0.5, 0.9, 1.4), "X/W", rx);
  let sharp = rx < 0.9;
  if (m >= 3) {
    const y = q[3] - q[2];
    if (!(y > 0)) return null;
    const ry = y / w;
    const fY = live && m === 3;
    const nY = fY ? 1 : subLegs(ctx, idx[2], idx[3]);
    if (nW === 5 && nY === 5) return null; // two fives joined by a three: that is a plain zigzag
    const sY = corrFit(nY);
    if (sY !== null) {
      acc.add(8, sY);
      known++;
    }
    let s = Math.max(near(ry, 1, 0.5), 0.8 * near(ry, 1.618, 0.3), 0.8 * near(ry, 0.618, 0.2));
    if (fY && ry < 0.8) s = Math.max(s, 0.5);
    acc.add(30, s, "Y/W", ry);
    acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.6, 1.8, 4));
    if (!fY && q[3] <= q[1]) sharp = false;
  }
  if (m >= 4) {
    const xx = q[3] - q[4];
    if (!(xx > 0)) return null;
    const rxx = xx / (q[3] - q[2]);
    if (rxx < 0.3 || rxx > 1.4) return null;
    if (q[4] <= Math.min(q[0], q[2]) - 0.4 * w) return null;
    acc.add(15, trap(rxx, 0.3, 0.5, 0.9, 1.4), "XX/Y", rxx);
    if (rxx >= 0.9) sharp = false;
  }
  if (m === 5) {
    const z = q[5] - q[4];
    if (!(z > 0)) return null;
    const rz = z / w;
    let s = Math.max(near(rz, 1, 0.5), 0.8 * near(rz, 0.618, 0.2), 0.8 * near(rz, 1.618, 0.3));
    if (live && rz < 0.8) s = Math.max(s, 0.5);
    acc.add(20, s, "Z/W", rz);
    if (!live) {
      const sZ = corrFit(subLegs(ctx, idx[4], idx[5]));
      if (sZ !== null) {
        acc.add(8, sZ);
        known++;
      }
      if (q[5] <= q[3]) sharp = false;
    }
  }
  if (m >= 3) acc.add(8, legShare(t));
  const triple = m >= 4;
  const kind: CountKind = triple ? (sharp ? "triple_zigzag" : "triple_three") : sharp ? "double_zigzag" : "double_three";
  const score = acc.score();
  const ev = m === 2 ? CORR_EVIDENCE[2] : m === 3 ? CORR_EVIDENCE[3] : m === 4 ? 0.6 : 0.7;
  // a combination is the fallback reading: it never outranks a clean simple count, least of all when its inner structure is unknown
  const cap = triple ? 55 : known > 0 ? 65 : 50;
  const conf = Math.min(cap, calib(score) * ev - 4);
  return mk(ctx, kind, idx, ["W", "X", "Y", "X", "Z"], m === 3 || m === 5, live, score, conf, acc.ratios);
}

/**
 * Triangle A-B-C-D-E (m = 4: D forming, m = 5: E forming / finished): contracting, barrier (one flat boundary), running
 * (B beyond the start of A) or expanding (every wave longer than the previous one).
 */
function evalTriangle(ctx: Ctx, idx: number[], live: boolean): WaveCount | null {
  const P = ctx.P;
  const k = idx[0];
  const m = idx.length - 1;
  const { q, t } = series(ctx, idx);
  // q0 start, q1 high (A), q2 low (B), q3 high (C), q4 low (D), q5 high (E)
  const a = q[1] - q[0];
  const b = q[1] - q[2];
  const c = q[3] - q[2];
  const dd = q[3] - q[4];
  if (!(a > 0) || !(b > 0) || !(c > 0) || !(dd > 0)) return null;
  const tol = 0.06 * a;
  const rc = c / a;
  const rd = dd / b;
  let kind: CountKind;
  const formingD = live && m === 4;
  if (q[2] < q[0] && q[3] > q[1] && (formingD || q[4] < q[2])) {
    kind = "triangle_expanding";
    if (rc < 1.05 || rc > 2.2 || (!formingD && (rd < 1.05 || rd > 2.2))) return null;
  } else {
    if (q[3] > q[1] + tol || q[4] < q[2] - tol) return null;
    const flatTop = Math.abs(q[3] - q[1]) <= tol;
    const flatBot = Math.abs(q[4] - q[2]) <= tol && !formingD;
    if (flatTop && flatBot) return null; // a rectangle, not a triangle
    if (q[2] < q[0]) {
      if (b / a > 1.5 || flatTop || flatBot) return null;
      kind = "triangle_running";
    } else kind = flatTop || flatBot ? "triangle_barrier" : "triangle";
    if (rc < 0.38 || (kind !== "triangle_running" && rc > 1.02) || rd < 0.38 || rd > 1.02) return null;
  }
  const exp = kind === "triangle_expanding";
  const acc = new Acc();
  const fit = (r: number) => (exp ? trap(r, 1.02, 1.15, 1.7, 2.2) : trap(r, 0.36, 0.5, 0.85, 1.02));
  // a running triangle has an oversized B: C is measured against B there
  acc.add(26, fit(kind === "triangle_running" ? c / b : rc), "C/A", rc);
  acc.add(26, formingD ? Math.max(fit(rd), 0.5) : fit(rd), "D/B", rd);
  if (m === 5) {
    const e = q[5] - q[4];
    if (!(e > 0)) return null;
    const re = e / c;
    if (exp) {
      if (!live && q[5] <= q[3]) return null;
      if (re > 2.2) return null;
    } else if (q[5] > q[3] + (kind === "triangle_barrier" ? tol : 0)) return null;
    let s = fit(re);
    if (live && (exp ? re < 1.15 : re < 0.5)) s = Math.max(s, 0.5);
    acc.add(26, s, "E/C", re);
  }
  // position: a triangle corrects a larger move, so the leg that leads into it is not smaller than wave A
  const prev = k >= 1 ? Math.abs(P[k].p - P[k - 1].p) : NaN;
  if (isFinite(prev)) {
    if (!exp && prev < 0.9 * a) return null;
    acc.add(10, clamp01(prev / a / 1.5));
  } else acc.add(10, 0.5);
  acc.add(6, legShare(t));
  addStructure(acc, ctx, idx, "33333", live, 3);
  const score = acc.score();
  const conf = Math.min(80, calib(score) * (m === 4 ? 0.6 : 0.75) * (exp ? 0.85 : kind === "triangle_running" ? 0.9 : 1));
  return mk(ctx, kind, idx, ["A", "B", "C", "D", "E"], m === 5, live, score, conf, acc.ratios);
}

/* ───────────────────────── projections ───────────────────────── */

const px = (base: number, d: number, len: number, ratio: number) => base + d * len * ratio;

function mkLevels(base: number, d: number, len: number, items: [number, boolean, string?][]): ProjLevel[] {
  return items.map(([r, core, tag]) => ({ price: px(base, d, len, r), tag: tag ?? f3(r), core }));
}

/** Projection for a live count (its last pivot is the provisional extreme) or for a just finished one (last pivot confirmed). */
export function project(c: WaveCount): Projection {
  const piv = c.pivots;
  const m = piv.length - 1;
  const d = c.dir; // direction of wave 1 / A / W
  const last = piv[m];
  const none = (phase: Phase): Projection => ({ phase, mode: "none", dir: d, anchorI: last.i, anchorP: last.p, levels: [], invalid: null, next: null });

  // `next`: the first level that the running extreme has not reached yet (in the travel direction of the forming wave)
  const pickNext = (levels: ProjLevel[], travel: 1 | -1, now: number): ProjLevel | null => {
    if (!levels.length) return null;
    const ordered = [...levels].sort((p1, p2) => travel * (p1.price - p2.price));
    for (const l of ordered) if (travel * (l.price - now) > 0) return l;
    return ordered[ordered.length - 1];
  };
  const wrap = (phase: Phase, mode: Projection["mode"], travel: 1 | -1, anchor: Pivot, levels: ProjLevel[], invalid: { price: number; fromI: number } | null): Projection => ({
    phase,
    mode,
    dir: travel,
    anchorI: anchor.i,
    anchorP: anchor.p,
    levels,
    invalid,
    next: pickNext(levels, travel, last.p),
  });

  if (isMotive(c.kind)) {
    const diag = c.kind !== "impulse";
    const p = (j: number) => piv[j].p;
    const w1 = Math.abs(p(1) - p(0));
    if (!c.forming) {
      // pattern finished at a confirmed pivot (m === 5): a correction is due
      if (m === 5) {
        const net = Math.abs(p(5) - p(0));
        const lv = mkLevels(p(5), -d, net, [[0.382, true], [0.5, true], [0.618, true]]);
        lv.push({ price: p(4), tag: "w4", core: false });
        return wrap("w5done", "retrace", (-d) as 1 | -1, piv[5], lv, { price: p(5), fromI: piv[5].i });
      }
      return none("w5done");
    }
    if (m === 2) {
      const lv = mkLevels(p(1), -d, w1, [[0.382, false], [0.5, true], [0.618, true], [0.786, false]]);
      return wrap("w2", "retrace", (-d) as 1 | -1, piv[1], lv, { price: p(0), fromI: piv[0].i });
    }
    if (m === 3) {
      const lv = mkLevels(p(2), d, w1, [[1.0, false], [1.618, true], [2.0, true], [2.618, false]]);
      return wrap("w3", "target", d, piv[2], lv, { price: p(2), fromI: piv[2].i });
    }
    if (m === 4) {
      const w3 = Math.abs(p(3) - p(2));
      const lv = mkLevels(p(3), -d, w3, [[0.236, false], [0.382, true], [0.5, true], [0.618, false]]);
      return wrap("w4", "retrace", (-d) as 1 | -1, piv[3], lv, { price: diag ? p(2) : p(1), fromI: diag ? piv[2].i : piv[1].i });
    }
    // m === 5: wave 5 forming
    const net03 = Math.abs(p(3) - p(0));
    const lv = [
      ...mkLevels(p(4), d, w1, [[0.618, true], [1.0, true], [1.618, false]]),
      ...mkLevels(p(4), d, net03, [[0.382, false, "0→3 0.382"], [0.618, false, "0→3 0.618"]]),
    ];
    return wrap("w5", "target", d, piv[4], lv, { price: p(4), fromI: piv[4].i });
  }

  if (isAbc(c.kind)) {
    const A = Math.abs(piv[1].p - piv[0].p);
    if (m === 2) {
      const lv = mkLevels(piv[1].p, -d, A, [[0.382, false], [0.5, true], [0.618, true], [0.786, false]]);
      return wrap("wB", "retrace", (-d) as 1 | -1, piv[1], lv, { price: piv[0].p, fromI: piv[0].i });
    }
    // m === 3
    if (!c.forming) {
      return { phase: "wCdone", mode: "none", dir: (-d) as 1 | -1, anchorI: piv[3].i, anchorP: piv[3].p, levels: [], invalid: { price: piv[3].p, fromI: piv[3].i }, next: null };
    }
    const lv = mkLevels(piv[2].p, d, A, [[0.618, false], [1.0, true], [1.618, true]]);
    return wrap("wC", "target", d, piv[2], lv, { price: piv[2].p, fromI: piv[2].i });
  }

  if (isComplex(c.kind)) {
    const W = Math.abs(piv[1].p - piv[0].p);
    const sharp = c.kind.endsWith("zigzag");
    if (m === 2) {
      const lv = mkLevels(piv[1].p, -d, W, [[0.382, false], [0.5, true], [0.618, true], [0.786, false]]);
      return wrap("wX", "retrace", (-d) as 1 | -1, piv[1], lv, sharp ? { price: piv[0].p, fromI: piv[0].i } : null);
    }
    if (m === 3) {
      if (!c.forming) return { ...none("wYdone"), invalid: { price: piv[3].p, fromI: piv[3].i } };
      const lv = mkLevels(piv[2].p, d, W, [[0.618, false], [1.0, true], [1.618, true]]);
      return wrap("wY", "target", d, piv[2], lv, { price: piv[2].p, fromI: piv[2].i });
    }
    if (m === 4) {
      const Y = Math.abs(piv[3].p - piv[2].p);
      const lv = mkLevels(piv[3].p, -d, Y, [[0.382, false], [0.5, true], [0.618, true], [0.786, false]]);
      return wrap("wXX", "retrace", (-d) as 1 | -1, piv[3], lv, sharp ? { price: piv[2].p, fromI: piv[2].i } : null);
    }
    if (!c.forming) return { ...none("wZdone"), invalid: { price: piv[5].p, fromI: piv[5].i } };
    const lv = mkLevels(piv[4].p, d, W, [[0.618, false], [1.0, true], [1.618, true]]);
    return wrap("wZ", "target", d, piv[4], lv, { price: piv[4].p, fromI: piv[4].i });
  }

  if (isTriangle(c.kind)) {
    const exp = c.kind === "triangle_expanding";
    if (m === 4) {
      // D is forming; in a contracting triangle it may not pass the end of B
      return { ...none("wD"), dir: (-d) as 1 | -1, invalid: exp ? null : { price: piv[2].p, fromI: piv[2].i } };
    }
    // after E the thrust goes against wave A (in the direction of the move the triangle corrects); measured by the widest wave
    const A = Math.abs(piv[1].p - piv[0].p);
    const width = exp ? Math.abs(piv[5].p - piv[4].p) : A;
    const lv = mkLevels(piv[5].p, -d, width, [[0.618, true], [1.0, true], [1.618, false]]);
    const inv = exp ? null : { price: piv[3].p, fromI: piv[3].i };
    if (c.forming) return { ...none("wE"), invalid: inv };
    return wrap("wEdone", "target", (-d) as 1 | -1, piv[5], lv, exp ? { price: piv[5].p, fromI: piv[5].i } : inv);
  }
  return none("w5done");
}

/* ───────────────────────── per-degree analysis ───────────────────────── */

interface DegreeMemo {
  sig: string;
  stable: WaveCount[];
}
const memo = new Map<string, DegreeMemo>();
const MEMO_LIMIT = 24;

/** A wave may span 1, 3 or 5 swings of the zigzag (its own subwaves), so a count is a COMBINATION of pivots, not a run of consecutive ones. */
const SPANS = [1, 3, 5];
/** Longest count, in zigzag swings. */
const MAX_SPAN = 21;
/** Finished counts weaker than this are not worth caching. */
const STABLE_FLOOR = 12;

/** A merged leg is valid only when every swing inside it stays strictly between the leg's two ends. */
function legOk(P: Pivot[], a: number, s: number): boolean {
  if (s === 1) return true;
  const pa = P[a].p;
  const pb = P[a + s].p;
  const lo = Math.min(pa, pb);
  const hi = Math.max(pa, pb);
  for (let j = a + 1; j < a + s; j++) if (!(P[j].p > lo && P[j].p < hi)) return false;
  return true;
}

function evalTuple(ctx: Ctx, idx: number[], isLive: boolean, out: WaveCount[]): void {
  const m = idx.length - 1;
  const push = (c: WaveCount | null) => {
    if (c && (isLive || c.conf >= STABLE_FLOOR)) out.push(c);
  };
  if (isLive || m === 5) push(evalImpulse(ctx, idx, isLive));
  if (m <= 3 && (isLive || m === 3)) push(evalCorrective(ctx, idx, isLive));
  if (ctx.allowComplex && (isLive || m === 3 || m === 5)) push(evalComplex(ctx, idx, isLive));
  if ((m === 4 || m === 5) && (isLive || m === 5)) push(evalTriangle(ctx, idx, isLive));
}

/** Every pivot combination starting at `from`..: finished patterns ending at or before `to` (live = false) or patterns ending at the last pivot (live = true). */
function candidates(ctx: Ctx, from: number, to: number, live: boolean): WaveCount[] {
  const P = ctx.P;
  const n = P.length;
  const out: WaveCount[] = [];
  const idx: number[] = [];
  const dfs = (k0: number): void => {
    const cur = idx[idx.length - 1];
    const m = idx.length - 1;
    if (m >= 2) {
      const isLive = cur === n - 1;
      if (live ? isLive : !isLive && cur <= to) evalTuple(ctx, idx.slice(), isLive, out);
    }
    if (m === 5) return;
    for (const s of SPANS) {
      const nx = cur + s;
      if (nx > n - 1 || nx - k0 > MAX_SPAN) break;
      if (!live && nx > to) break;
      if (!legOk(P, cur, s)) continue;
      idx.push(nx);
      dfs(k0);
      idx.pop();
    }
  };
  for (let k = Math.max(0, from); k <= n - 3; k++) {
    idx.length = 0;
    idx.push(k);
    dfs(k);
  }
  return out;
}

/**
 * Wave grammar. A correction that starts where a strong, finished motive wave of the opposite direction ended is far more
 * believable (unless it retraces beyond that wave's origin: then it corrects nothing); a motive wave that starts where such
 * a correction ended, in the direction of the motive wave before it, continues the sequence.
 */
function applyContext(list: WaveCount[]): WaveCount[] {
  const ends = new Map<number, { conf: number; origin: number; dir: 1 | -1 }>();
  for (const x of list) {
    if (isMotive(x.kind) && x.complete && !x.forming) {
      const prev = ends.get(x.endK);
      if (!prev || x.conf > prev.conf) ends.set(x.endK, { conf: x.conf, origin: x.pivots[0].p, dir: x.dir });
    }
  }
  const follows = (x: WaveCount) => {
    const mo = ends.get(x.startK);
    if (!mo || mo.conf < 60 || mo.dir === x.dir) return null;
    for (const p of x.pivots) if (x.dir * (p.p - mo.origin) > 0) return null;
    return mo;
  };
  const corrEnds = new Map<number, 1 | -1>();
  for (const x of list) {
    if (isMotive(x.kind) || !x.complete || x.forming || x.conf < 25) continue;
    const mo = follows(x);
    if (mo) corrEnds.set(x.endK, mo.dir);
  }
  return list.map((x) => {
    if (isMotive(x.kind)) {
      return corrEnds.get(x.startK) === x.dir ? { ...x, conf: Math.min(100, Math.round(x.conf * 1.1)) } : x;
    }
    if (isTriangle(x.kind) || !follows(x)) return x;
    const m = x.labels.length;
    if (isComplex(x.kind)) {
      const cap = m >= 4 ? 60 : 70;
      const k = m === 2 ? CORR_EVIDENCE.ctx2 / CORR_EVIDENCE[2] : m === 3 ? CORR_EVIDENCE.ctx3 / CORR_EVIDENCE[3] : 1.15;
      return { ...x, conf: Math.min(cap, Math.round(x.conf * k)) };
    }
    const base = CORR_EVIDENCE[m === 2 ? 2 : 3];
    const boosted = CORR_EVIDENCE[m === 2 ? "ctx2" : "ctx3"];
    return { ...x, conf: Math.min(100, Math.round((x.conf / base) * boosted)) };
  });
}

/** What the higher degree expects from its forming wave: lower-degree motive waves that start inside it should go the same way. */
export interface DegreeBias {
  fromI: number;
  dir: 1 | -1;
}


export function emptyDegree(degree: ElliottDegree): DegreeResult {
  return { degree, pivotCount: 0, counts: [], alt: null, live: null };
}

export function analyzeDegree(c: SwingCandle[], o: ElliottOptions, degree: ElliottDegree, bias?: DegreeBias | null): DegreeResult {
  const n = c.length;
  if (n < 10) return emptyDegree(degree);
  // the window start is quantised so that the zigzag (ATR warm-up) stays stable while new bars arrive
  const win = Math.max(100, Math.floor(o.window));
  let start = Math.max(0, n - win);
  start = start - (start % 100);
  const slice = start === 0 ? c : c.slice(start);
  const mult = DEGREE_ATR[degree] * (1.5 - 0.1 * Math.max(1, Math.min(10, o.sensitivity)));
  let piv: Pivot[];
  try {
    piv = zigzag(slice, { atrMult: mult, atrPeriod: 14 });
  } catch {
    return emptyDegree(degree);
  }
  if (start > 0) piv = piv.map((p) => ({ ...p, i: p.i + start }));
  piv = piv.filter((p) => isFinite(p.p));
  const len = piv.length;
  if (len < 3) return { ...emptyDegree(degree), pivotCount: len };
  // the next finer zigzag: its swings are the subwaves of this degree's legs
  let F: number[] = [];
  try {
    F = zigzag(slice, { atrMult: mult / 2, atrPeriod: 14 }).map((p) => p.i + start);
  } catch {
    F = [];
  }
  const ctx: Ctx = { degree, P: piv, F, allowDiagonals: o.allowDiagonals, allowComplex: o.allowComplex };

  // candidates that only use confirmed pivots (complete patterns ending before the last pivot) are cached between ticks
  const lastConf = len >= 2 ? piv[len - 2] : piv[0];
  const sig = `${len}|${lastConf.i}|${lastConf.p}|${piv[0].i}`;
  const mkey = `${degree}|${o.sensitivity}|${start}|${o.allowDiagonals ? 1 : 0}${o.allowComplex ? 1 : 0}|${win}`;
  let cached = memo.get(mkey);
  if (!cached || cached.sig !== sig) {
    cached = { sig, stable: candidates(ctx, 0, len - 2, false) };
    memo.delete(mkey);
    memo.set(mkey, cached);
    if (memo.size > MEMO_LIMIT) {
      const first = memo.keys().next().value;
      if (first !== undefined) memo.delete(first);
    }
  }
  const liveCands = candidates(ctx, Math.max(0, len - 1 - MAX_SPAN), len - 1, true);
  let withCtx = applyContext([...cached.stable, ...liveCands]);
  if (debugSink) debugSink.push(...withCtx);
  if (bias) {
    // degree consistency: a motive wave inside the forming wave of the higher degree should travel with it
    withCtx = withCtx.map((x) => (isMotive(x.kind) && x.pivots[0].i >= bias.fromI ? { ...x, conf: Math.min(100, Math.round(x.conf * (x.dir === bias.dir ? 1.08 : 0.8))) } : x));
  }
  const all = withCtx.filter((x) => x.conf >= o.minConfidence);

  // live pick: ends at the last pivot, or is a complete pattern that ended at the last confirmed pivot
  const liveSet = all.filter((x) => x.endK === len - 1 || (x.endK === len - 2 && x.complete));
  const rank = (x: WaveCount) => x.conf + (x.endK === len - 1 ? 2 : 0);
  liveSet.sort((p1, p2) => rank(p2) - rank(p1));
  const primary = liveSet[0] ?? null;

  const chain: WaveCount[] = [];
  const maxCounts = Math.max(1, Math.floor(o.maxCounts));
  let cursor: number;
  if (primary) {
    chain.push(primary);
    cursor = primary.startK;
  } else {
    // no live count: still show the latest finished ones
    const done = all.filter((x) => x.complete && x.endK <= len - 2);
    done.sort((p1, p2) => p2.endK - p1.endK || p2.conf - p1.conf);
    const first = done[0];
    if (first) {
      chain.push(first);
      cursor = first.startK;
    } else cursor = -1;
  }
  while (chain.length < maxCounts && cursor > 0) {
    let best: WaveCount | null = null;
    let bestRank = -Infinity;
    for (const x of cached.stable) {
      if (x.conf < o.minConfidence || x.endK > cursor) continue;
      const r = x.conf + (x.endK === cursor ? 8 : -3 * (cursor - x.endK));
      if (r > bestRank) {
        bestRank = r;
        best = x;
      }
    }
    if (!best) break;
    chain.push(best);
    cursor = best.startK;
  }
  chain.reverse();

  let alt: WaveCount | null = null;
  if (o.showAlternate && primary) {
    const floor = Math.max(20, o.minConfidence * 0.6);
    const sameEnd = withCtx.filter((x) => x !== primary && x.endK === primary.endK && x.conf >= floor && x.labels.length >= 3 && (x.kind !== primary.kind || x.startK !== primary.startK));
    sameEnd.sort((p1, p2) => p2.conf - p1.conf);
    alt = sameEnd[0] ?? null;
  }

  const live: LiveCount | null = primary ? { count: primary, proj: project(primary) } : null;
  return { degree, pivotCount: len, counts: chain, alt, live };
}

/** Whole analysis for the indicator: one degree, or all three ("multi"). */
export function analyze(c: SwingCandle[], o: ElliottOptions, multi: boolean): ElliottResult {
  const list: ElliottDegree[] = multi ? ["primary", "intermediate", "minor"] : [o.degree];
  const degrees: DegreeResult[] = [];
  const clean = sanitize(c);
  const base = (): ElliottResult => ({ degrees, focus: -1, precision: 2, analysed: Math.min(c.length, Math.max(100, Math.floor(o.window))), minConfidence: o.minConfidence, multi });
  if (!clean) {
    for (const dg of list) degrees.push(emptyDegree(dg));
    return base();
  }
  let bias: DegreeBias | null = null;
  for (const dg of list) {
    try {
      const r = analyzeDegree(clean, o, dg, bias);
      degrees.push(r);
      const pr = r.live?.proj;
      if (pr && pr.mode === "target" && r.live!.count.conf >= 60) bias = { fromI: pr.anchorI, dir: pr.dir };
    } catch {
      degrees.push(emptyDegree(dg));
    }
  }
  const res = base();
  res.focus = degrees.findIndex((d) => d.live !== null);
  return res;
}

/** Forward-fills non-finite candles (indices must stay aligned). Null when there is nothing usable. */
function sanitize(c: SwingCandle[]): SwingCandle[] | null {
  let bad = false;
  for (let i = Math.max(0, c.length - 20000); i < c.length; i++) {
    const k = c[i];
    if (!(isFinite(k.h) && isFinite(k.l) && isFinite(k.c) && isFinite(k.o))) {
      bad = true;
      break;
    }
  }
  if (!bad) return c;
  let prev: number | null = null;
  const out: SwingCandle[] = new Array(c.length);
  for (let i = 0; i < c.length; i++) {
    const k = c[i];
    if (isFinite(k.h) && isFinite(k.l) && isFinite(k.c) && isFinite(k.o)) {
      prev = k.c;
      out[i] = k;
    } else if (prev !== null) out[i] = { t: k.t, o: prev, h: prev, l: prev, c: prev, v: 0 };
    else out[i] = { t: k.t, o: NaN, h: NaN, l: NaN, c: NaN, v: 0 };
  }
  // a leading NaN prefix: cut it by back-filling from the first valid candle
  const first = out.findIndex((k) => isFinite(k.c));
  if (first < 0) return null;
  for (let i = 0; i < first; i++) {
    const v = out[first].c;
    out[i] = { t: c[i].t, o: v, h: v, l: v, c: v, v: 0 };
  }
  return out;
}

/** Prices a user may want alerts on: the invalidation and the next target of the focus count. */
export function alertLevels(r: ElliottResult | undefined | null): number[] {
  if (!r || r.focus < 0) return [];
  const live = r.degrees[r.focus]?.live;
  if (!live) return [];
  const out: number[] = [];
  if (live.proj.invalid && isFinite(live.proj.invalid.price)) out.push(live.proj.invalid.price);
  if (live.proj.next && isFinite(live.proj.next.price)) out.push(live.proj.next.price);
  return out;
}

let debugSink: WaveCount[] | null = null;
/** Test hook: runs `fn` and returns every candidate count the analysis looked at meanwhile. */
export function collectCandidates(fn: () => void): WaveCount[] {
  debugSink = [];
  try {
    fn();
    return debugSink;
  } finally {
    debugSink = null;
  }
}

/** Test hook: drops the cache. */
export function resetElliottCache(): void {
  memo.clear();
}

/** ATR of the last bar, for sanity displays. */
export function lastAtr(c: SwingCandle[]): number {
  const a = atrSeries(c, 14);
  return a.length ? a[a.length - 1] : 0;
}
