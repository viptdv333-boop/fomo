import type { Candle } from "../types";
import type { FlowBar } from "../orderflow/types";

/* Volume profile maths (pure, no DOM, no engine): volume per price row of a bar range, point of control, value area, high / low
   volume nodes, developing POC / value area, bar statistics. Real trades (an order flow store) are used where the caller has them,
   the candle approximation everywhere else; the result says how many bars were of which kind so the UI can label it honestly. */

/** What the profile needs from the order flow store (structural, so tests can pass a stub). */
export interface VpFlow {
  /** Grid of the stored trade levels. */
  tick: number;
  real(t: number): FlowBar | null | undefined;
}

export type VpRowMode = "rows" | "ticks" | "price" | "percent";
export type VpPolarity = "bar" | "portion";

export interface VpOpts {
  rowMode: VpRowMode;
  /** Number of rows (rowMode "rows"). */
  rows: number;
  /** Ticks per row (rowMode "ticks"). */
  rowTicks: number;
  /** Row height in price units (rowMode "price"). */
  rowPrice: number;
  /** Row height in % of the last close (rowMode "percent"). */
  rowPct: number;
  /** Instrument tick (for rowMode "ticks"). */
  tickSize: number;
  /** Value area, % of the total volume. */
  valueArea: number;
  /** Use trades where the flow has them. */
  useFlow: boolean;
  /** Candle approximation: "bar" = the whole volume goes up / down by close vs open; "portion" = split by where the close sits in the bar. */
  polarity: VpPolarity;
  /** Passes of a 1-2-1 smoothing over the rows (0 = none). */
  smooth: number;
}

export const DEFAULT_VP_OPTS: VpOpts = {
  rowMode: "rows",
  rows: 100,
  rowTicks: 1,
  rowPrice: 1,
  rowPct: 0.1,
  tickSize: 0.01,
  valueArea: 70,
  useFlow: true,
  polarity: "bar",
  smooth: 0,
};

export interface VpGrid {
  lo: number;
  step: number;
  n: number;
}

export interface VpRow {
  lo: number;
  hi: number;
  up: number;
  down: number;
}

export interface VpProfile {
  rows: VpRow[];
  /** Total volume per row (up + down). */
  tot: Float64Array;
  poc: number;
  vaLo: number;
  vaHi: number;
  /** Largest row volume. */
  max: number;
  /** Sum of the rows (after smoothing, redistributed to the original sum, so it equals `volume`). */
  total: number;
  /** Volume of the bars as they are (before the spreading over rows). */
  volume: number;
  /** Candle extremes of the range (Profile High / Low). */
  lo: number;
  hi: number;
  /** First / last bar of the range. */
  a: number;
  b: number;
  bars: number;
  realBars: number;
  approxBars: number;
  /** Buy / sell volume of the bars that came from real trades (aggressor split). */
  realBuy: number;
  realSell: number;
  grid: VpGrid;
}

const MAX_ROWS = 1000;

const fin = (v: number) => typeof v === "number" && isFinite(v);

/** Row grid for a price span. Flat spans get one thin row. */
export function makeGrid(lo: number, hi: number, o: VpOpts, ref: number): VpGrid {
  if (!(hi > lo)) {
    const eps = Math.max(Math.abs(lo) * 1e-6, 1e-9);
    return { lo: lo - eps, step: 2 * eps, n: 1 };
  }
  let size = 0;
  if (o.rowMode === "ticks") size = (o.tickSize > 0 ? o.tickSize : 0) * Math.max(1, o.rowTicks);
  else if (o.rowMode === "price") size = o.rowPrice;
  else if (o.rowMode === "percent") size = ref > 0 ? (ref * o.rowPct) / 100 : 0;
  if (o.rowMode !== "rows" && fin(size) && size > 0) {
    let g = Math.floor(lo / size + 1e-9) * size;
    let n = Math.max(1, Math.ceil((hi - g) / size - 1e-9));
    if (n > MAX_ROWS) {
      size *= Math.ceil(n / MAX_ROWS);
      g = Math.floor(lo / size + 1e-9) * size;
      n = Math.max(1, Math.ceil((hi - g) / size - 1e-9));
    }
    return { lo: g, step: size, n };
  }
  const n = Math.max(2, Math.min(MAX_ROWS, Math.floor(fin(o.rows) ? o.rows : 100)));
  return { lo, step: (hi - lo) / n, n };
}

