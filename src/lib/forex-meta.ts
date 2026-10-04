/**
 * FOREX instruments of the terminal: the curated pair list, currency names / aliases, price precision and the search ranking.
 * Pure (no Next / network imports): safe on the client, in the i18n dictionaries and in scripts/check-forex-search.ts.
 * The data side (quotes / candles) lives in forex.ts (server only).
 */

import type { MarketItem } from "./market-types";

export type FxKind = "major" | "cross" | "em" | "metal";

export interface FxPair {
  /** EURUSD: the terminal ticker, the dataTicker and the symbol FMP uses */
  symbol: string;
  base: string;
  quote: string;
  kind: FxKind;
  /** price decimals shown on the chart / in the list (pip precision: 5, JPY 3, ...) */
  digits: number;
}

export interface FxCurrency {
  ru: string;
  en: string;
  cn: string;
  /** extra search words (lower case, ё -> е) */
  alias: string[];
  /** ISO country of the flag on the pair icon ("" = no flag: metals) */
  flag: string;
}

export const FX_CURRENCIES: Record<string, FxCurrency> = {
  USD: { ru: "Доллар США", en: "US Dollar", cn: "美元", alias: ["доллар", "бакс", "dollar", "buck"], flag: "US" },
  EUR: { ru: "Евро", en: "Euro", cn: "欧元", alias: ["euro", "фибер"], flag: "EU" },
  GBP: { ru: "Фунт стерлингов", en: "British Pound", cn: "英镑", alias: ["фунт", "стерлинг", "pound", "sterling", "cable"], flag: "GB" },
  JPY: { ru: "Японская иена", en: "Japanese Yen", cn: "日元", alias: ["иена", "йена", "йен", "yen"], flag: "JP" },
  CHF: { ru: "Швейцарский франк", en: "Swiss Franc", cn: "瑞士法郎", alias: ["франк", "швейцар", "franc", "swissy"], flag: "CH" },
  AUD: { ru: "Австралийский доллар", en: "Australian Dollar", cn: "澳元", alias: ["австрал", "aussie", "australia"], flag: "AU" },
  CAD: { ru: "Канадский доллар", en: "Canadian Dollar", cn: "加元", alias: ["канад", "loonie", "canada"], flag: "CA" },
  NZD: { ru: "Новозеландский доллар", en: "New Zealand Dollar", cn: "纽元", alias: ["новозеланд", "kiwi", "zealand"], flag: "NZ" },
  CNH: { ru: "Юань (офшор)", en: "Chinese Yuan (offshore)", cn: "离岸人民币", alias: ["юань", "yuan", "renminbi", "rmb"], flag: "CN" },
  CNY: { ru: "Юань (материковый)", en: "Chinese Yuan (onshore)", cn: "人民币", alias: ["юань", "yuan", "renminbi", "rmb"], flag: "CN" },
  TRY: { ru: "Турецкая лира", en: "Turkish Lira", cn: "土耳其里拉", alias: ["лира", "турц", "turk", "lira"], flag: "TR" },
  RUB: { ru: "Российский рубль", en: "Russian Ruble", cn: "卢布", alias: ["рубль", "рубл", "ruble", "rouble"], flag: "RU" },
  INR: { ru: "Индийская рупия", en: "Indian Rupee", cn: "印度卢比", alias: ["рупия", "рупи", "индий", "rupee"], flag: "IN" },
  KZT: { ru: "Казахстанский тенге", en: "Kazakhstani Tenge", cn: "坚戈", alias: ["тенге", "казах", "tenge"], flag: "KZ" },
  XAU: { ru: "Золото", en: "Gold", cn: "黄金", alias: ["золото", "gold"], flag: "" },
  XAG: { ru: "Серебро", en: "Silver", cn: "白银", alias: ["серебро", "silver"], flag: "" },
  SEK: { ru: "Шведская крона", en: "Swedish Krona", cn: "瑞典克朗", alias: ["крона", "швед", "krona"], flag: "SE" },
  NOK: { ru: "Норвежская крона", en: "Norwegian Krone", cn: "挪威克朗", alias: ["крона", "норв", "krone"], flag: "NO" },
  PLN: { ru: "Польский злотый", en: "Polish Zloty", cn: "波兰兹罗提", alias: ["злотый", "польск", "zloty"], flag: "PL" },
  MXN: { ru: "Мексиканский песо", en: "Mexican Peso", cn: "墨西哥比索", alias: ["песо", "мексик", "peso"], flag: "MX" },
  ZAR: { ru: "Южноафриканский рэнд", en: "South African Rand", cn: "南非兰特", alias: ["рэнд", "ранд", "rand"], flag: "ZA" },
  SGD: { ru: "Сингапурский доллар", en: "Singapore Dollar", cn: "新加坡元", alias: ["сингапур"], flag: "SG" },
  HKD: { ru: "Гонконгский доллар", en: "Hong Kong Dollar", cn: "港元", alias: ["гонконг"], flag: "HK" },
};

