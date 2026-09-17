import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for market data (avoids CORS issues with MOEX)

const MOEX_INTERVALS: Record<string, number> = {
  "1": 1, "10": 10, "60": 60,
  "D": 24, "W": 7, "M": 31,
};

// MOEX ISS has no native 5m/15m/4h candles — like terminal-3 (a reference
// project by the same author), synthesize them by resampling the nearest
// native interval it does support (1m for 5m/15m, 60m for 4h) with plain
// OHLCV aggregation (open=first, high=max, low=min, close=last,
// volume=sum). terminal-3 also has a session-anchored variant of the 4h
// resample to match TradingView's exact bar geometry for its signal bot —
// that precision isn't needed for a display chart, so this uses simple
// calendar-aligned buckets instead.
const MOEX_SYNTHESIZE: Record<string, { native: string; bucketMs: number }> = {
  "5": { native: "1", bucketMs: 5 * 60_000 },
  "15": { native: "1", bucketMs: 15 * 60_000 },
  "240": { native: "60", bucketMs: 4 * 3_600_000 },
};

// MOEX boards to try in order for candles
const MOEX_CANDLE_BOARDS = [
  { engine: "stock", market: "shares", board: "TQBR" },       // Russian shares
  { engine: "stock", market: "bonds", board: "TQOB" },        // OFZ bonds
  { engine: "stock", market: "bonds", board: "TQCB" },        // Corporate bonds
  { engine: "currency", market: "selt", board: "CETS" },      // Currency
  { engine: "futures", market: "forts", board: "RFUD" },       // Ruble futures
];

// Futures base tickers → 2-letter prefix for contract codes on MOEX
const FUTURES_PREFIX: Record<string, string> = {
  // Commodities
  "BR": "BR",        // Brent
  "GOLD": "GD",      // Gold
  "SILV": "SV",      // Silver
  "PLT": "PT",       // Platinum
  "PLD": "PD",       // Palladium
  "NG": "NG",        // Natural gas
  "WHEAT": "W4",     // Wheat
  "COCOA": "CC",     // Cocoa
  "SUGAR": "SA",     // Sugar
  "CU": "CE",        // Copper
  // Currency
  "Si": "Si",        // USD/RUB
  "Eu": "Eu",        // EUR/RUB
  "CR": "CR",        // CNY/RUB
  // Indices
  "NASD": "NA",      // NASDAQ 100
  "SPYF": "SF",      // S&P 500
  "MIX": "MX",       // MOEX Index
  "RTS": "RI",       // RTS Index
  "BTCF": "BT",      // Bitcoin futures MOEX
};

// Cache for resolved futures contracts (base ticker → {contract, expiry})
const contractCache = new Map<string, { contract: string; resolved: number }>();
const CONTRACT_CACHE_TTL = 3600_000; // 1 hour

// `anchorMs` is "now" for a live/initial load, or the chart's requested
// `to` timestamp when paging further back into history — without it every
// history request resolved to the same "now − N bars" window, so scrolling
// back just re-fetched and re-drew the same recent chunk (looked like the
// chart repeating/tiling itself).
function getDateFrom(count: number, interval: string, anchorMs?: number): string {
  const d = anchorMs ? new Date(anchorMs) : new Date();
  switch (interval) {
    case "M": d.setMonth(d.getMonth() - count); break;
    case "W": d.setDate(d.getDate() - count * 7); break;
    case "D": d.setDate(d.getDate() - count); break;
    default: d.setDate(d.getDate() - Math.max(7, Math.ceil((count * 5) / 300))); break;
  }
  return d.toISOString().slice(0, 10);
}

