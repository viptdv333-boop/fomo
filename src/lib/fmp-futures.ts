/**
 * FMP candles for the terminal (server only): US exchange futures (CME / CBOT / NYMEX / COMEX / ICE US, FMP's continuous front-month
 * series CLUSD GCUSD NGUSD ... see us-futures.ts) and, through the same code, every other `source: "fmp"` symbol (US stocks).
 *
 *   getFmpFuturesCandles(symbol, interval, { from?, to?, limit })  ->  { candles (ascending, UTC epoch ms), error?, detail?, stale?, ... }
 *
 * What the provider gives (Ultimate plan: 1-minute charts, 3000 calls a minute, full history) and what is derived here:
 *
 *   interval          source                                          bar start
 *   1  5  60          native /historical-chart/{1min|5min|1hour}      the provider's own time
 *   15  30            aggregated from 5min                            UTC clock multiple of 15 / 30 minutes
 *   240 (4h)          aggregated from 1hour, SESSION aligned          Globex session open 18:00 US Eastern (17:00 CT) + k x 4h:
 *                                                                     18:00 22:00 02:00 06:00 10:00 14:00 (the last one is 3 h long: the
 *                                                                     17:00-18:00 maintenance break has no bars). Anchored in the Eastern
 *                                                                     wall clock, so it follows daylight saving time. Stocks (not a
 *                                                                     CME symbol): anchored at the cash open 09:30 ET instead.
 *   D                 native /historical-price-eod/full               00:00 UTC of the TRADE date; the newest session, when the EOD
 *                                                                     table lags, is built from the 1hour bars (see dailyTail)
 *   W                 aggregated from D                               Monday 00:00 UTC (ISO weeks)
 *   M, Y              aggregated from D                               1st of the month / Jan 1st, 00:00 UTC
 *
 * Aggregation: open = first, close = last, high / low = max / min, volume = sum. Rows with a zero / missing price are dropped (a
 * NEGATIVE price is real: WTI settled at -37.63 on 2020-04-20), duplicates are merged, the result is sorted ascending and passed through
 * chart/candles.ts (cleanCandle) like every other source.
 *
 * Time: FMP prints intraday times as US Eastern wall clock (the same convention as the forex layer: FOREX_FMP_TZ, or FMP_FUTURES_TZ for
 * futures only, both default America/New_York); they are converted to real UTC epoch ms. Daily dates are plain calendar dates (UTC midnight).
 * A Sunday-dated EOD row (a Globex week-open session) is merged into the Monday that follows it, a Saturday row is dropped.
 *
 * History paging: when the chart scrolls back it asks for `to` = the time before its oldest bar. The raw rows are fetched in date windows
 * (from / to are calendar dates in the provider's time) going back until `limit` bars exist: 1min 4 days, 5min 21 days, 1hour 180 days,
 * EOD 12 years per call, at most MAX_CALLS (6) windows per request. A window shares its boundary day with its neighbour and rows are merged by
 * time, so nothing is lost at the seams. Nothing assumes a response is complete: the next window starts at the OLDEST row actually
 * received, so a silently truncated answer only costs one more call. The paging stops when a window brings nothing older (the symbol's
 * first data; remembered for 6 h so scrolling further back costs no call) or after an empty window.
 *
 * Contract rolls: FMP's series is the continuous front month. The price jumps at a roll (contango / backwardation) and a gap can appear;
 * nothing is back-adjusted here, deliberately.
 *
 * Errors are never silent: a failed provider call is reported as `error: "limit" | "plan" | "network"` with a `detail` (see fmp-gate.ts,
 * which also keeps the cooldown / denial memory shared with the quotes and the forex layer). Cached windows are served stale when the
 * provider fails or is cooling down (`stale: true`).
 */

import { cleanCandle } from "./chart/candles";
import { fmpSymbol } from "./fmp-alias";
import { fmpRequest, type FmpErrorKind, type FmpFailure } from "./fmp-gate";
import { FMP_INTRADAY_TZ, tzOffsetMs } from "./forex";
import { usFutureBySymbol } from "./us-futures";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Provider windows per request (the latency and the spend of one chart load / scroll-back page). */
export const MAX_CALLS = 6;
/** Fresh time of a window that touches the present; windows entirely in the past never change. */
const TTL_LIVE_INTRADAY = 15_000;
const TTL_LIVE_EOD = 60_000;
const TTL_OLD = 6 * HOUR;
/** A cached window is kept this long for the stale fallback. */
const KEEP_STALE = 24 * HOUR;
const MAX_CACHED_ROWS = 300_000;

