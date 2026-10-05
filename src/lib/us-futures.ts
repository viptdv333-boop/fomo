/**
 * US exchange futures (CME Group: CME / CBOT / NYMEX / COMEX, and ICE Futures US) offered in the «Фьючерсы» chip of the instrument search.
 * The data comes from FMP (source "fmp"), whose commodity list (/stable/commodities-list) names the continuous front-month series
 * `<root>USD` (a few agricultural ones end in `USX`: KEUSX, SBUSX, ...). The table is static and curated: no network, safe on the client.
 * Pure: used by the search API, the popular lists, the dialog and scripts/check-instrument-search.ts.
 */

import type { FutAsset, MarketItem } from "./market-types";

export type UsExchange = "CME" | "CBOT" | "NYMEX" | "COMEX" | "ICE";

export interface UsFuture {
  /** root symbol shown as the ticker ("NQ", "CL") */
  root: string;
  /** FMP symbol: the dataTicker of the chart ("NQUSD") */
  symbol: string;
  ru: string;
  en: string;
  exchange: UsExchange;
  /** underlying asset class (the asset chips of the «Фьючерсы» chip) */
  group: FutAsset;
  /** terminal icon (empty: a letter badge) */
  icon: string;
  /** extra search words (lower case): «gold», «нефть» ... */
  words: string[];
}

const I = (f: string) => `/icons/instruments/${f}.svg`;

/** [root, FMP symbol, ru, en, exchange, asset class, icon, words] */
type Row = [string, string, string, string, UsExchange, FutAsset, string, string[]?];