/** Scratch result of addBar. */
export interface BarAdd {
  real: boolean;
  r0: number;
  r1: number;
  buy: number;
  sell: number;
  vol: number;
}

/** Adds one candle's volume to the per-row arrays. Returns false when the candle carries nothing to add. */
export function addBar(c: Candle, flow: VpFlow | null | undefined, g: VpGrid, o: VpOpts, up: Float64Array | number[], down: Float64Array | number[], out: BarAdd): boolean {
  const { lo, step, n } = g;
  const rowAt = (p: number) => {
    const k = Math.floor((p - lo) / step + 1e-9);
    return k < 0 ? 0 : k > n - 1 ? n - 1 : k;
  };
  out.real = false;
  out.buy = 0;
  out.sell = 0;
  out.vol = 0;
  const real = o.useFlow && flow ? flow.real(c.t) : null;
  if (real && real.lv.length) {
    const lv = real.lv;
    const cell = flow!.tick > 0 ? flow!.tick : 0;
    let r0 = n;
    let r1 = -1;
    let vol = 0;
    for (let k = 0; k + 2 < lv.length; k += 3) {
      const p0 = lv[k];
      const sell = lv[k + 1];
      const buy = lv[k + 2];
      if (!fin(p0) || !fin(sell) || !fin(buy)) continue;
      vol += sell + buy;
      out.buy += buy;
      out.sell += sell;
      if (cell > 0 && cell > step * 1.5) {
        // the trade cells are coarser than the rows: spread each cell over the rows it covers
        const a = rowAt(p0);
        const b = rowAt(p0 + cell - 1e-12);
        const share = 1 / (b - a + 1);
        for (let r = a; r <= b; r++) {
          down[r] += sell * share;
          up[r] += buy * share;
        }
        if (a < r0) r0 = a;
        if (b > r1) r1 = b;
      } else {
        const r = rowAt(p0 + cell / 2);
        down[r] += sell;
        up[r] += buy;
        if (r < r0) r0 = r;
        if (r > r1) r1 = r;
      }
    }
    if (r1 < 0) return false;
    out.real = true;
    out.r0 = r0;
    out.r1 = r1;
    out.vol = vol;
    return true;
  }
  const v = c.v;
  if (!(v > 0) || !fin(v) || !fin(c.h) || !fin(c.l)) return false;
  const range = c.h - c.l;
  let upFrac = c.c >= c.o ? 1 : 0;
  if (o.polarity === "portion" && range > 0) upFrac = Math.min(1, Math.max(0, (c.c - c.l) / range));
  const a = rowAt(c.l);
  const b = rowAt(c.h);
  out.r0 = a;
  out.r1 = b;
  out.vol = v;
  if (range <= 0 || a === b) {
    up[a] += v * upFrac;
    down[a] += v * (1 - upFrac);
    return true;
  }
  let tot = 0;
  for (let k = a; k <= b; k++) {
    const ov = Math.min(c.h, lo + (k + 1) * step) - Math.max(c.l, lo + k * step);
    if (ov > 0) tot += ov;
  }
  if (!(tot > 0)) {
    up[a] += v * upFrac;
    down[a] += v * (1 - upFrac);
    return true;
  }
  for (let k = a; k <= b; k++) {
    const ov = Math.min(c.h, lo + (k + 1) * step) - Math.max(c.l, lo + k * step);
    if (ov <= 0) continue;
    const part = (ov / tot) * v;
    up[k] += part * upFrac;
    down[k] += part * (1 - upFrac);
  }
  return true;
}

/** 1-2-1 smoothing, edges renormalised; every series keeps its sum. */
export function smoothRows(x: Float64Array, passes: number): Float64Array {
  const n = x.length;
  if (passes <= 0 || n < 3) return x;
  let sum0 = 0;
  for (let i = 0; i < n; i++) sum0 += x[i];
  let cur = Float64Array.from(x);
  for (let p = 0; p < passes; p++) {
    const nx = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 2 * cur[i];
      let w = 2;
      if (i > 0) {
        s += cur[i - 1];
        w += 1;
      }
      if (i < n - 1) {
        s += cur[i + 1];
        w += 1;
      }
      nx[i] = s / w;
    }
    cur = nx;
  }
  let sum1 = 0;
  for (let i = 0; i < n; i++) sum1 += cur[i];
  if (sum1 > 0 && sum0 > 0) {
    const k = sum0 / sum1;
    for (let i = 0; i < n; i++) cur[i] *= k;
  }
  return cur;
}

