/**
 * FOREX data layer (server only): spot currency pairs and metals vs USD for the terminal.
 *
 *   getForexQuote(symbol)                              -> last price + day change
 *   getForexCandles(symbol, interval, from?, to?, n?)  -> OHLC bars, ascending, UTC epoch ms
 *
 * Providers are pluggable (see FOREX_PROVIDERS) and tried in order; a provider that answers 401 / 402 / 403 / 429 / empty is
 * remembered as "denied" for a while (so a plan restriction costs ONE upstream call, not one per request) and the next one is used.
 *
 *   fmp    Financial Modeling Prep (official, the key is FMP_API_KEY from the environment, /stable endpoints). Free / basic plans
 *          serve only some pairs and no intraday charts; a paid plan serves everything. 250 calls a day on the free plan.
 *   stooq  keyless CSV (daily / weekly / monthly only). Since 2025 stooq.com answers a JS proof-of-work page to non-browsers, which is
 *          detected and switches the provider off for hours; kept for the day it is open again.
 *   yahoo  UNOFFICIAL FALLBACK: Yahoo Finance's public chart endpoint (query1.finance.yahoo.com/v8/finance/chart). No key, no
 *          contract, no SLA: Yahoo's terms do not license redistribution, the endpoint may change or block at any time. Used with
 *          timeouts, caching, request de-duplication and a circuit breaker; never scraped in loops.
 *
 * Honest data notes: spot FX has no central exchange, so there is no real volume. FMP daily bars carry a TICK volume, Yahoo none
 * (0). The market is continuous 24x5 (Sunday ~21:00 UTC to Friday ~21:00 UTC). Candle times are real UTC epoch ms (not wall clocks).
 */

import { FX_PAIRS, fxDigits, parseFxSymbol } from "./forex-meta";
import { fmpGateCheck, fmpGateReport } from "./fmp-gate";

export type ForexProviderName = "fmp" | "stooq" | "yahoo";

export interface FxCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FxQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  /** ISO time of the last update */
  time: string;
}

/** "tick": the provider's tick count (not an exchange volume); "none": no volume; "futures": real volume of the proxy futures contract (metals) */
export type FxVolume = "tick" | "none" | "futures";

export interface ForexQuoteResult {
  quote: FxQuote;
  provider: ForexProviderName;
  /** the symbol is served by a proxy instrument (metals on Yahoo: COMEX futures instead of spot) */
  proxy?: string;
}

export interface ForexCandlesResult {
  candles: FxCandle[];
  provider: ForexProviderName | "none";
  /** "tick": tick count of the provider (not an exchange volume); "none": the provider has no volume */
  volume: FxVolume;
  proxy?: string;
  /** why the answer is empty (diagnostics) */
  reason?: string;
}

type Fail = "denied" | "empty" | "rate" | "error" | "unsupported";
type R<T> = { ok: true; data: T; proxy?: string } | { ok: false; reason: Fail; status?: number; /** deny the whole kind (endpoint), not just this symbol */ wide?: boolean; ttlMs?: number };
type Failure = Extract<R<unknown>, { ok: false }>;
type CandleData = { candles: FxCandle[]; volume: FxVolume };
type Kind = "quote" | "intraday" | "daily";

export interface ForexProvider {
  name: ForexProviderName;
  quote?(symbol: string): Promise<R<FxQuote>>;
  candles?(symbol: string, interval: string, from: number | undefined, to: number | undefined, limit: number): Promise<R<CandleData>>;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const TIMEOUT_MS = 9_000;
const UA = "Mozilla/5.0 (compatible; fomo-terminal/1.0; +https://fomo.spot)";

const isDaily = (iv: string) => iv === "D" || iv === "W" || iv === "M";
const kindOf = (iv: string): Kind => (isDaily(iv) ? "daily" : "intraday");
const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN);
const round = (v: number, digits: number) => Number(v.toFixed(digits));

/* ── shared state (survives dev hot reloads) ── */

interface State {
  cache: Map<string, { at: number; ttl: number; v: unknown }>;
  inflight: Map<string, Promise<unknown>>;
  deny: Map<string, number>;
  fmpDay: string;
  fmpCalls: number;
}
const G = globalThis as unknown as { __fomoForex?: State };
const S: State = (G.__fomoForex ??= { cache: new Map(), inflight: new Map(), deny: new Map(), fmpDay: "", fmpCalls: 0 });

