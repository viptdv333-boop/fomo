import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

// GET: Fetch all active futures contracts for this instrument from MOEX
export async function GET(_req: NextRequest, context: RouteContext) {
  const { slug } = await context.params;

  const instrument = await prisma.instrument.findFirst({
    where: { OR: [{ slug }, { id: slug }] },
    select: { dataTicker: true, ticker: true, dataSource: true },
  });

  if (!instrument) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (instrument.dataSource !== "moex") {
    return NextResponse.json({ contracts: [], source: "unsupported" });
  }

  const assetCode = instrument.dataTicker || instrument.ticker;
  if (!assetCode) {
    return NextResponse.json({ contracts: [], source: "no_ticker" });
  }

  try {
    // Fetch from MOEX ISS API
    const url = `https://iss.moex.com/iss/engines/futures/markets/forts/securities.json?assetcode=${encodeURIComponent(assetCode)}`;
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error("MOEX API error");

    const data = await res.json();

    // Parse securities table
    const secCols: string[] = data.securities?.columns || [];
    const secRows: any[][] = data.securities?.data || [];

    // Parse marketdata table
    const mdCols: string[] = data.marketdata?.columns || [];
    const mdRows: any[][] = data.marketdata?.data || [];

    // Build index maps
    const secIdx = Object.fromEntries(secCols.map((c, i) => [c, i]));
    const mdIdx = Object.fromEntries(mdCols.map((c, i) => [c, i]));

    // Build contract map by SECID
    const contracts: any[] = [];

    for (let i = 0; i < secRows.length; i++) {
      const sec = secRows[i];
      const md = mdRows[i]; // same index

      const secid = sec[secIdx["SECID"]];
      const shortname = sec[secIdx["SHORTNAME"]];
      const lastTradeDate = sec[secIdx["LASTTRADEDATE"]];

      const last = md?.[mdIdx["LAST"]];
      const open = md?.[mdIdx["OPEN"]];
      const high = md?.[mdIdx["HIGH"]];
      const low = md?.[mdIdx["LOW"]];
      const settle = md?.[mdIdx["SETTLEPRICE"]];
      const change = md?.[mdIdx["LASTCHANGE"]];
      const changePct = md?.[mdIdx["LASTCHANGEPRCNT"]];
      const volume = md?.[mdIdx["VOLTODAY"]];
      const openInterest = md?.[mdIdx["OPENPOSITION"]];
      const numTrades = md?.[mdIdx["NUMTRADES"]];
      const updateTime = md?.[mdIdx["UPDATETIME"]];

      // Skip contracts with no data
      if (!last && !settle && !volume) continue;

      contracts.push({
        secid,
        shortname,
        lastTradeDate,
        last,
        open,
        high,
        low,
        settle,
        change,
        changePct,
        volume,
        openInterest,
        numTrades,
        updateTime,
      });
    }

    // Sort by expiry (SECID contains month/year code)
    contracts.sort((a, b) => (a.secid || "").localeCompare(b.secid || ""));

    return NextResponse.json({ contracts, assetCode, source: "moex" });
  } catch (err) {
    console.error("MOEX contracts fetch error:", err);
    return NextResponse.json({ contracts: [], source: "error" });
  }
}
