/**
 * Yahoo instrument search for the universal market search: the keyless v1/finance/search endpoint plus a curated
 * popular list (US stocks & CME futures, London, Hong Kong, Xetra, Tokyo). Rows carry their own venue / country.
 * Only instrument types the klines source serves are offered (equities, funds, indices, futures); crypto / FX stay
 * with Bybit / Binance / the forex layer.
 */
import type { MarketItem, MarketGroup, FutAsset } from "./market-types";
import { TtlCache } from "./fomo-ideas";
import { yahooMeta } from "./data/yahoo";

const HOSTS = ["https://query1.finance.yahoo.com", "https://query2.finance.yahoo.com"];

/** Yahoo exchange code → [venue label, ISO country]; unknown codes fall back to the display name. */
const VENUE: Record<string, [string, string]> = {
  NMS: ["Nasdaq", "US"], NGM: ["Nasdaq", "US"], NCM: ["Nasdaq", "US"], NYQ: ["NYSE", "US"], ASE: ["NYSE American", "US"], PCX: ["NYSE Arca", "US"], BTS: ["BATS", "US"],
  LSE: ["LSE", "GB"], IOB: ["LSE Intl", "GB"],
  GER: ["Xetra", "DE"], FRA: ["Frankfurt", "DE"], MUN: ["Munich", "DE"], BER: ["Berlin", "DE"], DUS: ["Düsseldorf", "DE"], HAM: ["Hamburg", "DE"], STU: ["Stuttgart", "DE"],
  HKSE: ["HKEX", "HK"],
  JPX: ["Tokyo", "JP"], TYO: ["Tokyo", "JP"], OSA: ["Osaka", "JP"],
  PAR: ["Euronext Paris", "FR"], AMS: ["Euronext Amsterdam", "NL"], BRU: ["Euronext Brussels", "BE"], LIS: ["Euronext Lisbon", "PT"],
  MIL: ["Borsa Italiana", "IT"], MCE: ["BME Madrid", "ES"],
  STO: ["Nasdaq Stockholm", "SE"], HEL: ["Nasdaq Helsinki", "FI"], CPH: ["Nasdaq Copenhagen", "DK"], OSL: ["Oslo", "NO"],
  TOR: ["Toronto", "CA"], VAN: ["TSX Venture", "CA"],
  ASX: ["ASX", "AU"], NZE: ["NZX", "NZ"],
  KSC: ["KOSPI", "KR"], KOS: ["KOSDAQ", "KR"], TAI: ["TWSE", "TW"], TWO: ["TPEx", "TW"],
  SHH: ["Shanghai", "CN"], SHZ: ["Shenzhen", "CN"], BSE: ["BSE", "IN"], NSE: ["NSE", "IN"],
};

/** CME/CBOT/NYMEX/COMEX continuous contracts → the futures chip's asset class. */
const FUT_ASSET: Record<string, FutAsset> = {
  "ES=F": "index", "NQ=F": "index", "YM=F": "index", "RTY=F": "index", "NI=F": "index",
  "CL=F": "oil", "BZ=F": "oil", "NG=F": "gas", "GC=F": "gold", "SI=F": "silver", "HG=F": "copper", "PL=F": "platinum", "PA=F": "palladium",
  "ZC=F": "grain", "ZW=F": "grain", "ZS=F": "grain", "ZM=F": "grain", "ZO=F": "grain", "ZR=F": "grain",
  "ZL=F": "soft", "KC=F": "soft", "CC=F": "soft", "SB=F": "soft", "CT=F": "soft", "OJ=F": "soft",
  "LE=F": "livestock", "HE=F": "livestock", "GF=F": "livestock",
  "ZB=F": "bond", "ZN=F": "bond", "ZF=F": "bond", "ZT=F": "bond", "UB=F": "bond",
  "6E=F": "currency", "6J=F": "currency", "6B=F": "currency", "6A=F": "currency", "6C=F": "currency", "6S=F": "currency", "6M=F": "currency",
  "BTC=F": "crypto", "ETH=F": "crypto",
};

const TYPE_GROUP: Record<string, MarketGroup> = {
  EQUITY: "stock",
  ETF: "fund",
  MUTUALFUND: "fund",
  INDEX: "index",
  FUTURE: "future",
};

function venueOf(exchangeCode: string, display: string): { exchange: string; country?: string } {
  const v = VENUE[exchangeCode];
  return v ? { exchange: v[0], country: v[1] } : { exchange: display || exchangeCode || "Yahoo" };
}

function itemOf(symbol: string, name: string, quoteType: string, exchangeCode: string, display: string): MarketItem | null {
  const group = TYPE_GROUP[quoteType];
  if (!group || !symbol) return null;
  const { exchange, country } = venueOf(exchangeCode, display);
  const item: MarketItem = { secid: symbol, ticker: symbol, name: name || symbol, group, source: "yahoo", exchange, country };
  if (group === "future") item.fgroup = FUT_ASSET[symbol] ?? "other";
  if (group === "index") item.sub = "equity";
  return item;
}

