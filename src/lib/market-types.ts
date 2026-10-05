/* Shapes shared by the market search / contracts APIs and the terminal UI (no runtime imports: safe on the client). */

export type MarketGroup = "stock" | "bond" | "fund" | "future" | "currency" | "index" | "crypto" | "forex" | "other";
/** the chips of the instrument search dialog ("all" is every group) */
export type GroupTab = "all" | Exclude<MarketGroup, "other">;
export type MarketSource = "moex" | "bybit" | "forex" | "fmp";
/** underlying asset class of a futures row (the second chip row of the «Фьючерсы» chip); "other" is only listed under «Все» */
export type FutAsset = "oil" | "gas" | "gold" | "silver" | "copper" | "platinum" | "palladium" | "index" | "currency" | "bond" | "grain" | "soft" | "livestock" | "crypto" | "stock" | "other";
export type ContractKind = "perpetual" | "quarterly" | "monthly" | "weekly" | "spot";

/** Options of the two dropdowns of the instrument search dialog (what the rows on offer have). */
export interface Facets {
  countries: string[];
  venues: string[];
}

/** One page of a chip's list as /api/market-search answers it. */
export interface MarketPage {
  items: MarketItem[];
  /** rows after the filters (all pages) */
  total: number;
  hasMore: boolean;
  facets: Facets;
  /** nothing was typed: the chip's popular list */
  popular?: boolean;
}

/** One selectable thing: a share, a bond, a fund, a currency pair, a futures underlying (auto front) or an exact contract. */
export interface MarketItem {
  /** the id to put into ?symbol= / dataTicker: SECID, or the auto ticker for a futures underlying ("MIX", "SBRF.F") */
  secid: string;
  /** short display ticker (the SECID, or the short name for bonds with ISIN ids) */
  ticker: string;
  name: string;
  isin?: string;
  group: MarketGroup;
  source: MarketSource;
  /** English name when the row has a curated one (US futures): shown instead of `name` outside the Russian UI */
  nameEn?: string;
  /** venue label on the right of a row: MOEX, CME, NYMEX, COMEX, CBOT, ICE, Bybit, Forex (filled by tagItem) */
  exchange?: string;
  /** ISO country of the listing: "RU", "US" (filled by tagItem; none for crypto / spot forex) */
  country?: string;
  /** second-filter category: forex "major" | "cross" | "em" | "metal", index "equity" | "bond" | "tr", bond "ofz" | "corp", currency "fiat" | "metal", crypto: the quote currency */
  sub?: string;
  /** futures: underlying asset class (filled by tagItem from the curated table) */
  fgroup?: FutAsset;
  engine?: string;
  market?: string;
  board?: string;
  /** price unit when it is not money (bonds: % of par) */
  unit?: "%";
  /* futures */
  /** true: `secid` is the "auto front month" ticker of an underlying */
  auto?: boolean;
  /** underlying code (ASSETCODE) */
  asset?: string;
  /** number of selectable contracts of the underlying (family rows) */
  contracts?: number;
  kind?: ContractKind;
  expiry?: string | null;
  order?: number;
  daysLeft?: number | null;
}

/** One contract of an underlying as returned by /api/contracts. */
export interface ContractInfo {
  secid: string;
  /** exact ticker to request data with (equals secid for MOEX; Bybit: "BTCUSDT.P" ...) */
  ticker: string;
  shortname: string;
  kind: ContractKind;
  expiry: string | null;
  order: number;
  daysLeft: number | null;
  /** badge text: «текущий» / «следующий» / «3-й» / «вечный» (in the requested language) */
  badge: string;
  /** full label «MIX дек-26 · MXZ6 · текущий (осталось 75 дн.)» */
  label: string;
  lot?: number;
  decimals?: number;
  minstep?: number;
}

export interface ContractsResponse {
  source: "moex" | "bybit";
  /** underlying code ("MIX", "BTC") */
  asset: string;
  name: string;
  /** auto front month ticker ("MIX"); Bybit: the spot ticker */
  auto: string;
  /** ticker that was asked for resolved to this contract (auto -> the front) */
  current?: string;
  contracts: ContractInfo[];
  /** the upstream list could not be loaded (empty answer is then not authoritative) */
  unavailable?: boolean;
}