/** Result cache with a shared in-flight request; a stale copy (up to 10 x ttl) is served when the producer fails. */
async function cached<T>(key: string, ttl: number, produce: () => Promise<T | null>): Promise<T | null> {
  const hit = S.cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.v as T | null;
  const running = S.inflight.get(key);
  if (running) return (await running) as T | null;
  const p = (async () => {
    let v: T | null = null;
    try {
      v = await produce();
    } catch {
      v = null;
    }
    if (v === null && hit && Date.now() - hit.at < hit.ttl * 10) return hit.v as T | null;
    // a failure is remembered for a few seconds only, so a broken upstream is not hit on every request
    S.cache.set(key, { at: Date.now(), ttl: v === null ? Math.min(ttl, 5_000) : ttl, v });
    if (S.cache.size > 800) {
      const cut = Date.now() - 20 * MIN;
      for (const [k, e] of S.cache) if (e.at < cut) S.cache.delete(k);
    }
    return v;
  })().finally(() => S.inflight.delete(key));
  S.inflight.set(key, p);
  return (await p) as T | null;
}

function denied(name: string, kind: Kind, symbol: string): boolean {
  const now = Date.now();
  for (const k of [`${name}|*|*`, `${name}|${kind}|*`, `${name}|${kind}|${symbol}`]) {
    const until = S.deny.get(k);
    if (until && until > now) return true;
  }
  return false;
}

function applyDeny(name: string, kind: Kind, symbol: string, f: { reason: Fail; wide?: boolean; ttlMs?: number }) {
  const until = (ms: number) => Date.now() + ms;
  if (f.reason === "rate") S.deny.set(`${name}|*|*`, until(f.ttlMs ?? 60_000));
  else if (f.reason === "denied") S.deny.set(`${name}|${kind}|${f.wide ? "*" : symbol}`, until(f.ttlMs ?? 6 * HOUR));
  else if (f.reason === "error") S.deny.set(`${name}|${kind}|*`, until(f.ttlMs ?? 15_000));
  else if (f.reason === "empty" && f.ttlMs) S.deny.set(`${name}|${kind}|${symbol}`, until(f.ttlMs));
}

/** For diagnostics (scripts/check-forex.ts and the klines headers): what is switched off right now. */
export function forexDenied(): Record<string, number> {
  const out: Record<string, number> = {};
  const now = Date.now();
  for (const [k, v] of S.deny) if (v > now) out[k] = Math.round((v - now) / 1000);
  return out;
}

async function http(url: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": UA, ...headers } });
  return { status: res.status, text: await res.text() };
}

/* ── time helpers ── */