/** Curated popular rows: what the chips show before anything is typed. */
export const YAHOO_POPULAR: MarketItem[] = [
  ["AAPL", "Apple", "EQUITY", "NMS", "NasdaqGS"],
  ["MSFT", "Microsoft", "EQUITY", "NMS", "NasdaqGS"],
  ["NVDA", "NVIDIA", "EQUITY", "NMS", "NasdaqGS"],
  ["TSLA", "Tesla", "EQUITY", "NMS", "NasdaqGS"],
  ["AMZN", "Amazon", "EQUITY", "NMS", "NasdaqGS"],
  ["GOOGL", "Alphabet", "EQUITY", "NMS", "NasdaqGS"],
  ["META", "Meta Platforms", "EQUITY", "NMS", "NasdaqGS"],
  ["SPY", "SPDR S&P 500 ETF", "ETF", "PCX", "NYSEArca"],
  ["ES=F", "E-mini S&P 500", "FUTURE", "CME", "CME"],
  ["NQ=F", "E-mini Nasdaq 100", "FUTURE", "CME", "CME"],
  ["CL=F", "Crude Oil WTI", "FUTURE", "NYM", "NY Mercantile"],
  ["GC=F", "Gold", "FUTURE", "CMX", "COMEX"],
  ["SHEL.L", "Shell", "EQUITY", "LSE", "LSE"],
  ["HSBA.L", "HSBC", "EQUITY", "LSE", "LSE"],
  ["SAP.DE", "SAP", "EQUITY", "GER", "XETRA"],
  ["SIE.DE", "Siemens", "EQUITY", "GER", "XETRA"],
  ["0700.HK", "Tencent", "EQUITY", "HKSE", "HKSE"],
  ["9988.HK", "Alibaba", "EQUITY", "HKSE", "HKSE"],
  ["7203.T", "Toyota", "EQUITY", "JPX", "Tokyo"],
  ["6758.T", "Sony", "EQUITY", "JPX", "Tokyo"],
  ["^GSPC", "S&P 500", "INDEX", "SNP", "S&P 500"],
  ["^N225", "Nikkei 225", "INDEX", "OSA", "Osaka"],
  ["^GDAXI", "DAX", "INDEX", "GER", "XETRA"],
  ["^FTSE", "FTSE 100", "INDEX", "LSE", "LSE"],
].map(([s, n, t, e, d]) => itemOf(s, n, t, e, d)!).filter(Boolean);

/** The popular rows of one chip: stocks+funds for «Акции», the CME block for «Фьючерсы», a short mix for «Все». */
export function yahooPopularFor(group: string): MarketItem[] {
  if (group === "stock") return YAHOO_POPULAR.filter((i) => i.group === "stock" || i.group === "fund");
  if (group === "fund") return YAHOO_POPULAR.filter((i) => i.group === "fund");
  if (group === "future") return YAHOO_POPULAR.filter((i) => i.group === "future");
  if (group === "index") return YAHOO_POPULAR.filter((i) => i.group === "index");
  if (group === "all") return YAHOO_POPULAR.filter((i) => ["AAPL", "NVDA", "ES=F", "GC=F", "SAP.DE", "0700.HK", "7203.T", "^GSPC"].includes(i.secid));
  return [];
}

const searchCache = new TtlCache<MarketItem[]>(200);

/** A typed query against Yahoo's search endpoint; only the types the klines source serves. Cached 10 min. */
export async function searchYahoo(q: string, limit: number = 20): Promise<MarketItem[]> {
  const query = q.trim();
  if (query.length < 1) return [];
  const key = `y|${query.toLowerCase()}|${limit}`;
  const hit = searchCache.get(key, Date.now());
  if (hit) return hit;
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${Math.min(limit, 25)}&newsCount=0&listsCount=0`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      });
      if (!res.ok) continue;
      const j = await res.json();
      const quotes: any[] = Array.isArray(j?.quotes) ? j.quotes : [];
      const items = quotes
        .map((x) => itemOf(x.symbol, x.shortname || x.longname, x.quoteType, x.exchange, x.exchDisp))
        .filter((x): x is MarketItem => !!x)
        .slice(0, limit);
      searchCache.set(key, items, 10 * 60_000, Date.now());
      return items;
    } catch {
      /* next host */
    }
  }
  return [];
}

const metaCache = new TtlCache<MarketItem | null>(500);

/** Exact lookup of a Yahoo-style id (suffix .L / .HK / .DE / .T, futures =F, index ^, or a plain US ticker). */
export async function lookupYahoo(id: string): Promise<MarketItem | null> {
  if (!/^[A-Za-z0-9.^=\-]{1,20}$/.test(id)) return null;
  // a plain 1-5 letter ticker may be Yahoo's (US) — but only after the MOEX lookup missed; suffixed/=/^ ids are Yahoo-shaped
  const yahooShaped = /[.=^]/.test(id);
  if (!yahooShaped && !/^[A-Z]{1,5}$/.test(id.toUpperCase())) return null;
  const key = id.toUpperCase();
  const hit = metaCache.get(key, Date.now());
  if (hit !== undefined) return hit;
  const meta = await yahooMeta(key);
  const item = meta ? itemOf(meta.symbol, meta.symbol, meta.quoteType, meta.exchangeCode, meta.exchange) : null;
  metaCache.set(key, item, 60 * 60_000, Date.now());
  return item;
}
