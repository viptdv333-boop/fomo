import { NextRequest, NextResponse } from "next/server";

/**
 * Real-time quote proxy for MOEX and Bybit.
 * MOEX marketdata endpoint gives near-realtime prices (1-3 sec delay),
 * unlike the candles endpoint which has ~15 min delay.
 *
 * Usage: /api/quote?source=moex&ticker=SBER
 *        /api/quote?source=bybit&ticker=BTCUSDT
 */

// MOEX boards to try
const MOEX_BOARDS = [
  { engine: "stock", market: "shares", board: "TQBR" },
  { engine: "stock", market: "bonds", board: "TQOB" },
  { engine: "stock", market: "bonds", board: "TQCB" },
  { engine: "currency", market: "selt", board: "CETS" },
  { engine: "futures", market: "forts", board: "RFUD" },
];

const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", GOLD: "GD", SILV: "SV", NG: "NG", WHEAT: "W4",
  PLT: "PT", PLD: "PD", COCOA: "CC",
  Si: "Si", Eu: "Eu", CR: "CR",
  NASD: "NA", SPYF: "SF", MIX: "MX",
};

// Simple contract cache (shared with klines via module scope in edge runtime)
const contractCache = new Map<string, { contract: string; resolved: number }>();

async function findActiveContract(baseTicker: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[baseTicker];
  if (!prefix) return null;

  const cached = contractCache.get(baseTicker);
  if (cached && Date.now() - cached.resolved < 3600_000) return cached.contract;

  try {
    const url = `https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.securities?.data;
    if (!rows) return null;

    const today = new Date().toISOString().slice(0, 10);
    const candidates = rows
      .filter((r: any[]) => (r[0] as string).startsWith(prefix) && r[0] !== baseTicker && r[2] && (r[2] as string) >= today)
      .sort((a: any[], b: any[]) => (a[2] as string).localeCompare(b[2] as string));

    const contract = candidates.length > 0 ? (candidates[0][0] as string) : null;
    if (contract) contractCache.set(baseTicker, { contract, resolved: Date.now() });
    return contract;
  } catch {
    return null;
  }
}

interface Quote {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  time: string;
  ticker: string;
}

async function fetchMoexQuote(ticker: string): Promise<Quote | null> {
  // Try each board with exact ticker
  for (const { engine, market, board } of MOEX_BOARDS) {
    try {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/boards/${board}/securities/${ticker}.json?iss.meta=off&iss.only=marketdata,securities&marketdata.columns=SECID,LAST,OPEN,HIGH,LOW,VOLTODAY,UPDATETIME&securities.columns=SECID,PREVPRICE`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = await res.json();

      const md = data.marketdata?.data?.[0];
      if (!md || !md[1]) continue;

      const price = md[1] as number;
      const open = (md[2] as number) || price;
      const high = (md[3] as number) || price;
      const low = (md[4] as number) || price;
      const volume = (md[5] as number) || 0;
      const time = (md[6] as string) || "";

      // Previous close price for change calculation
      const sec = data.securities?.data?.[0];
      const prevClose = sec ? (sec[1] as number) || open : open;
      const change = price - prevClose;
      const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

      return { price, open, high, low, volume, change, changePercent, time, ticker };
    } catch {
      continue;
    }
  }

  // Try as futures base ticker
  const contract = await findActiveContract(ticker);
  if (contract) {
    const result = await fetchMoexQuote(contract);
    if (result) return { ...result, ticker: contract };
  }

  return null;
}

async function fetchBybitQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${symbol}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.retCode !== 0) return null;

    const t = data.result?.list?.[0];
    if (!t) return null;

    const price = parseFloat(t.lastPrice);
    const open = parseFloat(t.prevPrice24h) || price;
    const high = parseFloat(t.highPrice24h) || price;
    const low = parseFloat(t.lowPrice24h) || price;
    const volume = parseFloat(t.volume24h) || 0;
    const change = price - open;
    const changePercent = open !== 0 ? (change / open) * 100 : 0;

    return {
      price, open, high, low, volume, change, changePercent,
      time: new Date().toISOString(),
      ticker: symbol,
    };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const source = searchParams.get("source") || "";
  const ticker = searchParams.get("ticker") || "";

  if (!ticker || !source) {
    return NextResponse.json({ error: "source and ticker required" }, { status: 400 });
  }

  let quote: Quote | null = null;

  if (source === "moex") {
    quote = await fetchMoexQuote(ticker);
  } else if (source === "bybit") {
    quote = await fetchBybitQuote(ticker);
  }

  if (!quote) {
    return NextResponse.json({ error: "No quote data" }, { status: 404 });
  }

  return NextResponse.json(quote, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
