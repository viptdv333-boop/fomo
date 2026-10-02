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
export type CountKind = "impulse" | "leading_diagonal" | "ending_diagonal" | "zigzag" | "flat" | "expanded_flat" | "triangle" | "wxy";

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
}

export interface ProjLevel {
  price: number;
  /** Display ratio, e.g. "1.618" or "0→3 0.618". */
  tag: string;
  /** Part of the main target / retracement zone. */
  core: boolean;
}

export type Phase = "w2" | "w3" | "w4" | "w5" | "w5done" | "wB" | "wC" | "wCdone" | "wE" | "wEdone" | "wX" | "wY" | "wYdone";

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
  allowDiagonals: boolean;
  allowComplex: boolean;
}

function mk(ctx: Ctx, kind: CountKind, k: number, m: number, labels: string[], complete: boolean, forming: boolean, score: number, conf: number, ratios: RatioInfo[]): WaveCount {
  const piv = ctx.P.slice(k, k + m + 1);
  return {
    key: `${ctx.degree}|${kind}|${piv[0].i}|${piv[m].i}`,
    degree: ctx.degree,
    kind,
    dir: piv[0].type === "L" ? 1 : -1,
    pivots: piv,
    labels: labels.slice(0, m),
    forming,
    complete,
    score: Math.round(score),
    conf: Math.max(0, Math.min(100, Math.round(conf))),
    ratios,
    startK: k,
    endK: k + m,
  };
}

function evalImpulse(ctx: Ctx, k: number, m: number, live: boolean): WaveCount | null {
  const P = ctx.P;
  const d = P[k].type === "L" ? 1 : -1;
  const q: number[] = [];
  const t: number[] = [];
  for (let j = 0; j <= m; j++) {
    q.push(d * P[k + j].p);
    t.push(P[k + j].i);
  }
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
    const contracting = w3 < w1 && (m < 5 || w5 < w3);
    const sU = nslope(t, q, m >= 5 ? [1, 3, 5] : [1, 3], H, T);
    const sL = nslope(t, q, [2, 4], H, T);
    const converge = sL > sU ? 1 : 0.2;
    acc.add(14, 0.5 * (contracting ? 1 : 0.4) + 0.5 * converge);
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
  // extension: normally wave 3 is the extended one
  if (m >= 3) {
    let s: number;
    if (m === 3) s = forming ? (x3 >= 1.618 ? 1 : 0.6) : x3 >= 1.2 ? 1 : 0.3;
    else if (m === 4) s = w3 >= w1 ? 1 : 0.35;
    else s = w3 >= w1 && w3 >= w5 ? 1 : w5 >= w1 && w5 > w3 ? 0.7 : 0.55;
    acc.add(8, s);
  }

  const score = acc.score();
  let conf = calib(score) * EVIDENCE[m];
  const trunc = m >= 5 && q[5] <= q[3];
  if (trunc) conf *= 0.88;
  if (diag) conf = Math.min(75, conf * 0.85);
  let kind: CountKind = "impulse";
  if (diag) {
    // ending diagonals follow a strong advance in the same direction, leading ones start a move
    const prior = k >= 2 ? d * (P[k - 1].p - P[k - 2].p) : 0;
    kind = prior >= 0.8 * (q[m] - q[0]) ? "ending_diagonal" : "leading_diagonal";
  }
  const labels = ["1", "2", "3", "4", "5"];
  return mk(ctx, kind, k, m, labels, m === 5, forming, score, conf, acc.ratios);
}

/* ───────────────────────── corrections ───────────────────────── */

