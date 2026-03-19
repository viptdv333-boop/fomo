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
  // Extended data
  numTrades: number | null;
  bid: number | null;
  offer: number | null;
  spread: number | null;
  waprice: number | null;
  openInterest: number | null;
  prevClose: number | null;
  marketCap: number | null;
  low52w: number | null;
  high52w: number | null;
  lotSize: number | null;
  faceValue: number | null;
  couponValue: number | null;
  couponPercent: number | null;
  nextCouponDate: string | null;
  matDate: string | null;
  duration: number | null;
  yieldToMaturity: number | null;
  secType: "stock" | "bond" | "futures" | "currency" | "unknown";
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

interface BoardConfig {
  engine: string;
  market: string;
  secType: MoexMarketData["secType"];
}

const MOEX_BOARDS: BoardConfig[] = [
  { engine: "stock", market: "shares", secType: "stock" },
  { engine: "stock", market: "bonds", secType: "bond" },
  { engine: "currency", market: "selt", secType: "currency" },
  { engine: "futures", market: "forts", secType: "futures" },
];

async function tryFetchMarketData(
  ticker: string,
  markets: BoardConfig[]
): Promise<MoexMarketData | null> {
  for (const { engine, market, secType } of markets) {
    try {
      // Fetch both marketdata and securities blocks
      const url = `https://iss.moex.com/iss/engines/${engine}/markets/${market}/securities/${ticker}.json?iss.meta=off&iss.only=marketdata,securities`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;

      const json = await res.json();

      // Parse marketdata
      const mdColumns = json.marketdata?.columns as string[] | undefined;
      const mdData = json.marketdata?.data as (string | number | null)[][] | undefined;

      if (!mdColumns || !mdData || mdData.length === 0) continue;

      const mdRow = mdData[0];
      const md = (name: string) => {
        const idx = mdColumns.indexOf(name);
        return idx >= 0 ? mdRow[idx] : null;
      };

      const last = md("LAST") as number | null;
      if (last === null) continue;

      // Parse securities (for static info like lot size, face value, etc.)
      const secColumns = json.securities?.columns as string[] | undefined;
      const secData = json.securities?.data as (string | number | null)[][] | undefined;
      const secRow = secData && secData.length > 0 ? secData[0] : null;
      const sec = (name: string) => {
        if (!secColumns || !secRow) return null;
        const idx = secColumns.indexOf(name);
        return idx >= 0 ? secRow[idx] : null;
      };

      const bid = md("BID") as number | null;
      const offer = md("OFFER") as number | null;

      return {
        last,
        change: md("CHANGE") as number | null,
        changePercent: md("LASTTOPREVPRICE") as number | null,
        open: md("OPEN") as number | null,
        high: md("HIGH") as number | null,
        low: md("LOW") as number | null,
        volume: md("VOLTODAY") as number | null,
        value: md("VALTODAY") as number | null,
        updateTime: md("UPDATETIME") as string | null,
        // Extended
        numTrades: md("NUMTRADES") as number | null,
        bid,
        offer,
        spread: bid && offer ? +(offer - bid).toFixed(4) : null,
        waprice: md("WAPRICE") as number | null,
        openInterest: md("OPENPOSITION") as number | null ?? md("OPENINTEREST") as number | null,
        prevClose: (sec("PREVPRICE") ?? sec("PREVADMITTEDQUOTE") ?? md("CLOSEPRICE")) as number | null,
        marketCap: md("ISSUECAPITALIZATION") as number | null ?? md("MARKETPRICE3") as number | null,
        low52w: sec("LOW52") as number | null ?? md("LOW52") as number | null,
        high52w: sec("HIGH52") as number | null ?? md("HIGH52") as number | null,
        lotSize: sec("LOTSIZE") as number | null,
        faceValue: sec("FACEVALUE") as number | null,
        couponValue: sec("COUPONVALUE") as number | null,
        couponPercent: sec("COUPONPERCENT") as number | null,
        nextCouponDate: sec("NEXTCOUPON") as string | null,
        matDate: sec("MATDATE") as string | null,
        duration: md("DURATION") as number | null,
        yieldToMaturity: md("YIELD") as number | null ?? md("YIELDTOPREVYIELD") as number | null,
        secType,
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
          { engine: "futures", market: "forts", secType: "futures" },
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
