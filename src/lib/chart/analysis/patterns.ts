/**
 * Automatic chart pattern recognition (pure analysis, no canvas).
 *
 * Pipeline: ATR zigzag pivots (one or several "degrees") -> candidate geometry per pattern family (least-squares
 * trendlines through confirmed pivots, neckline patterns from pivot triples/quintuples) -> status evaluation on the
 * bars after the pattern (forming / breakout / target / failed) -> confidence 0..100 -> de-duplication.
 *
 * Complexity: only the last `window` bars are analysed; every detector walks the pivot list with a bounded
 * number of pivots per candidate (no O(n^3)). Never throws: bad input yields an empty list.
 */
import { atrSeries, fitLine, zigzag, type SwingCandle } from "./swings";

export type PatternType =
  | "double_top"
  | "double_bottom"
  | "triple_top"
  | "triple_bottom"
  | "hs"
  | "ihs"
  | "tri_asc"
  | "tri_desc"
  | "tri_sym"
  | "wedge_rising"
  | "wedge_falling"
  | "flag_bull"
  | "flag_bear"
  | "pennant_bull"
  | "pennant_bear"
  | "rectangle"
  | "channel_up"
  | "channel_down"
  | "broadening"
  | "cup"
  | "rounding_bottom"
  | "rounding_top";

export type PatternGroup = "double" | "triple" | "hs" | "tri" | "wedge" | "flag" | "pennant" | "rect" | "channel" | "broad" | "cup" | "round";

export const PATTERN_GROUPS: readonly PatternGroup[] = ["double", "triple", "hs", "tri", "wedge", "flag", "pennant", "rect", "channel", "broad", "cup", "round"];

export const TYPE_GROUP: Record<PatternType, PatternGroup> = {
  double_top: "double",
  double_bottom: "double",
  triple_top: "triple",
  triple_bottom: "triple",
  hs: "hs",
  ihs: "hs",
  tri_asc: "tri",
  tri_desc: "tri",
  tri_sym: "tri",
  wedge_rising: "wedge",
  wedge_falling: "wedge",
  flag_bull: "flag",
  flag_bear: "flag",
  pennant_bull: "pennant",
  pennant_bear: "pennant",
  rectangle: "rect",
  channel_up: "channel",
  channel_down: "channel",
  broadening: "broad",
  cup: "cup",
  rounding_bottom: "round",
  rounding_top: "round",
};

export type PatternStatus = "forming" | "breakout" | "target" | "failed";
export type Degree = "fine" | "normal" | "coarse" | "auto";

export interface PatternOptions {
  enabled: Partial<Record<PatternGroup, boolean>>;
  degree: Degree;
  /** Hide patterns below this confidence (0..100). */
  minConfidence: number;
  /** Pattern length limits, bars (first to last defining pivot). */
  minBars: number;
  maxBars: number;
  /** Equality / line-touch tolerance in ATR. */
  tolAtr: number;
  bufferMode: "atr" | "pct";
  bufferAtr: number;
  bufferPct: number;
  /** Breakout needs the CLOSE beyond the line (otherwise the high / low is enough). */
  requireClose: boolean;
  maxShown: number;
  /** Analysis window: the last N bars. */
  window: number;
  /** Patterns older than this many bars since their last event are dropped. */
  maxAge: number;
  showFailed: boolean;
  /** Ids shown last time: they get a small bonus so the picture does not flicker. */
  prevIds?: ReadonlySet<string>;
}

export const DEFAULT_PATTERN_OPTIONS: PatternOptions = {
  enabled: Object.fromEntries(PATTERN_GROUPS.map((g) => [g, true])) as Record<PatternGroup, boolean>,
  degree: "auto",
  minConfidence: 50,
  minBars: 8,
  maxBars: 250,
  tolAtr: 0.6,
  bufferMode: "atr",
  bufferAtr: 0.25,
  bufferPct: 0.3,
  requireClose: true,
  maxShown: 5,
  window: 1500,
  maxAge: 60,
  showFailed: true,
};

export interface PatternPoint {
  i: number;
  p: number;
}

export interface PatternSeg {
  i0: number;
  p0: number;
  i1: number;
  p1: number;
  /** line = trendline, neck = neckline / rim, ext = dotted projection. */
  kind: "line" | "neck" | "ext";
}

export interface DetectedPattern {
  /** Stable: `<type>:<time of the first pivot>`. */
  id: string;
  type: PatternType;
  group: PatternGroup;
  /** Breakout direction when broken, else the expected direction (0 = undecided). */
  bias: -1 | 0 | 1;
  status: PatternStatus;
  /** 0..100 */
  confidence: number;
  /** Candle indexes of the input array. */
  i0: number;
  i1: number;
  /** Last bar the outline is drawn to. */
  endIdx: number;
  /** Breakout / target / failure bar, -1 while forming. */
  eventIdx: number;
  /** Bar where the target was hit, -1 otherwise. */
  targetIdx: number;
  pivots: PatternPoint[];
  /** Zigzag path through the defining pivots (neckline patterns). */
  path: PatternPoint[];
  segs: PatternSeg[];
  /** Fitted bowl (cups, rounding). */
  curve: PatternPoint[];
  /** Breakout level (price) and the bar its line starts at. */
  level: number | null;
  levelIdx: number;
  target: number | null;
  stop: number | null;
  rr: number | null;
  /** Reference height used for the measured move. */
  height: number;
  /** ATR at the end of the pattern (for label sizing / zones). */
  atr: number;
  volConfirmed: boolean;
  provisional: boolean;
  /** Confidence components 0..1 (geometry, proportions, prior trend, volume, status). */
  parts: { geom: number; prop: number; trend: number; vol: number; status: number };
}

export interface AlertLevel {
  price: number;
  kind: "breakout" | "target" | "stop";
  patternId: string;
}

/** Levels worth an alert for live patterns (forming: breakout + target + stop; broken: target + stop). */
export function alertLevelsOf(list: readonly DetectedPattern[]): AlertLevel[] {
  const out: AlertLevel[] = [];
  for (const p of list) {
    if (p.status === "target" || p.status === "failed") continue;
    if (p.status === "forming" && p.level !== null) out.push({ price: p.level, kind: "breakout", patternId: p.id });
    if (p.target !== null) out.push({ price: p.target, kind: "target", patternId: p.id });
    if (p.stop !== null) out.push({ price: p.stop, kind: "stop", patternId: p.id });
  }
  return out;
}

/* ───────────────────────── internals ───────────────────────── */