/** Value area around the POC: rows are added one at a time, always the larger neighbour (ties go up), until `pct` % of the volume is inside. */
export function valueAreaOf(tot: ArrayLike<number>, poc: number, pct: number): [number, number] {
  const n = tot.length;
  let total = 0;
  for (let i = 0; i < n; i++) total += tot[i];
  const need = (total * Math.min(100, Math.max(1, pct))) / 100;
  let lo = poc;
  let hi = poc;
  let acc = tot[poc];
  const at = (k: number) => (k >= 0 && k < n ? tot[k] : -1);
  while (acc < need - total * 1e-12 && (lo > 0 || hi < n - 1)) {
    const below = at(lo - 1);
    const above = at(hi + 1);
    if (above >= below && above >= 0) {
      hi++;
      acc += above;
    } else if (below >= 0) {
      lo--;
      acc += below;
    } else break;
  }
  return [lo, hi];
}

/** Volume profile of bars [a, b]. Null when the range has no bars or no volume at all. */
export function buildVp(candles: ArrayLike<Candle>, a: number, b: number, flow: VpFlow | null | undefined, o: VpOpts): VpProfile | null {
  const n = candles.length;
  a = Math.max(0, Math.floor(a));
  b = Math.min(n - 1, Math.floor(b));
  if (!(b >= a)) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = a; i <= b; i++) {
    const c = candles[i];
    if (fin(c.h) && c.h > hi) hi = c.h;
    if (fin(c.l) && c.l < lo) lo = c.l;
  }
  if (!fin(hi) || !fin(lo)) return null;
  const refC = candles[b].c;
  const g = makeGrid(lo, hi, o, fin(refC) ? refC : (hi + lo) / 2);
  const up = new Float64Array(g.n);
  const down = new Float64Array(g.n);
  const bar: BarAdd = { real: false, r0: 0, r1: 0, buy: 0, sell: 0, vol: 0 };
  let realBars = 0;
  let approxBars = 0;
  let realBuy = 0;
  let realSell = 0;
  let volume = 0;
  for (let i = a; i <= b; i++) {
    if (!addBar(candles[i], flow, g, o, up, down, bar)) continue;
    volume += bar.vol;
    if (bar.real) {
      realBars++;
      realBuy += bar.buy;
      realSell += bar.sell;
    } else approxBars++;
  }
  const su = o.smooth > 0 ? smoothRows(up, o.smooth) : up;
  const sd = o.smooth > 0 ? smoothRows(down, o.smooth) : down;
  const rows: VpRow[] = new Array(g.n);
  const tot = new Float64Array(g.n);
  let poc = 0;
  let max = 0;
  let total = 0;
  for (let k = 0; k < g.n; k++) {
    rows[k] = { lo: g.lo + k * g.step, hi: g.lo + (k + 1) * g.step, up: su[k], down: sd[k] };
    tot[k] = su[k] + sd[k];
    total += tot[k];
    if (tot[k] > max) {
      max = tot[k];
      poc = k;
    }
  }
  if (!(max > 0)) return null;
  const [vaLo, vaHi] = valueAreaOf(tot, poc, o.valueArea);
  return { rows, tot, poc, vaLo, vaHi, max, total, volume, lo, hi, a, b, bars: b - a + 1, realBars, approxBars, realBuy, realSell, grid: g };
}

export interface VpLevels {
  high: number;
  vah: number;
  poc: number;
  val: number;
  low: number;
}

/** Profile High / Value Area High / POC / Value Area Low / Profile Low as prices. */
export function profileLevels(p: VpProfile): VpLevels {
  const r = p.rows[p.poc];
  return { high: p.hi, vah: p.rows[p.vaHi].hi, poc: (r.lo + r.hi) / 2, val: p.rows[p.vaLo].lo, low: p.lo };
}

