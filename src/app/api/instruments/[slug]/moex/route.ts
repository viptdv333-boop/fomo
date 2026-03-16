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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const instrument = await prisma.instrument.findUnique({
    where: { slug },
    select: { ticker: true, exchange: true },
  });

  if (!instrument || !instrument.ticker) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (instrument.exchange !== "MOEX") {
    return NextResponse.json({ error: "MOEX data only" }, { status: 400 });
  }

  try {
    // Try futures market first, then stock market
    const markets = [
      { engine: "futures", market: "forts" },
      { engine: "stock", market: "shares" },
      { engine: "stock", market: "bonds" },
      { engine: "currency", market: "selt" },
    ];

    let data: MoexMarketData | null = null;

    for (const { engine, market } of markets) {
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities/${instrument.ticker}.json?iss.meta=off&iss.only=marketdata,securities`;

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

      data = {
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
      break;
    }

    if (!data) {
      return NextResponse.json({ error: "No market data" }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("MOEX API error:", err);
    return NextResponse.json({ error: "MOEX API error" }, { status: 502 });
  }
}