function evalCorrective(ctx: Ctx, k: number, m: number, live: boolean): WaveCount | null {
  const P = ctx.P;
  const d = P[k].type === "L" ? 1 : -1;
  const q: number[] = [];
  const t: number[] = [];
  for (let j = 0; j <= m; j++) {
    q.push(d * P[k + j].p);
    t.push(P[k + j].i);
  }
  const a = q[1] - q[0];
  if (!(a > 0)) return null;
  const b = q[1] - q[2];
  if (!(b > 0)) return null;
  const rb = b / a;
  if (rb > 1.65 || rb < 0.15) return null;
  let kind: CountKind = rb < 0.9 ? "zigzag" : rb <= 1.0 ? "flat" : "expanded_flat";
  const forming = live;
  const acc = new Acc();
  let rc = NaN;
  if (m === 3) {
    const c = q[3] - q[2];
    if (!(c > 0)) return null;
    rc = c / a;
    const e = (q[3] - q[1]) / a; // how far C ends beyond the end of A
    if (!forming) {
      if (kind === "zigzag" && e <= 0) return null; // C beyond A is mandatory (no truncation modelled)
      if (kind !== "zigzag" && e < -0.12) return null;
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
  } else if (kind === "flat") {
    acc.add(35, 0.2 + 0.8 * near(rb, 0.95, 0.12), "B/A", rb);
    if (m === 3) {
      const e = (q[3] - q[1]) / a;
      acc.add(40, f && e < 0 ? 0.6 : near(e, 0.03, 0.2), "C/A", rc);
      acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
    }
  } else {
    acc.add(35, trap(rb, 1.0, 1.05, 1.382, 1.65), "B/A", rb);
    if (m === 3) {
      let s = trap(rc, 1.0, 1.272, 2.0, 2.8);
      if (f && rc < 1.272) s = Math.max(s, 0.5);
      acc.add(40, s, "C/A", rc);
      acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.5, 2, 5));
    }
  }
  if (m === 3) acc.add(8, legShare(t));
  const score = acc.score();
  const conf = calib(score) * (m === 2 ? CORR_EVIDENCE[2] : CORR_EVIDENCE[3]);
  return mk(ctx, kind, k, m, ["A", "B", "C"], m === 3, forming, score, conf, acc.ratios);
}

/** Double three / double zigzag W-X-Y: the fallback reading of a 3-leg move that is not a clean A-B-C. */
function evalWxy(ctx: Ctx, k: number, m: number, live: boolean): WaveCount | null {
  const P = ctx.P;
  const d = P[k].type === "L" ? 1 : -1;
  const q: number[] = [];
  const t: number[] = [];
  for (let j = 0; j <= m; j++) {
    q.push(d * P[k + j].p);
    t.push(P[k + j].i);
  }
  const w = q[1] - q[0];
  const x = q[1] - q[2];
  if (!(w > 0) || !(x > 0)) return null;
  const rx = x / w;
  if (rx < 0.3 || rx > 1.05) return null;
  const acc = new Acc();
  acc.add(35, trap(rx, 0.3, 0.5, 0.9, 1.05), "X/W", rx);
  let ry = NaN;
  if (m === 3) {
    const y = q[3] - q[2];
    if (!(y > 0)) return null;
    ry = y / w;
    let s = near(ry, 1, 0.5);
    if (live && ry < 0.8) s = Math.max(s, 0.5);
    acc.add(40, s, "Y/W", ry);
    acc.add(10, trap((t[3] - t[2]) / Math.max(1, t[1] - t[0]), 0.2, 0.6, 1.8, 4));
  }
  const score = acc.score();
  const conf = Math.min(60, calib(score) * (m === 2 ? CORR_EVIDENCE[2] : CORR_EVIDENCE[3]) - 4);
  return mk(ctx, "wxy", k, m, ["W", "X", "Y"], m === 3, live, score, conf, acc.ratios);
}

