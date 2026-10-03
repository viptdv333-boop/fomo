/* Depth-ladder maths of the order book panel: best N levels per side, cumulative volume, spread, mid price, imbalance.
   Pure (no React, no network) so the panel and the check script share it. */

import type { BookSide } from "./algopack-parse";

export interface Ladder {
  /** best N asks, lowest price first */
  asks: (BookSide & { cum: number })[];
  /** best N bids, highest price first */
  bids: (BookSide & { cum: number })[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  /** spread as % of the mid price */
  spreadPct: number | null;
  mid: number | null;
  /** total volume of the shown levels */
  sumBid: number;
  sumAsk: number;
  /** (bid - ask) / (bid + ask) over the shown levels, -1..1; null with an empty book */
  imbalance: number | null;
  /** largest single-level volume (bar scale) */
  maxQty: number;
  /** largest cumulative volume (depth bar scale) */
  maxCum: number;
}

export function buildLadder(bids: BookSide[], asks: BookSide[], levels: number): Ladder {
  const n = Math.max(1, Math.floor(levels));
  const b = bids.slice(0, n);
  const a = asks.slice(0, n);
  let cum = 0;
  const bidsC = b.map((x) => ({ ...x, cum: (cum += x.q) }));
  const sumBid = cum;
  cum = 0;
  const asksC = a.map((x) => ({ ...x, cum: (cum += x.q) }));
  const sumAsk = cum;
  const bestBid = b.length ? b[0].p : null;
  const bestAsk = a.length ? a[0].p : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const tot = sumBid + sumAsk;
  let maxQty = 0;
  for (const x of b) maxQty = Math.max(maxQty, x.q);
  for (const x of a) maxQty = Math.max(maxQty, x.q);
  return {
    asks: asksC,
    bids: bidsC,
    bestBid,
    bestAsk,
    spread,
    spreadPct: spread !== null && mid !== null && mid > 0 ? (spread / mid) * 100 : null,
    mid,
    sumBid,
    sumAsk,
    imbalance: tot > 0 ? (sumBid - sumAsk) / tot : null,
    maxQty,
    maxCum: Math.max(sumBid, sumAsk),
  };
}

/** Decimals worth showing for prices of this book (from the step between levels, else 2). */
export function priceDecimals(prices: number[]): number {
  let d = 0;
  for (const p of prices) {
    const s = String(p);
    const i = s.indexOf(".");
    if (i >= 0) d = Math.max(d, Math.min(8, s.length - i - 1));
  }
  return d;
}