interface Ln {
  a: number;
  b: number;
}
const at = (l: Ln, x: number) => l.a + l.b * x;
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lnOf = (i0: number, p0: number, i1: number, p1: number): Ln => {
  const b = i1 === i0 ? 0 : (p1 - p0) / (i1 - i0);
  return { a: p0 - b * i0, b };
};

interface Pv {
  i: number;
  p: number;
  H: boolean;
  prov: boolean;
}

interface Cand {
  type: PatternType;
  bias: -1 | 0 | 1;
  i0: number;
  iLast: number;
  piv: Pv[];
  /** Two-line patterns. */
  upper?: Ln;
  lower?: Ln;
  /** Neckline patterns: single break line and direction. */
  neck?: Ln;
  neckDir?: 1 | -1;
  /** Pre-breakout invalidation price and the side it is on (close beyond = failed). */
  inv?: number;
  invDir?: 1 | -1;
  apex?: number;
  geom: number;
  prop: number;
  trend: number;
  vol: number;
  height: number;
  target(level: number, dir: number, A: number): number;
  stop(dir: number, A: number): number;
  bonus: number;
  provisional: boolean;
  path?: PatternPoint[];
  curve?: PatternPoint[];
  /** Where the neckline is drawn from. */
  neckFrom?: number;
  /** Fixed breakout reference for volume (index range of the pattern body). */
  volA: number;
  volB: number;
}

interface Ev {
  status: PatternStatus;
  brk: number;
  dir: -1 | 0 | 1;
  level: number | null;
  levelIdx: number;
  target: number | null;
  stop: number | null;
  rr: number | null;
  ev: number;
  end: number;
  targetIdx: number;
  wrongWay: boolean;
}

/** Confidence calibration (logistic centre / steepness); exported for tuning scripts. */
export const CAL = { c: 0.72, k: 13 };
const DEG: Record<Degree, number[]> = { fine: [1.7], normal: [2.6], coarse: [4.2], auto: [1.7, 2.6, 4.2] };

class Analyzer {
  readonly n: number;
  readonly A: number[];
  readonly cumV: Float64Array;
  readonly hasVol: boolean;

  constructor(readonly c: SwingCandle[], readonly o: PatternOptions, atr: number[]) {
    this.n = c.length;
    this.A = atr.map((v, i) => Math.max(v, Math.abs(c[i].c) * 1e-6, 1e-12));
    this.cumV = new Float64Array(this.n + 1);
    let pos = 0;
    for (let i = 0; i < this.n; i++) {
      const v = c[i].v ?? 0;
      this.cumV[i + 1] = this.cumV[i] + (isFinite(v) && v > 0 ? v : 0);
      if (v > 0) pos++;
    }
    this.hasVol = pos > this.n * 0.6;
  }

  /* ── small helpers ── */

  private buf(i: number, price: number): number {
    return this.o.bufferMode === "pct" ? Math.abs(price) * (this.o.bufferPct / 100) : this.o.bufferAtr * this.A[i];
  }

  meanVol(a: number, b: number): number {
    a = Math.max(0, a);
    b = Math.min(this.n - 1, b);
    if (b < a) return 0;
    return (this.cumV[b + 1] - this.cumV[a]) / (b - a + 1);
  }

  /**
   * 0..1: how clear the trend into pivot `i0` is, in direction `dir` (1 up / -1 down). Statistical: the net move over
   * the lookback in units of ATR*sqrt(bars), so a random walk rarely scores high.
   */
  trend(i0: number, p0: number, dir: 1 | -1, len: number): number {
    const lb = clamp(Math.round(len), 12, 90);
    const a = i0 - lb;
    if (a < 0) return 0;
    const move = (p0 - this.c[a].c) * dir;
    const z = move / (this.A[i0] * Math.sqrt(lb));
    return clamp((z - 0.8) / 2.2, 0, 1);
  }

  trendBoth(i0: number, p0: number, len: number): { dir: -1 | 0 | 1; s: number } {
    const u = this.trend(i0, p0, 1, len);
    const d = this.trend(i0, p0, -1, len);
    if (u >= d) return { dir: u > 0.05 ? 1 : 0, s: u };
    return { dir: d > 0.05 ? -1 : 0, s: d };
  }

  /** Contraction score 0..1 (1 = volume dries up from the first half to the second); 0.5 without volume data. */
  volContraction(a: number, b: number): number {
    if (!this.hasVol || b - a < 4) return 0.5;
    const mid = Math.floor((a + b) / 2);
    const m1 = this.meanVol(a, mid);
    const m2 = this.meanVol(mid + 1, b);
    if (m1 <= 0) return 0.5;
    return clamp((1.15 - m2 / m1) / 0.55, 0, 1);
  }

  /* ───────── neckline patterns ───────── */

  private doubles(pv: Pv[], out: Cand[]) {
    const o = this.o;
    for (let k = 2; k < pv.length; k++) {
      const p0 = pv[k - 2];
      const p1 = pv[k - 1];
      const p2 = pv[k];
      const top = p0.H && !p1.H && p2.H;
      const bot = !p0.H && p1.H && !p2.H;
      if (!top && !bot) continue;
      const sgn = top ? 1 : -1;
      const len = p2.i - p0.i;
      if (len < o.minBars || len > o.maxBars) continue;
      const avg = (p0.p + p2.p) / 2;
      const height = (avg - p1.p) * sgn;
      const A = this.A[p2.i];
      if (height < 2 * A) continue;
      const diff = Math.abs(p0.p - p2.p);
      const tol = o.tolAtr * A;
      if (diff > tol || diff > 0.22 * height) continue;
      const eq = 1 - diff / Math.min(tol, 0.22 * height);
      const gap1 = p1.i - p0.i;
      const gap2 = p2.i - p1.i;
      const tsym = Math.min(gap1, gap2) / Math.max(gap1, gap2);
      const ts = this.trend(p0.i, p0.p, sgn as 1 | -1, len);
      const extremeP = top ? Math.max(p0.p, p2.p) : Math.min(p0.p, p2.p);
      const neckP = p1.p;
      let vol = 0.5;
      if (this.hasVol) {
        const v0 = this.meanVol(p0.i - 1, p0.i + 1);
        const v2 = this.meanVol(p2.i - 1, p2.i + 1);
        if (v0 > 0) vol = clamp((1.15 - v2 / v0) / 0.55, 0, 1);
      }
      out.push({
        type: top ? "double_top" : "double_bottom",
        bias: (-sgn) as -1 | 1,
        i0: p0.i,
        iLast: p2.i,
        piv: [p0, p1, p2],
        neck: { a: neckP, b: 0 },
        neckDir: (-sgn) as -1 | 1,
        inv: extremeP + sgn * 0.5 * A,
        invDir: sgn as 1 | -1,
        geom: 0.65 * eq + 0.35 * clamp(height / (3.5 * A), 0, 1),
        prop: 0.5 * tsym + 0.5 * clamp(len / 25, 0, 1),
        trend: ts,
        vol,
        height,
        target: (lvl, dir) => lvl + dir * height,
        stop: () => extremeP + sgn * 0.25 * A,
        bonus: 0,
        provisional: p2.prov,
        path: [p0, p1, p2].map((q) => ({ i: q.i, p: q.p })),
        volA: p0.i,
        volB: p2.i,
      });
    }
  }