export interface FmpBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FmpCandlesOptions {
  /** lower bound, UTC ms (inclusive) */
  from?: number;
  /** upper bound, UTC ms (inclusive): the chart scrolled back to this time. Absent: up to now */
  to?: number;
  /** newest bars wanted (default 300, at most 5000) */
  limit?: number;
}

export interface FmpCandlesResult {
  candles: FmpBar[];
  /** the provider failed for (part of) the request; `candles` may still hold what was fetched or cached */
  error?: FmpErrorKind;
  detail?: string;
  retryAfterSec?: number;
  /** some bars come from the cache after a provider failure / cooldown */
  stale?: boolean;
  /** the symbol has no older data than the oldest bar returned */
  reachedStart: boolean;
  /** "globex": CME-style session day from 18:00 ET; "cash": 09:30 ET */
  session: Session;
  /** provider windows looked at (cache hits included) */
  windows: number;
}

export type Session = "globex" | "cash";

interface Plan {
  endpoint: "intraday" | "eod";
  /** the provider's interval name, or "eod" */
  raw: string;
  bucket: "none" | "fixed" | "session" | "W" | "M" | "Y";
  bucketMs: number;
  /** raw rows per terminal bar (sizes the request) */
  ratio: number;
  /** calendar days per provider call */
  chunkDays: number;
  /** raw rows per calendar day (weekends included) */
  density: number;
  /** consecutive empty windows tolerated after data was seen before the paging stops */
  tolerance: number;
}

const PLANS: Record<string, Plan> = {
  "1": { endpoint: "intraday", raw: "1min", bucket: "none", bucketMs: MIN, ratio: 1, chunkDays: 4, density: 986, tolerance: 1 },
  "5": { endpoint: "intraday", raw: "5min", bucket: "none", bucketMs: 5 * MIN, ratio: 1, chunkDays: 21, density: 197, tolerance: 0 },
  "15": { endpoint: "intraday", raw: "5min", bucket: "fixed", bucketMs: 15 * MIN, ratio: 3, chunkDays: 21, density: 197, tolerance: 0 },
  "30": { endpoint: "intraday", raw: "5min", bucket: "fixed", bucketMs: 30 * MIN, ratio: 6, chunkDays: 21, density: 197, tolerance: 0 },
  "60": { endpoint: "intraday", raw: "1hour", bucket: "none", bucketMs: HOUR, ratio: 1, chunkDays: 180, density: 16, tolerance: 0 },
  "240": { endpoint: "intraday", raw: "1hour", bucket: "session", bucketMs: 4 * HOUR, ratio: 4, chunkDays: 180, density: 16, tolerance: 0 },
  D: { endpoint: "eod", raw: "eod", bucket: "none", bucketMs: DAY, ratio: 1, chunkDays: 12 * 365, density: 0.69, tolerance: 0 },
  W: { endpoint: "eod", raw: "eod", bucket: "W", bucketMs: 7 * DAY, ratio: 5, chunkDays: 12 * 365, density: 0.69, tolerance: 0 },
  M: { endpoint: "eod", raw: "eod", bucket: "M", bucketMs: 30 * DAY, ratio: 22, chunkDays: 12 * 365, density: 0.69, tolerance: 0 },
  Y: { endpoint: "eod", raw: "eod", bucket: "Y", bucketMs: 365 * DAY, ratio: 253, chunkDays: 12 * 365, density: 0.69, tolerance: 0 },
};

export const FMP_FUTURES_INTERVALS = Object.keys(PLANS);

const tz = () => process.env.FMP_FUTURES_TZ || FMP_INTRADAY_TZ;
const SESSION_ANCHOR_MIN: Record<Session, number> = { globex: 18 * 60, cash: 9 * 60 + 30 };

/** CME-style continuous futures (the curated list) get the Globex session day; anything else is treated as a stock. */
export function fmpSession(symbol: string): Session {
  return usFutureBySymbol(fmpSymbol(symbol)) ? "globex" : "cash";
}

/* ───────────── time helpers ───────────── */

/**
 * Offset of `zone` from UTC (ms, east positive) at the instant `utcMs`, cached per UTC hour: zones change their offset only on a whole
 * UTC hour, so the offset at the start of the hour is the offset of every instant in it. (tzOffsetMs formats a date through Intl: far too
 * slow to call for every one of tens of thousands of rows.)
 */
