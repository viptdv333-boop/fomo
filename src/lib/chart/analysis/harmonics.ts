import { atrSeries, zigzag, type Pivot, type SwingCandle } from "./swings";

/* Harmonic patterns on the zigzag swings: AB=CD, Gartley, Bat, Butterfly, Crab, Deep Crab, Shark, Cypher (bullish and bearish).

   Points X-A-B-C-D are zigzag pivots; a leg may swallow up to `maxSkip` minor pullbacks, as long as its two ends stay the
   extremes of everything between them. The ratios are the textbook ones (Gartley / Pesavento / Carney):

     pattern     AB/XA          BC/AB          D                      CD/BC (secondary)   invalidation
     Gartley     0.618          0.382-0.886    0.786 XA               1.13-1.618          beyond X
     Bat         0.382-0.5      0.382-0.886    0.886 XA               1.618-2.618         beyond X
     Butterfly   0.786          0.382-0.886    1.272-1.414 XA         1.618-2.24          beyond 1.618 XA
     Crab        0.382-0.618    0.382-0.886    1.618 XA               2.24-3.618          beyond 2.0 XA
     Deep Crab   0.886          0.382-0.886    1.618 XA               2.0-3.618           beyond 2.0 XA
     Shark       0.382-0.618    1.13-1.618     0.886-1.13 XC          1.618-2.24          beyond 1.13 XC
     Cypher      0.382-0.618    XC = 1.272-1.414 XA   0.786 XC        -                   beyond X
     AB=CD       -              0.382-0.886    CD = AB                1.13-2.618          beyond 1.272 AB

   Every window is widened by the tolerance (a share of the ratio). The CD/BC projection is a confirming number: it does not
   reject a pattern, it only costs confidence (it is arithmetically incompatible with the XA ratios for part of the BC range).

   Confidence is 100 minus what the pattern loses on every count (weights in `W`): the graded distance of each ratio from its
   ideal value (the defining ratios weigh most), the proportions in time (every leg a fair share, AB like CD, XA against A..D),
   the clarity of the legs (the smallest one against the zigzag reversal, the pullbacks a leg swallows) and, for AB=CD, the
   symmetry in time, a BC of 0.618 / 0.786 and an impulse into A. Calibrated on random walks: an average random candidate
   ends up near 35-45, far under the default threshold of 60, a textbook pattern above 85. An AB=CD that shares its C-D leg
   with a five-point pattern is dropped: it is the same move read twice.

   PRZ (potential reversal zone) = the allowed window of D. While the C->D leg is still running the pattern is "forming" and D is
   projected; once the provisional extreme is inside the PRZ the status is "prz"; a confirmed D makes it "complete", after which
   the targets (0.382 and 0.618 of the A-D leg, of the C-D leg for Shark and Cypher where C is the extreme) or the invalidation
   level decide between "target" and "failed". Pure functions, no DOM. */

export type HarmonicType = "abcd" | "gartley" | "bat" | "butterfly" | "crab" | "deep_crab" | "shark" | "cypher";
export const HARMONIC_TYPES: HarmonicType[] = ["abcd", "gartley", "bat", "butterfly", "crab", "deep_crab", "shark", "cypher"];
export type HarmonicStatus = "forming" | "prz" | "complete" | "target" | "failed";
export type HarmonicLabel = "X" | "A" | "B" | "C" | "D";

export interface HarmonicPoint {
  label: HarmonicLabel;
  /** Candle index (of the full input array). For a projected D it may lie beyond the last candle. */
  i: number;
  p: number;
  confirmed: boolean;
  /** D that is not there yet (forming pattern): the ideal completion price. */
  projected?: boolean;
}

export interface HarmonicRatio {
  /** The connector the ratio is written on (X-B, A-C, B-D, X-D, X-C, A-D). */
  a: HarmonicLabel;
  b: HarmonicLabel;
  /** What is divided by what, e.g. "AB/XA". */
  name: string;
  value: number;
  /** Textbook window (without the tolerance). */
  lo: number;
  hi: number;
  /** The ratio of a projected D (the ideal value, not a measured one). */
  projected?: boolean;
}

