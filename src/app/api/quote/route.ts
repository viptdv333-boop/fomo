import { NextRequest, NextResponse } from "next/server";

/**
 * Real-time quote proxy for MOEX instruments via Tinkoff Invest API.
 * Usage: /api/quote?source=moex&ticker=SBER
 */

const TINKOFF_URL =
  "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const TINKOFF_TOKEN = process.env.TINKOFF_TOKEN || "";

const SHARE_TICKERS = new Set(["SBER", "GAZP", "LKOH", "YDEX", "ROSN"]);

const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR",
  GOLD: "GD",
  SILV: "SV",
  PLT: "PT",
  PLD: "PD",
  NG: "NG",
  WHEAT: "W4",
  COCOA: "CC",
  SUGAR: "SA",
  CU: "CE",
  Si: "Si",
  Eu: "Eu",
  CR: "CR",
  NASD: "NA",
  SPYF: "SF",
  MIX: "MX",
  RTS: "RI",
  BTCF: "BT",
};

const contractCache = new Map<string, { contract: string; resolved: number }>();

function parseQuotation(q: { units?: string; nano?: number }): number {
  return parseInt(q.units || "0") + (q.nano || 0) / 1_000_000_000;
}

async function findActiveContract(baseTicker: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[baseTicker];
  if (!prefix) return null;
  const cached = contractCache.get(baseTicker);
  if (cached && Date.now() - cached.resolved < 3600_000) return cached.contract;
  try {
    const url =
      "https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE";
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.securities?.data;
    if (!rows) return null;
    const today = new Date().toISOString().slice(0, 10);
    const candidates = rows
      .filter(
        (r: any[]) =>
          (r[0] as string).startsWith(prefix) &&
          r[0] !== baseTicker &&
          r[2] &&
          (r[2] as string) >= today
      )
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

async function tinkoffRequest(endpoint: string, body: object): Promise<any> {
  const res = await fetch(`${TINKOFF_URL}.${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TINKOFF_TOKEN}`,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchTinkoffQuote(ticker: string): Promise<Quote | null> {
  let resolvedTicker = ticker;
  let classCode = "TQBR";

  if (SHARE_TICKERS.has(ticker)) {
    classCode = "TQBR";
  } else if (FUTURES_PREFIX[ticker]) {
    const contract = await findActiveContract(ticker);
    if (!contract) return null;
    resolvedTicker = contract;
    classCode = "SPBFUT";
  } else {
    classCode = "SPBFUT";
  }

  const instrumentId = `${resolvedTicker}_${classCode}`;

  try {
    // Get last price (real-time)
    const priceData = await tinkoffRequest("MarketDataService/GetLastPrices", {
      instrumentId: [instrumentId],
      lastPriceType: "LAST_PRICE_EXCHANGE",
    });
    const lp = priceData?.lastPrices?.[0];
    if (!lp || !lp.price) return null;
    const price = parseQuotation(lp.price);
    const time = lp.time || new Date().toISOString();

    // Get today's candle for OHLC + volume
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const candleData = await tinkoffRequest("MarketDataService/GetCandles", {
      instrumentId: instrumentId,
      from: todayStart.toISOString(),
      to: now.toISOString(),
      interval: "CANDLE_INTERVAL_DAY",
    });

    let open = price;
    let high = price;
    let low = price;
    let volume = 0;
    const candles = candleData?.candles;
    if (candles && candles.length > 0) {
      const c = candles[candles.length - 1];
      open = parseQuotation(c.open);
      high = Math.max(parseQuotation(c.high), price);
      low = Math.min(parseQuotation(c.low), price);
      volume = parseInt(c.volume || "0");
    }

    const change = price - open;
    const changePercent = open !== 0 ? (change / open) * 100 : 0;
    return { price, open, high, low, volume, change, changePercent, time, ticker: resolvedTicker };
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
    quote = await fetchTinkoffQuote(ticker);
  }

  if (!quote) {
    return NextResponse.json({ error: "No quote data" }, { status: 404 });
  }

  return NextResponse.json(quote, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate" },
  });
}