  private triples(pv: Pv[], out: Cand[]) {
    const o = this.o;
    for (let k = 4; k < pv.length; k++) {
      const q = [pv[k - 4], pv[k - 3], pv[k - 2], pv[k - 1], pv[k]];
      const top = q[0].H && !q[1].H && q[2].H && !q[3].H && q[4].H;
      const bot = !q[0].H && q[1].H && !q[2].H && q[3].H && !q[4].H;
      if (!top && !bot) continue;
      const sgn = top ? 1 : -1;
      const len = q[4].i - q[0].i;
      if (len < o.minBars * 1.5 || len > o.maxBars) continue;
      const exts = [q[0].p, q[2].p, q[4].p];
      const mids = [q[1].p, q[3].p];
      const avgE = (exts[0] + exts[1] + exts[2]) / 3;
      const neckP = top ? Math.min(mids[0], mids[1]) : Math.max(mids[0], mids[1]);
      const height = (avgE - neckP) * sgn;
      const A = this.A[q[4].i];
      if (height < 2 * A) continue;
      const spreadE = Math.max(...exts) - Math.min(...exts);
      const spreadM = Math.abs(mids[0] - mids[1]);
      const tol = o.tolAtr * A;
      if (spreadE > tol * 1.2 || spreadE > 0.22 * height) continue;
      if (spreadM > tol * 1.6 || spreadM > 0.3 * height) continue;
      const eq = 1 - spreadE / Math.min(tol * 1.2, 0.22 * height);
      const eq2 = 1 - spreadM / Math.min(tol * 1.6, 0.3 * height);
      const ts = this.trend(q[0].i, q[0].p, sgn as 1 | -1, len);
      const extremeP = top ? Math.max(...exts) : Math.min(...exts);
      let vol = 0.5;
      if (this.hasVol) {
        const v0 = this.meanVol(q[0].i - 1, q[0].i + 1);
        const v4 = this.meanVol(q[4].i - 1, q[4].i + 1);
        if (v0 > 0) vol = clamp((1.15 - v4 / v0) / 0.55, 0, 1);
      }
      out.push({
        type: top ? "triple_top" : "triple_bottom",
        bias: (-sgn) as -1 | 1,
        i0: q[0].i,
        iLast: q[4].i,
        piv: q,
        neck: { a: neckP, b: 0 },
        neckDir: (-sgn) as -1 | 1,
        inv: extremeP + sgn * 0.5 * A,
        invDir: sgn as 1 | -1,
        geom: 0.5 * eq + 0.3 * eq2 + 0.2 * clamp(height / (3.5 * A), 0, 1),
        prop: clamp(len / 40, 0, 1),
        trend: ts,
        vol,
        height,
        target: (lvl, dir) => lvl + dir * height,
        stop: () => extremeP + sgn * 0.25 * A,
        bonus: 3,
        provisional: q[4].prov,
        path: q.map((x) => ({ i: x.i, p: x.p })),
        volA: q[0].i,
        volB: q[4].i,
      });
    }
  }

  private headShoulders(pv: Pv[], out: Cand[]) {
    const o = this.o;
    for (let k = 4; k < pv.length; k++) {
      const q = [pv[k - 4], pv[k - 3], pv[k - 2], pv[k - 1], pv[k]];
      const top = q[0].H && !q[1].H && q[2].H && !q[3].H && q[4].H;
      const bot = !q[0].H && q[1].H && !q[2].H && q[3].H && !q[4].H;
      if (!top && !bot) continue;
      const sgn = top ? 1 : -1;
      const [ls, l1, hd, l2, rs] = q;
      const len = rs.i - ls.i;
      if (len < o.minBars * 1.5 || len > o.maxBars) continue;
      const neck = lnOf(l1.i, l1.p, l2.i, l2.p);
      const height = (hd.p - at(neck, hd.i)) * sgn;
      const A = this.A[rs.i];
      if (height < 2.2 * A) continue;
      const shMax = top ? Math.max(ls.p, rs.p) : Math.min(ls.p, rs.p);
      const prom = (hd.p - shMax) * sgn;
      if (prom < Math.max(0.5 * A, 0.14 * height)) continue;
      const shDiff = Math.abs(ls.p - rs.p);
      if (shDiff > 0.3 * height) continue;
      if ((ls.p - at(neck, ls.i)) * sgn < 0.25 * height || (rs.p - at(neck, rs.i)) * sgn < 0.25 * height) continue;
      const slope = Math.abs(neck.b * (l2.i - l1.i));
      if (slope > 0.5 * height) continue;
      const tr = (hd.i - ls.i) / Math.max(1, rs.i - hd.i);
      if (tr < 0.4 || tr > 2.5) continue;
      const tsym = tr < 1 ? tr : 1 / tr;
      const ts = this.trend(ls.i, ls.p, sgn as 1 | -1, len);
      let vol = 0.5;
      if (this.hasVol) {
        const v0 = this.meanVol(hd.i - 1, hd.i + 1);
        const v4 = this.meanVol(rs.i - 1, rs.i + 1);
        if (v0 > 0) vol = clamp((1.15 - v4 / v0) / 0.55, 0, 1);
      }
      const geom = Math.pow(0.35 * (1 - shDiff / (0.3 * height)) + 0.35 * clamp(prom / (0.4 * height), 0, 1) + 0.15 * (1 - slope / (0.5 * height)) + 0.15 * clamp(height / (3.5 * A), 0, 1), 1.5);
      out.push({
        type: top ? "hs" : "ihs",
        bias: (-sgn) as -1 | 1,
        i0: ls.i,
        iLast: rs.i,
        piv: q,
        neck,
        neckDir: (-sgn) as -1 | 1,
        inv: hd.p + sgn * 0.15 * A,
        invDir: sgn as 1 | -1,
        geom,
        prop: 0.55 * tsym + 0.45 * clamp(len / 40, 0, 1),
        trend: ts,
        vol,
        height,
        target: (lvl, dir) => lvl + dir * height,
        stop: () => rs.p + sgn * 0.25 * A,
        bonus: 0,
        provisional: rs.prov,
        path: q.map((x) => ({ i: x.i, p: x.p })),
        neckFrom: l1.i,
        volA: ls.i,
        volB: rs.i,
      });
    }
  }