export interface HarmonicPattern {
  id: string;
  type: HarmonicType;
  /** 1 = bullish (D is a low, the trade is up), -1 = bearish. */
  dir: 1 | -1;
  status: HarmonicStatus;
  confidence: number;
  /** X, A, B, C, D (A, B, C, D for AB=CD). */
  pts: HarmonicPoint[];
  ratios: HarmonicRatio[];
  /** Potential reversal zone: the allowed prices of D and the bars the box is drawn over. */
  prz: { lo: number; hi: number; i0: number; i1: number };
  /** Price of D: the pivot, or the projection while forming. */
  d: number;
  t1: number;
  t2: number;
  /** Invalidation level. */
  stop: number;
  t1Idx: number;
  t2Idx: number;
  failIdx: number;
  startIdx: number;
  /** Last bar of the pattern itself (D, or the last candle while forming). */
  endIdx: number;
}

export interface HarmonicOptions {
  mode: "atr" | "pct";
  devAtr: number;
  devPct: number;
  /** Tolerance of the ratios as a fraction (0.05 = 5 %). */
  tol: number;
  /** Minor pullbacks a single leg may contain (0-3). */
  maxSkip: number;
  minBars: number;
  maxBars: number;
  minConf: number;
  bullish: boolean;
  bearish: boolean;
  enabled?: Partial<Record<HarmonicType, boolean>>;
  /** Report patterns whose D is still ahead. */
  forming: boolean;
  /** Keep the patterns that have reached a target or failed. */
  showDone: boolean;
  maxShown: number;
  window: number;
  /** Bars after D a finished pattern stays on the chart. */
  maxAge: number;
}

export const HARMONIC_DEFAULTS: HarmonicOptions = {
  mode: "atr",
  devAtr: 2,
  devPct: 1,
  tol: 0.05,
  maxSkip: 2,
  minBars: 12,
  maxBars: 400,
  minConf: 60,
  bullish: true,
  bearish: true,
  forming: true,
  showDone: true,
  maxShown: 4,
  window: 1500,
  maxAge: 150,
};

type Rng = [number, number];
interface Spec {
  type: HarmonicType;
  /** AB / XA */
  b?: Rng;
  /** BC / AB */
  c?: Rng;
  /** XC / XA */
  xc?: Rng;
  /** D as a ratio of the base leg, measured from A (base XA) or from C (base XC, AB). */
  d: Rng;
  base: "xa" | "xc" | "ab";
  /** CD / BC: confirming only. */
  cd?: Rng;
  /** Invalidation, same base as d. */
  inv: number;
  /** The leg the targets retrace: A-D or C-D. */
  ext: "A" | "C";
}

const R_C: Rng = [0.382, 0.886];
export const HARMONIC_SPECS: Spec[] = [
  { type: "gartley", b: [0.618, 0.618], c: R_C, d: [0.786, 0.786], base: "xa", cd: [1.13, 1.618], inv: 1, ext: "A" },
  { type: "bat", b: [0.382, 0.5], c: R_C, d: [0.886, 0.886], base: "xa", cd: [1.618, 2.618], inv: 1, ext: "A" },
  { type: "butterfly", b: [0.786, 0.786], c: R_C, d: [1.272, 1.414], base: "xa", cd: [1.618, 2.24], inv: 1.618, ext: "A" },
  { type: "crab", b: [0.382, 0.618], c: R_C, d: [1.618, 1.618], base: "xa", cd: [2.24, 3.618], inv: 2, ext: "A" },
  { type: "deep_crab", b: [0.886, 0.886], c: R_C, d: [1.618, 1.618], base: "xa", cd: [2, 3.618], inv: 2, ext: "A" },
  { type: "shark", b: [0.382, 0.618], c: [1.13, 1.618], d: [0.886, 1.13], base: "xc", cd: [1.618, 2.24], inv: 1.13, ext: "C" },
  { type: "cypher", b: [0.382, 0.618], xc: [1.272, 1.414], d: [0.786, 0.786], base: "xc", inv: 1, ext: "C" },
];
const SPEC_ABCD: Spec = { type: "abcd", c: R_C, d: [1, 1], base: "ab", cd: [1.13, 2.618], inv: 1.272, ext: "A" };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** 0 inside the window, growing to 1 at the edge of the tolerance; -1 outside. */
function err(r: number, w: Rng, tol: number): number {
  const a = w[0] * (1 - tol);
  const b = w[1] * (1 + tol);
  if (!(r >= a && r <= b)) return -1;
  if (r < w[0]) return (w[0] - r) / (w[0] - a || 1);
  if (r > w[1]) return (r - w[1]) / (b - w[1] || 1);
  return 0;
}

