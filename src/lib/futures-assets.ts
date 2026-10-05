/**
 * Underlying asset classes of futures: the second chip row of the «Фьючерсы» chip of the instrument search dialog (Нефть, Газ, Золото ...).
 * A small curated table maps the MOEX FORTS families (ISS ASSETCODE, checked against engines/futures/markets/forts) to them; the US contracts
 * carry their class in us-futures.ts. Where Moscow Exchange has no analogue (livestock, grains other than wheat ...) only the US contracts exist:
 * nothing is invented. A FORTS family that is not in the table is a single-stock future («Акции»).
 * Pure (no Next / network imports): the server orders the lists with it, the client labels the chips, scripts/check-instrument-search.ts checks it.
 */

import type { FutAsset, MarketItem } from "./market-types";

/** The asset classes in display order (chips and group headers). */
export const FUT_ASSETS: FutAsset[] = ["oil", "gas", "gold", "silver", "copper", "platinum", "palladium", "index", "currency", "bond", "grain", "soft", "livestock", "crypto", "stock", "other"];
/** Chips of the asset row (everything but the catch-all, which only shows under «Все»). */
export const FUT_ASSET_CHIPS: FutAsset[] = FUT_ASSETS.filter((a) => a !== "other");

export function isFutAsset(v: string): v is FutAsset {
  return (FUT_ASSETS as string[]).includes(v);
}

/** FORTS ASSETCODE -> class, in the order the rows are listed inside a class. */
const MOEX_TABLE: [FutAsset, string[]][] = [
  ["oil", ["BR", "BRM", "WTI", "AI95", "AI92"]],
  ["gas", ["NG", "NGM", "TTF"]],
  ["gold", ["GOLD", "GOLDM", "GL"]],
  ["silver", ["SILV", "SILVM", "SL"]],
  ["copper", ["COPPER", "ALUM", "NICKEL", "ZINC"]],
  ["platinum", ["PLT", "PLTM"]],
  ["palladium", ["PLD", "PLDM"]],
  ["index", ["MIX", "MXI", "RTS", "RTSM", "SPYF", "NASD", "DJ30", "R2000", "DAX", "STOX", "HANG", "NIKK", "RVI"]],
  ["currency", ["Si", "Eu", "CNY", "USDM", "EURM", "ED", "GBPU", "UCNY", "UTRY", "UKZT", "KZT", "HKD", "AED", "BYN", "INR", "TRY", "AUDU", "UCAD", "UCHF", "UINR", "UJPY", "EGBP", "EJPY", "ECAD", "AMD"]],
  ["bond", ["RGBI", "RUONIA", "KEYRATE"]],
  ["grain", ["WHEAT"]],
  ["soft", ["SUGAR", "SUGR", "COCOA", "COFFEE", "ORANGE"]],
  ["crypto", ["BTC", "ETH", "SOL", "XRP", "TRX", "ETHA", "IBIT"]],
  ["stock", ["SBRF", "SBPR", "GAZR", "LKOH", "ROSN", "GMKN", "VTBR", "MGNT", "AFLT", "ALRS", "MAGN", "NLMK", "MTSI", "MOEX", "OZON", "YDEX", "T", "TATN", "SNGR", "SNGP", "PHOR", "PLZLM", "POSI", "RUAL", "HYDR", "IRAO", "FEES", "RTKM", "VKCO", "X5"]],
  // listed products that are neither a commodity, a currency nor a single stock (ETF / foreign-index / basket / rate products): shown under «Все» only
  ["other", ["DTL", "IPO", "MMI", "EM", "FNI", "FIXR", "CNI", "HOME", "BRAZIL", "CHINA", "INDIA", "KOREA", "SAUDI", "AFRICA", "ARGT", "XIA", "TLT", "SOXQ", "UPRO", "MOEXCNY"]],
];

const GROUP_OF = new Map<string, FutAsset>();
const ORDER_OF = new Map<string, number>();
for (const [g, codes] of MOEX_TABLE) {
  codes.forEach((c, i) => {
    GROUP_OF.set(c, g);
    ORDER_OF.set(c, i);
  });
}

/** Class of a FORTS family by its ASSETCODE (a code that is not in the table is a single-stock future). */
export function moexAssetGroup(asset: string): FutAsset {
  return GROUP_OF.get(asset) ?? "stock";
}

/** Position of a family inside its class (curated first, the rest after them). */
export function moexAssetOrder(asset: string): number {
  return ORDER_OF.get(asset) ?? 1000;
}

/** Every FORTS ASSETCODE the table knows (scripts compare it with ISS). */
export function knownMoexAssets(): string[] {
  return [...GROUP_OF.keys()];
}

/** Words that name an asset class («газ», «gold»): a query equal to one of them lifts the rows of that class above names that merely start the same way (Газпром). */
const CLASS_WORDS: Partial<Record<FutAsset, string[]>> = {
  oil: ["нефть", "oil", "crude", "бензин", "gasoline"],
  gas: ["газ", "gas"],
  gold: ["золото", "gold"],
  silver: ["серебро", "silver"],
  copper: ["медь", "copper", "алюминий", "никель", "цинк"],
  platinum: ["платина", "platinum"],
  palladium: ["палладий", "palladium"],
  index: ["индекс", "index"],
  currency: ["валюта", "currency", "доллар", "евро", "юань", "рубль"],
  bond: ["облигации", "bonds", "ставка"],
  grain: ["пшеница", "wheat", "кукуруза", "corn", "соя", "зерно", "grain"],
  soft: ["сахар", "sugar", "кофе", "coffee", "какао", "cocoa", "хлопок", "cotton"],
  livestock: ["скот", "cattle", "свинина", "молоко"],
  crypto: ["биткоин", "bitcoin", "btc", "эфириум", "крипто", "crypto"],
};

/** Score added to a futures row when the query is a word that names its asset class. */
export function classBoost(query: string, group: FutAsset | undefined): number {
  const q = query.trim().toLowerCase().replace(/ё/g, "е");
  return group && q && CLASS_WORDS[group]?.includes(q) ? 25 : 0;
}

const COUNTRY_RANK: Record<string, number> = { RU: 0, US: 1 };
const countryRank = (c: string | undefined) => (c && c in COUNTRY_RANK ? COUNTRY_RANK[c] : 2);

/**
 * Futures rows grouped by asset class, inside a class by country (РФ, then США, then the rest); the order inside a bucket is kept.
 * `byRelevance`: the classes come in the order of their first row (a typed query: the best hit's class on top); otherwise in FUT_ASSETS order.
 */
export function arrangeByAsset<T extends Pick<MarketItem, "fgroup" | "country">>(items: T[], byRelevance = false): T[] {
  const first = new Map<FutAsset, number>();
  items.forEach((it, i) => {
    const g = it.fgroup ?? "other";
    if (!first.has(g)) first.set(g, i);
  });
  const gRank = (g: FutAsset) => (byRelevance ? first.get(g) ?? 0 : FUT_ASSETS.indexOf(g));
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => gRank(a.it.fgroup ?? "other") - gRank(b.it.fgroup ?? "other") || countryRank(a.it.country) - countryRank(b.it.country) || a.i - b.i)
    .map((x) => x.it);
}