  /* ───────── trendline patterns ───────── */

  private lineWindows(pv: Pv[], out: Cand[]) {
    const o = this.o;
    // confirmed pivots only; provisional extreme excluded from line fits
    const cf: Pv[] = [];
    for (const q of pv) if (!q.prov) cf.push(q);
    const m = cf.length;
    for (let e = 3; e < m; e++) {
      for (let cnt = 4; cnt <= 11 && e - cnt + 1 >= 0; cnt++) {
        const s = e - cnt + 1;
        const len = cf[e].i - cf[s].i;
        if (len > o.maxBars) break;
        if (len < Math.max(5, o.minBars * (cnt === 4 ? 0.5 : 1))) continue;
        this.tryLines(cf, s, e, out);
      }
    }
  }

  private tryLines(cf: Pv[], s: number, e: number, out: Cand[]) {
    const o = this.o;
    const win = cf.slice(s, e + 1);
    const hs = win.filter((q) => q.H);
    const ls = win.filter((q) => !q.H);
    if (hs.length < 2 || ls.length < 2) return;
    const U = fitLine(hs);
    const L = fitLine(ls);
    const x0 = win[0].i;
    const xe = win[win.length - 1].i;
    const len = xe - x0;
    const w0 = at(U, x0) - at(L, x0);
    const w1 = at(U, xe) - at(L, xe);
    const A = this.A[xe];
    if (!(w0 > 1.2 * A) || !(w1 > 0.7 * A)) return;
    const tol = o.tolAtr * A;
    let maxDev = 0;
    let sumDev = 0;
    for (const q of hs) {
      const d = Math.abs(q.p - at(U, q.i));
      sumDev += d;
      if (d > maxDev) maxDev = d;
    }
    for (const q of ls) {
      const d = Math.abs(q.p - at(L, q.i));
      sumDev += d;
      if (d > maxDev) maxDev = d;
    }
    if (maxDev > tol) return;
    let viol = 0;
    for (let x = x0; x <= xe; x++) {
      const k = this.c[x];
      if (k.h > at(U, x) + tol || k.l < at(L, x) - tol) viol++;
    }
    if (viol > 0.08 * (len + 1)) return;

    const cr = w1 / w0;
    const du = (U.b * len) / w0;
    const dl = (L.b * len) / w0;
    const flat = (d: number) => Math.abs(d) <= 0.18;
    const n = win.length;

    const devScore = 1 - clamp(sumDev / n / tol, 0, 1) * 0.8;
    const ctnScore = 1 - viol / (0.08 * (len + 1) + 1e-9);
    const r2U = hs.length >= 3 ? U.r2 : 0.7;
    const r2L = ls.length >= 3 ? L.r2 : 0.7;
    const touch = clamp((n - 4) / 4, 0, 1);
    const geom = 0.4 * touch + 0.25 * devScore + 0.15 * clamp(ctnScore, 0, 1) + 0.2 * ((r2U + r2L) / 2);
    const lenScore = len < 15 ? len / 15 : len > 150 ? clamp(1 - (len - 150) / 150, 0.3, 1) : 1;
    const apex = U.b !== L.b ? (L.a - U.a) / (U.b - L.b) : Infinity;
    const lastLow = [...win].reverse().find((q) => !q.H)!;
    const lastHigh = [...win].reverse().find((q) => q.H)!;
    const stopOf = (dir: number) => (dir > 0 ? lastLow.p - 0.2 * A : lastHigh.p + 0.2 * A);
    const piv = win;
    const volC = this.volContraction(x0, xe);

    const conv0 = w1 / w0 <= 0.72;
    const apexOk0 = apex > xe && apex - xe <= Math.max(1.6 * len, 20);
    const base = {
      apex: conv0 && apexOk0 ? apex : undefined,
      i0: x0,
      iLast: xe,
      piv,
      upper: U,
      lower: L,
      geom,
      height: w0,
      bonus: 0,
      provisional: false,
      volA: x0,
      volB: xe,
      vol: volC,
    };

    /* flags / pennants: a strong pole into the first pivot */
    const pole = this.pole(cf, s, len);
    if (pole && n <= 8) {
      const flagSlopeOk = pole.dir > 0 ? du <= 0.15 && dl <= 0.15 : du >= -0.15 && dl >= -0.15;
      const meanSlope = (du + dl) / 2;
      const pennSlopeOk = pole.dir > 0 ? meanSlope <= 0.2 : meanSlope >= -0.2;
      const shallow = w0 <= 0.55 * pole.h;
      const retr = pole.dir > 0 ? pole.top - Math.min(...ls.map((q) => q.p)) : Math.max(...hs.map((q) => q.p)) - pole.top;
      const retrOk = retr <= 0.65 * pole.h;
      if ((flagSlopeOk || pennSlopeOk) && shallow && retrOk && len <= Math.max(12, 3 * pole.bars + 10)) {
        const poleScore = clamp((pole.h / (A * Math.sqrt(pole.bars)) - 1.5) / 3.5, 0, 1);
        const retrScore = 1 - clamp(retr / (0.65 * pole.h), 0, 1) * 0.6;
        if (flagSlopeOk && cr >= 0.7 && cr <= 1.35 && Math.abs(du - dl) <= 0.35) {
          const d: 1 | -1 = pole.dir > 0 ? 1 : -1;
          out.push({
            ...base,
            type: d > 0 ? "flag_bull" : "flag_bear",
            bias: d,
            trend: poleScore,
            prop: 0.5 * retrScore + 0.5 * (1 - clamp(Math.abs(cr - 1) / 0.35, 0, 1)),
            target: (lvl, dir) => lvl + dir * (dir === d ? pole.h : w0),
            stop: stopOf,
            height: pole.h,
            bonus: 6,
          });
        } else if (pennSlopeOk && cr <= 0.7 && w1 > 0.5 * A) {
          const d: 1 | -1 = pole.dir > 0 ? 1 : -1;
          out.push({
            ...base,
            type: d > 0 ? "pennant_bull" : "pennant_bear",
            bias: d,
            trend: poleScore,
            prop: 0.5 * retrScore + 0.5 * (1 - clamp(Math.abs(cr - 0.4) / 0.4, 0, 1)),
            apex: apex > xe ? apex : undefined,
            target: (lvl, dir) => lvl + dir * (dir === d ? pole.h : w0),
            stop: stopOf,
            height: pole.h,
            bonus: 8,
          });
        }
      }
    }
    if (n < 5) return;

    const conv = cr <= 0.72;
    const par = cr >= 0.8 && cr <= 1.25 && Math.abs(du - dl) <= 0.35;
    const div = cr >= 1.4;
    const apexOk = apex > xe && apex - xe <= Math.max(1.6 * len, 20);
    const shapeConv = 1 - clamp(Math.abs(cr - 0.45) / 0.45, 0, 1);
    const apexScore = apexOk ? 1 - clamp(Math.abs((apex - xe) / len - 0.4) / 0.9, 0, 1) : 0;
    const propConv = 0.45 * shapeConv + 0.2 * apexScore + 0.35 * lenScore;
    const propPar = 0.65 * (1 - clamp(Math.abs(cr - 1) / 0.3, 0, 1)) + 0.35 * lenScore;

    const mk = (type: PatternType, bias: -1 | 0 | 1, extra: Partial<Cand>) => out.push({ ...base, type, bias, trend: 0.5, prop: 0.5, target: (l, d) => l + d * w0, stop: stopOf, ...extra } as Cand);

    if (conv && apexOk) {
      if (flat(du) && dl >= 0.25) {
        const t = this.trend(x0, hs[0].p, 1, len);
        mk("tri_asc", 1, { prop: propConv, trend: 0.35 + 0.65 * t });
      } else if (flat(dl) && du <= -0.25) {
        const t = this.trend(x0, ls[0].p, -1, len);
        mk("tri_desc", -1, { prop: propConv, trend: 0.35 + 0.65 * t });
      } else if (du <= -0.2 && dl >= 0.2) {
        const tb = this.trendBoth(x0, (hs[0].p + ls[0].p) / 2, len);
        mk("tri_sym", tb.s >= 0.3 ? tb.dir : 0, { prop: propConv, trend: 0.3 + 0.7 * tb.s });
      } else if (du >= 0.2 && dl >= 0.2) {
        const t = this.trend(x0, ls[0].p, 1, len);
        if (t >= 0.25) {
          const startP = at(L, x0);
          mk("wedge_rising", -1, {
            prop: propConv,
            trend: t,
            target: (lvl, dir, a) => (dir < 0 && lvl - startP > 0.5 * a ? startP : lvl + dir * w0),
          });
        }
      } else if (du <= -0.2 && dl <= -0.2) {
        const t = this.trend(x0, hs[0].p, -1, len);
        if (t >= 0.25) {
          const startP = at(U, x0);
          mk("wedge_falling", 1, {
            prop: propConv,
            trend: t,
            target: (lvl, dir, a) => (dir > 0 && startP - lvl > 0.5 * a ? startP : lvl + dir * w0),
          });
        }
      }
    } else if (par) {
      if (flat(du) && flat(dl)) {
        const tb = this.trendBoth(x0, (hs[0].p + ls[0].p) / 2, len);
        mk("rectangle", tb.s >= 0.4 ? tb.dir : 0, { prop: propPar, trend: 0.3 + 0.7 * tb.s, vol: 0.4 * volC + 0.3 });
      } else if (n >= 6 && du >= 0.35 && dl >= 0.35) {
        mk("channel_up", 1, { prop: propPar, trend: clamp(((du + dl) / 2) / 1.5, 0, 1), vol: 0.5, bonus: -2 });
      } else if (n >= 6 && du <= -0.35 && dl <= -0.35) {
        mk("channel_down", -1, { prop: propPar, trend: clamp((-(du + dl) / 2) / 1.5, 0, 1), vol: 0.5, bonus: -2 });
      }
    } else if (div && n >= 6 && cr >= 1.5 && U.b > 0 && L.b < 0 && du >= 0.1 && dl <= -0.1) {
      mk("broadening", 0, {
        prop: 0.55 * clamp((cr - 1.3) / 1.0, 0, 1) + 0.45 * lenScore,
        trend: 0.5,
        vol: 1 - volC,
        target: (l, d) => l + d * w1,
        height: w1,
      });
    }
  }

