import { NextRequest, NextResponse } from "next/server";
import { getBatchQuotes, type QuoteRequest } from "@/lib/quotes";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getViewer } from "@/lib/algopack-access";

/**
 * Batch quotes for the terminal watchlist.
 * GET /api/quotes?items=moex:SBER,moex:GAZP,bybit:BTCUSDT
 *   -> { "moex:SBER": { price, change, changePercent, volume, time }, ... }
 * Instruments without a quote are simply absent from the response. MOEX quotes are real time (T-Invest) for a signed-in
 * session; a guest gets the delayed ISS marketdata (GUEST_REALTIME=1 restores real time for everybody).
 */

const MAX_ITEMS = 80;
const TICKER_RE = /^[A-Za-z0-9_.-]{1,24}$/;

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("items") || "";
  const items: QuoteRequest[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const [source, ticker] = part.trim().split(":");
    if ((source !== "moex" && source !== "bybit" && source !== "fmp" && source !== "forex") || !ticker || !TICKER_RE.test(ticker)) continue;
    const key = `${source}:${ticker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ source, ticker });
    if (items.length >= MAX_ITEMS) break;
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "items required (source:ticker,...)" }, { status: 400 });
  }

  // 5 s polling is 12 requests a minute per tab; leave room for a few tabs.
  const rl = await rateLimit(`quotes:${clientIp(request)}`, 120, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const { realtime } = await getViewer();
  const quotes = await getBatchQuotes(items, { realtime });
  return NextResponse.json(quotes, {
    headers: { "Cache-Control": "no-cache, no-store, must-revalidate", Vary: "Cookie" },
  });
}
