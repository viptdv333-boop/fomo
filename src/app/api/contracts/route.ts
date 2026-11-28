import { NextRequest, NextResponse } from "next/server";
import { contractBadge, contractLabel, findFamily, getFortsFamilies, refreshDays, type Lang } from "@/lib/moex-contracts";
import { getBybitContracts } from "@/lib/bybit-contracts";
import { ipOf, overLimit } from "@/lib/mem-rate-limit";
import type { ContractInfo, ContractsResponse } from "@/lib/market-types";
import { continuousSymbol } from "@/lib/continuous-futures";
import { chainContracts } from "@/lib/ng-symbols";

/**
 * Exact tradable contracts of one underlying.
 *   GET /api/contracts?asset=MIX            (also MXZ6, IMOEXF, SBRF.F, CU, ... any ticker of the family)  &source=moex (default)
 *   GET /api/contracts?asset=BTCUSDT&source=bybit                        spot / linear perpetual / dated futures
 *   GET /api/contracts?secids=MXZ6,IMOEXF,BRX6                           -> { info: { MXZ6: {...}, ... } }  (watchlist badges)
 * &lang=ru|en|cn for the labels. Public, rate limited, cached upstream for an hour.
 */

export const dynamic = "force-dynamic";

const ID_RE = /^(?:[A-Za-z0-9_.-]{1,24}|[A-Za-z]{1,8}[12]!)$/;
const LANGS = new Set(["ru", "en", "cn"]);
const CACHE = { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" };

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  if (overLimit(`contracts:${ipOf(req)}`, 120)) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } });
  const langParam = sp.get("lang") ?? "ru";
  const lang: Lang = LANGS.has(langParam) ? (langParam as Lang) : "ru";
  const source = sp.get("source") === "bybit" ? "bybit" : "moex";

  /* badges for a list of exact secids */
  const secids = sp.get("secids");
  if (secids) {
    const families = (await getFortsFamilies()).map(refreshDays);
    const info: Record<string, ContractInfo & { asset: string; name: string; auto: string }> = {};
    for (const id of secids.split(",").slice(0, 100)) {
      if (!ID_RE.test(id)) continue;
      const sym = continuousSymbol(id);
      if (sym) {
        const fam = findFamily(families, sym.asset, true);
        const cc = chainContracts(sym.asset, fam?.name ?? sym.asset, lang).find((c) => c.ticker === id)!;
        info[id] = { ...cc, asset: sym.asset, name: fam?.name ?? sym.asset, auto: fam?.auto ?? sym.asset };
        continue;
      }
      for (const f of families) {
        const c = f.contracts.find((x) => x.secid === id);
        if (c) {
          info[id] = { ...toInfo(c, f.name, lang), asset: f.asset, name: f.name, auto: f.auto };
          break;
        }
      }
    }
    return NextResponse.json({ info }, { headers: CACHE });
  }

  const asset = sp.get("asset") ?? sp.get("ticker") ?? "";
  if (!ID_RE.test(asset)) return NextResponse.json({ error: "asset required" }, { status: 400 });

  if (source === "bybit") {
    const r = await getBybitContracts(asset, lang);
    if (!r) return NextResponse.json({ error: "unknown asset" }, { status: 404 });
    return NextResponse.json(r, { headers: CACHE });
  }

  const families = await getFortsFamilies();
  if (families.length === 0) {
    const empty: ContractsResponse = { source: "moex", asset, name: asset, auto: asset, contracts: [], unavailable: true };
    return NextResponse.json(empty, { headers: { "Cache-Control": "no-store" } });
  }
  // strict by default: "AFLT" is the share, not the futures underlying (use AFLT.F); loose=1 also matches bare underlying codes
  const fam = findFamily(families, asset, sp.get("loose") === "1");
  if (!fam) {
    // not a futures underlying (a share, a bond ...): an empty list is the authoritative answer
    const none: ContractsResponse = { source: "moex", asset, name: asset, auto: asset, contracts: [] };
    return NextResponse.json(none, { headers: CACHE });
  }
  const f = refreshDays(fam);
  // Continuous (склейка) options come FIRST, then the dated contracts — for every family with a rollable chain (≥2 dated).
  const datedCount = f.contracts.filter((c) => c.order >= 1).length;
  const continuous = datedCount >= 2 ? chainContracts(f.asset, f.name, lang) : [];
  const res: ContractsResponse = {
    source: "moex",
    asset: f.asset,
    name: f.name,
    auto: f.auto,
    current: continuousSymbol(asset) ? asset : f.contracts.find((c) => c.secid === asset)?.secid ?? f.contracts.find((c) => c.order === 1)?.secid,
    contracts: [...continuous, ...f.contracts.map((c) => toInfo(c, f.name, lang))],
  };
  return NextResponse.json(res, { headers: CACHE });
}

function toInfo(c: ReturnType<typeof refreshDays>["contracts"][number], name: string, lang: Lang): ContractInfo {
  return {
    secid: c.secid,
    ticker: c.secid,
    shortname: c.shortname,
    kind: c.kind,
    expiry: c.expiry,
    order: c.order,
    daysLeft: c.daysLeft,
    badge: contractBadge(c, lang),
    label: contractLabel(c, name, lang),
    lot: c.lot,
    decimals: c.decimals,
    minstep: c.minstep,
  };
}
