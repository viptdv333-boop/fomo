import type { Candle } from "../types";
import type { FlowBar } from "./types";

/* Client-side holder of the order flow of the chart. One store per engine. The fetcher (client.ts) fills it with real bars;
   for bars it has none for, barFor() spreads the candle's volume over its price range (an approximation the UI labels). */

export interface BigTrade {
  /** Chart time. */
  t: number;
  p: number;
  v: number;
  buy: boolean;
}

export type FlowAvail = "unknown" | "trades" | "none";

const r10 = (v: number) => +v.toFixed(10);

/** Re-buckets levels of grid `tick` into cells of `step` (a multiple of tick). */
export function regroupLevels(lv: number[], tick: number, step: number): number[] {
  if (!(tick > 0) || step <= tick * 1.0001) return lv;
  const k = Math.max(1, Math.round(step / tick));
  const out: number[] = [];
  let curG = NaN;
  let b = 0;
  let a = 0;
  for (let i = 0; i < lv.length; i += 3) {
    const g = Math.floor(Math.round(lv[i] / tick) / k);
    if (g !== curG) {
      if (curG === curG) out.push(r10(curG * k * tick), b, a);
      curG = g;
      b = 0;
      a = 0;
    }
    b += lv[i + 1];
    a += lv[i + 2];
  }
  if (curG === curG) out.push(r10(curG * k * tick), b, a);
  return out;
}

export interface FlowInfo {
  supported: boolean;
  tick: number;
  nativeTick: number;
  /** Chart-time ranges that have trade data. */
  cov: [number, number][];
  live: boolean;
  pending: boolean;
  delayed?: boolean;
}

export class OrderFlowStore {
  version = 0;
  avail: FlowAvail = "unknown";
  /** Grid of the stored real levels (0 = nothing fetched yet). */
  tick = 0;
  nativeTick = 0;
  live = false;
  /** The source publishes trades with a delay (MOEX ISS ~15 min): the newest bars are estimates. */
  delayed = false;
  pending = false;
  cov: [number, number][] = [];
  /** Added to a chart time to get the exchange's wall clock (sessions / days are grouped on that). */
  wallShiftMs = 0;
  /** Price decimals of the instrument (for the approximation grid). */
  precision = 2;
  /** Exchange the trades come from ("bybit" / "moex" / ""), for labels. */
  sourceName = "";
  /** Who wants data: "footprint", "ind", "draw". */
  readonly needs = new Set<string>();

