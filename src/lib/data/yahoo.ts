/**
 * Yahoo Finance chart data (public, no key, ~15 min delayed): US stocks & CME futures (ES=F), London (.L),
 * Hong Kong (.HK), Xetra (.DE), Tokyo (.T), indices (^GSPC), FX (EURUSD=X). One endpoint for every market.
 * Unofficial API: hosts fall back query1 → query2, answers are cached upstream (kline-cache) so request volume stays low.
 * Intraday history is capped by Yahoo (1m ~7d, 5/15/30m ~60d, 60m ~730d); daily and above go back to listing.
 * LSE quotes arrive in pence (GBp/GBX) — normalised to pounds here.
 */
import { UpstreamCache, issCacheTtl, LIVE_TTL_MS } from "../kline-cache";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

/** the terminal's interval ids -> Yahoo chart intervals (240 is resampled from 60m in the klines route, Y from M) */
export const YAHOO_INTERVAL: Record<string, string> = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "60m",
  D: "1d",
  W: "1wk",
  M: "1mo",
};

/** Yahoo's own lookback caps per interval, in seconds. */
const MAX_WINDOW: Record<string, number> = {
  "1m": 7 * 86_400,
  "5m": 60 * 86_400,
  "15m": 60 * 86_400,
  "30m": 60 * 86_400,
  "60m": 730 * 86_400,
};

export interface YahooCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface YahooResult {
  candles: YahooCandle[];
  symbol: string;
  exchange: string;
  currency: string;
}

/** Calendar seconds to ask for so `limit` bars fit (weekends/holidays margin), clamped to Yahoo's cap. */
export function yahooWindowSeconds(interval: string, limit: number): number {
  const yi = YAHOO_INTERVAL[interval];
  if (!yi) return 0;
  const minutes = yi === "1d" ? 1440 : yi === "1wk" ? 10_080 : yi === "1mo" ? 44_640 : parseInt(yi);
  const calendar = Math.ceil((limit * minutes * 60) / 86_400) * 1.6 + 5; // days, with a weekend/holiday margin
  const secs = Math.ceil(calendar * 86_400);
  const cap = MAX_WINDOW[yi];
  return cap ? Math.min(secs, cap) : Math.min(secs, 60 * 365 * 86_400);
}

/** Live requests quantise `period2` to the 10 s cache bucket so identical charts share one upstream fetch. */
export function yahooUrl(symbol: string, interval: string, limit: number, toMs?: number, nowMs: number = Date.now()): string | null {
  const yi = YAHOO_INTERVAL[interval];
  if (!yi || !/^[A-Za-z0-9.^=\-]{1,20}$/.test(symbol)) return null;
  const end = toMs !== undefined ? Math.floor(toMs / 1000) : Math.floor(nowMs / 10_000) * 10;
  const start = end - yahooWindowSeconds(interval, limit);
  return `/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?period1=${start}&period2=${end}&interval=${yi}&includePrePost=false`;
}

/** Parse a v8 chart answer: parallel timestamp/OHLCV arrays with null holes; pence → pounds. */
export function parseYahooChart(json: any): YahooResult | null {
  const r = json?.chart?.result?.[0];
  if (!r || !Array.isArray(r.timestamp)) return null;
  const q = r.indicators?.quote?.[0];
  if (!q) return null;
  const meta = r.meta ?? {};
  const pence = meta.currency === "GBp" || meta.currency === "GBX";
  const k = pence ? 0.01 : 1;
  const out: YahooCandle[] = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({
      timestamp: r.timestamp[i] * 1000,
      open: o * k,
      high: h * k,
      low: l * k,
      close: c * k,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return { candles: out, symbol: meta.symbol ?? "", exchange: meta.fullExchangeName ?? meta.exchangeName ?? "", currency: meta.currency ?? "" };
}

async function fetchYahoo(path: string): Promise<any | null> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* next host */
    }
  }
  return null;
}

// Upstream cache: closed history for hours, the live edge for seconds (shared with the other sources' discipline).
const gYahoo = globalThis as unknown as { __yahooCache?: UpstreamCache<YahooResult | null> };
const cache = (gYahoo.__yahooCache ??= new UpstreamCache<YahooResult | null>(300));

/** The newest `limit` bars up to `toMs` (scroll-back), oldest first. Cached by the exact upstream request. */
export async function yahooCandles(symbol: string, interval: string, limit: number, toMs?: number): Promise<YahooResult> {
  const empty: YahooResult = { candles: [], symbol, exchange: "", currency: "" };
  const path = yahooUrl(symbol, interval, limit, toMs);
  if (!path) return empty;
  const want = Math.min(Math.max(limit, 1), 5000);
  const till = toMs !== undefined ? new Date(toMs).toISOString().slice(0, 10) : undefined;
  const code = interval === "D" ? 24 : interval === "W" ? 7 : interval === "M" ? 31 : 1;
  const ttl = issCacheTtl(till, code);
  const got = await cache.get(path, (r) => (r && r.candles.length ? ttl : LIVE_TTL_MS), async () => {
    const json = await fetchYahoo(path);
    return json ? parseYahooChart(json) : null;
  });
  if (!got) return empty;
  const candles = toMs !== undefined ? got.candles.filter((c) => c.timestamp <= toMs) : got.candles;
  return { ...got, candles: candles.slice(-want) };
}

export interface YahooMeta {
  symbol: string;
  exchangeCode: string;
  exchange: string;
  currency: string;
  quoteType: string;
}

const gMeta = globalThis as unknown as { __yahooMeta?: UpstreamCache<YahooMeta | null> };
const metaCache = (gMeta.__yahooMeta ??= new UpstreamCache<YahooMeta | null>(500));

/** Instrument meta (exchange, type, currency) for the search lookup; one cheap chart call, cached an hour. */
export async function yahooMeta(symbol: string): Promise<YahooMeta | null> {
  if (!/^[A-Za-z0-9.^=\-]{1,20}$/.test(symbol)) return null;
  const path = `/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?range=1d&interval=1d`;
  return metaCache.get(path, 3_600_000, async () => {
    const j = await fetchYahoo(path);
    const m = j?.chart?.result?.[0]?.meta;
    if (!m) return null;
    return {
      symbol: m.symbol ?? symbol.toUpperCase(),
      exchangeCode: m.exchangeName ?? "",
      exchange: m.fullExchangeName ?? m.exchangeName ?? "",
      currency: m.currency ?? "",
      quoteType: m.instrumentType ?? "",
    };
  });
}