const offCache = new Map<string, number>();
function offAt(utcMs: number, zone: string): number {
  const h = Math.floor(utcMs / HOUR);
  const key = `${zone}|${h}`;
  let v = offCache.get(key);
  if (v === undefined) {
    if (offCache.size > 60_000) offCache.clear();
    v = tzOffsetMs(h * HOUR, zone);
    offCache.set(key, v);
  }
  return v;
}

/** Wall clock (pseudo-UTC ms: the wall fields read with UTC getters) -> real UTC ms in `zone`; the offset is looked up twice for the DST edges. */
function wallMsToUtc(wallMs: number, zone: string): number {
  let t = wallMs - offAt(wallMs, zone);
  t = wallMs - offAt(t, zone);
  return t;
}

/** "2026-10-02 16:59:00" / "2026-10-02" read as the wall clock of `zone` -> UTC ms (NaN when unreadable). Same result as forex.ts wallToUtc, but cached. */
export function parseWall(str: string, zone: string): number {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?/.exec(str);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  return zone === "UTC" ? wall : wallMsToUtc(wall, zone);
}

/** Calendar day number (days since 1970-01-01) of an instant on the provider's wall clock. */
const wallDay = (utcMs: number) => Math.floor((utcMs + offAt(utcMs, tz())) / DAY);
const ymdOfDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * Start (UTC ms) of the session-aligned bucket that contains `t`: buckets of `bucketMs` counted from the session open (`anchorMin`
 * minutes after midnight on the Eastern wall clock). Globex 18:00: 18, 22, 02, 06, 10, 14; cash 09:30: 09:30, 13:30, 17:30 ...
 */
export function sessionBucketStart(t: number, bucketMs: number, anchorMin: number, zone = tz()): number {
  const shifted = t + offAt(t, zone) - anchorMin * MIN;
  const dayIdx = Math.floor(shifted / DAY);
  const k = Math.floor((shifted - dayIdx * DAY) / bucketMs);
  return wallMsToUtc(dayIdx * DAY + anchorMin * MIN + k * bucketMs, zone);
}

/** Trade date (day number; its UTC midnight is the daily bar time) of an instant: Globex rolls to the next date at 18:00 ET and never lands on a weekend. */
export function tradeDay(t: number, session: Session, zone = tz()): number {
  const wall = t + offAt(t, zone);
  let day = Math.floor(wall / DAY);
  if (session === "globex") {
    if (wall - day * DAY >= SESSION_ANCHOR_MIN.globex * MIN) day += 1;
    const dow = (day + 4) % 7; // 1970-01-01 was a Thursday; 0 = Sunday
    if (dow === 6) day += 2;
    else if (dow === 0) day += 1;
  }
  return day;
}

/* ───────────── rows ───────────── */

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);
/** A usable price: finite and not zero (negative is legitimate: WTI 2020-04-20). */
const px = (v: number) => Number.isFinite(v) && v !== 0;