export interface VpZone {
  /** Row indices, inclusive. */
  r0: number;
  r1: number;
  lo: number;
  hi: number;
  /** Largest row volume in the zone, as a share of the POC volume. */
  strength: number;
}

function runs(flags: Uint8Array, p: VpProfile): VpZone[] {
  const out: VpZone[] = [];
  let s = -1;
  for (let k = 0; k <= flags.length; k++) {
    const on = k < flags.length && flags[k] === 1;
    if (on && s < 0) s = k;
    if (!on && s >= 0) {
      let m = 0;
      for (let q = s; q < k; q++) if (p.tot[q] > m) m = p.tot[q];
      out.push({ r0: s, r1: k - 1, lo: p.rows[s].lo, hi: p.rows[k - 1].hi, strength: p.max > 0 ? m / p.max : 0 });
      s = -1;
    }
  }
  return out;
}

/** High-volume nodes ("supply & demand" zones): runs of rows whose volume is within `thrPct` % of the POC volume. */
export function highVolumeZones(p: VpProfile, thrPct: number): VpZone[] {
  const lim = p.max * (1 - Math.min(100, Math.max(0, thrPct)) / 100);
  const f = new Uint8Array(p.tot.length);
  for (let k = 0; k < f.length; k++) f[k] = p.tot[k] >= lim && p.tot[k] > 0 ? 1 : 0;
  return runs(f, p);
}

/** Low-volume nodes (gaps): runs of rows at or below `nodePct` % of the POC volume that lie between traded prices (not the empty tails). */
export function lowVolumeGaps(p: VpProfile, nodePct: number): VpZone[] {
  const lim = p.max * (Math.min(100, Math.max(0, nodePct)) / 100);
  const n = p.tot.length;
  let first = -1;
  let last = -1;
  for (let k = 0; k < n; k++) {
    if (p.tot[k] > lim) {
      if (first < 0) first = k;
      last = k;
    }
  }
  const f = new Uint8Array(n);
  if (first >= 0) for (let k = first; k <= last; k++) f[k] = p.tot[k] <= lim ? 1 : 0;
  return runs(f, p);
}

export interface VpDeveloping {
  from: number;
  poc: Float64Array;
  vah: Float64Array;
  val: Float64Array;
}

/** POC (and value area) of [a, i] for every bar i of the range, on the rows of the final profile. */
export function developingVp(candles: ArrayLike<Candle>, a: number, b: number, flow: VpFlow | null | undefined, g: VpGrid, o: VpOpts, withVa: boolean): VpDeveloping {
  const len = Math.max(0, b - a + 1);
  const poc = new Float64Array(len).fill(NaN);
  const vah = new Float64Array(len).fill(NaN);
  const val = new Float64Array(len).fill(NaN);
  const up = new Float64Array(g.n);
  const down = new Float64Array(g.n);
  const tot = new Float64Array(g.n);
  const bar: BarAdd = { real: false, r0: 0, r1: 0, buy: 0, sell: 0, vol: 0 };
  let best = 0;
  let pk = -1;
  for (let i = a; i <= b; i++) {
    if (addBar(candles[i], flow, g, o, up, down, bar)) {
      for (let k = bar.r0; k <= bar.r1; k++) {
        tot[k] = up[k] + down[k];
        if (tot[k] > best) {
          best = tot[k];
          pk = k;
        }
      }
    }
    if (pk >= 0) {
      poc[i - a] = g.lo + (pk + 0.5) * g.step;
      if (withVa) {
        const [l, h] = valueAreaOf(tot, pk, o.valueArea);
        vah[i - a] = g.lo + (h + 1) * g.step;
        val[i - a] = g.lo + l * g.step;
      }
    }
  }
  return { from: a, poc, vah, val };
}

/** Simple average of the volume of the `len` bars ending at `end` (the bars before the range count too). */
export function volumeMa(candles: ArrayLike<Candle>, end: number, len: number): number {
  const e = Math.min(candles.length - 1, Math.floor(end));
  const s = Math.max(0, e - Math.max(1, Math.floor(len)) + 1);
  if (e < s) return 0;
  let sum = 0;
  for (let i = s; i <= e; i++) {
    const v = candles[i].v;
    if (fin(v) && v > 0) sum += v;
  }
  return sum / (e - s + 1);
}