function dateFromDays(days: number, anchorMs?: number): string {
  const d = anchorMs ? new Date(anchorMs) : new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// MOEX ISS paginates candles.json in pages of up to 500 rows via `start`
// (row offset). Loop until a short/empty page signals the end of what's
// available in the [from, till] window, then dedupe by timestamp — the
// same defensive merge the reference terminal-3 project uses whenever it
// combines pages, so a retried/overlapping page can never double a bar.
async function fetchIssCandlesPage(
  url: string,
  moexInterval: number,
  from: string,
  till?: string
): Promise<any[][]> {
  const rows: any[][] = [];
  let start = 0;
  for (let page = 0; page < 30; page++) {
    const params = new URLSearchParams({
      interval: String(moexInterval),
      from,
      start: String(start),
      "iss.meta": "off",
    });
    if (till) params.set("till", till);
    const res = await fetch(`${url}?${params}`, { cache: "no-store" });
    if (!res.ok) break;
    const data = await res.json();
    const batch: any[][] = data.candles?.data;
    if (!batch || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < 500) break;
    start += batch.length;
  }
  return rows;
}

// Find nearest active futures contract for a base ticker
async function findActiveContract(baseTicker: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[baseTicker];
  if (!prefix) return null;

  // Check in-memory cache
  const cached = contractCache.get(baseTicker);
  if (cached && Date.now() - cached.resolved < CONTRACT_CACHE_TTL) {
    return cached.contract;
  }

  try {
    const url = `https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const data = await res.json();
    const rows = data.securities?.data;
    if (!rows) return null;

    const today = new Date().toISOString().slice(0, 10);
    const candidates = rows
      .filter((r: any[]) => {
        const secId = r[0] as string;
        const expiry = r[2] as string;
        return secId.startsWith(prefix) && secId !== baseTicker && expiry && expiry >= today;
      })
      .sort((a: any[], b: any[]) => (a[2] as string).localeCompare(b[2] as string));

    const contract = candidates.length > 0 ? candidates[0][0] as string : null;
    if (contract) {
      contractCache.set(baseTicker, { contract, resolved: Date.now() });
    }
    return contract;
  } catch {
    return null;
  }
}

function parseCandles(candles: any[][]) {
  return candles.map((c: any[]) => ({
    timestamp: new Date(c[6]).getTime(),
    open: c[0],
    high: c[2],
    low: c[3],
    close: c[1],
    volume: c[5] || 0,
  }));
}

function toDateStr(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Filter to the requested window and dedupe by timestamp (keep-last —
// cheap insurance against ISS's day-granularity `till` overlapping an
// adjacent request). Returns ascending, untrimmed — trimming to `limit`
// happens after synthesis (below), since aggregation must run first.
function filterAndDedupe(rawRows: any[][], toMs: number | undefined) {
  let parsed = parseCandles(rawRows);
  if (toMs !== undefined) {
    parsed = parsed.filter((c) => c.timestamp <= toMs);
  }
  const byTs = new Map<number, (typeof parsed)[number]>();
  for (const c of parsed) byTs.set(c.timestamp, c);
  return Array.from(byTs.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// Groups native-granularity candles (must be ascending) into fixed-size
// buckets and reduces each with plain OHLCV aggregation — the same
// open/high/low/close/volume rule terminal-3 uses when it resamples 1m
// candles into 5m/15m bars (or 1H into 4H).
function aggregateCandles(candles: ReturnType<typeof filterAndDedupe>, bucketMs: number) {
  const buckets = new Map<number, (typeof candles)[number]>();
  for (const c of candles) {
    const bucketTs = Math.floor(c.timestamp / bucketMs) * bucketMs;
    const b = buckets.get(bucketTs);
    if (!b) {
      buckets.set(bucketTs, { timestamp: bucketTs, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    } else {
      b.high = Math.max(b.high, c.high);
      b.low = Math.min(b.low, c.low);
      b.close = c.close; // candles arrive in ascending order, so the last write is the true close
      b.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

// How many calendar days of native-granularity history to request in order
// to synthesize `limit` bars of a coarser interval. Capped (not simply
// `limit * multiplier` days of history) so a 24h-traded futures contract
// can never fill the ISS pagination cap with only the oldest slice of the
// window and never reach `till`/now — 1440 (a full day of 1-minute bars)
// is the safe density to size the cap against.
function synthDaysNeeded(limit: number, nativeIntervalMinutes: number, bucketMs: number): number {
  const multiplier = bucketMs / (nativeIntervalMinutes * 60_000);
  const rawLimit = Math.min(limit * multiplier, 3000);
  return Math.max(3, Math.ceil((rawLimit * nativeIntervalMinutes) / 1440));
}

interface MoexResult {
  candles: any[];
  resolvedTicker: string;
}

async function fetchMoexCandles(ticker: string, interval: string, limit: number, toMs?: number): Promise<MoexResult> {
  const synth = MOEX_SYNTHESIZE[interval];
  const fetchInterval = synth ? synth.native : interval;
  const moexInterval = MOEX_INTERVALS[fetchInterval] || 24;

  const from = synth
    ? dateFromDays(synthDaysNeeded(limit, MOEX_INTERVALS[fetchInterval], synth.bucketMs), toMs)
    : getDateFrom(limit, interval, toMs);
  // Live/initial load: omit `till` so today's still-forming candle isn't
  // excluded. Scroll-back load: bound `till` to toMs's calendar day — ISS's
  // `till` is date-granularity only, so this is a broad net; the exact
  // `timestamp <= toMs` cut happens below.
  const till = toMs !== undefined ? toDateStr(toMs) : undefined;

  function finalize(rawRows: any[][]) {
    let candles = filterAndDedupe(rawRows, toMs);
    if (synth) candles = aggregateCandles(candles, synth.bucketMs);
    return candles.slice(-limit);
  }

  // 1. Try all standard boards with the exact ticker
  for (const { engine, market, board } of MOEX_CANDLE_BOARDS) {
    try {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/boards/${board}/securities/${ticker}/candles.json`;
      const rows = await fetchIssCandlesPage(url, moexInterval, from, till);
      if (rows.length > 0) {
        const candles = finalize(rows);
        if (candles.length > 0) return { candles, resolvedTicker: ticker };
      }
    } catch {
      continue;
    }
  }

  // 2. If exact ticker failed, it might be a futures base ticker (BR, GOLD, Si, NG, etc.)
  const activeContract = await findActiveContract(ticker);
  if (activeContract) {
    try {
      const url = `https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities/${activeContract}/candles.json`;
      const rows = await fetchIssCandlesPage(url, moexInterval, from, till);
      if (rows.length > 0) {
        const candles = finalize(rows);
        if (candles.length > 0) return { candles, resolvedTicker: activeContract };
      }
    } catch {
      // fall through
    }
  }

  return { candles: [], resolvedTicker: ticker };
}