/** Provider JSON (newest first, {date, open, high, low, close, volume}) -> ascending bars in UTC ms; junk rows are dropped, duplicate times merged (last wins). */
export function parseRows(json: unknown, endpoint: "intraday" | "eod"): FmpBar[] {
  const arr = Array.isArray(json) ? json : (json as { historical?: unknown[] } | null)?.historical;
  if (!Array.isArray(arr)) return [];
  const zone = endpoint === "eod" ? "UTC" : tz();
  const byTs = new Map<number, FmpBar>();
  for (const r of arr as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const t = parseWall(String(r.date), zone);
    const c = num(r.close);
    let o = num(r.open);
    let h = num(r.high);
    let l = num(r.low);
    // no close, or nothing but a close: not a bar
    if (!Number.isFinite(t) || !px(c) || (!px(o) && !px(h) && !px(l))) continue;
    if (!px(o)) o = c;
    if (!px(h)) h = Math.max(o, c);
    if (!px(l)) l = Math.min(o, c);
    const v = num(r.volume);
    byTs.set(t, { timestamp: t, open: o, high: h, low: l, close: c, volume: v > 0 ? v : 0 });
  }
  return [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** Merges consecutive bars whose key is equal (rows must be ascending); the bar time becomes the key. */
function bucketRows(rows: FmpBar[], keyOf: (t: number) => number): FmpBar[] {
  const out: FmpBar[] = [];
  let cur: FmpBar | null = null;
  for (const c of rows) {
    const k = keyOf(c.timestamp);
    if (!cur || cur.timestamp !== k) {
      cur = { ...c, timestamp: k };
      out.push(cur);
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return out;
}

/** 15m / 30m ...: fixed windows on the UTC clock. */
export const aggregateFixed = (rows: FmpBar[], bucketMs: number) => bucketRows(rows, (t) => Math.floor(t / bucketMs) * bucketMs);

/** 4h: windows counted from the session open of the Eastern wall clock. */
export const aggregateSession = (rows: FmpBar[], bucketMs: number, session: Session) => bucketRows(rows, (t) => sessionBucketStart(t, bucketMs, SESSION_ANCHOR_MIN[session]));

export function periodStart(ts: number, iv: "W" | "M" | "Y"): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  if (iv === "Y") {
    d.setUTCMonth(0, 1);
  } else if (iv === "M") {
    d.setUTCDate(1);
  } else {
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  }
  return d.getTime();
}

/** W / M / Y from daily bars (ISO weeks start on Monday). */
export const aggregatePeriods = (days: FmpBar[], iv: "W" | "M" | "Y") => bucketRows(days, (t) => periodStart(t, iv));

/** A Sunday-dated daily row (the Globex week-open session) belongs to the Monday that follows it; a Saturday row is an artefact. */
export function normalizeDaily(rows: FmpBar[]): FmpBar[] {
  const out: FmpBar[] = [];
  for (const c of rows) {
    const dow = new Date(c.timestamp).getUTCDay();
    if (dow === 6) continue;
    const t = dow === 0 ? c.timestamp + DAY : c.timestamp;
    const last = out[out.length - 1];
    if (last && last.timestamp === t) {
      last.high = Math.max(last.high, c.high);
      last.low = Math.min(last.low, c.low);
      last.close = c.close;
      last.volume += c.volume;
    } else out.push({ ...c, timestamp: t });
  }
  return out;
}

/**
 * The newest session(s) the EOD table does not have yet (it is written after the close; during a session its newest row is missing or
 * lags) built from hourly bars: every trade date after the newest EOD date becomes a daily bar. Nothing before it is touched.
 */
export function dailyTail(daily: FmpBar[], hourly: FmpBar[], session: Session): FmpBar[] {
  if (daily.length === 0) return daily;
  const newest = daily[daily.length - 1].timestamp;
  const extra = bucketRows(
    hourly.filter((h) => tradeDay(h.timestamp, session) * DAY > newest),
    (t) => tradeDay(t, session) * DAY
  );
  return extra.length ? [...daily, ...extra] : daily;
}

/* ───────────── provider windows: cache, in-flight, stale ───────────── */

interface CacheEntry {
  at: number;
  ttl: number;
  rows: FmpBar[];
}
interface State {
  cache: Map<string, CacheEntry>;
  rows: number;
  inflight: Map<string, Promise<WindowResult>>;
  /** "raw|symbol" -> no data older than ts (until) */
  floor: Map<string, { ts: number; until: number }>;
  /** "raw|symbol" -> nothing at all (until) */
  none: Map<string, number>;
}
const G = globalThis as unknown as { __fomoFmpFutures?: State };
const S: State = (G.__fomoFmpFutures ??= { cache: new Map(), rows: 0, inflight: new Map(), floor: new Map(), none: new Map() });

/** Forget the caches and the paging memory (tests). The cooldown / denial memory lives in fmp-gate.ts. */
export function fmpFuturesReset(): void {
  S.cache.clear();
  S.rows = 0;
  S.inflight.clear();
  S.floor.clear();
  S.none.clear();
}

interface WindowResult {
  /** null: nothing usable (see `fail`) */
  bars: FmpBar[] | null;
  stale?: boolean;
  fail?: FmpFailure;
}

function remember(key: string, rows: FmpBar[], ttl: number) {
  const old = S.cache.get(key);
  if (old) {
    S.rows -= old.rows.length;
    S.cache.delete(key); // re-inserted below: the Map order is the age order
  }
  S.cache.set(key, { at: Date.now(), ttl, rows });
  S.rows += rows.length;
  for (const k of S.cache.keys()) {
    if ((S.rows <= MAX_CACHED_ROWS && S.cache.size <= 400) || k === key) break;
    S.rows -= S.cache.get(k)!.rows.length;
    S.cache.delete(k);
  }
}

/** One provider call: raw rows of the calendar days [startDay, endDay] (provider time), ascending. */
async function getWindow(plan: Plan, sym: string, startDay: number, endDay: number): Promise<WindowResult> {
  const key = `${plan.raw}|${sym}|${startDay}|${endDay}`;
  const now = Date.now();
  const hit = S.cache.get(key);
  if (hit && now - hit.at < hit.ttl) return { bars: hit.rows };
  const running = S.inflight.get(key);
  if (running) return running;
  const live = endDay >= wallDay(now) - 1;
  const ttl = live ? (plan.endpoint === "intraday" ? TTL_LIVE_INTRADAY : TTL_LIVE_EOD) : TTL_OLD;
  const p = (async (): Promise<WindowResult> => {
    const path =
      plan.endpoint === "eod"
        ? `/historical-price-eod/full?symbol=${encodeURIComponent(sym)}&from=${ymdOfDay(startDay)}&to=${ymdOfDay(endDay)}`
        : `/historical-chart/${plan.raw}?symbol=${encodeURIComponent(sym)}&from=${ymdOfDay(startDay)}&to=${ymdOfDay(endDay)}`;
    const r = await fmpRequest(plan.endpoint, sym, path);
    if (r.ok) {
      const rows = parseRows(r.json, plan.endpoint);
      remember(key, rows, ttl);
      return { bars: rows };
    }
    // the provider failed or is cooling down: the last copy of this window, however old (up to a day), is better than a blank chart
    const stale = S.cache.get(key);
    if (stale && Date.now() - stale.at < KEEP_STALE) return { bars: stale.rows, stale: true, fail: r };
    return { bars: null, fail: r };
  })().finally(() => S.inflight.delete(key));
  S.inflight.set(key, p);
  return p;
}

/* ───────────── paging ───────────── */

interface Collected {
  bars: Map<number, FmpBar>;
  windows: number;
  fail?: FmpFailure;
  stale: boolean;
  /** no older data exists */
  reachedStart: boolean;
  /** the caller's `from` bound was reached */
  reachedFrom: boolean;
}

async function collect(plan: Plan, sym: string, need: number, toMs: number | undefined, fromMs: number | undefined): Promise<Collected> {
  const out: Collected = { bars: new Map(), windows: 0, stale: false, reachedStart: false, reachedFrom: false };
  const ref = toMs ?? Date.now();
  // the live edge looks one day past "today" so a wrong guess of the provider's clock cannot hide the newest bars
  let endDay = wallDay(ref) + (toMs === undefined ? 1 : 0);
  const fromDay = fromMs !== undefined ? wallDay(fromMs) : -Infinity;
  let size = Math.min(plan.chunkDays, Math.max(3, Math.ceil((need * 1.3) / plan.density) + 3));
  let oldest = Infinity;
  let empties = 0;
  let enough = 0;
  while (out.windows < MAX_CALLS) {
    const startDay = Math.max(endDay - size + 1, fromDay);
    const w = await getWindow(plan, sym, startDay, endDay);
    out.windows++;
    if (w.fail) out.fail = w.fail;
    if (w.stale) out.stale = true;
    if (!w.bars) break; // a failure with nothing cached: stop, report it
    const rows = w.bars;
    for (const b of rows) {
      if (!out.bars.has(b.timestamp) && b.timestamp <= ref) enough++;
      out.bars.set(b.timestamp, b);
    }
    if (rows.length > 0 && rows[0].timestamp < oldest) {
      // progress: older rows than before
      empties = 0;
      oldest = rows[0].timestamp;
      if (enough >= need) break;
      if (startDay <= fromDay) {
        out.reachedFrom = true;
        break;
      }
      // continue from the oldest row really received (a truncated answer costs one more call, never a hole); both ends are inclusive
      // calendar days, so the boundary day is read twice: one day of overlap, and a response cut at its newest rows still moves back
      endDay = Math.min(startDay, wallDay(oldest));
    } else {
      // an empty window, or one that only repeated what we have: before the first rows (the weekend at the live edge) just step back;
      // after them it is the end of the data (after `tolerance` such windows)
      if (out.bars.size > 0 && ++empties > plan.tolerance) {
        out.reachedStart = true;
        break;
      }
      if (startDay <= fromDay) {
        out.reachedFrom = true;
        break;
      }
      endDay = startDay;
    }
    size = plan.chunkDays;
  }
  return out;
}

/** The hourly bars of the last days (shared with the 1h chart's window cache when the dates match). Failures are not reported. */
async function recentHours(sym: string): Promise<FmpBar[]> {
  const today = wallDay(Date.now());
  const w = await getWindow(PLANS["60"], sym, today - 4, today + 1);
  return w.bars ?? [];
}

/* ───────────── the public call ───────────── */

async function run(symbol: string, interval: string, opts: FmpCandlesOptions): Promise<FmpCandlesResult> {
  const sym = fmpSymbol(symbol).toUpperCase();
  const session = fmpSession(symbol);
  const plan = PLANS[interval];
  const empty = (extra: Partial<FmpCandlesResult> = {}): FmpCandlesResult => ({ candles: [], reachedStart: false, session, windows: 0, ...extra });
  if (!plan) return empty({ detail: "unsupported-interval" });
  const limit = Math.max(1, Math.min(Math.floor(opts.limit ?? 300) || 300, 5000));
  const { from, to } = opts;
  const memKey = `${plan.raw}|${sym}`;
  const now = Date.now();

  // scrolling back past the first data the symbol has: no call
  const fl = S.floor.get(memKey);
  if (to !== undefined && fl && fl.until > now && to < fl.ts) return empty({ reachedStart: true });
  const none = S.none.get(memKey);
  if (to === undefined && none && none > now) return empty({ reachedStart: true, detail: "no-data" });

  const need = (limit + 1) * plan.ratio;
  const got = await collect(plan, sym, need, to, from);
  let rows = [...got.bars.values()].sort((a, b) => a.timestamp - b.timestamp);

  if (rows.length === 0) {
    if (!got.fail) {
      // a clean empty answer: this symbol has nothing here (remembered, so a wrong symbol does not cost windows on every request)
      if (to === undefined) S.none.set(memKey, now + 10 * MIN);
      else S.floor.set(memKey, { ts: to, until: now + 30 * MIN });
    }
    return empty({ error: got.fail?.error, detail: got.fail?.detail ?? "no-data", retryAfterSec: got.fail?.retryAfterSec, windows: got.windows, reachedStart: !got.fail, stale: got.stale || undefined });
  }
  if (got.reachedStart) S.floor.set(memKey, { ts: rows[0].timestamp, until: now + TTL_OLD });

  // derive the terminal's bars
  let bars: FmpBar[];
  if (plan.bucket === "fixed") bars = aggregateFixed(rows, plan.bucketMs);
  else if (plan.bucket === "session") bars = aggregateSession(rows, plan.bucketMs, session);
  else if (plan.endpoint === "eod") {
    bars = normalizeDaily(rows);
    // the live edge of a daily-family chart: add the session(s) the EOD table does not have yet
    if (to === undefined) bars = dailyTail(bars, await recentHours(sym), session);
    if (plan.bucket === "W" || plan.bucket === "M" || plan.bucket === "Y") bars = aggregatePeriods(bars, plan.bucket);
  } else bars = rows;

  // the oldest bucket is incomplete when the raw rows stop short of it (call cap / enough rows), not at the symbol's first data
  if (plan.bucket !== "none" && !got.reachedStart && !got.reachedFrom && bars.length > 1) bars = bars.slice(1);
  if (to !== undefined) bars = bars.filter((b) => b.timestamp <= to);
  if (from !== undefined) bars = bars.filter((b) => b.timestamp >= from);
  bars = bars.slice(-limit);

  // drawable bars (chart/candles.ts): the same sanitising as the other sources
  const candles: FmpBar[] = [];
  let prev: number | undefined;
  for (const b of bars) {
    const c = cleanCandle({ t: b.timestamp, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }, prev);
    if (!c) continue;
    candles.push({ timestamp: c.t, open: c.o, high: c.h, low: c.l, close: c.c, volume: c.v });
    prev = c.c;
  }
  return {
    candles,
    error: got.fail?.error,
    detail: got.fail?.detail,
    retryAfterSec: got.fail?.retryAfterSec,
    stale: got.stale || undefined,
    reachedStart: got.reachedStart,
    session,
    windows: got.windows,
  };
}

/** Never throws: a failure inside is reported as a network error. */
export async function getFmpFuturesCandles(symbol: string, interval: string, opts: FmpCandlesOptions = {}): Promise<FmpCandlesResult> {
  try {
    return await run(symbol, interval, opts);
  } catch {
    return { candles: [], error: "network", detail: "exception", reachedStart: false, session: fmpSession(symbol), windows: 0 };
  }
}

/* exported for scripts/check-fmp-futures.ts */
export const __test = { PLANS, parseWall, parseRows, aggregateFixed, aggregateSession, aggregatePeriods, normalizeDaily, dailyTail, sessionBucketStart, tradeDay, periodStart, wallDay, ymdOfDay };