type Row = [symbol: string, kind: FxKind, digits?: number];

/** Curated list in display order: majors, crosses, EM / RU-relevant, metals. Digits: 5 by default, JPY 3, EM 4, metals 2-3. */
const ROWS: Row[] = [
  ["EURUSD", "major"], ["GBPUSD", "major"], ["USDJPY", "major"], ["USDCHF", "major"], ["AUDUSD", "major"], ["USDCAD", "major"], ["NZDUSD", "major"],
  ["EURGBP", "cross"], ["EURJPY", "cross"], ["GBPJPY", "cross"], ["EURCHF", "cross"], ["AUDJPY", "cross"], ["CADJPY", "cross"], ["EURAUD", "cross"],
  ["GBPCHF", "cross"], ["EURCAD", "cross"], ["GBPAUD", "cross"], ["AUDNZD", "cross"], ["CHFJPY", "cross"], ["NZDJPY", "cross"], ["AUDCAD", "cross"],
  ["USDCNH", "em", 4], ["USDCNY", "em", 4], ["USDTRY", "em", 4], ["USDRUB", "em", 4], ["USDINR", "em", 3], ["USDKZT", "em", 2],
  ["XAUUSD", "metal", 2], ["XAGUSD", "metal", 3],
];

/** Digits of a pair that is not curated (a typed cross): by the quote currency. */
export function digitsOf(base: string, quote: string): number {
  if (quote === "JPY") return 3;
  if (base === "XAU") return 2;
  if (base === "XAG") return 3;
  return 5;
}

export const FX_PAIRS: FxPair[] = ROWS.map(([symbol, kind, digits]) => {
  const base = symbol.slice(0, 3);
  const quote = symbol.slice(3);
  return { symbol, base, quote, kind, digits: digits ?? digitsOf(base, quote) };
});

const BY_SYMBOL = new Map(FX_PAIRS.map((p) => [p.symbol, p]));

export function fxPair(symbol: string): FxPair | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

/** A pair of two known currency codes ("NZDJPY"), curated or not. */
export function parseFxSymbol(symbol: string): FxPair | null {
  const s = symbol.toUpperCase();
  const known = BY_SYMBOL.get(s);
  if (known) return known;
  if (!/^[A-Z]{6}$/.test(s)) return null;
  const base = s.slice(0, 3);
  const quote = s.slice(3);
  if (!FX_CURRENCIES[base] || !FX_CURRENCIES[quote] || base === quote) return null;
  return { symbol: s, base, quote, kind: "cross", digits: digitsOf(base, quote) };
}

export function isForexSymbol(symbol: string): boolean {
  return parseFxSymbol(symbol) !== null;
}

/** Price decimals for a forex symbol (the chart's API rounds to this, the watchlist shows this). */
export function fxDigits(symbol: string): number {
  return parseFxSymbol(symbol)?.digits ?? 5;
}

/** "EUR/USD" */
export function fxSlash(p: { base: string; quote: string }): string {
  return `${p.base}/${p.quote}`;
}

/** Display name of a pair in a language: «Евро / Доллар США». */
export function fxName(p: { base: string; quote: string }, lang: "ru" | "en" | "cn"): string {
  const b = FX_CURRENCIES[p.base]?.[lang] ?? p.base;
  const q = FX_CURRENCIES[p.quote]?.[lang] ?? p.quote;
  return `${b} / ${q}`;
}