/** Contracting triangle A-B-C-D-E (m = 4 means E has not started, m = 5 E is forming / finished). */
function evalTriangle(ctx: Ctx, k: number, m: number, live: boolean): WaveCount | null {
  const P = ctx.P;
  const d = P[k].type === "L" ? 1 : -1;
  const q: number[] = [];
  const t: number[] = [];
  for (let j = 0; j <= m; j++) {
    q.push(d * P[k + j].p);
    t.push(P[k + j].i);
  }
  // q0 start, q1 high (A), q2 low (B), q3 high (C), q4 low (D), q5 high (E)
  const a = q[1] - q[0];
  const b = q[1] - q[2];
  const c = q[3] - q[2];
  const dd = q[3] - q[4];
  if (!(a > 0) || !(b > 0) || !(c > 0) || !(dd > 0)) return null;
  if (q[2] <= q[0]) return null; // B stays inside A
  if (q[3] >= q[1]) return null; // lower high
  if (q[4] <= q[2]) return null; // higher low
  const rc = c / a;
  const rd = dd / b;
  if (rc < 0.4 || rc > 0.9 || rd < 0.4 || rd > 0.9) return null;
  const acc = new Acc();
  acc.add(30, near(rc, 0.65, 0.3), "C/A", rc);
  acc.add(30, near(rd, 0.65, 0.3), "D/B", rd);
  if (m === 5) {
    const e = q[5] - q[4];
    if (!(e > 0)) return null;
    if (q[5] >= q[3] && !live) return null;
    if (q[5] > q[3]) return null;
    const re = e / c;
    let s = near(re, 0.65, 0.3);
    if (live && re < 0.65) s = Math.max(s, 0.5);
    acc.add(30, s, "E/C", re);
  }
  acc.add(10, 0.6);
  const score = acc.score();
  const conf = Math.min(80, calib(score) * (m === 4 ? 0.6 : 0.75));
  return mk(ctx, "triangle", k, m, ["A", "B", "C", "D", "E"], m === 5, live, score, conf, acc.ratios);
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

  if (c.kind === "impulse" || c.kind === "leading_diagonal" || c.kind === "ending_diagonal") {
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

  if (c.kind === "zigzag" || c.kind === "flat" || c.kind === "expanded_flat") {
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

  if (c.kind === "wxy") {
    const W = Math.abs(piv[1].p - piv[0].p);
    if (m === 2) {
      const lv = mkLevels(piv[1].p, -d, W, [[0.382, false], [0.5, true], [0.618, true], [0.786, false]]);
      return wrap("wX", "retrace", (-d) as 1 | -1, piv[1], lv, { price: piv[0].p, fromI: piv[0].i });
    }
    if (!c.forming) return { ...none("wYdone"), invalid: { price: piv[3].p, fromI: piv[3].i } };
    const lv = mkLevels(piv[2].p, d, W, [[0.618, false], [1.0, true], [1.618, true]]);
    return wrap("wY", "target", d, piv[2], lv, { price: piv[2].p, fromI: piv[2].i });
  }

  // triangle
  if (c.kind === "triangle") {
    if (m === 4) return { ...none("wE"), invalid: { price: piv[3].p, fromI: piv[3].i } };
    return { ...none(c.forming ? "wE" : "wEdone"), invalid: { price: piv[3].p, fromI: piv[3].i } };
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

function candidates(ctx: Ctx, from: number, to: number, live: boolean): WaveCount[] {
  const P = ctx.P;
  const n = P.length;
  const out: WaveCount[] = [];
  for (let k = Math.max(0, from); k <= n - 3; k++) {
    for (let e = k + 2; e <= Math.min(n - 1, k + 5); e++) {
      if (live ? e !== n - 1 : e === n - 1 || e > to) continue;
      const m = e - k;
      const isLive = e === n - 1;
      if (m <= 5 && (isLive || m === 5)) {
        const c = evalImpulse(ctx, k, m, isLive);
        if (c) out.push(c);
      }
      if (m <= 3 && (isLive || m === 3)) {
        const c = evalCorrective(ctx, k, m, isLive);
        if (c) out.push(c);
        if (ctx.allowComplex) {
          const w = evalWxy(ctx, k, m, isLive);
          if (w) out.push(w);
        }
      }
      if ((m === 4 || m === 5) && (isLive || m === 5)) {
        const c = evalTriangle(ctx, k, m, isLive);
        if (c) out.push(c);
      }
    }
  }
  return out;
}

/** A correction that starts where a strong, finished impulse of the opposite direction ended is far more believable. */
function applyContext(list: WaveCount[]): WaveCount[] {
  const ends = new Map<number, number>();
  for (const x of list) {
    if ((x.kind === "impulse" || x.kind === "ending_diagonal" || x.kind === "leading_diagonal") && x.complete && !x.forming) {
      const prev = ends.get(x.endK);
      if (prev === undefined || x.conf > prev) ends.set(x.endK, x.conf);
    }
  }
  return list.map((x) => {
    if (x.kind !== "zigzag" && x.kind !== "flat" && x.kind !== "expanded_flat" && x.kind !== "wxy") return x;
    const ic = ends.get(x.startK);
    if (ic === undefined || ic < 60) return x;
    const m = x.labels.length;
    const base = CORR_EVIDENCE[m === 2 ? 2 : 3];
    const boosted = CORR_EVIDENCE[m === 2 ? "ctx2" : "ctx3"];
    const cap = x.kind === "wxy" ? 60 : 100;
    return { ...x, conf: Math.min(cap, Math.round((x.conf / base) * boosted)) };
  });
}

export function emptyDegree(degree: ElliottDegree): DegreeResult {
  return { degree, pivotCount: 0, counts: [], alt: null, live: null };
}

export function analyzeDegree(c: SwingCandle[], o: ElliottOptions, degree: ElliottDegree): DegreeResult {
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
  const ctx: Ctx = { degree, P: piv, allowDiagonals: o.allowDiagonals, allowComplex: o.allowComplex };

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
  const liveCands = candidates(ctx, Math.max(0, len - 6), len - 1, true);
  const withCtx = applyContext([...cached.stable, ...liveCands]);
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
  for (const dg of list) {
    try {
      degrees.push(analyzeDegree(clean, o, dg));
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

/** Test hook: drops the cache. */
export function resetElliottCache(): void {
  memo.clear();
}

/** ATR of the last bar, for sanity displays. */
export function lastAtr(c: SwingCandle[]): number {
  const a = atrSeries(c, 14);
  return a.length ? a[a.length - 1] : 0;
}