  /** Impulse into pivot `s` (the first pivot of the flag): the pole. */
  private pole(cf: Pv[], s: number, flagLen: number): { dir: 1 | -1; top: number; h: number; bars: number } | null {
    const q = cf[s];
    let best: { dir: 1 | -1; top: number; h: number; bars: number } | null = null;
    let bestK = 0;
    for (const j of [s - 1, s - 3, s - 5]) {
      if (j < 0) continue;
      const b = cf[j];
      if (b.H === q.H) continue;
      const bars = q.i - b.i;
      if (bars < 2 || bars > 40) continue;
      const h = Math.abs(q.p - b.p);
      const A = this.A[q.i];
      if (h < 3 * A || h / (A * Math.sqrt(bars)) < 1.8) continue;
      const k = h / Math.pow(bars, 0.7);
      if (k > bestK) {
        bestK = k;
        best = { dir: q.H ? 1 : -1, top: q.p, h, bars };
      }
    }
    if (best && flagLen > 3 * best.bars + 10) return null;
    return best;
  }

  /* ───────── cups / rounding ───────── */

  private cups(pv: Pv[], out: Cand[]) {
    const o = this.o;
    // triples (left rim, bottom, right rim): consecutive pivots, plus a right rim found on the price itself
    // (where the price first comes back to the left rim level; it is often not a pivot yet, or never becomes one)
    const triples: [Pv, Pv, Pv][] = [];
    for (let k = 2; k < pv.length; k++) triples.push([pv[k - 2], pv[k - 1], pv[k]]);
    for (let j = 0; j + 1 < pv.length; j++) {
      const rl = pv[j];
      const bt = pv[j + 1];
      const d0 = Math.abs(rl.p - bt.p);
      if (d0 < 3 * this.A[bt.i]) continue;
      const sg = rl.H ? 1 : -1;
      const lim = Math.min(this.n - 1, rl.i + Math.floor(o.maxBars * 1.5));
      for (let x = bt.i + 4; x <= lim; x++) {
        const touch = sg > 0 ? this.c[x].h >= rl.p - 0.1 * d0 : this.c[x].l <= rl.p + 0.1 * d0;
        if (!touch) continue;
        let bi = x;
        for (let y = x; y <= Math.min(x + 2, this.n - 1); y++) if (sg > 0 ? this.c[y].h > this.c[bi].h : this.c[y].l < this.c[bi].l) bi = y;
        triples.push([rl, bt, { i: bi, p: sg > 0 ? this.c[bi].h : this.c[bi].l, H: sg > 0, prov: bi >= this.n - 3 }]);
        break;
      }
    }
    for (const [rl, bt, rr] of triples) {
      const bowl = rl.H && !bt.H && rr.H;
      const arch = !rl.H && bt.H && !rr.H;
      if (!bowl && !arch) continue;
      const sgn = bowl ? 1 : -1;
      const len = rr.i - rl.i;
      if (len < Math.max(o.minBars, 18) || len > o.maxBars * 1.5) continue;
      const rimAvg = (rl.p + rr.p) / 2;
      const depth = (rimAvg - bt.p) * sgn;
      const A = this.A[rr.i];
      if (depth < 3 * A) continue;
      const rimDiff = Math.abs(rl.p - rr.p);
      if (rimDiff > 0.22 * depth) continue;
      const tpos = (bt.i - rl.i) / len;
      if (tpos < 0.28 || tpos > 0.72) continue;
      const fit = this.quad(rl.i, rr.i, bt.p, depth, sgn, bt.i);
      if (!fit || fit.a < 1.5 || fit.r2 < 0.72) continue;
      // a bowl, not a V: the parabola must clearly beat straight legs
      if (1 - fit.r2 > 0.7 * (1 - fit.r2v)) continue;
      const level = bowl ? Math.max(rl.p, rr.p) : Math.min(rl.p, rr.p);
      let type: PatternType = bowl ? "rounding_bottom" : "rounding_top";
      let handleLow = NaN;
      if (bowl && !rr.prov) {
        // handle: a shallow pullback after the right rim, before any breakout
        let hi = -1;
        let lowV = Infinity;
        for (let x = rr.i + 1; x < this.n; x++) {
          if (this.c[x].c > level + this.buf(x, level)) break;
          if (this.c[x].l < lowV) {
            lowV = this.c[x].l;
            hi = x;
          }
        }
        const hd = rr.p - lowV;
        if (hi > 0 && hd >= 0.06 * depth && hd <= 0.5 * depth && hi - rr.i <= 0.5 * len + 5 && hi - rr.i >= 2) {
          type = "cup";
          handleLow = lowV;
        }
      }
      if (type !== "cup" && fit.r2 < 0.8) continue;
      const ts = this.trend(rl.i, rl.p, sgn as 1 | -1, len);
      const symm = 1 - Math.abs(tpos - 0.5) / 0.22;
      const geom = 0.5 * clamp((fit.r2 - 0.65) / 0.3, 0, 1) + 0.25 * clamp(symm, 0, 1) + 0.25 * (1 - rimDiff / (0.22 * depth));
      const curve: PatternPoint[] = [];
      const steps = 28;
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const y = fit.a * t * t + fit.b * t + fit.c;
        curve.push({ i: rl.i + t * len, p: bt.p + sgn * y * depth });
      }
      out.push({
        type,
        bias: sgn as 1 | -1,
        i0: rl.i,
        iLast: type === "cup" ? rr.i : rr.i,
        piv: [rl, bt, rr],
        neck: { a: level, b: 0 },
        neckDir: sgn as 1 | -1,
        inv: bt.p - sgn * 0.1 * A,
        invDir: (-sgn) as 1 | -1,
        geom,
        prop: 0.5 * clamp(len / 40, 0, 1) + 0.5 * clamp(1 - Math.abs(tpos - 0.5) / 0.3, 0, 1),
        trend: type === "rounding_top" ? ts : 0.4 + 0.6 * ts,
        vol: 0.5,
        height: depth,
        target: (lvl, dir) => lvl + dir * depth,
        stop: () => (type === "cup" ? handleLow - 0.2 * A : level - sgn * 0.5 * depth),
        bonus: type === "cup" ? 4 : 0,
        provisional: rr.prov,
        curve,
        path: [],
        neckFrom: rl.i,
        volA: rl.i,
        volB: rr.i,
      });
    }
  }

  /** Quadratic y = a t^2 + b t + c on the closes between two indexes; y normalised so the bottom is 0 and the rims ~1. */
  private quad(i0: number, i1: number, botP: number, depth: number, sgn: number, bi: number): { a: number; b: number; c: number; r2: number; r2v: number } | null {
    const len = i1 - i0;
    if (len < 8) return null;
    let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0, sy = 0, syy = 0;
    let cnt = 0;
    for (let x = i0; x <= i1; x++) {
      const t = (x - i0) / len;
      const y = ((this.c[x].c - botP) * sgn) / depth;
      const t2v = t * t;
      s0 += 1;
      s1 += t;
      s2 += t2v;
      s3 += t2v * t;
      s4 += t2v * t2v;
      t0 += y;
      t1 += y * t;
      t2 += y * t2v;
      sy += y;
      syy += y * y;
      cnt++;
    }
    // normal equations [s4 s3 s2; s3 s2 s1; s2 s1 s0] [a b c] = [t2 t1 t0]
    const det = (m: number[][]) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const M = [
      [s4, s3, s2],
      [s3, s2, s1],
      [s2, s1, s0],
    ];
    const D = det(M);
    if (!isFinite(D) || Math.abs(D) < 1e-12) return null;
    const rep = (col: number) => M.map((row, r) => row.map((v, c) => (c === col ? [t2, t1, t0][r] : v)));
    const a = det(rep(0)) / D;
    const b = det(rep(1)) / D;
    const c = det(rep(2)) / D;
    const mean = sy / cnt;
    const ssTot = syy - cnt * mean * mean;
    if (ssTot <= 1e-9) return null;
    let ssRes = 0;
    let ssV = 0;
    const yl = ((this.c[i0].c - botP) * sgn) / depth;
    const yr = ((this.c[i1].c - botP) * sgn) / depth;
    const tb = (bi - i0) / len;
    for (let x = i0; x <= i1; x++) {
      const t = (x - i0) / len;
      const y = ((this.c[x].c - botP) * sgn) / depth;
      const d = y - (a * t * t + b * t + c);
      ssRes += d * d;
      // a "V": straight legs from the rims to the bottom (a double top / bottom, not a bowl)
      const v = t <= tb ? yl * (1 - t / Math.max(tb, 1e-9)) : yr * ((t - tb) / Math.max(1 - tb, 1e-9));
      ssV += (y - v) * (y - v);
    }
    return { a, b, c, r2: Math.max(0, 1 - ssRes / ssTot), r2v: Math.max(0, 1 - ssV / ssTot) };
  }

  /* ───────── evaluation ───────── */

  private boundary(cd: Cand, dir: number, x: number): number {
    if (cd.neck) return dir === cd.neckDir ? at(cd.neck, x) : NaN;
    if (!cd.upper || !cd.lower) return NaN;
    return dir > 0 ? at(cd.upper, x) : at(cd.lower, x);
  }

  evaluate(cd: Cand): Ev | null {
    const n = this.n;
    const o = this.o;
    const c = this.c;
    const lastBar = n - 1;
    let brk = -1;
    let dir: -1 | 0 | 1 = 0;
    let failedAt = -1;
    for (let x = cd.iLast + 1; x < n; x++) {
      if (cd.apex !== undefined && x > cd.apex + 1 && brk < 0) return null; // ran past the apex without a breakout
      for (const d of [1, -1] as const) {
        const lvl = this.boundary(cd, d, x);
        if (!isFinite(lvl)) continue;
        const b = this.buf(x, lvl);
        const px = o.requireClose ? c[x].c : d > 0 ? c[x].h : c[x].l;
        if ((px - lvl) * d > b) {
          brk = x;
          dir = d;
          break;
        }
      }
      if (brk >= 0) break;
      if (cd.inv !== undefined && cd.invDir !== undefined && (c[x].c - cd.inv) * cd.invDir > 0) {
        failedAt = x;
        break;
      }
    }
    const A = this.A[Math.min(lastBar, Math.max(cd.iLast, 0))];
    const Anow = this.A[lastBar];

    if (failedAt >= 0) {
      if (lastBar - failedAt > Math.min(o.maxAge, 12)) return null;
      const d0 = cd.bias;
      return { status: "failed", brk: -1, dir: d0, level: null, levelIdx: -1, target: null, stop: null, rr: null, ev: failedAt, end: failedAt, targetIdx: -1, wrongWay: false };
    }

    if (brk < 0) {
      // still forming
      if (lastBar - cd.iLast > o.maxAge) return null;
      if (cd.bias === 0) {
        return { status: "forming", brk: -1, dir: 0, level: null, levelIdx: lastBar, target: null, stop: null, rr: null, ev: -1, end: lastBar, targetIdx: -1, wrongWay: false };
      }
      const d = cd.bias;
      let lvl = this.boundary(cd, d, lastBar);
      if (!isFinite(lvl)) lvl = c[lastBar].c;
      const T = cd.target(lvl, d, Anow);
      let S = cd.stop(d, Anow);
      S = this.fixStop(S, lvl, d, Anow);
      return { status: "forming", brk: -1, dir: d, level: lvl, levelIdx: lastBar, target: T, stop: S, rr: this.rr(lvl, T, S), ev: -1, end: lastBar, targetIdx: -1, wrongWay: false };
    }

    // broken out
    const lvl = this.boundary(cd, dir, brk);
    const T = cd.target(lvl, dir, A);
    const S = this.fixStop(cd.stop(dir, A), lvl, dir, A);
    let status: PatternStatus = "breakout";
    let ev = brk;
    let targetIdx = -1;
    for (let x = brk + 1; x < n; x++) {
      const k = c[x];
      // failure: close beyond the stop, or a quick return inside by more than an ATR
      const back = (k.c - this.boundary(cd, dir, x)) * dir;
      if ((k.c - S) * dir < 0 || (x - brk <= 8 && back < -Math.max(1.0 * this.A[x], this.buf(x, lvl) * 2))) {
        status = "failed";
        ev = x;
        break;
      }
      if (dir > 0 ? k.h >= T : k.l <= T) {
        status = "target";
        ev = x;
        targetIdx = x;
        break;
      }
    }
    const age = lastBar - ev;
    if (status === "breakout" && age > o.maxAge) return null;
    if (status === "target" && age > Math.min(o.maxAge, 20)) return null;
    if (status === "failed" && age > Math.min(o.maxAge, 12)) return null;
    return {
      status,
      brk,
      dir,
      level: lvl,
      levelIdx: brk,
      target: T,
      stop: S,
      rr: this.rr(lvl, T, S),
      ev,
      end: status === "breakout" ? brk : ev,
      targetIdx,
      wrongWay: cd.bias !== 0 && dir !== cd.bias && !cd.neck,
    };
  }

  private fixStop(S: number, lvl: number, dir: number, A: number): number {
    // the stop must be on the other side of the entry, at least half an ATR away
    if ((lvl - S) * dir < 0.5 * A) return lvl - dir * 0.5 * A;
    return S;
  }

  private rr(lvl: number, T: number, S: number): number | null {
    const risk = Math.abs(lvl - S);
    if (!(risk > 0)) return null;
    const r = Math.abs(T - lvl) / risk;
    return isFinite(r) ? Math.round(r * 10) / 10 : null;
  }

  /* ───────── scoring + output ───────── */

  finish(cd: Cand, lo: number, deg: number): { pat: DetectedPattern; rank: number } | null {
    const ev = this.evaluate(cd);
    if (!ev) return null;
    if (ev.status === "failed" && !this.o.showFailed) return null;
    const A = this.A[Math.min(this.n - 1, cd.iLast)];
    // volume: breakout confirmation (volume of the breakout bar vs the pattern average)
    let volConfirmed = false;
    let vol = cd.vol;
    if (this.hasVol && ev.brk >= 0) {
      const body = this.meanVol(cd.volA, cd.volB);
      const vb = this.meanVol(ev.brk, ev.brk + 1);
      if (body > 0 && vb / body >= 1.3) volConfirmed = true;
      vol = 0.5 * vol + 0.5 * clamp((vb / body - 0.8) / 1.0, 0, 1);
    }
    let statusComp = ev.status === "forming" ? 0.45 : ev.status === "breakout" ? 0.8 + (volConfirmed ? 0.2 : 0) : ev.status === "target" ? 1 : 0.05;
    if (ev.wrongWay) statusComp *= 0.5;
    let raw = 0.36 * clamp(cd.geom, 0, 1) + 0.2 * clamp(cd.prop, 0, 1) + 0.2 * clamp(cd.trend, 0, 1) + 0.1 * clamp(vol, 0, 1) + 0.14 * statusComp;
    raw += cd.bonus / 100;
    if (cd.provisional && ev.status === "forming") raw -= 0.03;
    const id = `${cd.type}:${this.c[cd.i0].t}`;
    // logistic calibration: random-walk geometry sits around raw 0.6-0.7, a clean textbook figure above 0.85
    let conf = 100 / (1 + Math.exp(-(raw - CAL.c) * CAL.k));
    if (this.o.prevIds && this.o.prevIds.has(id)) conf += 4;
    conf = Math.round(clamp(conf, 0, 99));
    if (conf < this.o.minConfidence) return null;

    // outline
    const segs: PatternSeg[] = [];
    const end = ev.end;
    const x0 = cd.i0;
    if (cd.upper && cd.lower) {
      segs.push({ i0: x0 + lo, p0: at(cd.upper, x0), i1: end + lo, p1: at(cd.upper, end), kind: "line" });
      segs.push({ i0: x0 + lo, p0: at(cd.lower, x0), i1: end + lo, p1: at(cd.lower, end), kind: "line" });
      if (ev.status === "forming") {
        const proj = Math.min(cd.apex !== undefined ? Math.max(0, cd.apex - end) : 4, Math.max(4, Math.round((cd.iLast - x0) * 0.2)));
        if (proj > 1) {
          segs.push({ i0: end + lo, p0: at(cd.upper, end), i1: end + proj + lo, p1: at(cd.upper, end + proj), kind: "ext" });
          segs.push({ i0: end + lo, p0: at(cd.lower, end), i1: end + proj + lo, p1: at(cd.lower, end + proj), kind: "ext" });
        }
      }
    } else if (cd.neck) {
      const from = cd.neckFrom ?? x0;
      segs.push({ i0: from + lo, p0: at(cd.neck, from), i1: end + lo, p1: at(cd.neck, end), kind: "neck" });
    }
    const bias: -1 | 0 | 1 = ev.dir !== 0 ? ev.dir : cd.bias;
    const age = this.n - 1 - (ev.ev >= 0 ? ev.ev : cd.iLast);
    const recency = 1 - clamp(age / (this.o.maxAge * 2), 0, 1);
    const pat: DetectedPattern = {
      id,
      type: cd.type,
      group: TYPE_GROUP[cd.type],
      bias,
      status: ev.status,
      confidence: conf,
      i0: cd.i0 + lo,
      i1: cd.iLast + lo,
      endIdx: end + lo,
      eventIdx: ev.ev >= 0 ? ev.ev + lo : -1,
      targetIdx: ev.targetIdx >= 0 ? ev.targetIdx + lo : -1,
      pivots: cd.piv.map((q) => ({ i: q.i + lo, p: q.p })),
      path: (cd.path ?? []).map((q) => ({ i: q.i + lo, p: q.p })),
      segs,
      curve: (cd.curve ?? []).map((q) => ({ i: q.i + lo, p: q.p })),
      level: ev.level,
      levelIdx: ev.levelIdx >= 0 ? ev.levelIdx + lo : -1,
      target: ev.target,
      stop: ev.stop,
      rr: ev.rr,
      height: cd.height,
      atr: A,
      volConfirmed,
      provisional: cd.provisional,
      parts: { geom: cd.geom, prop: cd.prop, trend: cd.trend, vol, status: statusComp },
    };
    void deg;
    return { pat, rank: conf * 0.7 + recency * 30 };
  }

  /* ───────── driver ───────── */

  collect(pv: Pv[], lo: number, deg: number, out: Map<string, { pat: DetectedPattern; rank: number }>) {
    const en = this.o.enabled;
    const cands: Cand[] = [];
    if (en.double !== false) this.doubles(pv, cands);
    if (en.triple !== false) this.triples(pv, cands);
    if (en.hs !== false) this.headShoulders(pv, cands);
    if (en.cup !== false || en.round !== false) this.cups(pv, cands);
    if (en.tri !== false || en.wedge !== false || en.flag !== false || en.pennant !== false || en.rect !== false || en.channel !== false || en.broad !== false) this.lineWindows(pv, cands);
    for (const cd of cands) {
      if (en[TYPE_GROUP[cd.type]] === false) continue;
      const r = this.finish(cd, lo, deg);
      if (!r) continue;
      const prev = out.get(r.pat.id);
      if (!prev || prev.rank < r.rank) out.set(r.pat.id, r);
    }
  }
}

