import { coinIcon } from "./bybit-spot-search";
import { fxIcon, parseFxSymbol } from "./forex-meta";
import { knownMoexAssets, moexAssetGroup } from "./futures-assets";
import { usFutureBySymbol } from "./us-futures";
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
      if (candidate === "future") {
        const underlyingLogo = futureFamilyLogo(ticker);
        if (underlyingLogo) return underlyingLogo;
      }
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
  if (hint && FUTURE_TINVEST_LOGO[hint]) return FUTURE_TINVEST_LOGO[hint]!;
  const ticker = asset.trim().toUpperCase();
  const roots = [
    ticker.replace(/\d!$/, ""),
    ticker.replace(/-[A-Z0-9]{1,2}\.\d{2}$/, ""),
    ticker.replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, ""),
    ticker,
  ];
  for (const root of new Set(roots)) {
    if (!root || root === ticker) continue;
    const logo = FUTURE_TINVEST_LOGO[moexAssetGroup(root)];
    if (logo) return logo;
  }
  return FUTURE_TINVEST_LOGO[moexAssetGroup(ticker)] ?? "";
}

const categoryPath = (name: string) => `/icons/categories/${name}.svg`;

// The main watchlist is mirrored between fomo.spot and terminal.fomo.spot as
// ticker/source/name. Dynamic exchange-search metadata (group/emoji) is not
// stored with the row, so infer known MOEX futures from their stable ticker
// roots. This keeps a contract's icon the same after it is mirrored/reloaded.
const KNOWN_MOEX_FUTURES = new Set(knownMoexAssets().map((x) => x.toUpperCase()));
function moexFutureRoot(...symbols: Array<string | undefined>): string | null {
  for (const symbol of symbols) {
    const raw = (symbol ?? "").trim().toUpperCase();
    if (!raw) continue;
    const roots = [
      raw.replace(/\d!$/, ""),
      raw.replace(/-[A-Z0-9]{1,2}\.\d{2}$/, ""),
      raw.replace(/[FGHJKMNQUVXZ]\d{1,2}$/, ""),
      raw,
    ];
    for (const root of roots) if (KNOWN_MOEX_FUTURES.has(root)) return root;
  }
  return null;
}

type IconInstrument = { source: string; ticker: string; dataTicker: string; group?: string; emoji?: string };
function inferredGroup(inst: IconInstrument): string | undefined {
  if (inst.group) return inst.group;
  if (inst.source === "moex" && moexFutureRoot(inst.dataTicker, inst.ticker)) return "future";
  if (inst.source === "fmp" && (usFutureBySymbol(inst.dataTicker) || usFutureBySymbol(inst.ticker))) return "future";
  return undefined;
}

/** One resolved artwork path for the catalog, web watchlist and app watchlist. */
export function instrumentIcon(inst: IconInstrument): string {
  const group = inferredGroup(inst);
  const fallback = instrumentIconFallback({ ...inst, group });
  return tinkoffInstrumentIcon(group, inst.dataTicker, inst.ticker) || (fallback.includes("/tinvest/") ? fallback : "") || inst.emoji || fallback;
}

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
  const group = inferredGroup(inst);
  const providerLogo = tinkoffInstrumentIcon(group, inst.dataTicker, inst.ticker);
  if (providerLogo) return providerLogo;
  if (inst.source === "forex") {
    return parseFxSymbol(inst.dataTicker) ? fxIcon(inst.dataTicker) : categoryPath("forex");
  }
  if (inst.source === "bybit" || inst.source === "binance") {
    const symbol = inst.dataTicker.toUpperCase().replace(/\.P$/, "").replace(/[-_]\d{1,2}[A-Z]{3}\d{2}$/, "");
    const base = symbol.match(/^([A-Z0-9]+?)(?:USDT|USDC|USD|BTC|ETH)$/)?.[1] ?? symbol;
    return coinIcon(base);
  }
  const moexFuture = inst.source === "moex" ? moexFutureRoot(inst.dataTicker, inst.ticker) : null;
  if (inst.source === "moex" && (group === "future" || moexFuture)) {
    const symbol = moexFuture ?? (inst.dataTicker || inst.ticker).replace(/\d!$/, "").replace(/[FGHJKMNQUVXZ]\d{1,2}$/i, "");
    return futureFamilyLogo(symbol) || futuresIcon(symbol);
  }
  if (group === "future") {
    const us = inst.source === "fmp" ? usFutureBySymbol(inst.dataTicker) ?? usFutureBySymbol(inst.ticker) : undefined;
    return us?.icon || futuresIcon(inst.dataTicker || inst.ticker, undefined);
  }
  if (group === "stock") return categoryPath("stocks-ru");
  if (group === "fund") return categoryPath("funds");
  if (group === "bond") return categoryPath("bonds");
  if (group === "option") return categoryPath("options");
  if (group === "currency") return categoryPath("currencies");
  if (group === "index") return categoryPath("indices");
  if (group === "crypto") return categoryPath("crypto");
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
