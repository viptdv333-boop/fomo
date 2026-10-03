/**
 * Double ZigZag with High/Low prints: pure analysis (no DOM). Two independent swing layers (fast / slow), each detected by its own
 * mode (Pivot bars / Deviation % / ATR × k), enriched with the data shown next to every swing (change from the previous swing,
 * bars, volume of the leg, HH/HL/LH/LL tag) plus horizontal support / resistance levels from the last swings of the slow layer.
 */
import { atrSeries, detectSwings, type SwingCandle, type SwingSpec } from "./swings";

export type ZzTag = "HH" | "HL" | "LH" | "LL" | "EH" | "EL" | "";

export interface ZzPivot {
  /** Index in the full candle array. */
  i: number;
  t: number;
  p: number;
  type: "H" | "L";
  /** false for the last, still moving extreme. */
  confirmed: boolean;
  tag: ZzTag;
  /** Change from the previous swing, %. NaN for the first one. */
  pct: number;
  /** Bars since the previous swing (0 for the first one). */
  bars: number;
  /** Volume summed over the leg that ends in this swing. */
  vol: number;
}

export interface ZzLevel {
  /** Bar of the swing the level comes from. */
  i: number;
  p: number;
  type: "H" | "L";
  /** First bar after the swing whose close crossed the level, -1 when it is still intact. */
  broken: number;
}

export interface ZzLayer {
  spec: SwingSpec;
  pivots: ZzPivot[];
}

export interface ZzResult {
  layers: [ZzLayer, ZzLayer];
  levels: ZzLevel[];
  /** First analysed bar and the number of candles. */
  start: number;
  n: number;
  precision: number;
}

export interface ZzOptions {
  spec1: SwingSpec;
  spec2: SwingSpec;
  /** Only the last N bars are analysed. */
  window: number;
  /** Number of the slow layer swings that become levels (0 = none). */
  levels: number;
  /** Levels closer than this many ATR are merged. */
  mergeAtr: number;
}

const fin = (v: number) => v === v && v !== Infinity && v !== -Infinity;

function enrich(sub: SwingCandle[], start: number, spec: SwingSpec): ZzLayer {
  const raw = detectSwings(sub, spec);
  const n = sub.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + (fin(sub[i].v ?? NaN) ? (sub[i].v as number) : 0);
  const out: ZzPivot[] = [];
  let lastH: ZzPivot | null = null;
  let lastL: ZzPivot | null = null;
  for (let k = 0; k < raw.length; k++) {
    const r = raw[k];
    const prev = out[k - 1];
    const same = r.type === "H" ? lastH : lastL;
    let tag: ZzTag = "";
    if (same) {
      if (r.type === "H") tag = r.p > same.p ? "HH" : r.p < same.p ? "LH" : "EH";
      else tag = r.p < same.p ? "LL" : r.p > same.p ? "HL" : "EL";
    }
    const z: ZzPivot = {
      i: r.i + start,
      t: r.t,
      p: r.p,
      type: r.type,
      confirmed: r.confirmed,
      tag,
      pct: prev && prev.p !== 0 ? ((r.p - prev.p) / prev.p) * 100 : NaN,
      bars: prev ? r.i + start - prev.i : 0,
      vol: prev ? cum[r.i + 1] - cum[prev.i - start + 1] : 0,
    };
    out.push(z);
    if (r.confirmed) {
      if (r.type === "H") lastH = z;
      else lastL = z;
    }
  }
  return { spec, pivots: out };
}

function buildLevels(sub: SwingCandle[], start: number, slow: ZzLayer, count: number, mergeAtr: number): ZzLevel[] {
  if (count <= 0) return [];
  const conf = slow.pivots.filter((q) => q.confirmed).slice(-count);
  if (!conf.length) return [];
  const atr = atrSeries(sub, 14);
  const thr = Math.max(0, mergeAtr) * (atr[atr.length - 1] || 0);
  const sorted = conf.slice().sort((a, b) => a.p - b.p);
  const groups: ZzPivot[][] = [];
  for (const q of sorted) {
    const g = groups[groups.length - 1];
    if (g && q.p - g[g.length - 1].p <= thr) g.push(q);
    else groups.push([q]);
  }
  const out: ZzLevel[] = [];
  for (const g of groups) {
    // the most recent swing of the cluster represents it
    let best = g[0];
    for (const q of g) if (q.i > best.i) best = q;
    let broken = -1;
    for (let j = best.i - start + 1; j < sub.length; j++) {
      const c = sub[j].c;
      if (best.type === "H" ? c > best.p : c < best.p) {
        broken = j + start;
        break;
      }
    }
    out.push({ i: best.i, p: best.p, type: best.type, broken });
  }
  out.sort((a, b) => b.i - a.i);
  return out;
}

export function analyzeZz(cs: SwingCandle[], o: ZzOptions): ZzResult {
  const n = cs.length;
  const empty: ZzResult = { layers: [{ spec: o.spec1, pivots: [] }, { spec: o.spec2, pivots: [] }], levels: [], start: 0, n, precision: 2 };
  if (n < 5) return empty;
  const start = Math.max(0, n - Math.max(50, Math.floor(o.window)));
  const sub = start > 0 ? cs.slice(start) : cs;
  const l1 = enrich(sub, start, o.spec1);
  const l2 = enrich(sub, start, o.spec2);
  return { layers: [l1, l2], levels: buildLevels(sub, start, l2, Math.floor(o.levels), o.mergeAtr), start, n, precision: 2 };
}

/** Short mode description for the title: "5%", "ATR2", "P5". */
export function specText(s: SwingSpec): string {
  if (s.mode === "pct") return `${s.pct ?? 1}%`;
  if (s.mode === "atr") return `ATR${s.atr ?? 2}`;
  return `P${s.bars ?? 5}`;
}