const ROWS: Row[] = [
  // energy
  ["CL", "CLUSD", "Фьючерс на нефть WTI", "Light Sweet Crude Oil (WTI) Futures", "NYMEX", "oil", I("oil"), ["wti", "нефть", "oil", "crude"]],
  ["BZ", "BZUSD", "Фьючерс на нефть Brent", "Brent Crude Oil Futures", "NYMEX", "oil", I("oil"), ["brent", "брент", "нефть", "oil"]],
  ["NG", "NGUSD", "Фьючерс на природный газ Henry Hub", "Henry Hub Natural Gas Futures", "NYMEX", "gas", I("gas"), ["gas", "газ", "henry"]],
  ["HO", "HOUSD", "Фьючерс на мазут (ULSD)", "NY Harbor ULSD Heating Oil Futures", "NYMEX", "oil", I("oil"), ["heating", "diesel", "дизель", "мазут", "ulsd"]],
  ["RB", "RBUSD", "Фьючерс на бензин RBOB", "RBOB Gasoline Futures", "NYMEX", "oil", I("gasoline"), ["gasoline", "бензин", "rbob"]],
  // metals
  ["GC", "GCUSD", "Фьючерс на золото", "Gold Futures", "COMEX", "gold", I("gold"), ["gold", "золото"]],
  ["MGC", "MGCUSD", "Микро-фьючерс на золото", "Micro Gold Futures", "COMEX", "gold", I("gold"), ["gold", "золото", "micro", "микро"]],
  ["SI", "SIUSD", "Фьючерс на серебро", "Silver Futures", "COMEX", "silver", I("silver"), ["silver", "серебро"]],
  ["SIL", "SILUSD", "Микро-фьючерс на серебро", "Micro Silver Futures", "COMEX", "silver", I("silver"), ["silver", "серебро", "micro", "микро"]],
  ["HG", "HGUSD", "Фьючерс на медь", "Copper Futures", "COMEX", "copper", I("copper"), ["copper", "медь"]],
  ["PL", "PLUSD", "Фьючерс на платину", "Platinum Futures", "NYMEX", "platinum", I("platinum"), ["platinum", "платина"]],
  ["PA", "PAUSD", "Фьючерс на палладий", "Palladium Futures", "NYMEX", "palladium", I("palladium"), ["palladium", "палладий"]],
  ["ALI", "ALIUSD", "Фьючерс на алюминий", "Aluminum Futures", "COMEX", "copper", "", ["aluminum", "aluminium", "алюминий"]],
  // equity indices
  ["ES", "ESUSD", "E-mini S&P 500", "E-mini S&P 500 Futures", "CME", "index", I("sp500"), ["s&p", "sp500", "spx", "сп500"]],
  ["NQ", "NQUSD", "E-mini Nasdaq-100", "E-mini Nasdaq-100 Futures", "CME", "index", I("nasdaq100"), ["nasdaq", "насдак", "ndx"]],
  ["YM", "YMUSD", "E-mini Dow Jones", "E-mini Dow ($5) Futures", "CBOT", "index", I("dow-jones"), ["dow", "dji", "доу", "джонс"]],
  ["RTY", "RTYUSD", "Micro E-mini Russell 2000", "Micro E-mini Russell 2000 Futures", "CME", "index", I("russell2000"), ["russell", "рассел"]],
  // rates / fed funds
  ["ZT", "ZTUSD", "Фьючерс на 2-летние казначейские ноты США", "2-Year T-Note Futures", "CBOT", "bond", "", ["treasury", "note", "облигации", "казначейск"]],
  ["ZF", "ZFUSD", "Фьючерс на 5-летние казначейские ноты США", "5-Year T-Note Futures", "CBOT", "bond", "", ["treasury", "note", "облигации", "казначейск"]],
  ["ZN", "ZNUSD", "Фьючерс на 10-летние казначейские ноты США", "10-Year T-Note Futures", "CBOT", "bond", "", ["treasury", "note", "облигации", "казначейск"]],
  ["ZB", "ZBUSD", "Фьючерс на 30-летние казначейские облигации США", "U.S. Treasury Bond Futures", "CBOT", "bond", "", ["treasury", "bond", "облигации", "казначейск"]],
  ["ZQ", "ZQUSD", "Фьючерс на ставку федеральных фондов (30 дней)", "30-Day Federal Funds Futures", "CBOT", "bond", "", ["fed", "funds", "ставка", "фрс"]],
  // dollar index
  ["DX", "DXUSD", "Фьючерс на индекс доллара США", "U.S. Dollar Index Futures", "ICE", "currency", "", ["dxy", "dollar", "индекс доллара", "доллар"]],
  // grains and oilseeds
  ["ZC", "ZCUSX", "Фьючерс на кукурузу", "Corn Futures", "CBOT", "grain", I("corn"), ["corn", "кукуруза"]],
  ["ZS", "ZSUSX", "Фьючерс на соевые бобы", "Soybean Futures", "CBOT", "grain", I("soy"), ["soy", "soybean", "соя", "соевые"]],
  ["ZM", "ZMUSD", "Фьючерс на соевый шрот", "Soybean Meal Futures", "CBOT", "grain", I("soy"), ["soy", "meal", "соя", "шрот"]],
  ["ZL", "ZLUSX", "Фьючерс на соевое масло", "Soybean Oil Futures", "CBOT", "grain", I("soy"), ["soy", "oil", "соя", "масло"]],
  ["ZO", "ZOUSX", "Фьючерс на овёс", "Oat Futures", "CBOT", "grain", "", ["oat", "овес", "овёс"]],
  ["ZR", "ZRUSD", "Фьючерс на рис", "Rough Rice Futures", "CBOT", "grain", "", ["rice", "рис"]],
  ["KE", "KEUSX", "Фьючерс на пшеницу (KC HRW)", "KC HRW Wheat Futures", "CBOT", "grain", I("wheat"), ["wheat", "пшеница"]],
  // softs
  ["SB", "SBUSX", "Фьючерс на сахар №11", "Sugar No. 11 Futures", "ICE", "soft", I("sugar"), ["sugar", "сахар"]],
  ["CC", "CCUSD", "Фьючерс на какао", "Cocoa Futures", "ICE", "soft", I("cocoa"), ["cocoa", "какао"]],
  ["KC", "KCUSX", "Фьючерс на кофе «Арабика»", "Coffee C Futures", "ICE", "soft", I("coffee"), ["coffee", "кофе", "arabica", "арабика"]],
  ["CT", "CTUSX", "Фьючерс на хлопок №2", "Cotton No. 2 Futures", "ICE", "soft", "", ["cotton", "хлопок"]],
  ["OJ", "OJUSX", "Фьючерс на апельсиновый сок", "FCOJ-A Orange Juice Futures", "ICE", "soft", I("orange-juice"), ["orange", "juice", "апельсин", "сок"]],
  ["LB", "LBUSD", "Фьючерс на пиломатериалы", "Lumber Futures", "CME", "soft", "", ["lumber", "wood", "лес", "пиломатериалы"]],
  // livestock and dairy
  ["LE", "LEUSX", "Фьючерс на живой скот", "Live Cattle Futures", "CME", "livestock", "", ["cattle", "beef", "скот", "говядина"]],
  ["GF", "GFUSX", "Фьючерс на откормочный скот", "Feeder Cattle Futures", "CME", "livestock", "", ["cattle", "feeder", "скот"]],
  ["HE", "HEUSX", "Фьючерс на постную свинину", "Lean Hogs Futures", "CME", "livestock", "", ["hogs", "pork", "свинина"]],
  ["DC", "DCUSD", "Фьючерс на молоко (Class III)", "Class III Milk Futures", "CME", "livestock", "", ["milk", "dairy", "молоко"]],
];