/** Fibonacci numbers a ratio inside a window is expected to sit on. */
const FIB = [0.382, 0.5, 0.618, 0.707, 0.786, 0.886, 1, 1.13, 1.272, 1.414, 1.618, 2, 2.24, 2.618, 3.14, 3.618];

/** Graded distance of a ratio from its ideal value: 0 = exact, 1 = at the edge of the tolerance, -1 = outside.
    A single-value window is measured from that value. Inside a wide window the ratio is measured from the nearest Fibonacci
    number of the window (worth at most `IN_WINDOW`: the window is the textbook rule), on the tolerance fringe from the edge
    of the window, which is a Fibonacci number itself. */
const IN_WINDOW = 0.65;
function grade(r: number, w: Rng, tol: number): number {
  const e = err(r, w, tol);
  if (e < 0) return -1;
  if (w[0] === w[1]) return Math.min(1, Math.abs(r - w[0]) / (w[0] * tol));
  if (e > 0) return e;
  let best = 1;
  for (const f of FIB) {
    if (f < w[0] - 1e-9 || f > w[1] + 1e-9) continue;
    const d = Math.abs(r - f) / (f * tol * 2);
    if (d < best) best = d;
  }
  return IN_WINDOW * best;
}

/* Weights of the confidence score: the points a component costs when it is as bad as it may be. The defining ratios (D, a
   single-value B, the XC extension of the Cypher) weigh most. `base` is the flat deduction that puts an average random
   candidate well under the default threshold: a textbook pattern loses next to nothing elsewhere and stays above 85. */
const W = {
  d: 34, // completion ratio (AD/XA, CD/XC, CD/AB)
  bPoint: 26, // AB/XA of the patterns defined by one number (Gartley, Butterfly, Deep Crab)
  bWin: 14, // AB/XA window
  c: 10, // BC/AB window
  cExt: 20, // BC/AB of the Shark: an extension beyond A, the mark of the pattern
  xc: 22, // XC/XA of the Cypher
  cd: 8, // CD/BC projection (confirming)
  share: 10, // every leg takes a fair share of the time
  sym: 10, // AB and CD alike in time
  xaad: 8, // XA vs A..D in time
  prom: 10, // the smallest leg against the reversal the zigzag asks for
  pull: 20, // the deepest pullback swallowed by a leg, as a share of the leg
  skip: 4, // per swallowed pullback
  abT: 30, // AB=CD: time symmetry
  abC: 16, // AB=CD: BC at 0.618 / 0.786
  abLead: 14, // AB=CD: the impulse into A
  forming: 16, // D is not there yet: its ratio is unknown
  abForming: 26, // AB=CD without D: neither the ratio nor the symmetry is known
  base: 2,
  abBase: 10, // AB=CD has one point and two ratios less to get wrong
};

interface Raw {
  pat: HarmonicPattern;
  /** Pivot indexes x, a, b, c, d (-1 = no such point / projected). */
  k: number[];
  /** The pivot the C-D leg ends on (the running extreme while forming). */
  cd: number;
  rank: number;
  forming: boolean;
  prov: boolean;
  /** Distance from the current extreme to the PRZ, in base legs (forming only). */
  gap: number;
  /** In the mirrored space (bullish orientation): D, targets, invalidation. */
  uD: number;
  uT1: number;
  uT2: number;
  uInv: number;
}