/** Compact number for the statistics table: 594, 31, 213.784K, 1.250M. */
export function fmtVolShort(v: number, locale = "en-US"): string {
  if (!fin(v)) return "—";
  const a = Math.abs(v);
  const nf = (x: number, d: number) => x.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return nf(v / 1e9, 3) + "B";
  if (a >= 1e6) return nf(v / 1e6, 3) + "M";
  if (a >= 1e3) return nf(v / 1e3, 3) + "K";
  return nf(v, a < 10 && a !== Math.floor(a) ? 2 : 0);
}

/* ───────────── range resolution ───────────── */

export type VpRangeMode = "visible" | "lastN" | "fixed" | "session" | "anchor";

export interface VpRangeSpec {
  mode: VpRangeMode;
  lastN: number;
  /** Fixed range: bars back from the last bar (0 = the last bar). */
  fromBack: number;
  toBack: number;
  /** Fixed range as chart-time text ("2026-10-02 12:30" or ISO); a valid text wins over the bars-back number. */
  fromIso: string;
  toIso: string;
  session: "day" | "week" | "month";
  anchorTime: number;
  /** Visible bars (engine view). */
  visFrom: number;
  visTo: number;
  /** Added to a chart time to get the exchange wall clock (sessions are cut on that). */
  wallShift: number;
}

const DAY_MS = 86_400_000;

function periodKey(t: number, shift: number, period: "day" | "week" | "month"): number {
  const w = t + shift;
  if (period === "day") return Math.floor(w / DAY_MS);
  if (period === "week") return Math.floor((Math.floor(w / DAY_MS) + 3) / 7);
  const d = new Date(w);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** Chart-time text -> ms (text without a zone is read as UTC, i.e. as the chart's own clock). NaN when it is not a date. */
export function parseChartTime(s: string): number {
  const t = (s || "").trim();
  if (!t) return NaN;
  if (/^\d{9,15}$/.test(t)) return Number(t);
  const iso = t.replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(iso);
  return Date.parse(hasZone ? iso : iso + (iso.length <= 10 ? "T00:00:00Z" : "Z"));
}

export function formatChartTime(ms: number): string {
  if (!fin(ms)) return "";
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  const sec = Math.floor(ms / 1000) % 60;
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${sec ? ":" + p(sec) : ""}`;
}

/** First bar index with t >= time (n when there is none). */
export function indexAtOrAfterT(candles: ArrayLike<Candle>, t: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (candles[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The bars [a, b] a profile is built from, or null (nothing to show: no data, an anchor that is not set, an inverted range ...). */
export function resolveVpRange(candles: ArrayLike<Candle>, s: VpRangeSpec): [number, number] | null {
  const n = candles.length;
  if (n === 0) return null;
  const last = n - 1;
  let a: number;
  let b: number;
  switch (s.mode) {
    case "visible":
      a = s.visFrom;
      b = s.visTo;
      break;
    case "lastN":
      b = last;
      a = last - Math.max(1, Math.floor(s.lastN)) + 1;
      break;
    case "session": {
      b = last;
      const k = periodKey(candles[last].t, s.wallShift, s.session);
      a = last;
      while (a > 0 && periodKey(candles[a - 1].t, s.wallShift, s.session) === k) a--;
      break;
    }
    case "anchor": {
      if (!(s.anchorTime > 0)) return null;
      a = indexAtOrAfterT(candles, s.anchorTime);
      b = last;
      break;
    }
    case "fixed": {
      const tf = parseChartTime(s.fromIso);
      const tt = parseChartTime(s.toIso);
      a = fin(tf) ? indexAtOrAfterT(candles, tf) : last - Math.max(0, Math.floor(s.fromBack));
      b = fin(tt) ? indexAtOrAfterT(candles, tt + 1) - 1 : last - Math.max(0, Math.floor(s.toBack));
      break;
    }
    default:
      return null;
  }
  a = Math.max(0, Math.floor(a));
  b = Math.min(last, Math.floor(b));
  if (!(b >= a)) {
    if (s.mode === "fixed" && a > b) [a, b] = [Math.max(0, Math.min(a, b)), Math.min(last, Math.max(a, b))];
    else return null;
  }
  return [a, b];
}
