import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for market data (avoids CORS issues with MOEX)

const MOEX_INTERVALS: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 60,
  "D": 24, "W": 7, "M": 31,
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
  "BR": "BR",        // Brent
  "GOLD": "GD",      // Gold
  "SILV": "SV",      // Silver
  "NG": "NG",        // Natural gas
  "WHEAT": "W4",     // Wheat
  "PLT": "PT",       // Platinum
  "PLD": "PD",       // Palladium
  "COCOA": "CC",     // Cocoa
  "Si": "Si",        // USD/RUB
  "Eu": "Eu",        // EUR/RUB
  "CR": "CR",        // CNY/RUB
  "NASD": "NA",      // NASDAQ
  "SPYF": "SF",      // S&P500
  "MIX": "MX",       // MOEX Index
};

// Cache for resolved futures contracts (base ticker → {contract, expiry})
const contractCache = new Map<string, { contract: string; resolved: number }>();
const CONTRACT_CACHE_TTL = 3600_000; // 1 hour

function getDateFrom(count: number, interval: string): string {
  const d = new Date();
  switch (interval) {
    case "M": d.setMonth(d.getMonth() - count); break;
    case "W": d.setDate(d.getDate() - count * 7); break;
    case "D": d.setDate(d.getDate() - count); break;
    default: d.setDate(d.getDate() - 7); break;
  }
  return d.toISOString().slice(0, 10);
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

interface MoexResult {
  candles: any[];
  resolvedTicker: string;
}

async function fetchMoexCandles(ticker: string, interval: string, limit: number): Promise<MoexResult> {
  const moexInterval = MOEX_INTERVALS[interval] || 24;
  const from = getDateFrom(limit, interval);

  // 1. Try all standard boards with the exact ticker
  for (const { engine, market, board } of MOEX_CANDLE_BOARDS) {
    try {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/boards/${board}/securities/${ticker}/candles.json?interval=${moexInterval}&from=${from}&iss.meta=off`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();
      const candles = data.candles?.data;
      if (candles && candles.length > 0) return { candles: parseCandles(candles), resolvedTicker: ticker };
    } catch {
      continue;
    }
  }

  // 2. If exact ticker failed, it might be a futures base ticker (BR, GOLD, Si, NG, etc.)
  const activeContract = await findActiveContract(ticker);
  if (activeContract) {
    try {
      const url = `https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities/${activeContract}/candles.json?interval=${moexInterval}&from=${from}&iss.meta=off`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return { candles: [], resolvedTicker: ticker };
      const data = await res.json();
      const candles = data.candles?.data;
      if (candles && candles.length > 0) return { candles: parseCandles(candles), resolvedTicker: activeContract };
    } catch {
      // fall through
    }
  }

  return { candles: [], resolvedTicker: ticker };
}

interface BybitResult {
  candles: any[];
  resolvedTicker: string;
}

async function fetchBybitCandles(symbol: string, interval: string, limit: number): Promise<BybitResult> {
  try {
    const bybitIntervals: Record<string, string> = {
      "1": "1", "5": "5", "15": "15", "60": "60", "240": "240",
      "D": "D", "W": "W", "M": "M",
    };
    const bi = bybitIntervals[interval] || "D";
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bi}&limit=${limit}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { candles: [], resolvedTicker: symbol };
    const data = await res.json();
    if (data.retCode !== 0 || !data.result?.list) return { candles: [], resolvedTicker: symbol };

    return {
      candles: data.result.list.reverse().map((c: string[]) => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      })),
      resolvedTicker: symbol,
    };
  } catch {
    return { candles: [], resolvedTicker: symbol };
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source") || "";
  const ticker = searchParams.get("ticker") || "";
  const interval = searchParams.get("interval") || "D";
  const limit = parseInt(searchParams.get("limit") || "300");

  if (!ticker || !source) {
    return NextResponse.json({ error: "source and ticker required" }, { status: 400 });
  }

  let candles: any[] = [];
  let resolvedTicker = ticker;

  if (source === "moex") {
    const result = await fetchMoexCandles(ticker, interval, limit);
    candles = result.candles;
    resolvedTicker = result.resolvedTicker;
  } else if (source === "bybit") {
    const result = await fetchBybitCandles(ticker, interval, limit);
    candles = result.candles;
    resolvedTicker = result.resolvedTicker;
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
