/* The forming (live) bar of the terminal chart: which bar a quote belongs to, when a new bar is opened, how the quote is merged into the newest bar
   of EVERY timeframe, and how a refreshed bar from the server keeps the live price. Pure functions (no React, no DOM): scripts/check-live-bar.ts.

   Why this exists: every timeframe is a separate /api/klines answer (ISS / Tinkoff tail / Bybit / FMP), each one with its own lag (ISS hourly and daily bars
   are behind, the 15-minute delayed feed has no current hour at all, shared caches hold an answer for a minute). The only thing that makes the newest bar of
   M1, M15, H1 and D agree is the one live quote merged into each of them. */
import type { Candle } from "./types";
import { intervalToMs } from "./format";
import { intervalPlan } from "./intervals";

export const MSK_MS = 3 * 3_600_000;
export const DAY_MS = 86_400_000;

/** a quote further than this from the newest close must be confirmed by the next one before it is drawn (one bad print must not stretch a bar) */
export const JUMP_FRACTION = 0.03;

export const isIntraday = (interval: string): boolean => interval !== "D" && interval !== "W" && interval !== "M" && interval !== "Y";

/** Start of the bar containing `nowWall` (ms on the exchange's wall clock, read with UTC getters). */
export function bucketStartWall(nowWall: number, interval: string): number {
  if (interval === "W") {
    const d = new Date(nowWall);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
    return d.getTime();
  }
  if (interval === "M") {
    const d = new Date(nowWall);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (interval === "Y") {
    const d = new Date(nowWall);
    d.setUTCMonth(0, 1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  const ms = intervalToMs(interval);
  return Math.floor(nowWall / ms) * ms;
}

/* ── is this quote believable? ── */

/**
 * A price far (more than 3%) from the newest close is held back until the next quote lands within 1% of it (a confirmed gap is real, a lone print is not).
 * `pending` is the held price (0: none); the caller keeps it between polls and passes the new value back.
 */
export function gateQuote(price: number, lastClose: number, pending: number): { accept: boolean; pending: number } {
  const jump = Math.abs(price - lastClose) / (lastClose || price);
  if (jump > JUMP_FRACTION) {
    if (pending && Math.abs(price - pending) / pending < 0.01) return { accept: true, pending: 0 };
    return { accept: false, pending: price };
  }
  return { accept: true, pending: 0 };
}

/* ── which bar does the quote belong to ── */

export interface LiveContext {
  interval: string;
  source: string;
  /** Date.now() */
  now: number;
  /** the server's zone shift of the candle times (minutes east of UTC, in ms): MOEX candles are Moscow wall clock parsed in that zone */
  tzMs: number;
  /** chart time = real UTC ms + offsetMs */
  offsetMs: number;
  /** the newest bar of the chart */
  last: Candle;
}

export type LiveTarget = { kind: "bar"; t: number } | { kind: "reload" };

/**
 * Time of the bar the quote goes into, in the chart's time basis:
 *  - native intervals: the bucket of "now" on the exchange clock;
 *  - aggregated intervals (45m, 2h ...): bars are anchored to the first candle of each day, so the bar continues from the newest one in whole steps; when
 *    the day has changed the anchor is unknown here and the bars must be loaded again ("reload"): the quote must NOT be written into yesterday's last bar.
 */
export function liveTarget(c: LiveContext): LiveTarget {
  const plan = intervalPlan(c.interval, c.source);
  if (plan.ratio > 1) {
    const nowChart = c.now + c.offsetMs;
    if (Math.floor(nowChart / DAY_MS) !== Math.floor(c.last.t / DAY_MS)) return { kind: "reload" };
    if (nowChart <= c.last.t) return { kind: "bar", t: c.last.t };
    return { kind: "bar", t: c.last.t + Math.floor((nowChart - c.last.t) / plan.ms) * plan.ms };
  }
  // spot FX on a Sunday: the daily / weekly bar is the Monday one (the data layer merges the short Sunday bar into Monday)
  const sundayFx = c.source === "forex" && !isIntraday(c.interval) && new Date(c.now).getUTCDay() === 0 ? DAY_MS : 0;
  const nowWall = c.now + (c.source === "moex" ? MSK_MS : 0) + sundayFx;
  return { kind: "bar", t: bucketStartWall(nowWall, c.interval) - c.tzMs };
}

/**
 * The moment a quote belongs to, real UTC ms. A MOEX quote carries the time of its last trade (the free ISS feed is 15 minutes behind, a quiet instrument
 * traded minutes ago, a closed market yesterday): the quote goes into the bar that trade belongs to, so the delayed price lands in the delayed bar, a
 * closed market opens no flat bar per minute / no Saturday day bar, and a quote older than the newest bar is not written over it. Unknown or implausible
 * times (not a time, before 2019, in the future) count as "now".
 */
export function quoteMoment(tradeMs: number, now: number): number {
  const known = Number.isFinite(tradeMs) && tradeMs > Date.UTC(2019, 0, 1) && tradeMs <= now + 5 * 60_000;
  return known ? Math.min(tradeMs, now) : now;
}

/* ── merging ── */

/** The quote written into the chart's series: a new bar at `t` (when it is newer than the newest one) or the newest bar with the price in it. */
export function mergeQuote(last: Candle, t: number, price: number): Candle {
  if (t > last.t) return { t, o: price, h: price, l: price, c: price, v: 0 };
  return { ...last, c: price, h: Math.max(last.h, price), l: Math.min(last.l, price) };
}

/** What the chart remembers of the last quote it drew, per bar (the server's refresh of that bar must not wipe it). */
export interface LiveMemo {
  /** the bar the quote was merged into */
  t: number;
  price: number;
  /** the extremes the quotes drew in that bar */
  hi: number;
  lo: number;
  /** when (Date.now()) */
  at: number;
}

/** The memo after a quote was merged into bar `bar` (the bar as it is now, with the quote in it). */
export function remember(prev: LiveMemo | null, bar: Candle, price: number, now: number): LiveMemo {
  if (prev && prev.t === bar.t) return { t: bar.t, price, hi: Math.max(prev.hi, price), lo: Math.min(prev.lo, price), at: now };
  return { t: bar.t, price, hi: price, lo: price, at: now };
}

/**
 * A bar that came from the server (the 60 s refresh) replaces the live bar: its numbers are the exchange's, but they may be older than the quote that is
 * already on the chart (the 15-minute delayed feed, an hourly bar that does not know the last minutes, a cached answer). While the quote is young the
 * live price and the extremes it drew stay in the bar, so the chart does not jump back and forth between the two sources.
 */
export function keepLive(server: Candle, memo: LiveMemo | null, now: number, maxAgeMs: number): Candle {
  if (!memo || memo.t !== server.t || now - memo.at > maxAgeMs) return server;
  return { ...server, c: memo.price, h: Math.max(server.h, memo.hi, memo.price), l: Math.min(server.l, memo.lo, memo.price) };
}

/**
 * Aggregated intervals only: the refresh asks for a few bars of the base interval, so its aggregation is anchored to some candle in the middle of the day
 * and its bars do not sit on the chart's grid. A refreshed bar is used only when it is the newest bar itself or a whole number of steps after it
 * (same day); anything else would be written into the chart as a junk bar at the end.
 */
export function onChartGrid(candleT: number, lastT: number, stepMs: number): boolean {
  if (candleT === lastT) return true;
  if (candleT < lastT) return false;
  if (Math.floor(candleT / DAY_MS) !== Math.floor(lastT / DAY_MS)) return false;
  return (candleT - lastT) % stepMs === 0;
}

/* ── the retry of a failed live load ── */

/** Pause before the n-th (0-based) retry of a failed load of the live bars: 4 s, 8 s, 16 s, then every 30 s. */
export function retryDelayMs(attempt: number): number {
  return Math.min(30_000, 4_000 * 2 ** Math.max(0, attempt));
}

/* ── an honest "delayed" mark for the quote ── */

/**
 * The public ISS quote says when the last trade it knows of happened (`lagSec` = the feed's clock minus that trade). A lag between five and forty-five
 * minutes on a live market is the free 15-minute delay; less is real time, more is a quiet or closed market (not "delayed").
 */
export function quoteDelayed(lagSec: unknown): boolean {
  return typeof lagSec === "number" && Number.isFinite(lagSec) && lagSec >= 300 && lagSec <= 45 * 60;
}
