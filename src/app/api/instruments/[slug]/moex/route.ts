import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface MoexMarketData {
  last: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  value: number | null;
  updateTime: string | null;
}

// Futures prefix mapping (same as klines route)
const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", GOLD: "GD", SILV: "SV", NG: "NG", WHEAT: "W4",
  Si: "Si", Eu: "Eu", CR: "CR", NASD: "NA", SPYF: "SF",
};

async function findActiveContract(baseTicker: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[baseTicker];
  if (!prefix) return null;
  try {
    const url = `https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();
    const rows = data.securities?.data;
    if (!rows) return null;
    const today = new Date().toISOString().slice(0, 10);
    const candidates = rows
      .filter((r: any[]) => {
        const secId = r[0] as string;
        const expiry = r[2] as string;
        return secId.startsWith(prefix) && secId !== baseTicker && expiry && expiry >= today;
      })
      .sort((a: any[], b: any[]) => (a[2] as string).localeCompare(b[2] as string));
    return candidates.length > 0 ? candidates[0][0] : null;
  } catch {
    return null;
  }
}

const MOEX_BOARDS = [
  { engine: "stock", market: "shares" },
  { engine: "stock", market: "bonds" },
  { engine: "currency", market: "selt" },
  { engine: "futures", market: "forts" },
];

async function tryFetchMarketData(
  ticker: string,
  markets: { engine: string; market: string }[]
): Promise<MoexMarketData | null> {
  for (const { engine, market } of markets) {
    try {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities/${ticker}.json?iss.meta=off&iss.only=marketdata`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;

      const json = await res.json();
      const mdColumns = json.marketdata?.columns as string[] | undefined;
      const mdData = json.marketdata?.data as (string | number | null)[][] | undefined;

      if (!mdColumns || !mdData || mdData.length === 0) continue;

      const row = mdData[0];
      const col = (name: string) => {
        const idx = mdColumns.indexOf(name);
        return idx >= 0 ? row[idx] : null;
      };

      const last = col("LAST") as number | null;
      if (last === null) continue;

      return {
        last,
        change: col("CHANGE") as number | null,
        changePercent: col("LASTTOPREVPRICE") as number | null,
        open: col("OPEN") as number | null,
        high: col("HIGH") as number | null,
        low: col("LOW") as number | null,
        volume: col("VOLTODAY") as number | null,
        value: col("VALTODAY") as number | null,
        updateTime: col("UPDATETIME") as string | null,
      };
    } catch {
      continue;
    }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const instrument = await prisma.instrument.findUnique({
    where: { slug },
    select: { ticker: true, dataTicker: true, dataSource: true, exchange: true },
  });

  if (!instrument) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Use dataTicker (has specific contract/ticker), fall back to generic ticker
  const ticker = instrument.dataTicker || instrument.ticker;
  if (!ticker) {
    return NextResponse.json({ error: "No ticker" }, { status: 400 });
  }

  try {
    // 1. Try exact ticker on all boards
    let data = await tryFetchMarketData(ticker, MOEX_BOARDS);

    // 2. If failed, try auto-detecting futures contract
    if (!data) {
      const activeContract = await findActiveContract(ticker);
      if (activeContract) {
        data = await tryFetchMarketData(activeContract, [
          { engine: "futures", market: "forts" },
        ]);
      }
    }

    if (!data) {
      return NextResponse.json({ error: "No market data" }, { status: 404 });
    }

    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30" },
    });
  } catch (err) {
    console.error("MOEX API error:", err);
    return NextResponse.json({ error: "MOEX API error" }, { status: 502 });
  }
}