const FMP_KEY = process.env.FMP_API_KEY || "";

const FMP_INTERVALS: Record<string, string> = {
  "1": "1min", "5": "5min", "15": "15min", "60": "1hour", "240": "4hour",
};

async function fetchFmpCandles(ticker: string, interval: string, limit: number, toMs?: number) {
  try {
    if (["D", "W", "M"].includes(interval)) {
      // Daily/weekly/monthly — use EOD endpoint
      const res = await fetch(
        `https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&apikey=${FMP_KEY}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const hist = Array.isArray(data) ? data : data?.historical || [];
      // hist is newest-first — filter to the requested window before
      // slicing, instead of always taking the newest `limit` regardless of
      // what window the chart actually asked for.
      const mapped = hist.map((c: any) => ({
        timestamp: new Date(c.date).getTime(),
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
      }));
      const windowed = toMs !== undefined ? mapped.filter((c: any) => c.timestamp <= toMs) : mapped;
      return windowed.slice(0, limit).reverse();
    } else {
      // Intraday
      const fmpInterval = FMP_INTERVALS[interval] || "1hour";
      const res = await fetch(
        `https://financialmodelingprep.com/stable/historical-chart/${fmpInterval}?symbol=${ticker}&apikey=${FMP_KEY}`,
        { cache: "no-store" }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];
      const mapped = arr.map((c: any) => ({
        timestamp: new Date(c.date).getTime(),
        open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0,
      }));
      const windowed = toMs !== undefined ? mapped.filter((c: any) => c.timestamp <= toMs) : mapped;
      return windowed.slice(0, limit).reverse();
    }
  } catch {
    return [];
  }
}

async function fetchBybitCandles(ticker: string, interval: string, limit: number, toMs?: number) {
  const BYBIT_INTERVALS: Record<string, string> = {
    "1": "1", "5": "5", "15": "15", "60": "60", "240": "240", "D": "D", "W": "W", "M": "M",
  };
  try {
    const bybitInterval = BYBIT_INTERVALS[interval] || "D";
    const PAGE = 200; // Bybit max per request
    const pages = Math.ceil(Math.min(limit, 1000) / PAGE);
    let allCandles: any[] = [];
    let endTime: number | undefined = toMs;

    for (let i = 0; i < pages; i++) {
      let url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${ticker}&interval=${bybitInterval}&limit=${PAGE}`;
      if (endTime) url += `&end=${endTime}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) break;
      const data = await res.json();
      const list = data?.result?.list || [];
      if (list.length === 0) break;

      const parsed = list.map((c: any[]) => {
        const ts = Number(c[0]);
        return {
          timestamp: ts > 1e12 ? ts : ts * 1000,
          open: parseFloat(c[1]), high: parseFloat(c[2]), low: parseFloat(c[3]),
          close: parseFloat(c[4]), volume: parseFloat(c[5]) || 0,
        };
      });
      // list is newest-first; oldest item is last
      allCandles = [...parsed, ...allCandles];
      // Next page: fetch candles before the oldest one we got
      endTime = Number(list[list.length - 1][0]) - 1;
      if (list.length < PAGE) break; // no more data
    }

    // Sort chronologically (oldest first) and deduplicate
    allCandles.sort((a, b) => a.timestamp - b.timestamp);
    return allCandles;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source") || "";
  const ticker = searchParams.get("ticker") || "";
  const interval = searchParams.get("interval") || "D";
  const limit = parseInt(searchParams.get("limit") || "300");
  const toParam = searchParams.get("to");
  const toMs = toParam ? parseInt(toParam) : undefined;

  if (!ticker || !source) {
    return NextResponse.json({ error: "source and ticker required" }, { status: 400 });
  }

  let candles: any[] = [];
  let resolvedTicker = ticker;

  if (source === "moex") {
    const result = await fetchMoexCandles(ticker, interval, limit, toMs);
    candles = result.candles;
    resolvedTicker = result.resolvedTicker;
  } else if (source === "fmp") {
    candles = await fetchFmpCandles(ticker, interval, limit, toMs);
  } else if (source === "bybit") {
    candles = await fetchBybitCandles(ticker, interval, limit, toMs);
  }

  // Return object with metadata + candles
  // No cache for realtime (limit<=5), short cache for full loads
  const headers: Record<string, string> =
    limit <= 5
      ? { "Cache-Control": "no-cache, no-store, must-revalidate" }
      : { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" };

  return NextResponse.json(
    {
      ticker: resolvedTicker,
      source,
      candles,
    },
    { headers }
  );
}
