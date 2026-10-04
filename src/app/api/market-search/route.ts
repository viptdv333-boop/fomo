import { NextRequest, NextResponse } from "next/server";
import { lookupMarket, searchMarket } from "@/lib/moex-search";
import { ipOf, overLimit } from "@/lib/mem-rate-limit";
import type { MarketGroup } from "@/lib/market-types";

/**
 * Universal MOEX search (shares of all boards, bonds, funds / ETFs, currency, indices, FORTS futures with their contracts).
 *   GET /api/market-search?q=sber&group=all|stock|bond|fund|future|currency|index|crypto&limit=30
 *   GET /api/market-search?secid=SU26238RMFS4        exact lookup (a URL ?symbol=): { item }
 * Public, rate limited per IP, results cached for a minute.
 */

export const dynamic = "force-dynamic";

const GROUPS = new Set(["all", "stock", "bond", "fund", "future", "currency", "index", "crypto"]);
const ID_RE = /^[A-Za-z0-9_.-]{1,24}$/;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (overLimit(`msearch:${ipOf(req)}`, 90)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } });

  const secid = sp.get("secid");
  if (secid) {
    if (!ID_RE.test(secid)) return NextResponse.json({ item: null }, { status: 400 });
    const item = await lookupMarket(secid);
    return NextResponse.json({ item }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  }

  const q = (sp.get("q") ?? "").trim().slice(0, 60);
  const g = sp.get("group") ?? "all";
  const group = (GROUPS.has(g) ? g : "all") as MarketGroup | "all";
  // crypto tab with nothing typed: the popular pairs (the tab is never empty)
  if (!q && group !== "crypto") return NextResponse.json({ items: [] });
  const limit = Math.max(1, Math.min(60, parseInt(sp.get("limit") ?? "30") || 30));
  const items = await searchMarket(q, group, limit);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
}
