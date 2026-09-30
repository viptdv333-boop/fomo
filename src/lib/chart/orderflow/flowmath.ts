import type { Candle } from "../types";
import type { FlowBar } from "./types";
import type { OrderFlowStore } from "./store";

/* Order flow numbers derived per candle: delta, cumulative delta, the traded VWAP of a bar and volume profiles.
   Every function works with real trades where the store has them and with the candle approximation elsewhere. */

export const DAY_MS = 86_400_000;

export interface FlowCtx {
  store: OrderFlowStore | null | undefined;
  /** Nominal bar length, ms. */
  intervalMs: number;
}

/** [bid, ask, dh, dl, real] of a candle. */
export function candleFlow(c: Candle, store: OrderFlowStore | null | undefined): FlowBar {
  const real = store?.real(c.t);
  if (real) return real;
  const range = c.h - c.l;
  const vol = c.v > 0 ? c.v : 0;
  const k = range > 0 ? Math.max(-1, Math.min(1, (c.c - c.o) / range)) : 0;
  const ask = vol * (0.5 + 0.5 * k);
  const bid = vol - ask;
  const d = ask - bid;
  return { t: c.t, lv: [], bid, ask, dh: Math.max(0, d), dl: Math.min(0, d), real: false };
}

export interface DeltaSeries {
  delta: Float64Array;
  /** Cumulative delta, restarted every `reset` period. */
  cum: Float64Array;
  /** Running-delta extremes of every bar in cumulative terms. */
  cumHigh: Float64Array;
  cumLow: Float64Array;
  cumOpen: Float64Array;
  real: Uint8Array;
}

export type ResetPeriod = "none" | "day" | "week" | "month";