export const US_FUTURES: UsFuture[] = ROWS.map(([root, symbol, ru, en, exchange, group, icon, words]) => ({ root, symbol, ru, en, exchange, group, icon, words: words ?? [] }));

/** exchanges present in the table, in display order */
export const US_EXCHANGES: UsExchange[] = ["CME", "NYMEX", "COMEX", "CBOT", "ICE"];

const BY_SYMBOL = new Map(US_FUTURES.map((f) => [f.symbol, f]));
export function usFutureBySymbol(symbol: string): UsFuture | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** The table row as a search result (a futures series that is a single continuous contract: no contract list). */
export function usFutureItem(f: UsFuture): MarketItem {
  return {
    secid: f.symbol,
    ticker: f.root,
    name: f.ru,
    nameEn: f.en,
    group: "future",
    fgroup: f.group,
    source: "fmp",
    asset: f.root,
    exchange: f.exchange,
    country: "US",
  };
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/**
 * US futures for a query with their relevance: the exact root / FMP symbol first, then the root prefix, then words of the Russian / English name
 * and the aliases. Ties keep the table order. An empty query gives nothing.
 */
export function scoreUsFutures(q: string): { s: number; item: MarketItem }[] {
  const n = norm(q.trim());
  if (!n) return [];
  const scored: { s: number; i: number; f: UsFuture }[] = [];
  US_FUTURES.forEach((f, i) => {
    const root = norm(f.root);
    const sym = norm(f.symbol);
    const names = [norm(f.ru), norm(f.en), ...f.words.map(norm)];
    let s = 0;
    if (root === n || sym === n) s = 100;
    else if (n.length >= 2 && root.startsWith(n)) s = 70;
    else if (names.some((w) => w === n)) s = 65;
    else if (n.length >= 2 && names.some((w) => w.split(/[\s(),\-/]+/).some((x) => x.startsWith(n)))) s = 55;
    else if (n.length >= 3 && names.some((w) => w.includes(n))) s = 35;
    if (s) scored.push({ s, i, f });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  return scored.map((x) => ({ s: x.s, item: usFutureItem(x.f) }));
}

export function searchUsFutures(q: string, limit = 30): MarketItem[] {
  return scoreUsFutures(q).slice(0, limit).map((x) => x.item);
}

/** Every US future as search results, in the table order. */
export function allUsFutureItems(): MarketItem[] {
  return US_FUTURES.map(usFutureItem);
}
