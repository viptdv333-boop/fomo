import { NextRequest, NextResponse } from "next/server";

const FMP_KEY = process.env.FMP_API_KEY || "wOf19MzBRcmOUUBXVTQwUecPujpb81JU";

const cache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 min

export async function GET(request: NextRequest) {
  const days = parseInt(request.nextUrl.searchParams.get("days") || "7");

  const from = new Date();
  const to = new Date();
  to.setDate(to.getDate() + days);

  const fromStr = from.toISOString().split("T")[0];
  const toStr = to.toISOString().split("T")[0];
  const cacheKey = `${fromStr}_${toStr}`;

  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(
      `https://financialmodelingprep.com/stable/economic-calendar?from=${fromStr}&to=${toStr}&apikey=${FMP_KEY}`,
      { cache: "no-store" }
    );
    if (!res.ok) return NextResponse.json([]);
    const data = await res.json();

    // Filter: only High/Medium impact, major countries
    const majorCountries = new Set(["US", "EU", "GB", "JP", "CN", "RU", "DE", "FR"]);
    const filtered = (data || [])
      .filter((e: any) => majorCountries.has(e.country) && (e.impact === "High" || e.impact === "Medium"))
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 30);

    cache.set(cacheKey, { data: filtered, ts: Date.now() });
    return NextResponse.json(filtered);
  } catch {
    return NextResponse.json([]);
  }
}
