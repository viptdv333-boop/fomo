import { NextRequest, NextResponse } from "next/server";

const SLUG_TO_COINGECKO: Record<string, string> = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  solana: "solana",
  xrp: "ripple",
  bnb: "binancecoin",
  dogecoin: "dogecoin",
  cardano: "cardano",
  avalanche: "avalanche-2",
  polkadot: "polkadot",
  chainlink: "chainlink",
  litecoin: "litecoin",
  polygon: "matic-network",
  toncoin: "the-open-network",
  "sui-crypto": "sui",
  pepe: "pepe",
};

interface CoinGeckoResponse {
  name: string;
  market_data: {
    market_cap: Record<string, number>;
    circulating_supply: number;
    total_supply: number | null;
    max_supply: number | null;
    ath: Record<string, number>;
    ath_date: Record<string, string>;
    atl: Record<string, number>;
    atl_date: Record<string, string>;
    price_change_percentage_24h: number | null;
    price_change_percentage_7d: number | null;
    price_change_percentage_30d: number | null;
    market_cap_rank: number | null;
    fully_diluted_valuation: Record<string, number>;
    total_volume: Record<string, number>;
  };
}

export async function GET(request: NextRequest) {
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug) {
    return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
  }

  const coinGeckoId = SLUG_TO_COINGECKO[slug];
  if (!coinGeckoId) {
    return NextResponse.json({ error: "Unknown asset slug" }, { status: 404 });
  }

  try {
    const url = `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&community_data=false&developer_data=false`;

    const res = await fetch(url, { next: { revalidate: 300 } });

    if (!res.ok) {
      if (res.status === 429) {
        return NextResponse.json(
          { error: "Rate limit exceeded, try again later" },
          { status: 429 }
        );
      }
      return NextResponse.json(
        { error: "CoinGecko API error" },
        { status: res.status }
      );
    }

    const data: CoinGeckoResponse = await res.json();
    const md = data.market_data;

    const result = {
      name: data.name,
      market_cap_rank: md.market_cap_rank,
      market_cap: md.market_cap?.usd ?? null,
      fully_diluted_valuation: md.fully_diluted_valuation?.usd ?? null,
      total_volume: md.total_volume?.usd ?? null,
      circulating_supply: md.circulating_supply ?? null,
      total_supply: md.total_supply,
      max_supply: md.max_supply,
      ath: md.ath?.usd ?? null,
      ath_date: md.ath_date?.usd ?? null,
      atl: md.atl?.usd ?? null,
      atl_date: md.atl_date?.usd ?? null,
      price_change_24h: md.price_change_percentage_24h,
      price_change_7d: md.price_change_percentage_7d,
      price_change_30d: md.price_change_percentage_30d,
    };

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("CoinGecko API error:", err);
    return NextResponse.json({ error: "CoinGecko API error" }, { status: 502 });
  }
}