  /** Largest individual trades (chart time), oldest first. */
  big: BigTrade[] = [];
  private bars = new Map<number, FlowBar>();
  private listeners = new Set<() => void>();
  private approx = new Map<string, FlowBar>();
  private regrouped = new WeakMap<FlowBar, { step: number; lv: number[] }>();

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit() {
    this.version++;
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {}
    }
  }

  get size(): number {
    return this.bars.size;
  }

  /** New symbol / interval: forget everything. */
  reset() {
    this.bars.clear();
    this.approx.clear();
    this.tick = 0;
    this.nativeTick = 0;
    this.avail = "unknown";
    this.live = false;
    this.pending = false;
    this.cov = [];
    this.big = [];
    this.emit();
  }

  /** The grid changed (finer / coarser request): stored bars are of the old grid, drop them. */
  dropBars() {
    this.bars.clear();
    this.tick = 0;
  }

  setInfo(info: FlowInfo) {
    this.avail = info.supported ? "trades" : "none";
    if (info.nativeTick > 0) this.nativeTick = info.nativeTick;
    this.live = info.live;
    this.delayed = !!info.delayed;
    this.pending = info.pending;
    this.cov = info.cov;
  }

  put(bars: FlowBar[], tick: number) {
    if (tick > 0) this.tick = tick;
    for (const b of bars) this.bars.set(b.t, b);
    // real data replaced approximations
    if (bars.length) this.approx.clear();
  }

  /** Replaces the big trades of [from, to) (chart time) with the fresh list. */
  putBig(list: BigTrade[], from: number, to: number) {
    const keep = this.big.filter((b) => b.t < from || b.t >= to);
    this.big = keep.concat(list).sort((a, b) => a.t - b.t);
    if (this.big.length > 3000) this.big = this.big.slice(-3000);
  }

  get(t: number): FlowBar | undefined {
    return this.bars.get(t);
  }

  covered(t: number): boolean {
    for (const r of this.cov) if (t >= r[0] && t < r[1]) return true;
    return false;
  }

  /** Grid for approximated bars: the real grid when known, else the instrument's price precision. */
  baseTick(): number {
    if (this.tick > 0) return this.tick;
    if (this.nativeTick > 0) return this.nativeTick;
    return Math.pow(10, -this.precision);
  }

  /** Levels of `bar` at cells of `step`. */
  levelsAt(bar: FlowBar, step: number): number[] {
    if (!bar.real || !(this.tick > 0) || step <= this.tick * 1.0001) return bar.lv;
    const c = this.regrouped.get(bar);
    if (c && c.step === step) return c.lv;
    const lv = regroupLevels(bar.lv, this.tick, step);
    this.regrouped.set(bar, { step, lv });
    return lv;
  }

  /**
   * The order flow of a candle: real when the store has it, otherwise an approximation on a grid of `step`
   * (candle volume spread over its range, weighted to the body, split by the candle's direction).
   */
  barFor(c: Candle, step: number): FlowBar {
    const real = this.bars.get(c.t);
    if (real) return real;
    const key = `${c.t}|${c.o}|${c.h}|${c.l}|${c.c}|${c.v}|${step}`;
    let a = this.approx.get(key);
    if (!a) {
      if (this.approx.size > 6000) this.approx.clear();
      a = approximateBar(c, step);
      this.approx.set(key, a);
    }
    return a;
  }

  /** Real bar or null (no approximation). */
  real(t: number): FlowBar | null {
    return this.bars.get(t) ?? null;
  }
}

export function approximateBar(c: Candle, step: number): FlowBar {
  const range = c.h - c.l;
  const vol = c.v > 0 ? c.v : 0;
  let s = step > 0 ? step : range > 0 ? range / 10 : 1;
  let lo = Math.floor(c.l / s + 1e-9);
  let hi = Math.floor(c.h / s - 1e-9);
  if (hi < lo) hi = lo;
  if (hi - lo > 300) {
    s = s * Math.ceil((hi - lo + 1) / 300);
    lo = Math.floor(c.l / s + 1e-9);
    hi = Math.floor(c.h / s - 1e-9);
    if (hi < lo) hi = lo;
  }
  const n = hi - lo + 1;
  const k = range > 0 ? Math.max(-1, Math.min(1, (c.c - c.o) / range)) : 0;
  const askFrac = 0.5 + 0.5 * k;
  const bLo = Math.min(c.o, c.c);
  const bHi = Math.max(c.o, c.c);
  const mid = (c.o + c.c) / 2;
  const sigma = Math.max(range / 4, s);
  const w = new Array<number>(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const pc = (lo + i + 0.5) * s;
    const inBody = pc >= bLo - s * 0.5 && pc <= bHi + s * 0.5 ? 1 : 0;
    const z = (pc - mid) / sigma;
    w[i] = 0.35 + inBody + 0.8 * Math.exp(-0.5 * z * z);
    sum += w[i];
  }
  const lv: number[] = [];
  let tb = 0;
  let ta = 0;
  for (let i = 0; i < n; i++) {
    const v = sum > 0 ? (vol * w[i]) / sum : 0;
    const a = v * askFrac;
    const b = v - a;
    lv.push(r10((lo + i) * s), b, a);
    tb += b;
    ta += a;
  }
  const delta = ta - tb;
  return { t: c.t, lv, bid: tb, ask: ta, dh: Math.max(0, delta), dl: Math.min(0, delta), real: false };
}
