import type { Candle } from "../types";
import type { OrderFlowStore } from "./store";
import { DAY_MS, barPriceStats } from "./flowmath";

/* VWAP maths shared by the VWAP / anchored VWAP indicators and the anchored VWAP drawing. With trade data a bar contributes
   the exact volume-weighted price of its trades (and their spread, for the deviation bands); without it, the chosen
   candle price (hlc3 ...) weighted by the candle's volume. */

export type VwapAnchor = "day" | "week" | "month" | "year";
export type PriceSourceId = "close" | "open" | "high" | "low" | "hl2" | "hlc3" | "ohlc4";

export function pickPrice(c: Candle, source: PriceSourceId): number {
  switch (source) {
    case "open": return c.o;
    case "high": return c.h;
    case "low": return c.l;
    case "close": return c.c;
    case "hl2": return (c.h + c.l) / 2;
    case "ohlc4": return (c.o + c.h + c.l + c.c) / 4;
    default: return (c.h + c.l + c.c) / 3;
  }
}

export const ANCHOR_MS: Record<VwapAnchor, number> = { day: DAY_MS, week: 7 * DAY_MS, month: 28 * DAY_MS, year: 365 * DAY_MS };

function anchorKey(t: number, shift: number, anchor: VwapAnchor): number {
  const w = t + shift;
  if (anchor === "day") return Math.floor(w / DAY_MS);
  if (anchor === "week") return Math.floor((Math.floor(w / DAY_MS) + 3) / 7);
  const d = new Date(w);
  if (anchor === "month") return d.getUTCFullYear() * 12 + d.getUTCMonth();
  return d.getUTCFullYear();
}

export interface VwapResult {
  vwap: Float64Array;
  sd: Float64Array;
  realBars: number;
  approxBars: number;
  /** 1 where a new period (session) starts. */
  breaks: Uint8Array;
}

export interface VwapOptions {
  /** Restart every period, or start once at the bar index `from` (anchored). */
  anchor: VwapAnchor | { from: number };
  source: PriceSourceId;
  useTrades: boolean;
  store: OrderFlowStore | null | undefined;
}

export function computeVwap(candles: Candle[], o: VwapOptions): VwapResult {
  const n = candles.length;
  const vwap = new Float64Array(n).fill(NaN);
  const sd = new Float64Array(n).fill(NaN);
  const breaks = new Uint8Array(n);
  let sv = 0;
  let spv = 0;
  let sp2v = 0;
  let key = NaN;
  let realBars = 0;
  let approxBars = 0;
  const shift = o.store?.wallShiftMs ?? 0;
  const anchored = typeof o.anchor === "object";
  const start = anchored ? Math.max(0, (o.anchor as { from: number }).from) : 0;
  for (let i = anchored ? start : 0; i < n; i++) {
    const c = candles[i];
    if (!anchored) {
      const k = anchorKey(c.t, shift, o.anchor as VwapAnchor);
      if (k !== key) {
        key = k;
        breaks[i] = 1;
        sv = 0;
        spv = 0;
        sp2v = 0;
      }
    }
    const typical = pickPrice(c, o.source);
    const st = barPriceStats(c, o.store, o.useTrades, typical);
    if (st.real) realBars++;
    else if (c.v > 0) approxBars++;
    sv += st.v;
    spv += st.pv;
    sp2v += st.p2v;
    if (sv > 0) {
      const m = spv / sv;
      vwap[i] = m;
      sd[i] = Math.sqrt(Math.max(0, sp2v / sv - m * m));
    } else {
      vwap[i] = typical;
      sd[i] = 0;
    }
  }
  return { vwap, sd, realBars, approxBars, breaks };
}

/** First candle index whose start is >= t (chart time). */
export function indexAtOrAfter(candles: Candle[], t: number): number {
  let lo = 0;
  let hi = candles.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (candles[m].t < t) lo = m + 1;
    else hi = m;
  }
  return lo;
}
