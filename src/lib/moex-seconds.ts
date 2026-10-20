/* Second candles of MOEX instruments (shares and futures): the pure core shared by the server (server/moex-trades.ts) and the browser
   (chart/seconds-feed.ts, scripts/check-trades-seconds.ts). No Node, no React, no Next imports.

   Source: T-Invest "обезличенные сделки" (MarketDataService/GetLastTrades = the last hour, MarketDataStream trades = live). A trade carries
   a UTC time (microseconds), a price, a quantity in LOTS and a direction. The server folds the trades into 1-SECOND bars (`SecondBook`, at most
   one hour of them: 3600 numbers-rows per instrument, however busy the instrument is) and sends those on the wire; the browser merges them into
   N-second bars of the chart (`SecondsAgg`). A second without a trade has no bar (no fake flat bars). Volume is in units (lots x lot size),
   the same convention as the ISS / T-Invest minute bars (tinkoff-candles.ts). */

import type { Candle } from "./chart/types";

export const HOUR_MS = 3_600_000;
/** the window GetLastTrades guarantees */
export const WINDOW_MS = HOUR_MS;
/** MSK = UTC+3 all year round (no summer time since 2014) */
export const MSK_MS = 3 * HOUR_MS;

/** MOEX_SECONDS=0 (or false / off / no) switches the whole feature off: the server answers "off", the Секунды group stays hidden for MOEX. */
export function moexSecondsOn(env: Record<string, string | undefined> = process.env): boolean {
  const v = (env.MOEX_SECONDS ?? "").trim().toLowerCase();
  return !(v === "0" || v === "false" || v === "off" || v === "no");
}

/* ── the wire ── */

/** One second of trading on the wire: [second start (UTC ms), open, high, low, close, volume]. Cumulative: a later copy of the same second replaces the earlier one. */
export type SecWire = [number, number, number, number, number, number];

export type SecReason = "off" | "token" | "guest" | "quota" | "unsupported" | "unknown" | "limit" | "error";
export type SecState = "live" | "connecting" | "error";

export interface SecSnapshot {
  ok: true;
  /** room / instrument key ("SBER_TQBR") */
  key: string;
  /** server clock, UTC ms */
  now: number;
  /** first second the bars cover completely (earlier trades are not known): a bar bucket that starts before it is partial */
  since: number;
  /** UTC ms of the newest trade known, 0 when there is none in the window (market closed / quiet instrument) */
  last: number;
  state: SecState;
  bars: SecWire[];
}
export interface SecRefusal {
  ok: false;
  reason: SecReason;
}
export interface SecUpdate {
  key: string;
  bars: SecWire[];
}

/* ── T-Invest trades ── */

export interface RawTrade {
  /** UTC ms (millisecond part of the microsecond time) */
  t: number;
  p: number;
  /** units: lots x lot size */
  v: number;
  buy: boolean;
  /** identity of the trade for de-duplication (the API gives no trade id): the exact time string + price + quantity + direction */
  key: string;
}

/** {units: "274", nano: 660000000} -> 274.66, NaN when absent. */
export function quotationOf(q: unknown): number {
  if (!q || typeof q !== "object") return NaN;
  const { units, nano } = q as { units?: string | number; nano?: number };
  const u = String(units ?? "0").trim();
  const n = Number(nano ?? 0);
  if (!/^-?\d+$/.test(u) || !Number.isFinite(n)) return NaN;
  const neg = u.startsWith("-") || n < 0;
  const abs = Number(`${u.replace("-", "")}.${String(Math.abs(Math.trunc(n))).padStart(9, "0")}`);
  return neg ? -abs : abs;
}

/**
 * A `Trade` of GetLastTrades or of the stream's `trade` message -> RawTrade (null for anything unusable: no price, no quantity, no time).
 * `lot` converts the quantity (lots) to units; int64 fields arrive as strings in the JSON mapping.
 */
export function parseTrade(raw: unknown, lot: number): RawTrade | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { time?: unknown; price?: unknown; quantity?: unknown; direction?: unknown };
  if (typeof r.time !== "string") return null;
  const t = Date.parse(r.time);
  const p = quotationOf(r.price);
  const q = Number(r.quantity);
  if (!Number.isFinite(t) || t < Date.UTC(2019, 0, 1) || !(p > 0) || !(q > 0)) return null;
  const mult = lot > 0 ? lot : 1;
  return { t, p, v: q * mult, buy: r.direction === "TRADE_DIRECTION_BUY", key: `${r.time}|${p}|${q}|${r.direction ?? ""}` };
}

/* ── the server's one-hour book of 1-second bars ── */

interface Sec {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  /** time of the trade that gave the open / the close (ms): trades of one second may arrive out of order (the history after the stream) */
  ot: number;
  ct: number;
}

const KEY_KEEP_MS = 20_000;
const MAX_SECONDS = 3700;

export class SecondBook {
  private secs = new Map<number, Sec>();
  /** keys of the newest trades (the last KEY_KEEP_MS): the same trade from the stream and from the history is counted once */
  private keys = new Map<string, number>();
  /** time of the newest trade added (ms), 0: none */
  maxT = 0;

  get size(): number {
    return this.secs.size;
  }