export function detectHarmonics(all: SwingCandle[], opts: Partial<HarmonicOptions> = {}): HarmonicPattern[] {
  const o: HarmonicOptions = { ...HARMONIC_DEFAULTS, ...opts };
  const off = Math.max(0, all.length - Math.max(50, Math.round(o.window) || 0));
  const c = off > 0 ? all.slice(off) : all;
  const n = c.length;
  if (n < 20) return [];
  const pv: Pivot[] = zigzag(c, o.mode === "pct" ? { atrMult: 0, minPct: Math.max(1e-6, o.devPct) } : { atrMult: Math.max(1e-6, o.devAtr) });
  const m = pv.length;
  if (m < 4) return [];
  const atr = atrSeries(c, 14);
  /** The reversal the zigzag asks for at candle i: the yardstick of a prominent leg. */
  const thr = (i: number, price: number) => (o.mode === "pct" ? (Math.abs(price) * Math.max(1e-6, o.devPct)) / 100 : atr[i] * Math.max(1e-6, o.devAtr));
  const tol = clamp(o.tol, 0.005, 0.2);
  const span = 2 * clamp(Math.round(o.maxSkip) || 0, 0, 3) + 1;
  const minBars = Math.max(3, o.minBars);
  const on = (t: HarmonicType) => o.enabled?.[t] !== false;
  const specs = HARMONIC_SPECS.filter((s) => on(s.type));
  const abcdOn = on("abcd");

  /** A leg from pivot i to pivot j (opposite types): both ends are the extremes of every pivot between them. */
  const legOk = (i: number, j: number): boolean => {
    const a = pv[i];
    const b = pv[j];
    const up = a.type === "L";
    if (up ? !(b.p > a.p) : !(b.p < a.p)) return false;
    for (let q = i + 1; q < j; q++) {
      const v = pv[q].p;
      if (up ? v <= a.p || v >= b.p : v >= a.p || v <= b.p) return false;
    }
    return true;
  };

  /** The pullbacks a leg swallows: how many, and the deepest one as a share of the leg. */
  const inner = (i: number, j: number): [number, number] => {
    if (j - i < 3) return [0, 0];
    let mx = 0;
    for (let q = i + 1; q + 1 < j; q += 2) mx = Math.max(mx, Math.abs(pv[q].p - pv[q + 1].p));
    return [(j - i - 1) / 2, mx / (Math.abs(pv[j].p - pv[i].p) || 1)];
  };

  const raws: Raw[] = [];

  const make = (spec: Spec, s: 1 | -1, xi: number, ai: number, bi: number, ci: number, di: number): void => {
    const X = xi >= 0 ? pv[xi] : null;
    const A = pv[ai];
    const B = pv[bi];
    const C = pv[ci];
    const D = pv[di];
    const prov = !D.confirmed;
    const uA = s * A.p;
    const uB = s * B.p;
    const uC = s * C.p;
    const uD = s * D.p;
    const uX = X ? s * X.p : 0;
    const XA = X ? uA - uX : 0;
    const AB = uA - uB;
    const BC = uC - uB;
    const CD = uC - uD;
    const XC = X ? uC - uX : 0;
    if (!(AB > 0 && BC > 0 && CD > 0) || (X && !(XA > 0))) return;
    const isAbcd = !X;
    let pen = isAbcd ? W.abBase : W.base;
    if (spec.b) {
      const e = grade(AB / XA, spec.b, tol);
      if (e < 0) return;
      pen += (spec.b[0] === spec.b[1] ? W.bPoint : W.bWin) * e;
    }
    if (spec.c) {
      const r = BC / AB;
      const e = grade(r, spec.c, tol);
      if (e < 0) return;
      // AB=CD: the pullback is 0.618 or 0.786 of AB, anything else in the window is second best
      pen += isAbcd ? W.abC * clamp(Math.min(Math.abs(r - 0.618), Math.abs(r - 0.786)) / 0.12, 0, 1) : (spec.c[0] > 1 ? W.cExt : W.c) * e;
    }
    if (spec.xc) {
      const e = grade(XC / XA, spec.xc, tol);
      if (e < 0) return;
      pen += W.xc * e;
    }
    const baseLen = spec.base === "xa" ? XA : spec.base === "xc" ? XC : AB;
    const from = spec.base === "xa" ? uA : uC;
    if (!(baseLen > 0)) return;
    const lvl = (r: number) => from - r * baseLen;
    const wLo = spec.d[0] * (1 - tol);
    const wHi = spec.d[1] * (1 + tol);
    const rD = (from - uD) / baseLen;
    if (rD > wHi) return;
    let forming = false;
    let gap = 0;
    if (rD < wLo) {
      // D is still ahead: only the leg that is running right now can get there
      if (!prov || !o.forming) return;
      const den = uC - lvl(wLo);
      if (!(den > 0) || CD / den < 0.3) return;
      forming = true;
      gap = wLo - rD;
      pen += isAbcd ? W.abForming : W.forming;
    } else {
      pen += W.d * grade(rD, spec.d, tol);
    }
    // time: the pattern must have a sane shape
    const first = X ?? A;
    const tAB = B.i - A.i;
    const tBC = C.i - B.i;
    const tCD = D.i - C.i;
    const legs = X ? [A.i - X.i, tAB, tBC] : [tAB, tBC];
    if (!forming) legs.push(tCD);
    const total = (forming ? C.i : D.i) - first.i;
    if (total < minBars || total > o.maxBars) return;
    const mn = Math.max(1, Math.min(...legs));
    if (Math.max(...legs) / mn > 10) return;
    // AB against CD in time; while D is ahead: XA against AB, and for AB=CD the running leg once it has outlasted AB
    const q = !forming ? Math.min(tAB, tCD) / Math.max(tAB, tCD, 1) : X ? Math.min(legs[0], tAB) / Math.max(legs[0], tAB, 1) : Math.min(1, tAB / Math.max(1, n - 1 - C.i));
    // AB=CD is a pattern of symmetry, in time as well
    if (isAbcd && q < 0.4) return;

    const rCD = CD / BC;
    if (spec.cd && !isAbcd && !forming && (rCD < spec.cd[0] * (1 - 2 * tol) || rCD > spec.cd[1] * (1 + 2 * tol))) pen += W.cd;
    // every leg a fair share of the pattern in time (an even split is 1)
    const share = (mn * legs.length) / Math.max(1, total);
    pen += W.share * clamp((0.7 - share) / 0.4, 0, 1);
    if (isAbcd) {
      // equal legs in time (with CD = AB the slopes then match as well); a Fibonacci 0.618 of time is the second best
      pen += W.abT * Math.min(clamp((0.85 - q) / 0.35, 0, 1), 0.45 + Math.abs(q - 0.618) / 0.06);
      // the impulse into A: AB=CD corrects a move, it does not hang in a range
      let lead = 0;
      for (let k = ai - 1; k >= 0 && ai - k <= span; k -= 2) {
        if (k + 1 < ai && s * pv[k + 1].p >= uA) break;
        lead = Math.max(lead, uA - s * pv[k].p);
      }
      pen += W.abLead * clamp((0.786 - lead / AB) / 0.4, 0, 1);
    } else {
      pen += W.sym * clamp((0.6 - q) / 0.4, 0, 1);
      if (!forming) {
        // A..D against XA in time: anything from 0.5 to 3 is a proportion, beyond that the pattern is lopsided
        const r = (D.i - A.i) / Math.max(1, A.i - X!.i);
        pen += W.xaad * clamp(Math.abs(Math.log(r / 1.272)) / Math.log(2.5) - 1, 0, 1);
      }
    }
    // leg clarity: the smallest leg against the reversal the zigzag asks for, and the pullbacks the legs swallow
    const end = forming ? C : D;
    const unit = thr(Math.min(n - 1, end.i), end.p);
    let small = Math.min(AB, BC);
    if (X) small = Math.min(small, XA);
    if (!forming) small = Math.min(small, CD);
    if (unit > 0) pen += W.prom * clamp(2 - small / unit, 0, 1);
    let skipped = 0;
    let pull = 0;
    const seq = X ? [xi, ai, bi, ci, di] : [ai, bi, ci, di];
    for (let k = 1; k < seq.length; k++) {
      const [cnt, deep] = inner(seq[k - 1], seq[k]);
      skipped += cnt;
      if (deep > pull) pull = deep;
    }
    pen += W.skip * skipped + W.pull * clamp(pull / 0.5, 0, 1);

    const confidence = Math.round(clamp(100 - pen, 0, 100));
    if (confidence < o.minConf) return;

    // geometry in prices
    const uDp = forming ? lvl(spec.d[0]) : uD;
    const invR = Math.max(spec.inv, spec.d[1] * (1 + tol));
    const uInv = lvl(invR);
    const ext = spec.ext === "C" ? uC : uA;
    const uT1 = uDp + 0.382 * (ext - uDp);
    const uT2 = uDp + 0.618 * (ext - uDp);
    const dIdx = forming ? Math.max(C.i + Math.max(2, tAB), n + 1) : D.i;
    const w = Math.max(3, Math.round(((forming ? dIdx : D.i) - first.i) * 0.1));
    const zA = s * lvl(wLo);
    const zB = s * lvl(wHi);
    const P = (label: HarmonicLabel, q: Pivot): HarmonicPoint => ({ label, i: q.i + off, p: q.p, confirmed: q.confirmed });
    const pts: HarmonicPoint[] = [];
    if (X) pts.push(P("X", X));
    pts.push(P("A", A), P("B", B), P("C", C));
    pts.push(forming ? { label: "D", i: dIdx + off, p: s * uDp, confirmed: false, projected: true } : P("D", D));

    const ratios: HarmonicRatio[] = [];
    if (spec.b) ratios.push({ a: "X", b: "B", name: "AB/XA", value: AB / XA, lo: spec.b[0], hi: spec.b[1] });
    if (spec.xc) ratios.push({ a: "X", b: "C", name: "XC/XA", value: XC / XA, lo: spec.xc[0], hi: spec.xc[1] });
    else if (spec.c) ratios.push({ a: "A", b: "C", name: "BC/AB", value: BC / AB, lo: spec.c[0], hi: spec.c[1] });
    const dName = spec.base === "xa" ? "AD/XA" : spec.base === "xc" ? "CD/XC" : "CD/AB";
    if (spec.cd && !forming) ratios.push({ a: "B", b: "D", name: "CD/BC", value: rCD, lo: spec.cd[0], hi: spec.cd[1] });
    ratios.push({ a: X ? "X" : "A", b: "D", name: dName, value: forming ? spec.d[0] : rD, lo: spec.d[0], hi: spec.d[1], projected: forming || undefined });

    const pat: HarmonicPattern = {
      id: `${spec.type}:${s}:${first.t}:${C.t}`,
      type: spec.type,
      dir: s,
      status: forming ? "forming" : prov ? "prz" : "complete",
      confidence,
      pts,
      ratios,
      prz: { lo: Math.min(zA, zB), hi: Math.max(zA, zB), i0: (forming ? Math.min(n - 1, dIdx - w) : D.i - w) + off, i1: dIdx + w + off },
      d: s * uDp,
      t1: s * uT1,
      t2: s * uT2,
      stop: s * uInv,
      t1Idx: -1,
      t2Idx: -1,
      failIdx: -1,
      startIdx: first.i + off,
      endIdx: (forming ? n - 1 : D.i) + off,
    };
    raws.push({ pat, k: [xi, ai, bi, ci, forming ? -1 : di], cd: di, rank: confidence + (X ? 4 : 0), forming, prov, gap, uD, uT1, uT2, uInv });
  };

  for (let d = 3; d < m; d++) {
    const s: 1 | -1 = pv[d].type === "L" ? 1 : -1;
    if (s > 0 ? !o.bullish : !o.bearish) continue;
    for (let ci = d - 1; ci >= 0 && d - ci <= span; ci -= 2) {
      if (!legOk(ci, d)) continue;
      for (let bi = ci - 1; bi >= 0 && ci - bi <= span; bi -= 2) {
        if (!legOk(bi, ci)) continue;
        for (let ai = bi - 1; ai >= 0 && bi - ai <= span; ai -= 2) {
          if (!legOk(ai, bi)) continue;
          if (abcdOn) make(SPEC_ABCD, s, -1, ai, bi, ci, d);
          if (specs.length === 0) continue;
          for (let xi = ai - 1; xi >= 0 && ai - xi <= span; xi -= 2) {
            if (!legOk(xi, ai)) continue;
            for (const sp of specs) make(sp, s, xi, ai, bi, ci, d);
          }
        }
      }
    }
  }
  if (raws.length === 0) return [];

  // a five-point pattern and an AB=CD on the same C-D leg: the five-point one is the reading
  const five = new Set<string>();
  for (const r of raws) if (r.k[0] >= 0) five.add(`${r.pat.dir}:${r.k[3]}:${r.cd}`);
  if (five.size > 0) for (let k = raws.length - 1; k >= 0; k--) if (raws[k].k[0] < 0 && five.has(`${raws[k].pat.dir}:${raws[k].k[3]}:${raws[k].cd}`)) raws.splice(k, 1);

  // forming: of the patterns that may still complete from the same C a five-point one goes before AB=CD, then the nearest PRZ
  raws.sort(
    (a, b) =>
      Number(a.forming) - Number(b.forming) ||
      (a.forming ? Number(a.k[0] < 0) - Number(b.k[0] < 0) || a.gap - b.gap || b.rank - a.rank : b.rank - a.rank),
  );
  const kept: Raw[] = [];
  for (const r of raws) {
    let clash = false;
    for (const g of kept) {
      if (g.pat.dir !== r.pat.dir) continue;
      // the same D (or, while forming, the same C) is one pattern; so are two readings that share three points
      if (r.k[4] >= 0 && r.k[4] === g.k[4]) clash = true;
      else if (r.forming && g.forming && r.k[3] === g.k[3]) clash = true;
      else {
        let same = 0;
        for (const v of r.k) if (v >= 0 && g.k.includes(v)) same++;
        if (same >= 3) clash = true;
      }
      if (clash) break;
    }
    if (!clash) kept.push(r);
  }

  // what happened after D
  const out: HarmonicPattern[] = [];
  for (const r of kept) {
    const pt = r.pat;
    const s = pt.dir;
    if (!r.forming && !r.prov) {
      const dI = pv[r.k[4]].i;
      for (let x = dI + 1; x < n; x++) {
        const lowU = s > 0 ? c[x].l : -c[x].h;
        const highU = s > 0 ? c[x].h : -c[x].l;
        if (pt.t1Idx < 0 && lowU < r.uInv) {
          pt.failIdx = x + off;
          pt.status = "failed";
          break;
        }
        if (pt.t1Idx < 0 && highU >= r.uT1) {
          pt.t1Idx = x + off;
          pt.status = "target";
        }
        if (pt.t1Idx >= 0 && highU >= r.uT2) {
          pt.t2Idx = x + off;
          break;
        }
      }
      if (!o.showDone && (pt.status === "target" || pt.status === "failed")) continue;
      if (n - 1 - dI > o.maxAge) continue;
    }
    out.push(pt);
  }
  // the freshest first
  out.sort((a, b) => b.endIdx - a.endIdx || b.confidence - a.confidence);
  return out.slice(0, Math.max(1, Math.round(o.maxShown) || 1));
}

/** Is the pattern still a trade idea (D ahead, in the PRZ, or completed with the first target not reached yet). */
export const harmonicLive = (p: HarmonicPattern) => p.status === "forming" || p.status === "prz" || p.status === "complete";