export function pairToItem(p: FxPair): MarketItem {
  return { secid: p.symbol, ticker: p.symbol, name: fxSlash(p), group: "forex", source: "forex", asset: p.symbol };
}

/** Icon of a metal the terminal has artwork for (pairs get the two-flag icon in the UI). */
export function fxIcon(symbol: string): string {
  const s = symbol.toUpperCase();
  return s === "XAUUSD" ? "/icons/instruments/gold.svg" : s === "XAGUSD" ? "/icons/instruments/silver.svg" : "";
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/**
 * Ranks the curated list for a query: the exact symbol / «eur/usd» form first, then a single currency (code or name: «eur»,
 * «евро», «доллар»), prefixes, then "contains". Ties keep the curated order. A well-formed pair of two known codes that is not in the
 * list («NZDCAD») is offered as an extra row. Returns at most `limit` items (none for an empty query).
 */
export function searchForex(q: string, limit = 30, minScore = 0, list: FxPair[] = FX_PAIRS): MarketItem[] {
  const n = norm(q.trim().replace(/[\s/_-]+/g, ""));
  if (n.length < 2) return []; // one letter matches half of the list
  const scored: { s: number; i: number; p: FxPair }[] = [];
  list.forEach((p, i) => {
    const sym = norm(p.symbol);
    const b = FX_CURRENCIES[p.base];
    const qq = FX_CURRENCIES[p.quote];
    const words = [...(b?.alias ?? []), ...(qq?.alias ?? []), norm(b?.ru ?? ""), norm(qq?.ru ?? ""), norm(b?.en ?? ""), norm(qq?.en ?? ""), b?.cn ?? "", qq?.cn ?? ""];
    const baseCode = norm(p.base);
    const quoteCode = norm(p.quote);
    let s = 0;
    if (sym === n) s = 100;
    else if (baseCode === n) s = 90; // «eur»: pairs where it is the base first
    else if (quoteCode === n) s = 85;
    else if (sym.startsWith(n)) s = 80;
    else if (words.some((w) => w === n)) s = 75;
    else if (words.some((w) => w.startsWith(n))) s = 65;
    else if (n.length >= 2 && sym.includes(n)) s = 50;
    else if (n.length >= 3 && words.some((w) => w.includes(n))) s = 35;
    // a query with two currencies in words («евро доллар»): both must be found among the words
    if (!s) {
      const parts = norm(q.trim()).split(/[\s/_-]+/).filter(Boolean);
      if (parts.length === 2 && parts.every((x) => x.length >= 2 && (norm(p.base) === x || norm(p.quote) === x || words.some((w) => w.startsWith(x))))) s = 60;
    }
    if (s >= Math.max(1, minScore)) scored.push({ s, i, p });
  });
  scored.sort((a, b) => b.s - a.s || a.i - b.i);
  const out = scored.slice(0, limit).map((x) => pairToItem(x.p));
  // a typed pair of known codes that is not in the curated list
  const typed = n.length === 6 ? parseFxSymbol(n) : null;
  if (typed && !out.some((x) => x.secid === typed.symbol) && out.length < limit) out.unshift(pairToItem(typed));
  return out;
}

/** Shown under the «Форекс» tab before anything is typed: the majors and gold. */
export const POPULAR_FOREX: FxPair[] = FX_PAIRS.filter((p) => p.kind === "major" || p.symbol === "XAUUSD");

/**
 * The spot FX week is continuous: it opens on Sunday ~21:00 UTC (Sydney / Wellington) and closes on Friday ~21:00 UTC (New York
 * 17:00 in summer; the winter close is an hour later and is not modelled). No lunch breaks, no holidays except thin Christmas / New Year.
 */
export function fxMarketOpen(now: Date): boolean {
  const dow = now.getUTCDay();
  const min = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (dow === 6) return false;
  if (dow === 0) return min >= 21 * 60;
  if (dow === 5) return min < 21 * 60;
  return true;
}

/** True when a free-text query can be a currency / pair, so the «Все» tab adds a few forex hits («eurusd», «eur/usd», «eur»). */
export function looksLikeForex(q: string): boolean {
  const n = q.trim().replace(/[\s/_-]+/g, "").toUpperCase();
  return /^[A-Z]{6}$/.test(n) && parseFxSymbol(n) !== null;
}
