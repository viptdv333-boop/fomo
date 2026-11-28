import { coinIcon } from "./bybit-spot-search";
import { fxIcon, parseFxSymbol } from "./forex-meta";
import { moexAssetGroup } from "./futures-assets";
import type { FutAsset, MarketItem } from "./market-types";
import tinkoffIcons from "./tinvest-icons.generated.json";

type TInvestKind = "stock" | "bond" | "fund" | "future" | "currency";
const TINVEST_ALIASES = (tinkoffIcons as { aliases?: Record<string, string> }).aliases ?? {};

function tInvestKind(group?: string): TInvestKind | null {
  if (group === "stock") return "stock";
  if (group === "bond") return "bond";
  if (group === "fund") return "fund";
  if (group === "future") return "future";
  if (group === "currency") return "currency";
  return null;
}

/** Official T-Invest brand artwork for known instruments and exact contracts. */
export function tinkoffInstrumentIcon(kind: string | undefined, ...symbols: Array<string | undefined>): string {
  const kinds: TInvestKind[] = kind && tInvestKind(kind) ? [tInvestKind(kind)!] : ["stock", "future", "fund", "bond", "currency"];
  for (const symbol of symbols) {
    const ticker = (symbol ?? "").trim().toUpperCase();
    if (!ticker) continue;
    if (ticker.startsWith("ISIN:")) {
      const byIsin = TINVEST_ALIASES[`isin:${ticker.slice(5)}`];
      if (byIsin) return byIsin;
      continue;
    }
    for (const candidate of kinds) {
      const path = TINVEST_ALIASES[`${candidate}:${ticker}`];
      if (path) return path;
    }
  }
  return "";
}

const CLASS_ICON: Record<FutAsset, string> = {
  oil: "/icons/instruments/oil.svg",
  gas: "/icons/instruments/gas.svg",
  gold: "/icons/instruments/gold.svg",
  silver: "/icons/instruments/silver.svg",
  copper: "/icons/instruments/copper.svg",
  platinum: "/icons/instruments/platinum.svg",
  palladium: "/icons/instruments/palladium.svg",
  index: "/icons/categories/indices.svg",
  currency: "/icons/categories/currencies.svg",
  bond: "/icons/categories/indices.svg",
  grain: "/icons/instruments/wheat.svg",
  soft: "/icons/categories/commodities.svg",
  livestock: "/icons/categories/commodities.svg",
  crypto: "/icons/categories/crypto.svg",
  stock: "/icons/categories/stocks-ru.svg",
  other: "/icons/categories/commodities.svg",
};

const FUTURE_TICKER_ICON: Record<string, string> = {
  AI92: "gasoline", AI95: "gasoline", WTI: "oil", TTF: "euro-gas",
  WHEAT: "wheat", CORN: "corn", SOY: "soy",
  SUGAR: "sugar", SUGR: "sugar", COCOA: "cocoa", COFFEE: "coffee", ORANGE: "orange-juice",
};

// MOEX continuous commodity futures (for example PLD1!) do not always have a
// separate brand entry in T-Invest's instrument catalogue. Reuse the official
// T-Invest logo for the underlying asset when the exact contract has no logo.
const FUTURE_TINVEST_LOGO: Partial<Record<FutAsset, string>> = {
  gold: "/icons/instruments/tinvest/Gold1x160.webp",
  silver: "/icons/instruments/tinvest/Silv1x160.webp",
  platinum: "/icons/instruments/tinvest/Platinumx160.webp",
  palladium: "/icons/instruments/tinvest/Palladiumx160.webp",
};

function futureFamilyLogo(asset: string, hint?: FutAsset): string {
  const family = hint ?? moexAssetGroup(asset);
  return FUTURE_TINVEST_LOGO[family] ?? "";
}

const categoryPath = (name: string) => `/icons/categories/${name}.svg`;

/** Artwork for any listed or newly discovered futures family. */
export function futuresIcon(asset: string, group?: FutAsset): string {
  const upper = asset.toUpperCase();
  const specific = FUTURE_TICKER_ICON[upper];
  if (specific) return `/icons/instruments/${specific}.svg`;
  const klass = group ?? moexAssetGroup(asset);
  return CLASS_ICON[klass] || categoryPath("commodities");
}

/** Last-resort icon resolver for old saved rows, ad-hoc symbols and exact contracts. */
export function instrumentIconFallback(inst: {
  source: string;
  ticker: string;
  dataTicker: string;
  group?: string;
}): string {
  const providerLogo = tinkoffInstrumentIcon(inst.group, inst.dataTicker, inst.ticker);
  if (providerLogo) return providerLogo;
  if (inst.source === "forex") {
    return parseFxSymbol(inst.dataTicker) ? fxIcon(inst.dataTicker) : categoryPath("forex");
  }
  if (inst.source === "bybit" || inst.source === "binance") {
    const symbol = inst.dataTicker.toUpperCase().replace(/\.P$/, "").replace(/[-_]\d{1,2}[A-Z]{3}\d{2}$/, "");
    const base = symbol.match(/^([A-Z0-9]+?)(?:USDT|USDC|USD|BTC|ETH)$/)?.[1] ?? symbol;
    return coinIcon(base);
  }
  if (inst.source === "moex" && inst.group === "future") {
    const symbol = (inst.dataTicker || inst.ticker).replace(/\d!$/, "").replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, "");
    return futureFamilyLogo(symbol) || futuresIcon(symbol);
  }
  if (inst.group === "future") return futuresIcon(inst.dataTicker || inst.ticker, undefined);
  if (inst.group === "stock") return categoryPath("stocks-ru");
  if (inst.group === "fund") return categoryPath("funds");
  if (inst.group === "bond") return categoryPath("bonds");
  if (inst.group === "option") return categoryPath("options");
  if (inst.group === "currency") return categoryPath("currencies");
  if (inst.group === "index") return categoryPath("indices");
  if (inst.group === "crypto") return categoryPath("crypto");
  if (inst.source === "moex" || inst.source === "fmp" || inst.source === "databento" || inst.source === "twelvedata" || inst.source === "yahoo") return categoryPath("stocks-ru");
  return categoryPath("commodities");
}

/** Market-row resolver: T-Invest artwork first, then a non-empty class icon. */
export function marketItemIcon(item: MarketItem): string {
  const providerLogo = tinkoffInstrumentIcon(item.group, item.secid, item.ticker, item.isin ? `ISIN:${item.isin}` : undefined);
  if (providerLogo) return providerLogo;
  if (item.group === "future") return futureFamilyLogo(item.asset || item.secid, item.fgroup) || futuresIcon(item.asset || item.secid, item.fgroup);
  if (item.group === "stock") return categoryPath("stocks-ru");
  if (item.group === "fund") return categoryPath("funds");
  if (item.group === "bond") return categoryPath("bonds");
  if (item.group === "option") return categoryPath("options");
  if (item.group === "currency") return categoryPath("currencies");
  if (item.group === "index") return categoryPath("indices");
  if (item.group === "crypto") return categoryPath("crypto");
  if (item.group === "forex") return categoryPath("forex");
  return categoryPath("commodities");
}