  /** Adds a trade. Returns the second it went into (UTC ms), or 0 when it was a duplicate / unusable. */
  add(tr: RawTrade): number {
    if (!(tr.p > 0) || !(tr.v >= 0) || !Number.isFinite(tr.t)) return 0;
    if (this.keys.has(tr.key)) return 0;
    this.keys.set(tr.key, tr.t);
    const t = Math.floor(tr.t / 1000) * 1000;
    const s = this.secs.get(t);
    if (!s) {
      this.secs.set(t, { t, o: tr.p, h: tr.p, l: tr.p, c: tr.p, v: tr.v, ot: tr.t, ct: tr.t });
    } else {
      if (tr.t < s.ot) {
        s.o = tr.p;
        s.ot = tr.t;
      }
      if (tr.t >= s.ct) {
        s.c = tr.p;
        s.ct = tr.t;
      }
      if (tr.p > s.h) s.h = tr.p;
      if (tr.p < s.l) s.l = tr.p;
      s.v += tr.v;
    }
    if (tr.t > this.maxT) this.maxT = tr.t;
    return t;
  }

  /** Forget the keys older than the newest trade by KEY_KEEP_MS (call after a batch) and the seconds older than the window / over the cap. */
  trim(nowMs: number): void {
    const keyCut = this.maxT - KEY_KEEP_MS;
    for (const [k, t] of this.keys) if (t < keyCut) this.keys.delete(k);
    const cut = Math.floor((nowMs - WINDOW_MS) / 1000) * 1000;
    for (const t of this.secs.keys()) if (t < cut) this.secs.delete(t);
    if (this.secs.size > MAX_SECONDS) {
      const ts = [...this.secs.keys()].sort((a, b) => a - b);
      for (let i = 0; i < ts.length - MAX_SECONDS; i++) this.secs.delete(ts[i]);
    }
  }

  /** The seconds `ts` (ascending, the ones that exist) on the wire. */
  wire(ts?: Iterable<number>): SecWire[] {
    const list: Sec[] = [];
    if (ts) {
      for (const t of ts) {
        const s = this.secs.get(t);
        if (s) list.push(s);
      }
    } else {
      for (const s of this.secs.values()) list.push(s);
    }
    list.sort((a, b) => a.t - b.t);
    return list.map((s) => [s.t, s.o, s.h, s.l, s.c, s.v]);
  }
}

/** First second of the history window that is whole, for a window that starts at `fromMs`. */
export function windowSince(fromMs: number): number {
  return Math.ceil(fromMs / 1000) * 1000;
}

/* ── the browser: 1-second bars -> N-second bars ── */

/**
 * Holds the 1-second bars the server sent (chart time = UTC + `offsetMs`) and builds the N-second bars of the chart from them.
 * The server's bars are cumulative (a second that is still forming is sent again and again), so they are stored per second and
 * the N-second bar is re-built from its seconds each time: nothing is ever counted twice.
 *   - an N-second bucket that starts before `since` is partial (its first seconds are older than the history window) and is not drawn;
 *   - seconds without trades give no bar; a bucket with at least one traded second is a bar.
 */
export class SecondsAgg {
  private m = new Map<number, SecWire>();
  /** chart time of the first whole second (-Infinity until the first snapshot) */
  private sinceChart = -Infinity;

  constructor(
    readonly periodMs: number,
    readonly offsetMs: number,
  ) {}

  /** Bucket (chart time) of a second at chart time `ct`. Buckets are aligned to the exchange clock (a multiple of the period since midnight MSK). */
  bucketOf(ct: number): number {
    return Math.floor(ct / this.periodMs) * this.periodMs;
  }

  /** The first snapshot says where the history starts (UTC ms); later ones never move it forward (the browser keeps what it has). */
  setSince(utcMs: number): void {
    const c = utcMs + this.offsetMs;
    if (this.sinceChart === -Infinity || c < this.sinceChart) this.sinceChart = c;
  }

  /** Takes wire bars (UTC seconds), returns the N-second bars that changed, ascending. */
  apply(bars: readonly SecWire[]): Candle[] {
    const touched = new Set<number>();
    for (const w of bars) {
      if (!Array.isArray(w) || !(w[4] > 0) || !Number.isFinite(w[0])) continue;
      const ct = w[0] + this.offsetMs;
      this.m.set(ct, [ct, w[1], w[2], w[3], w[4], w[5]]);
      touched.add(this.bucketOf(ct));
    }
    return this.build([...touched].sort((a, b) => a - b));
  }

  /** Every N-second bar, ascending. */
  all(): Candle[] {
    const buckets = new Set<number>();
    for (const ct of this.m.keys()) buckets.add(this.bucketOf(ct));
    return this.build([...buckets].sort((a, b) => a - b));
  }

  private build(buckets: number[]): Candle[] {
    const out: Candle[] = [];
    const n = Math.round(this.periodMs / 1000);
    for (const b of buckets) {
      if (b < this.sinceChart) continue;
      let bar: Candle | null = null;
      for (let k = 0; k < n; k++) {
        const w = this.m.get(b + k * 1000);
        if (!w) continue;
        if (!bar) bar = { t: b, o: w[1], h: w[2], l: w[3], c: w[4], v: w[5] };
        else {
          if (w[2] > bar.h) bar.h = w[2];
          if (w[3] < bar.l) bar.l = w[3];
          bar.c = w[4];
          bar.v += w[5];
        }
      }
      if (bar) out.push(bar);
    }
    return out;
  }
}