export function periodId(t: number, wallShift: number, period: ResetPeriod): number {
  if (period === "none") return 0;
  const w = t + wallShift;
  if (period === "day") return Math.floor(w / DAY_MS);
  if (period === "week") return Math.floor((Math.floor(w / DAY_MS) + 3) / 7);
  const d = new Date(w);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function deltaSeries(candles: Candle[], store: OrderFlowStore | null | undefined, reset: ResetPeriod): DeltaSeries {
  const n = candles.length;
  const delta = new Float64Array(n);
  const cum = new Float64Array(n);
  const cumHigh = new Float64Array(n);
  const cumLow = new Float64Array(n);
  const cumOpen = new Float64Array(n);
  const real = new Uint8Array(n);
  let acc = 0;
  let key = NaN;
  const shift = store?.wallShiftMs ?? 0;
  for (let i = 0; i < n; i++) {
    const c = candles[i];
    const pk = periodId(c.t, shift, reset);
    if (pk !== key) {
      key = pk;
      acc = 0;
    }
    const f = candleFlow(c, store);
    const d = f.ask - f.bid;
    delta[i] = d;
    cumOpen[i] = acc;
    cumHigh[i] = acc + Math.max(f.dh, d, 0);
    cumLow[i] = acc + Math.min(f.dl, d, 0);
    acc += d;
    cum[i] = acc;
    real[i] = f.real ? 1 : 0;
  }
  return { delta, cum, cumHigh, cumLow, cumOpen, real };
}

let dsCache: { key: string; res: DeltaSeries } | null = null;

/** deltaSeries() with a one-entry cache (the indicator computes and paints from the same numbers). */
export function cachedDeltaSeries(candles: Candle[], store: OrderFlowStore | null | undefined, reset: ResetPeriod): DeltaSeries {
  const n = candles.length;
  const last = n ? candles[n - 1] : null;
  const key = `${n}|${candles[0]?.t}|${last?.t}|${last?.c}|${last?.v}|${store?.version ?? 0}|${reset}|${store?.wallShiftMs ?? 0}`;
  if (dsCache && dsCache.key === key) return dsCache.res;
  const res = deltaSeries(candles, store, reset);
  dsCache = { key, res };
  return res;
}

/** Volume-weighted mean price of a bar and the sum of price^2 * volume (for the deviation), from trades when available. */
export function barPriceStats(c: Candle, store: OrderFlowStore | null | undefined, useTrades: boolean, typical: number): { pv: number; p2v: number; v: number; real: boolean } {
  if (useTrades) {
    const f = store?.real(c.t);
    if (f && f.lv.length) {
      let pv = 0;
      let p2v = 0;
      let v = 0;
      const lv = f.lv;
      const half = (store?.tick ?? 0) / 2;
      for (let i = 0; i < lv.length; i += 3) {
        const w = lv[i + 1] + lv[i + 2];
        const p = lv[i] + half; // the middle of the cell
        pv += p * w;
        p2v += p * p * w;
        v += w;
      }
      if (v > 0) return { pv, p2v, v, real: true };
    }
  }
  const v = c.v > 0 ? c.v : 0;
  return { pv: typical * v, p2v: typical * typical * v, v, real: false };
}

/* ───────────── volume profile ───────────── */

export interface VpRow {
  lo: number;
  hi: number;
  up: number;
  down: number;
}

export interface VProfile {
  rows: VpRow[];
  poc: number;
  vaLo: number;
  vaHi: number;
  max: number;
  total: number;
  /** Candles that contributed with approximated volume / with trades. */
  approxBars: number;
  realBars: number;
  lo: number;
  hi: number;
}

export interface VpOptions {
  rows: number;
  /** When > 0, rows are exactly this many price units tall (ticks mode). */
  rowSize?: number;
  valueArea: number;
  /** Use trades (bid / ask) for the buy / sell split, else the candle direction. */
  useFlow: boolean;
}

/**
 * Volume profile of candles [from, to]: volume per price row, split into up (buy / ask) and down (sell / bid).
 * With trade data the split is the real aggressor split and the volume sits at the prices it traded at.
 */
export function buildVProfile(candles: Candle[], from: number, to: number, store: OrderFlowStore | null | undefined, o: VpOptions): VProfile | null {
  from = Math.max(0, from);
  to = Math.min(candles.length - 1, to);
  if (to < from) return null;
  let hi = -Infinity;
  let lo = Infinity;
  for (let i = from; i <= to; i++) {
    if (candles[i].h > hi) hi = candles[i].h;
    if (candles[i].l < lo) lo = candles[i].l;
  }
  if (!(hi > lo)) return null;
  let n: number;
  let step: number;
  if (o.rowSize && o.rowSize > 0) {
    step = o.rowSize;
    lo = Math.floor(lo / step) * step;
    n = Math.max(1, Math.min(2000, Math.ceil((hi - lo) / step + 1e-9)));
    hi = lo + n * step;
  } else {
    n = Math.max(2, Math.min(500, Math.floor(o.rows)));
    step = (hi - lo) / n;
  }
  const rows: VpRow[] = [];
  for (let k = 0; k < n; k++) rows.push({ lo: lo + k * step, hi: lo + (k + 1) * step, up: 0, down: 0 });
  const rowAt = (p: number) => Math.min(n - 1, Math.max(0, Math.floor((p - lo) / step)));
  let approxBars = 0;
  let realBars = 0;
  for (let i = from; i <= to; i++) {
    const c = candles[i];
    const real = o.useFlow ? store?.real(c.t) : null;
    if (real && real.lv.length) {
      realBars++;
      const lv = real.lv;
      const cell = store!.tick > 0 ? store!.tick : 0;
      for (let k = 0; k < lv.length; k += 3) {
        const p0 = lv[k];
        if (cell > 0 && cell > step * 1.5) {
          // the trade cells are coarser than the rows: spread each cell over the rows it covers
          const a = rowAt(p0);
          const b = rowAt(p0 + cell - 1e-12);
          const share = 1 / (b - a + 1);
          for (let r = a; r <= b; r++) {
            rows[r].down += lv[k + 1] * share;
            rows[r].up += lv[k + 2] * share;
          }
        } else {
          const r = rowAt(p0 + cell / 2);
          rows[r].down += lv[k + 1];
          rows[r].up += lv[k + 2];
        }
      }
      continue;
    }
    if (!(c.v > 0)) continue;
    approxBars++;
    const isUp = c.c >= c.o;
    const range = c.h - c.l;
    const a = rowAt(c.l);
    const b = rowAt(c.h);
    if (range <= 0 || a === b) {
      if (isUp) rows[a].up += c.v;
      else rows[a].down += c.v;
      continue;
    }
    for (let k = a; k <= b; k++) {
      const ov = Math.min(c.h, rows[k].hi) - Math.max(c.l, rows[k].lo);
      if (ov <= 0) continue;
      const part = (ov / range) * c.v;
      if (isUp) rows[k].up += part;
      else rows[k].down += part;
    }
  }
  let poc = 0;
  let max = 0;
  let total = 0;
  for (let k = 0; k < n; k++) {
    const t = rows[k].up + rows[k].down;
    total += t;
    if (t > max) {
      max = t;
      poc = k;
    }
  }
  if (max <= 0) return null;
  const need = (total * Math.min(100, Math.max(1, o.valueArea))) / 100;
  let vaLo = poc;
  let vaHi = poc;
  let acc = max;
  const at = (k: number) => (k >= 0 && k < n ? rows[k].up + rows[k].down : -1);
  while (acc < need && (vaLo > 0 || vaHi < n - 1)) {
    const below = at(vaLo - 1);
    const above = at(vaHi + 1);
    if (above >= below && above >= 0) {
      vaHi++;
      acc += above;
    } else if (below >= 0) {
      vaLo--;
      acc += below;
    } else break;
  }
  return { rows, poc, vaLo, vaHi, max, total, approxBars, realBars, lo, hi };
}

/** Wall-clock day / week / month id for grouping bars into sessions. */
export function sessionKey(t: number, wallShift: number, period: "day" | "week" | "month"): number {
  return periodId(t, wallShift, period);
}

/** Shape the drawing tools' profile painter expects (rows of equal height, up / down volume, POC and value area). */
export interface ToolProfile {
  lo: number;
  step: number;
  up: number[];
  dn: number[];
  total: number[];
  max: number;
  poc: number;
  vaLo: number;
  vaHi: number;
}

/** Profile of `cs` from real trades (null when the store has none for these candles, so the caller can approximate). */
export function buildProfileFromFlow(cs: Candle[], store: OrderFlowStore | null | undefined, rows: number, vaShare: number): ToolProfile | null {
  if (!store || store.avail !== "trades" || cs.length === 0) return null;
  const prof = buildVProfile(cs, 0, cs.length - 1, store, { rows, valueArea: vaShare * 100, useFlow: true });
  if (!prof || prof.realBars === 0) return null;
  const up = prof.rows.map((r) => r.up);
  const dn = prof.rows.map((r) => r.down);
  return {
    lo: prof.rows[0].lo,
    step: prof.rows[0].hi - prof.rows[0].lo,
    up,
    dn,
    total: up.map((u, i) => u + dn[i]),
    max: prof.max,
    poc: prof.poc,
    vaLo: prof.vaLo,
    vaHi: prof.vaHi,
  };
}
