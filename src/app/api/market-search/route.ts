import { NextRequest, NextResponse } from "next/server";
import { lookupMarket, popularMarketPage, searchMarketPage } from "@/lib/moex-search";
import { ipOf, overLimit } from "@/lib/mem-rate-limit";
import { isFutAsset } from "@/lib/futures-assets";
import { GROUP_TABS } from "@/lib/instrument-filters";
import type { Filters } from "@/lib/instrument-filters";
import type { GroupTab } from "@/lib/market-types";

/**
 * Universal market search (shares of all boards, bonds, funds / ETFs, MOEX currency and indices, FORTS futures with their contracts and the US futures
 * table, Bybit spot, forex pairs): one page of a chip's list, tagged with the venue / country / category and filtered.
 *   GET /api/market-search?q=sber&group=all|stock|fund|future|forex|currency|crypto|index|bond&limit=40&offset=0
 *       &country=RU|US  &venue=<exchange / board / category / quote of the chip>  &asset=oil|gas|...  (futures: underlying class)
 *     -> { items, total, hasMore, facets: { countries, venues }, popular?: true }
 *   GET /api/market-search?group=future                  empty query: the chip's popular list (the whole futures catalogue grouped by asset)
 *   GET /api/market-search?secid=SU26238RMFS4            exact lookup (a URL ?symbol=): { item }
 * Public, rate limited per IP, results cached for a minute.
 */

export const dynamic = "force-dynamic";

const ID_RE = /^[A-Za-z0-9_.-]{1,24}$/;
const FILTER_RE = /^[A-Za-z0-9_.-]{1,24}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (overLimit(`msearch:${ipOf(req)}`, 120)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } });

  const secid = sp.get("secid");
  if (secid) {
    if (!ID_RE.test(secid)) return NextResponse.json({ item: null }, { status: 400 });
    const item = await lookupMarket(secid);
    return NextResponse.json({ item }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  }

  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const g = sp.get("group") ?? "all";
  const group = (GROUP_TABS as string[]).includes(g) ? (g as GroupTab) : "all";
  const limit = Math.max(1, Math.min(100, parseInt(sp.get("limit") ?? "40") || 40));
  const offset = Math.max(0, Math.min(5000, parseInt(sp.get("offset") ?? "0") || 0));
  const country = sp.get("country") ?? "";
  const venue = sp.get("venue") ?? "";
  const asset = sp.get("asset") ?? "";
  const filters: Filters = {
    country: FILTER_RE.test(country) ? country.toUpperCase() : "",
    venue: FILTER_RE.test(venue) ? venue : "",
    asset: group === "future" && isFutAsset(asset) ? asset : "",
  };
  const opts = { limit, offset, filters };

  // nothing typed: every chip has its «popular» list (server cached, curated fallback when ISS is down), so no tab is ever empty
  if (!q) {
    const page = await popularMarketPage(group, opts);
    return NextResponse.json({ ...page, popular: true }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  }
  const page = await searchMarketPage(q, group, opts);
  return NextResponse.json(page, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
