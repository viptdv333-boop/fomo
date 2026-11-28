import { NextRequest, NextResponse } from "next/server";
import { continuousRank } from "@/lib/continuous-futures";
import { chainRolls } from "@/lib/continuous-futures";
import { getCatalogue } from "@/lib/moex-continuous";
import { mskDate } from "@/lib/moex-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The past roll points of a continuous futures series (NG1!, BR2!, …): where the chain switched contracts.
 *  The chart marks these on the spliced series. Device-independent, computed from the live MOEX catalogue. */
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") || "").trim().toUpperCase();
  const rank = continuousRank(ticker);
  if (!rank) return NextResponse.json({ rolls: [] });
  const asset = ticker.slice(0, -2);
  try {
    const catalogue = await getCatalogue(asset);
    const rolls = chainRolls(catalogue, rank, mskDate());
    return NextResponse.json({ rolls }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch {
    return NextResponse.json({ rolls: [] });
  }
}