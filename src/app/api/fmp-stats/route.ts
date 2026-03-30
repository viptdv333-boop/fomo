import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || "wOf19MzBRcmOUUBXVTQwUecPujpb81JU";

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

async function fetchCached(url: string): Promise<any> {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const data = await res.json();
  cache.set(url, { data, ts: Date.now() });
  return data;
}

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get("ticker");
  const type = request.nextUrl.searchParams.get("type");

  if (!ticker || !type) {
    return NextResponse.json({ error: "ticker and type required" }, { status: 400 });
  }

  if (type === "profile") {
    const data = await fetchCached(
      `https://financialmodelingprep.com/stable/profile?symbol=${ticker}&apikey=${FMP_KEY}`
    );
    const profile = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(profile || null);
  }

  if (type === "metrics") {
    const data = await fetchCached(
      `https://financialmodelingprep.com/stable/ratios-ttm?symbol=${ticker}&apikey=${FMP_KEY}`
    );
    const metrics = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(metrics || null);
  }

  return NextResponse.json({ error: "unknown type" }, { status: 400 });
}
