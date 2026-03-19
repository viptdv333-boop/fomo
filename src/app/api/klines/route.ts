import { NextRequest, NextResponse } from "next/server";

// Server-side proxy for market data (avoids CORS issues with MOEX)

const MOEX_INTERVALS: Record<string, number> = {
  "1": 1, "5": 5, "15": 15, "60": 60, "240": 60,
  "D": 24, "W": 7, "M": 31,
};

// MOEX boards to try in order
const MOEX_BOARDS = [
  { engine: "stock", market: "shares", board: "TQBR" },       // Russian shares
  { engine: "stock", market: "bonds", board: "TQOB" },        // OFZ bonds
  { engine: "stock", market: "bonds", board: "TQCB" },        // Corporate bonds
  { engine: "currency", market: "selt", board: "CETS" },      // Currency
  { engine: "futures", market: "forts", board: "RFUD" },       // Ruble futures
];

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

async function fetchMoexCandles(ticker: string, interval: string, limit: number) {
  const moexInterval = MOEX_INTERVALS[interval] || 24;
  const from = getDateFrom(limit, interval);

  for (const { engine, market, board } of MOEX_BOARDS) {
    try {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/boards/${board}/securities/${ticker}/candles.json?interval=${moexInterval}&from=${from}&iss.meta=off`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) continue;

      const data = await res.json();
      const candles = data.candles?.data;
      if (!candles || candles.length === 0) continue;

      // MOEX candle format: [open, close, high, low, value, volume, begin, end]
      return candles.map((c: any[]) => ({
        timestamp: new Date(c[6]).getTime(),
        open: c[0],
        high: c[2],
        low: c[3],
        close: c[1],
        volume: c[5] || 0,
      }));
    } catch {
      continue;
    }
  }
  return [];
}

async function fetchBybitCandles(symbol: string, interval: string, limit: number) {
  try {
    const bybitIntervals: Record<string, string> = {
      "1": "1", "5": "5", "15": "15", "60": "60", "240": "240",
      "D": "D", "W": "W", "M": "M",
    };
    const bi = bybitIntervals[interval] || "D";
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bi}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.retCode !== 0 || !data.result?.list) return [];

    return data.result.list.reverse().map((c: string[]) => ({
      timestamp: parseInt(c[0]),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }));
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

  if (!ticker || !source) {
    return NextResponse.json({ error: "source and ticker required" }, { status: 400 });
  }

  let candles: any[] = [];

  if (source === "moex") {
    candles = await fetchMoexCandles(ticker, interval, limit);
  } else if (source === "bybit") {
    candles = await fetchBybitCandles(ticker, interval, limit);
  }

  return NextResponse.json(candles, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
  });
}