function toPv(zz: ReturnType<typeof zigzag>): Pv[] {
  return zz.map((q) => ({ i: q.i, p: q.p, H: q.type === "H", prov: !q.confirmed }));
}

/** Detects the patterns in the last `o.window` candles. Indexes in the result refer to `all`. */
export function detectPatterns(all: readonly SwingCandle[], opts: Partial<PatternOptions> = {}): DetectedPattern[] {
  try {
    return run(all, { ...DEFAULT_PATTERN_OPTIONS, ...opts, enabled: { ...DEFAULT_PATTERN_OPTIONS.enabled, ...(opts.enabled ?? {}) } });
  } catch {
    return [];
  }
}

function run(all: readonly SwingCandle[], o: PatternOptions): DetectedPattern[] {
  const N = all.length;
  const win = Math.max(80, Math.floor(o.window));
  let lo = Math.max(0, N - win);
  // skip leading garbage
  while (lo < N && !(isFinite(all[lo].h) && isFinite(all[lo].l) && isFinite(all[lo].c) && isFinite(all[lo].o))) lo++;
  if (N - lo < 40) return [];
  const cs: SwingCandle[] = [];
  let prevC = all[lo].c;
  for (let i = lo; i < N; i++) {
    const k = all[i];
    if (isFinite(k.h) && isFinite(k.l) && isFinite(k.c) && isFinite(k.o) && k.h >= k.l) {
      cs.push({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c, v: isFinite(k.v ?? 0) ? k.v : 0 });
      prevC = k.c;
    } else cs.push({ t: k.t, o: prevC, h: prevC, l: prevC, c: prevC, v: 0 });
  }
  // flat data: nothing to find
  let mn = Infinity;
  let mx = -Infinity;
  for (const k of cs) {
    if (k.l < mn) mn = k.l;
    if (k.h > mx) mx = k.h;
  }
  if (!(mx > mn) || (mx - mn) / Math.max(Math.abs(mx), 1e-12) < 1e-6) return [];

  const atr = atrSeries(cs, 14);
  const an = new Analyzer(cs, o, atr);
  const found = new Map<string, { pat: DetectedPattern; rank: number }>();
  const mults = DEG[o.degree] ?? DEG.normal;
  for (const m of mults) {
    const pv = toPv(zigzag(cs, { atrMult: m }));
    if (pv.length < 4) continue;
    an.collect(pv, lo, m, found);
  }
  const list = [...found.values()].sort((a, b) => b.rank - a.rank);

  // overlapping patterns: keep the best, drop the rest
  const picked: { pat: DetectedPattern; rank: number }[] = [];
  for (const r of list) {
    let clash = false;
    for (const q of picked) {
      const a0 = Math.max(r.pat.i0, q.pat.i0);
      const a1 = Math.min(r.pat.i1, q.pat.i1);
      const ov = a1 - a0;
      const shorter = Math.min(r.pat.i1 - r.pat.i0, q.pat.i1 - q.pat.i0);
      if (ov > 0 && shorter > 0 && ov / shorter > 0.6) {
        clash = true;
        break;
      }
    }
    if (!clash) picked.push(r);
    if (picked.length >= Math.max(1, o.maxShown)) break;
  }
  return picked.map((r) => r.pat);
}
