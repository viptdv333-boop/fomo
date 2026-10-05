/**
 * Chips and filters of the instrument search dialog: which chips exist, what the second dropdown means for each of them
 * (exchange / trading board / category / quote currency), tagging of search results with their venue, country and category,
 * the futures asset row and the filtering itself.
 * Pure (no Next / network imports): the server applies it to the API answers, the client to the lists it already has,
 * scripts/check-instrument-search.ts checks it.
 */

import type { Facets, FutAsset, GroupTab, MarketItem } from "./market-types";
import { fxPair } from "./forex-meta";
import { moexAssetGroup } from "./futures-assets";
import { US_EXCHANGES } from "./us-futures";

/** The chips of the dialog, in order (TradingView's set; «Валюта» = MOEX FX spot, right after the international «Форекс»). */
export const GROUP_TABS: GroupTab[] = ["all", "stock", "fund", "future", "forex", "currency", "crypto", "index", "bond"];

export interface Filters {
  /** ISO country of the listing, "" = every country */
  country: string;
  /** exchange / trading board / category / quote currency (see venueKind), "" = all */
  venue: string;
  /** futures only: underlying asset class chip, "" = every class (grouped under asset headers) */
  asset: FutAsset | "";
}
export const NO_FILTERS: Filters = { country: "", venue: "", asset: "" };
export const hasFilters = (f: Filters): boolean => !!(f.country || f.venue || f.asset);
export const sameFilters = (a: Filters, b: Filters): boolean => a.country === b.country && a.venue === b.venue && a.asset === b.asset;

/** What the second dropdown of a chip filters by. */
export type VenueKind = "exchange" | "board" | "category" | "quote";
export function venueKind(tab: GroupTab): VenueKind {
  switch (tab) {
    case "stock":
    case "fund":
      return "board";
    case "bond":
    case "currency":
    case "forex":
    case "index":
      return "category";
    case "crypto":
      return "quote";
    default:
      return "exchange"; // futures and «Все»
  }
}

/** Countries every chip offers even before a list is loaded. */
const BASE_COUNTRIES: Record<GroupTab, string[]> = {
  all: ["RU", "US"],
  stock: ["RU"],
  fund: ["RU"],
  bond: ["RU"],
  currency: ["RU"],
  future: ["RU", "US"],
  forex: [],
  crypto: [],
  index: ["RU"],
};

/** Values of the second dropdown every chip offers. A board is offered only when it is certain to have rows (the rest come from the lists). */
const BASE_VENUES: Record<GroupTab, string[]> = {
  all: ["MOEX", ...US_EXCHANGES, "Bybit", "Forex"],
  stock: ["TQBR"],
  fund: [],
  bond: ["ofz", "corp"],
  currency: ["fiat", "metal"],
  future: ["MOEX", ...US_EXCHANGES],
  forex: ["major", "cross", "em", "metal"],
  crypto: ["USDT"],
  index: ["equity", "bond", "tr"],
};

const IDX_BOND_RE = /облигац|RGBI|RUCB|CBI/i;
const IDX_TR_RE = /полной доходности|total return|\bTR\b|TRN$|TRR$|TR$/i;

/** category of a MOEX index: bond / total return / the rest (equity) */
export function indexSub(secid: string, name: string): string {
  if (IDX_BOND_RE.test(secid) || IDX_BOND_RE.test(name)) return "bond";
  if (IDX_TR_RE.test(name) || /TR[NR]?$/.test(secid)) return "tr";
  return "equity";
}

/** coin quote currency of a Bybit pair ticker: «BTCUSDT» -> USDT */
export function cryptoQuote(ticker: string, asset?: string): string {
  if (asset && ticker.startsWith(asset) && ticker.length > asset.length) return ticker.slice(asset.length).replace(/[^A-Z0-9].*$/, "");
  const m = /(USDT|USDC|USD|EUR|BTC|ETH)$/.exec(ticker);
  return m ? m[1] : "USDT";
}

