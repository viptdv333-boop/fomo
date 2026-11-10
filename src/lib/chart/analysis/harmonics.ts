import { zigzag, type Pivot, type SwingCandle } from "./swings";

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

interface Raw {
  pat: HarmonicPattern;
  /** Pivot indexes x, a, b, c, d (-1 = no such point / projected). */
  k: number[];
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
    const errs: number[] = [];
    if (spec.b) {
      const e = err(AB / XA, spec.b, tol);
      if (e < 0) return;
      errs.push(e);
    }
    if (spec.c) {
      const e = err(BC / AB, spec.c, tol);
      if (e < 0) return;
      errs.push(e);
    }
    if (spec.xc) {
      const e = err(XC / XA, spec.xc, tol);
      if (e < 0) return;
      errs.push(e);
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
    } else {
      errs.push(err(rD, spec.d, tol));
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
    const q = forming ? Math.min(legs[0], tAB) / Math.max(legs[0], tAB, 1) : Math.min(tAB, tCD) / Math.max(tAB, tCD, 1);
    // AB=CD is a pattern of symmetry, in time as well
    if (!X && !forming && q < 0.4) return;

    let conf = 100 - 32 * (errs.reduce((a, b) => a + b, 0) / Math.max(1, errs.length));
    const rCD = CD / BC;
    if (spec.cd && !forming && (rCD < spec.cd[0] * (1 - 2 * tol) || rCD > spec.cd[1] * (1 + 2 * tol))) conf -= 10;
    // AB=CD is equal legs in time as well as in price, so it is judged harder
    conf -= X ? 14 * (1 - clamp((q - 0.15) / 0.45, 0, 1)) : 4 + 20 * (1 - clamp((q - 0.4) / 0.4, 0, 1));
    if (forming) conf -= 6;
    const confidence = Math.round(clamp(conf, 0, 100));
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
    raws.push({ pat, k: [xi, ai, bi, ci, forming ? -1 : di], rank: confidence + (X ? 4 : 0), forming, prov, gap, uD, uT1, uT2, uInv });
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