const dtfCache = new Map<string, Intl.DateTimeFormat>();
export function tzOffsetMs(utcMs: number, tz: string): number {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    dtfCache.set(tz, f);
  }
  const p: Record<string, number> = {};
  for (const x of f.formatToParts(new Date(utcMs))) if (x.type !== "literal") p[x.type] = Number(x.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

/** "2026-10-02 16:59:00" read as a wall clock of `tz` -> UTC ms (NaN for an unreadable string). */
export function wallToUtc(wall: string, tz: string): number {
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[ T](\d\d):(\d\d)(?::(\d\d))?)?/.exec(wall);
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  let t = asUtc - tzOffsetMs(asUtc, tz);
  t = asUtc - tzOffsetMs(t, tz); // once more: the offset at the real instant (DST edges)
  return t;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ── bar helpers ── */

/** Buckets bars into fixed UTC-aligned windows (4h) with plain OHLCV aggregation. Ascending in, ascending out. */
function bucketBars(rows: FxCandle[], bucketMs: number): FxCandle[] {
  const out: FxCandle[] = [];
  let cur: FxCandle | null = null;
  for (const c of rows) {
    const t = Math.floor(c.timestamp / bucketMs) * bucketMs;
    if (!cur || cur.timestamp !== t) {
      cur = { ...c, timestamp: t };
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

/** UTC calendar week (Monday) / month start of a timestamp. */
function periodStart(ts: number, iv: "W" | "M"): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  if (iv === "M") d.setUTCDate(1);
  else {
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  }
  return d.getTime();
}

function aggregatePeriods(days: FxCandle[], iv: "W" | "M"): FxCandle[] {
  const out: FxCandle[] = [];
  let cur: FxCandle | null = null;
  for (const c of days) {
    const t = periodStart(c.timestamp, iv);
    if (!cur || cur.timestamp !== t) {
      cur = { ...c, timestamp: t };
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

/**
 * FMP daily FX bars follow the New York calendar day: a short bar on Sunday evening (the week's open) and, now and then, a duplicate
 * dated Saturday. The terminal's FX day is Monday-Friday: Sunday is merged into the Monday that follows it, Saturday is dropped.
 */
export function normalizeFxDaily(rows: FxCandle[]): FxCandle[] {
  const out: FxCandle[] = [];
  let carry: FxCandle | null = null;
  for (const c of rows) {
    const dow = new Date(c.timestamp).getUTCDay();
    if (dow === 6) continue;
    if (dow === 0) {
      carry = c;
      continue;
    }
    if (carry && dow === 1 && c.timestamp - carry.timestamp <= 2 * DAY) {
      out.push({ timestamp: c.timestamp, open: carry.open, high: Math.max(c.high, carry.high), low: Math.min(c.low, carry.low), close: c.close, volume: c.volume + carry.volume });
    } else out.push(c);
    carry = null;
  }
  if (carry) out.push(carry); // a Sunday bar at the very end (the new week has just opened): shown on its own until Monday
  return out;
}

function window(rows: FxCandle[], from?: number, to?: number): FxCandle[] {
  return rows.filter((c) => (from === undefined || c.timestamp >= from) && (to === undefined || c.timestamp <= to));
}

/* ═══════════════════════════ FMP ═══════════════════════════ */

const FMP_BASE = "https://financialmodelingprep.com/stable";
const FMP_IV: Record<string, string> = { "1": "1min", "5": "5min", "15": "15min", "30": "30min", "60": "1hour", "240": "4hour" };
/** FMP documents intraday times as US Eastern wall clock (stock convention). NOT verified for FX on a paid plan: scripts/check-forex.ts compares the newest bar with the clock. */
export const FMP_INTRADAY_TZ = process.env.FOREX_FMP_TZ || "America/New_York";

/** One day's spending is capped, so the terminal can never eat the whole quota that the calendar shares (free plan: 250 a day). */
function fmpBudget(): boolean {
  const day = new Date().toISOString().slice(0, 10);
  if (S.fmpDay !== day) {
    S.fmpDay = day;
    S.fmpCalls = 0;
  }
  const max = Number(process.env.FOREX_FMP_DAILY_MAX) || 150;
  if (S.fmpCalls >= max) return false;
  S.fmpCalls++;
  return true;
}

async function fmpGet(path: string): Promise<{ ok: true; json: unknown } | { ok: false; f: Failure }> {
  const key = process.env.FMP_API_KEY || "";
  if (!key) return { ok: false, f: { ok: false, reason: "denied", wide: true, ttlMs: 10 * MIN } };
  // the process-wide FMP memory (fmp-gate.ts: cooldown after a 429, plan denials) is shared with the futures candles and the quotes
  const kind = path.startsWith("/quote") ? "quote" : path.startsWith("/historical-chart") ? "intraday" : "eod";
  const gateSym = /[?&]symbol=([^&]+)/.exec(path)?.[1] ?? "*";
  const blocked = fmpGateCheck(kind, gateSym);
  if (blocked) return { ok: false, f: blocked.error === "limit" ? { ok: false, reason: "rate", ttlMs: (blocked.retryAfterSec ?? 60) * 1000 } : { ok: false, reason: "denied", ttlMs: Math.min(blocked.retryAfterSec ?? 600, 600) * 1000 } };
  if (!fmpBudget()) return { ok: false, f: { ok: false, reason: "denied", wide: true, ttlMs: 30 * MIN } };
  const { status, text } = await http(`${FMP_BASE}${path}${path.includes("?") ? "&" : "?"}apikey=${encodeURIComponent(key)}`);
  fmpGateReport(kind, gateSym, status, text);
  if (status === 429) return { ok: false, f: { ok: false, reason: "rate", status } };
  if (status === 401 || status === 402 || status === 403) {
    // "Restricted Endpoint": the whole endpoint is not in the plan; "Premium Query Parameter": this symbol is not
    return { ok: false, f: { ok: false, reason: "denied", status, wide: /Restricted Endpoint/i.test(text) } };
  }
  if (status !== 200) return { ok: false, f: { ok: false, reason: "error", status } };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, f: { ok: false, reason: "error", status } };
  }
}

/** Daily bars of one pair, newest 5+ years, shared by D / W / M requests for 10 minutes (one FMP call per pair per 10 min). */
async function fmpDailyRaw(symbol: string): Promise<{ ok: true; rows: FxCandle[] } | Failure> {
  let fail: Failure | null = null;
  const rows = await cached<FxCandle[]>(`fmp-eod|${symbol}`, 10 * MIN, async () => {
    const r = await fmpGet(`/historical-price-eod/full?symbol=${symbol}`);
    if (!r.ok) {
      fail = r.f;
      return null;
    }
    const arr = Array.isArray(r.json) ? r.json : (r.json as { historical?: unknown[] })?.historical;
    if (!Array.isArray(arr) || arr.length === 0) {
      fail = { ok: false, reason: "denied", ttlMs: 10 * MIN };
      return null;
    }
    const out: FxCandle[] = [];
    for (const c of arr as Record<string, unknown>[]) {
      const t = wallToUtc(String(c.date), "UTC");
      if (Number.isFinite(t)) out.push({ timestamp: t, open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume) || 0 });
    }
    return out.sort((a, b) => a.timestamp - b.timestamp);
  });
  if (rows) return { ok: true, rows };
  // `fail` is set only for the caller that made the request; a caller that shared its in-flight request reports a plain empty (no deny)
  return fail ?? { ok: false, reason: "empty" };
}

const fmpProvider: ForexProvider = {
  name: "fmp",
  async quote(symbol) {
    const r = await fmpGet(`/quote?symbol=${symbol}`);
    if (!r.ok) return r.f;
    const it = (Array.isArray(r.json) ? r.json[0] : r.json) as Record<string, unknown> | undefined;
    const price = num(it?.price);
    if (!it || !(price > 0)) return { ok: false, reason: "denied", ttlMs: 10 * MIN };
    const ts = num(it.timestamp);
    return {
      ok: true,
      data: {
        price,
        open: num(it.open) || price,
        high: num(it.dayHigh) || price,
        low: num(it.dayLow) || price,
        volume: num(it.volume) || 0,
        change: num(it.change) || 0,
        changePercent: num(it.changePercentage ?? it.changesPercentage) || 0,
        time: ts > 0 ? new Date(ts * 1000).toISOString() : new Date().toISOString(),
      },
    };
  },
  async candles(symbol, interval, from, to, limit) {
    if (isDaily(interval)) {
      const raw = await fmpDailyRaw(symbol);
      if (!raw.ok) return raw;
      const days = normalizeFxDaily(raw.rows);
      const rows = interval === "D" ? days : aggregatePeriods(days, interval as "W" | "M");
      return { ok: true, data: { candles: window(rows, from, to).slice(-limit), volume: "tick" } };
    }
    const iv = FMP_IV[interval];
    if (!iv) return { ok: false, reason: "unsupported" };
    const end = to ?? Date.now();
    const span = Math.max(3 * DAY, ((limit * Number(interval)) / 60 / 24) * 1.6 * DAY + 2 * DAY);
    const r = await fmpGet(`/historical-chart/${iv}?symbol=${symbol}&from=${ymd(from ?? end - span)}&to=${ymd(end + DAY)}`);
    if (!r.ok) return r.f;
    if (!Array.isArray(r.json) || r.json.length === 0) return { ok: false, reason: "empty" };
    const rows: FxCandle[] = [];
    for (const c of r.json as Record<string, unknown>[]) {
      const t = wallToUtc(String(c.date), FMP_INTRADAY_TZ);
      if (Number.isFinite(t)) rows.push({ timestamp: t, open: num(c.open), high: num(c.high), low: num(c.low), close: num(c.close), volume: num(c.volume) || 0 });
    }
    rows.sort((a, b) => a.timestamp - b.timestamp);
    return { ok: true, data: { candles: window(rows, from, to).slice(-limit), volume: "tick" } };
  },
};

/* ═══════════════════════════ Stooq (keyless, daily only) ═══════════════════════════ */

const stooqProvider: ForexProvider = {
  name: "stooq",
  async candles(symbol, interval, from, to, limit) {
    if (!isDaily(interval)) return { ok: false, reason: "unsupported" };
    const i = interval === "D" ? "d" : interval === "W" ? "w" : "m";
    const { status, text } = await http(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=${i}`);
    // a browser check page (JS proof of work) instead of CSV: switched off for hours
    if (status !== 200 || /^\s*</.test(text)) return { ok: false, reason: "denied", status, wide: true };
    const rows: FxCandle[] = [];
    for (const line of text.split(/\r?\n/).slice(1)) {
      const p = line.split(",");
      if (p.length < 5) continue;
      const t = wallToUtc(p[0], "UTC");
      const o = num(p[1]);
      const c = num(p[4]);
      if (Number.isFinite(t) && o > 0 && c > 0) rows.push({ timestamp: t, open: o, high: num(p[2]), low: num(p[3]), close: c, volume: num(p[5]) || 0 });
    }
    if (!rows.length) return { ok: false, reason: "empty" };
    rows.sort((a, b) => a.timestamp - b.timestamp);
    return { ok: true, data: { candles: window(rows, from, to).slice(-limit), volume: "none" } };
  },
};

/* ═══════════════════════════ Yahoo Finance (UNOFFICIAL fallback) ═══════════════════════════ */

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

/** Symbols Yahoo names differently; metals have no spot series there: the COMEX future is used and flagged as a proxy. */
const YAHOO_MAP: Record<string, { sym: string; proxy?: string }> = {
  USDCNH: { sym: "CNH=X" },
  XAUUSD: { sym: "GC=F", proxy: "COMEX gold futures (GC=F)" },
  XAGUSD: { sym: "SI=F", proxy: "COMEX silver futures (SI=F)" },
};
const yahooSym = (symbol: string) => YAHOO_MAP[symbol] ?? { sym: `${symbol}=X` };

interface YSpec {
  yi: string;
  nativeMs: number;
  /** how far back Yahoo serves this interval */
  maxBack: number;
  /** longest window of one request */
  maxSpan: number;
  /** the terminal's bar is a multiple of the native one */
  bucketMs?: number;
}
const YAHOO_SPEC: Record<string, YSpec> = {
  "1": { yi: "1m", nativeMs: MIN, maxBack: 29 * DAY, maxSpan: 7 * DAY },
  "5": { yi: "5m", nativeMs: 5 * MIN, maxBack: 59 * DAY, maxSpan: 59 * DAY },
  "15": { yi: "15m", nativeMs: 15 * MIN, maxBack: 59 * DAY, maxSpan: 59 * DAY },
  "30": { yi: "30m", nativeMs: 30 * MIN, maxBack: 59 * DAY, maxSpan: 59 * DAY },
  "60": { yi: "60m", nativeMs: HOUR, maxBack: 729 * DAY, maxSpan: 729 * DAY },
  "240": { yi: "60m", nativeMs: HOUR, maxBack: 729 * DAY, maxSpan: 729 * DAY, bucketMs: 4 * HOUR },
  D: { yi: "1d", nativeMs: DAY, maxBack: 40 * 365 * DAY, maxSpan: 40 * 365 * DAY },
  W: { yi: "1wk", nativeMs: 7 * DAY, maxBack: 40 * 365 * DAY, maxSpan: 40 * 365 * DAY },
  M: { yi: "1mo", nativeMs: 31 * DAY, maxBack: 40 * 365 * DAY, maxSpan: 40 * 365 * DAY },
};

async function yahooGet(symbol: string, query: string): Promise<{ ok: true; result: any; proxy?: string } | { ok: false; f: Failure }> {
  const m = yahooSym(symbol);
  const { status, text } = await http(`${YAHOO_BASE}/${encodeURIComponent(m.sym)}?${query}`);
  if (status === 429) return { ok: false, f: { ok: false, reason: "rate", status } };
  if (status === 404) return { ok: false, f: { ok: false, reason: "denied", status, ttlMs: 30 * MIN } };
  if (status !== 200) return { ok: false, f: { ok: false, reason: "error", status } };
  try {
    const result = JSON.parse(text)?.chart?.result?.[0];
    return result ? { ok: true, result, proxy: m.proxy } : { ok: false, f: { ok: false, reason: "empty", status } };
  } catch {
    return { ok: false, f: { ok: false, reason: "error", status } };
  }
}

const yahooProvider: ForexProvider = {
  name: "yahoo",
  async quote(symbol) {
    // daily bars of the last days: the live price is in the meta, today's open / range / previous close in the bars
    const r = await yahooGet(symbol, "interval=1d&range=5d");
    if (!r.ok) return r.f;
    const meta = r.result.meta ?? {};
    const q = r.result.indicators?.quote?.[0] ?? {};
    const closes: number[] = (q.close ?? []).filter((v: unknown) => typeof v === "number");
    const price = num(meta.regularMarketPrice) || closes[closes.length - 1];
    if (!(price > 0)) return { ok: false, reason: "empty" };
    const n = (q.close ?? []).length;
    const opens: (number | null)[] = q.open ?? [];
    const prev = closes.length >= 2 ? closes[closes.length - 2] : num(meta.chartPreviousClose) || price;
    const digits = fxDigits(symbol);
    const change = price - prev;
    const t = num(meta.regularMarketTime);
    return {
      ok: true,
      proxy: r.proxy,
      data: {
        price: round(price, digits),
        open: round(num(opens[n - 1]) || price, digits),
        high: round(num(meta.regularMarketDayHigh) || price, digits),
        low: round(num(meta.regularMarketDayLow) || price, digits),
        volume: 0,
        change: round(change, digits + 1),
        changePercent: prev > 0 ? round((change / prev) * 100, 4) : 0,
        time: t > 0 ? new Date(t * 1000).toISOString() : new Date().toISOString(),
      },
    };
  },
  async candles(symbol, interval, from, to, limit) {
    const spec = YAHOO_SPEC[interval];
    if (!spec) return { ok: false, reason: "unsupported" };
    const now = Date.now();
    const per = spec.bucketMs ? spec.bucketMs / spec.nativeMs : 1;
    // FX trades ~5 of 7 days: window sized for `limit` bars with a margin
    const span = Math.min(spec.maxSpan, ((limit * per * spec.nativeMs) * 1.5) + (spec.nativeMs >= DAY ? 10 * DAY : 2 * DAY));
    const end = to !== undefined ? Math.min(to + 1000, now + HOUR) : now + HOUR;
    let start = from ?? end - span;
    start = Math.max(start, now - spec.maxBack, end - spec.maxSpan);
    if (start >= end) return { ok: false, reason: "empty" };
    const r = await yahooGet(symbol, `interval=${spec.yi}&period1=${Math.floor(start / 1000)}&period2=${Math.ceil(end / 1000)}`);
    if (!r.ok) return r.f;
    const ts: number[] = r.result.timestamp ?? [];
    const q = r.result.indicators?.quote?.[0] ?? {};
    const off = num(r.result.meta?.gmtoffset) || 0;
    const digits = fxDigits(symbol);
    let rows: FxCandle[] = [];
    for (let i = 0; i < ts.length; i++) {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if (![o, h, l, c].every((v) => typeof v === "number" && v > 0)) continue;
      // daily+ bars start at 00:00 of the exchange's zone: the date of that wall clock, as UTC midnight (what the chart's day buckets use)
      const t = spec.nativeMs >= DAY ? Math.floor((ts[i] * 1000 + off * 1000) / DAY) * DAY : ts[i] * 1000;
      rows.push({ timestamp: t, open: round(o, digits), high: round(h, digits), low: round(l, digits), close: round(c, digits), volume: num(q.volume?.[i]) || 0 });
    }
    if (spec.bucketMs) rows = bucketBars(rows, spec.bucketMs);
    if (!rows.length) return { ok: false, reason: "empty" };
    return { ok: true, proxy: r.proxy, data: { candles: window(rows, from, to).slice(-limit), volume: r.proxy ? "futures" : "none" } };
  },
};

/* ═══════════════════════════ the layer ═══════════════════════════ */

export const FOREX_PROVIDERS: Record<ForexProviderName, ForexProvider> = { fmp: fmpProvider, stooq: stooqProvider, yahoo: yahooProvider };

function order(envName: string, def: string): ForexProvider[] {
  const names = (process.env[envName] || def).split(",").map((s) => s.trim().toLowerCase());
  return names.filter((n): n is ForexProviderName => n in FOREX_PROVIDERS).map((n) => FOREX_PROVIDERS[n]);
}

/**
 * Candles: FMP first (official), then Stooq, then Yahoo. Quotes: Yahoo first, FMP second — FMP's free plan is 250 calls a day and
 * a watchlist polled every few seconds would spend it in minutes (and the calendar shares the same key); with a paid plan set
 * FOREX_QUOTE_PROVIDERS=fmp,yahoo. FOREX_CANDLE_PROVIDERS / FOREX_QUOTE_PROVIDERS take any comma list of fmp | stooq | yahoo.
 */
const quoteOrder = () => order("FOREX_QUOTE_PROVIDERS", "yahoo,fmp");
const candleOrder = () => order("FOREX_CANDLE_PROVIDERS", "fmp,stooq,yahoo");

const QUOTE_TTL = () => Number(process.env.FOREX_QUOTE_TTL_MS) || 8_000;

/** Last price of a pair. null: not a known pair, or no provider answered. */
export async function getForexQuote(symbol: string): Promise<ForexQuoteResult | null> {
  const sym = symbol.toUpperCase();
  if (!parseFxSymbol(sym)) return null;
  return cached<ForexQuoteResult>(`q|${sym}`, QUOTE_TTL(), async () => {
    for (const p of quoteOrder()) {
      if (!p.quote || denied(p.name, "quote", sym)) continue;
      let r: R<FxQuote>;
      try {
        r = await p.quote(sym);
      } catch {
        r = { ok: false, reason: "error" };
      }
      if (r.ok) return { quote: r.data, provider: p.name, proxy: r.proxy };
      applyDeny(p.name, "quote", sym, r);
    }
    return null;
  });
}

/** Quotes of many pairs (the watchlist): up to 4 upstream requests at a time. Pairs without an answer are absent. */
export async function getForexQuotes(symbols: string[]): Promise<Record<string, ForexQuoteResult>> {
  const out: Record<string, ForexQuoteResult> = {};
  const list = [...new Set(symbols.map((s) => s.toUpperCase()))].slice(0, 40);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, list.length) }, async () => {
      while (next < list.length) {
        const s = list[next++];
        const q = await getForexQuote(s);
        if (q) out[s] = q;
      }
    })
  );
  return out;
}

/**
 * Bars of a pair, ascending. `interval`: the terminal's "1" "5" "15" "30" "60" "240" "D" "W" "M". `from` / `to`: UTC ms bounds
 * (`to` = the chart scrolled back to that time). `limit`: newest bars wanted (default 600). Never throws: an empty `candles` with
 * `provider: "none"` and a `reason` means nobody could serve it.
 */
export async function getForexCandles(symbol: string, interval: string, from?: number, to?: number, limit = 600): Promise<ForexCandlesResult> {
  const sym = symbol.toUpperCase();
  if (!parseFxSymbol(sym)) return { candles: [], provider: "none", volume: "none", reason: "unknown-symbol" };
  limit = Math.max(1, Math.min(limit, 5000));
  // a scroll-back page never changes: keep it longer; the live edge is refreshed every few seconds at most
  let reason = "";
  const ttl = to !== undefined ? 5 * MIN : isDaily(interval) ? 60_000 : 15_000;
  const got = await cached<ForexCandlesResult>(`c|${sym}|${interval}|${from ?? ""}|${to ?? ""}|${limit}`, ttl, async () => {
    const kind = kindOf(interval);
    const why: string[] = [];
    reason = "";
    for (const p of candleOrder()) {
      if (!p.candles) continue;
      if (denied(p.name, kind, sym)) {
        why.push(`${p.name}:skipped`);
        continue;
      }
      let r: R<CandleData>;
      try {
        r = await p.candles(sym, interval, from, to, limit);
      } catch {
        r = { ok: false, reason: "error" };
      }
      if (r.ok && r.data.candles.length > 0) return { candles: r.data.candles, provider: p.name, volume: r.data.volume, proxy: r.proxy };
      if (!r.ok) {
        applyDeny(p.name, kind, sym, r);
        why.push(`${p.name}:${r.reason}${r.status ? r.status : ""}`);
      } else why.push(`${p.name}:empty`);
    }
    reason = why.join(",") || "no-provider";
    return null; // not cached beyond a few seconds
  });
  return got ?? { candles: [], provider: "none", volume: "none", reason: reason || "error" };
}

/** The curated symbols (for scripts and the sparkline warm-up). */
export const FOREX_SYMBOLS = FX_PAIRS.map((p) => p.symbol);

/* exported for scripts/check-forex-fixtures */
export const __test = { bucketBars, aggregatePeriods, normalizeFxDaily, wallToUtc, window };