/** federal (ОФЗ, SU...) or corporate bond */
export function bondSub(secid: string, board?: string): string {
  return /^SU\d/.test(secid) || board === "TQOB" ? "ofz" : "corp";
}

/** MOEX FX instrument: a metal (GLD / SLV / PLT / PLD against the rouble) or a currency */
export function currencySub(secid: string): string {
  return /^(GLD|SLV|PLT|PLD)/.test(secid) ? "metal" : "fiat";
}

/** Fills the venue / country / category of a result (idempotent; what the source already said stays). */
export function tagItem(item: MarketItem): MarketItem {
  const out: MarketItem = { ...item };
  switch (item.source) {
    case "moex":
      out.exchange ??= "MOEX";
      out.country ??= "RU";
      if (item.group === "index") out.sub ??= indexSub(item.secid, item.name);
      else if (item.group === "bond") out.sub ??= bondSub(item.secid, item.board);
      else if (item.group === "currency") out.sub ??= currencySub(item.secid);
      else if (item.group === "future") out.fgroup ??= moexAssetGroup(item.asset ?? item.secid);
      break;
    case "bybit":
      out.exchange ??= "Bybit";
      out.sub ??= cryptoQuote(item.ticker, item.asset);
      break;
    case "forex":
      out.exchange ??= "Forex";
      out.sub ??= fxPair(item.secid)?.kind ?? "cross";
      break;
    case "fmp":
      out.exchange ??= "FMP";
      out.country ??= "US";
      break;
  }
  return out;
}

/** The value of a row the second dropdown compares with, for the chip being filtered. */
export function venueOf(item: MarketItem, tab: GroupTab): string {
  switch (venueKind(tab)) {
    case "board":
      return item.board ?? "";
    case "category":
    case "quote":
      return item.sub ?? "";
    default:
      return item.exchange ?? "";
  }
}

export function matchesFilters(item: MarketItem, tab: GroupTab, f: Filters): boolean {
  if (f.country && item.country !== f.country) return false;
  if (f.venue && venueOf(item, tab) !== f.venue) return false;
  if (f.asset && tab === "future" && item.fgroup !== f.asset) return false;
  return true;
}

/** Rows that pass the filters (the list itself when none is set). Items must be tagged. */
export function applyFilters(items: MarketItem[], tab: GroupTab, f: Filters): MarketItem[] {
  return hasFilters(f) ? items.filter((i) => matchesFilters(i, tab, f)) : items;
}

const rankIn = (order: string[], v: string): number => {
  const i = order.indexOf(v);
  return i < 0 ? order.length : i;
};

/** The countries and second-dropdown values of a list of rows. */
export function computeFacets(items: MarketItem[], tab: GroupTab): Facets {
  const countries = new Set<string>();
  const venues = new Set<string>();
  for (const it of items) {
    if (it.country) countries.add(it.country);
    const v = venueOf(it, tab);
    if (v) venues.add(v);
  }
  return { countries: [...countries], venues: [...venues] };
}

/** What the two dropdowns of a chip offer: the baseline of the chip, the facets of the list on offer and the selected values (ordered). */
export function filterOptions(tab: GroupTab, facets: Facets | null, selected: Pick<Filters, "country" | "venue">): Facets {
  const countries = new Set<string>(BASE_COUNTRIES[tab]);
  const venues = new Set<string>(BASE_VENUES[tab]);
  for (const c of facets?.countries ?? []) countries.add(c);
  for (const v of facets?.venues ?? []) venues.add(v);
  if (selected.country) countries.add(selected.country);
  if (selected.venue) venues.add(selected.venue);
  const cOrder = ["RU", "US"];
  const vOrder = BASE_VENUES[tab];
  return {
    countries: [...countries].sort((a, b) => rankIn(cOrder, a) - rankIn(cOrder, b) || a.localeCompare(b)),
    venues: [...venues].sort((a, b) => rankIn(vOrder, a) - rankIn(vOrder, b) || a.localeCompare(b)),
  };
}
