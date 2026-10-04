/* Shapes shared by the market search / contracts APIs and the terminal UI (no runtime imports: safe on the client). */

export type MarketGroup = "stock" | "bond" | "fund" | "future" | "currency" | "index" | "crypto" | "other";
export type ContractKind = "perpetual" | "quarterly" | "monthly" | "weekly" | "spot";

/** One selectable thing: a share, a bond, a fund, a currency pair, a futures underlying (auto front) or an exact contract. */
export interface MarketItem {
  /** the id to put into ?symbol= / dataTicker: SECID, or the auto ticker for a futures underlying ("MIX", "SBRF.F") */
  secid: string;
  /** short display ticker (the SECID, or the short name for bonds with ISIN ids) */
  ticker: string;
  name: string;
  isin?: string;
  group: MarketGroup;
  source: "moex" | "bybit";
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
