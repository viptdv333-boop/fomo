/**
 * «Popular» lists of the search dialogs: what every group chip shows while nothing is typed.
 * Pure (no Next / DB / network): the ranking of ISS board listings, the curated static fallbacks (shown instantly on the client and
 * when ISS is unreachable on the server, so a list is never empty) and the «Все» mix. The live fetching + caching lives in moex-search.ts.
 */

import type { MarketGroup, MarketItem } from "./market-types";
import { pairToItem as cryptoItem, POPULAR_CRYPTO } from "./bybit-spot-search";
import { pairToItem as fxItem, POPULAR_FOREX } from "./forex-meta";

export type PopularGroup = MarketGroup | "all";

/** One row of an ISS board listing joined with its turnover. */
export interface BoardRow {
  secid: string;
  shortname: string;
  name: string;
  isin: string;
  /** ISS SECTYPE (shares market: 1 ordinary, 2 preferred, D depositary receipt, J fund / ETF ...) */
  sectype: string;
  /** today's turnover in RUB (0 when unknown) */
  turnover: number;
}

/** How many rows each chip shows. */
export const POPULAR_COUNT = { stock: 15, bond: 15, fund: 12, future: 15, currency: 12 } as const;
/** How many rows of each group the «Все» mix takes (chip order). */
export const ALL_MIX: [MarketGroup, number][] = [["stock", 4], ["bond", 3], ["fund", 3], ["future", 4], ["crypto", 3], ["currency", 3], ["forex", 3]];

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** securities + marketdata blocks of an ISS board listing -> rows (unsorted). Tolerant: anything unexpected gives []. */
export function parseBoard(body: unknown): BoardRow[] {
  const b = body as { securities?: { columns?: string[]; data?: unknown[][] }; marketdata?: { columns?: string[]; data?: unknown[][] } } | null;
  const sc = b?.securities?.columns;
  const mc = b?.marketdata?.columns;
  if (!sc || !Array.isArray(b?.securities?.data)) return [];
  const col = (cols: string[], n: string) => cols.indexOf(n);
  const sId = col(sc, "SECID");
  if (sId < 0) return [];
  const [sShort, sName, sIsin, sType] = [col(sc, "SHORTNAME"), col(sc, "SECNAME"), col(sc, "ISIN"), col(sc, "SECTYPE")];
  const turn = new Map<string, number>();
  if (mc && Array.isArray(b?.marketdata?.data)) {
    const mId = col(mc, "SECID");
    const mVal = col(mc, "VALTODAY_RUR") >= 0 ? col(mc, "VALTODAY_RUR") : col(mc, "VALTODAY");
    if (mId >= 0 && mVal >= 0) for (const r of b!.marketdata!.data!) turn.set(String(r[mId]), num(r[mVal]));
  }
  const out: BoardRow[] = [];
  for (const r of b!.securities!.data!) {
    const secid = String(r[sId] ?? "");
    if (!secid) continue;
    out.push({
      secid,
      shortname: sShort >= 0 ? String(r[sShort] ?? "") : "",
      name: sName >= 0 ? String(r[sName] ?? "") : "",
      isin: sIsin >= 0 ? String(r[sIsin] ?? "") : "",
      sectype: sType >= 0 ? String(r[sType] ?? "") : "",
      turnover: turn.get(secid) ?? 0,
    });
  }
  return out;
}

/** turnover descending, the SECID as a stable tiebreak */
export function byTurnover(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => b.turnover - a.turnover || a.secid.localeCompare(b.secid));
}

/** shares and depositary receipts of the main board by turnover (funds / ETFs sit on the same board but are the «Фонды» chip). [] = no usable turnover (market closed / ISS hiccup): the caller falls back. */
export function pickStocks(rows: BoardRow[], n: number = POPULAR_COUNT.stock): BoardRow[] {
  const ranked = byTurnover(rows.filter((r) => r.sectype === "1" || r.sectype === "2" || r.sectype === "D")).filter((r) => r.turnover > 0);
  return ranked.length >= 5 ? ranked.slice(0, n) : [];
}

/** The funds people actually add (equity / gold / bond index ETFs and the big money-market ones), in this order. */
export const FUND_PRIORITY = ["TMOS", "SBMX", "LQDT", "TGLD", "AKME", "SBGB", "TRUR", "TBRU", "EQMX", "AKMM", "SBMM", "GOLD"];

/** funds / ETFs (SECTYPE J): the curated priority list first (those that are listed), then the biggest by turnover. */
export function pickFunds(rows: BoardRow[], n: number = POPULAR_COUNT.fund): BoardRow[] {
  const funds = rows.filter((r) => r.sectype === "J");
  if (funds.length < 3) return [];
  const by = new Map(funds.map((r) => [r.secid, r]));
  const out: BoardRow[] = [];
  for (const id of FUND_PRIORITY) {
    const r = by.get(id);
    if (r) out.push(r);
  }
  for (const r of byTurnover(funds)) {
    if (out.length >= n) break;
    if (!out.includes(r)) out.push(r);
  }
  return out.slice(0, n);
}

/** short names of the big corporate issuers that are worth a row among the OFZ (the corporate board is thousands of small issues) */
export const BIG_ISSUER_RE = /^(Сбер|РЖД|Газ[КкПп]|ГПН|Роснефт|Лукойл|ЛУКОЙЛ|ВЭБ|Т-Банк|Тинькофф|Альфа|МТС|Магнит|Норн|Атомэн|Транснеф|НОВАТЭК|Новатэк|Северст|Полюс|Х5|X5|Россети|ВТБ)/;

/** OFZ by turnover (+ a few big corporate issuers by turnover). [] = no usable turnover. */
export function pickBonds(ofz: BoardRow[], corp: BoardRow[], nOfz = 12, nCorp = 3): { row: BoardRow; corp: boolean }[] {
  const o = byTurnover(ofz).filter((r) => r.turnover > 0).slice(0, nOfz);
  if (o.length < 5) return [];
  const c = byTurnover(corp).filter((r) => r.turnover > 0 && BIG_ISSUER_RE.test(r.shortname)).slice(0, nCorp);
  return [...o.map((row) => ({ row, corp: false })), ...c.map((row) => ({ row, corp: true }))];
}

/** MOEX FX spot («завтра») instruments worth a row: SECID of the CETS board (the readable name is the SHORTNAME), curated order. */
export const FX_PRIORITY = ["USD000UTSTOM", "EUR_RUB__TOM", "CNYRUB_TOM", "GLDRUB_TOM", "SLVRUB_TOM", "PLTRUB_TOM", "PLDRUB_TOM", "HKDRUB_TOM", "TRYRUB_TOM", "KZTRUB_TOM", "GBPRUB_TOM", "BYNRUB_TOM"];

export function pickCurrency(rows: BoardRow[], n: number = POPULAR_COUNT.currency): BoardRow[] {
  const by = new Map(rows.map((r) => [r.secid, r]));
  const out: BoardRow[] = [];
  for (const id of FX_PRIORITY) {
    const r = by.get(id);
    if (r) out.push(r);
  }
  return out.length >= 3 ? out.slice(0, n) : [];
}

/** underlyings of the «Фьючерсы» chip (ASSETCODE of the family), most traded first */
export const FUTURES_PRIORITY = ["Si", "MIX", "RTS", "BR", "GOLD", "NG", "SBRF", "GAZR", "Eu", "CNY", "LKOH", "SILV", "GL", "MXI", "BTC"];

/* ── item builders (shape of the exchange search results) ── */

export function stockItem(r: BoardRow): MarketItem {
  return { secid: r.secid, ticker: r.secid, name: r.name || r.shortname || r.secid, isin: r.isin || undefined, group: "stock", source: "moex", engine: "stock", market: "shares", board: "TQBR" };
}
export function fundItem(r: BoardRow): MarketItem {
  return { secid: r.secid, ticker: r.secid, name: r.name || r.shortname || r.secid, isin: r.isin || undefined, group: "fund", source: "moex", engine: "stock", market: "shares", board: "TQBR" };
}
export function bondItem(r: BoardRow, board: "TQOB" | "TQCB"): MarketItem {
  // bonds are identified by ISIN / SU number: show the readable short name (like the search does)
  return { secid: r.secid, ticker: r.secid.length > 10 ? r.shortname || r.secid : r.secid, name: r.name || r.shortname || r.secid, isin: r.isin || undefined, group: "bond", source: "moex", engine: "stock", market: "bonds", board, unit: "%" };
}
export function currencyItem(r: BoardRow): MarketItem {
  return { secid: r.secid, ticker: r.shortname || r.secid, name: r.name || r.shortname || r.secid, group: "currency", source: "moex", engine: "currency", market: "selt", board: "CETS" };
}

/* ── static fallbacks (names as ISS gives them) ── */

const S = (secid: string, name: string, short = "") => ({ secid, name, short });
const STATIC_STOCKS = [
  S("SBER", "Сбербанк России ПАО ао"), S("GAZP", "\"Газпром\" (ПАО) ао"), S("LKOH", "НК ЛУКОЙЛ (ПАО) - ао"), S("ROSN", "ПАО НК Роснефть"), S("YDEX", "МКПАО ЯНДЕКС"),
  S("T", "Т-Технологии МКПАО ао"), S("GMKN", "ГМК \"Нор.Никель\" ПАО ао"), S("NVTK", "ПАО \"НОВАТЭК\" ао"), S("VTBR", "ао ПАО Банк ВТБ"), S("TATN", "Татнефть ПАО ао"),
  S("MGNT", "Магнит ПАО ао"), S("MOEX", "Московская Биржа ПАО ао"), S("OZON", "МКПАО Озон"), S("X5", "Корпоративный центр ИКС 5"), S("PLZL", "Полюс ПАО ао"),
];
const STATIC_OFZ = [
  S("SU26254RMFS1", "ОФЗ-ПД 26254 03/10/2040", "ОФЗ 26254"), S("SU26238RMFS4", "ОФЗ-ПД 26238 15/05/2041", "ОФЗ 26238"), S("SU26246RMFS7", "ОФЗ-ПД 26246 12/03/36", "ОФЗ 26246"),
  S("SU26248RMFS3", "ОФЗ-ПД 26248 16/05/40", "ОФЗ 26248"), S("SU26247RMFS5", "ОФЗ-ПД 26247 11/05/39", "ОФЗ 26247"), S("SU26252RMFS5", "ОФЗ-ПД 26252 12/10/2033", "ОФЗ 26252"),
  S("SU26253RMFS3", "ОФЗ-ПД 26253 06/10/2038", "ОФЗ 26253"), S("SU26243RMFS4", "ОФЗ-ПД 26243 19/05/38", "ОФЗ 26243"), S("SU26245RMFS9", "ОФЗ-ПД 26245 26/09/35", "ОФЗ 26245"),
  S("SU26251RMFS7", "ОФЗ-ПД 26251 28/08/2030", "ОФЗ 26251"), S("SU26233RMFS5", "ОФЗ-ПД 26233 18/07/2035", "ОФЗ 26233"), S("SU26240RMFS0", "ОФЗ-ПД 26240 30/07/2036", "ОФЗ 26240"),
];
const STATIC_FUNDS = [
  S("TMOS", "ПИФ Тинькофф Индекс МосБиржи"), S("SBMX", "БПИФ Первая Индекс МосБиржи"), S("LQDT", "БПИФ Ликвидность УК ВИМ"), S("TGLD", "БПИФ Тинькофф Золото"),
  S("AKME", "БПИФ Альфа Управляем Акции"), S("SBGB", "БПИФ Первая Гособлигации"), S("TRUR", "БПИФ Тинькофф Вечный портфель"), S("TBRU", "БПИФ Тинькофф Облигации РФ"),
  S("EQMX", "БПИФ ВТБ Индекс МосБиржи"), S("AKMM", "БПИФ Альфа Денежный рынок"), S("SBMM", "БПИФ Первая Сберегательный"), S("GOLD", "БПИФ Золото"),
];
const STATIC_FX: { secid: string; ticker: string; name: string }[] = [
  { secid: "USD000UTSTOM", ticker: "USDRUB_TOM", name: "USDRUB_TOM - USD/РУБ" }, { secid: "EUR_RUB__TOM", ticker: "EURRUB_TOM", name: "EURRUB_TOM - EUR/РУБ" },
  { secid: "CNYRUB_TOM", ticker: "CNYRUB_TOM", name: "CNY/RUB_TOM - CNY/РУБ" }, { secid: "GLDRUB_TOM", ticker: "GLDRUB_TOM", name: "GLD/RUB_TOM - GLD/РУБ" },
  { secid: "SLVRUB_TOM", ticker: "SLVRUB_TOM", name: "SLV/RUB_TOM - SLV/РУБ" }, { secid: "PLTRUB_TOM", ticker: "PLTRUB_TOM", name: "PLT/RUB_TOM - PLT/РУБ" },
  { secid: "PLDRUB_TOM", ticker: "PLDRUB_TOM", name: "PLD/RUB_TOM - PLD/РУБ" }, { secid: "HKDRUB_TOM", ticker: "HKDRUB_TOM", name: "HKD/RUB_TOM - HKD/РУБ" },
  { secid: "TRYRUB_TOM", ticker: "TRYRUB_TOM", name: "TRY/RUB_TOM - TRY/РУБ" }, { secid: "KZTRUB_TOM", ticker: "KZTRUB_TOM", name: "KZT/RUB_TOM - KZT/РУБ" },
  { secid: "GBPRUB_TOM", ticker: "GBPRUB_TOM", name: "GBP/RUB_TOM - GBP/РУБ" }, { secid: "BYNRUB_TOM", ticker: "BYNRUB_TOM", name: "BYN/RUB_TOM - BYN/РУБ" },
];
/** [auto ticker, underlying code, display name] */
const STATIC_FUT: [string, string, string][] = [
  ["Si", "Si", "Si · Доллар США / рубль"], ["MIX", "MIX", "MIX · Индекс МосБиржи"], ["RTS", "RTS", "RTS · Индекс РТС"], ["BR", "BR", "BR · Нефть Brent"], ["GOLD", "GOLD", "GOLD · Золото"],
  ["NG", "NG", "NG · Природный газ"], ["SBRF.F", "SBRF", "SBRF · Сбербанк"], ["GAZR.F", "GAZR", "GAZR · Газпром"], ["Eu", "Eu", "Eu · Евро / рубль"], ["CR", "CNY", "CNY · Юань / рубль"],
  ["LKOH.F", "LKOH", "LKOH · ЛУКОЙЛ"], ["SILV", "SILV", "SILV · Серебро"], ["GL.F", "GL", "GL · Золото в рублях"], ["MXI.F", "MXI", "MXI · Индекс МосБиржи (мини)"], ["BTCF", "BTC", "BTC · Биткоин"],
];

const BRD = (rows: { secid: string; name: string; short: string }[], f: (r: BoardRow) => MarketItem) =>
  rows.map((x) => f({ secid: x.secid, shortname: x.short, name: x.name, isin: "", sectype: "", turnover: 0 }));

/** Curated lists shown when ISS is unreachable (and instantly on the client before the live list arrives). */
export function staticPopular(group: PopularGroup): MarketItem[] {
  switch (group) {
    case "stock":
      return BRD(STATIC_STOCKS, stockItem);
    case "bond":
      return BRD(STATIC_OFZ, (r) => bondItem(r, "TQOB"));
    case "fund":
      return BRD(STATIC_FUNDS, fundItem);
    case "currency":
      return STATIC_FX.map((x) => currencyItem({ secid: x.secid, shortname: x.ticker, name: x.name, isin: "", sectype: "", turnover: 0 }));
    case "future":
      return STATIC_FUT.map(([auto, asset, name]) => ({ secid: auto, ticker: auto, name, group: "future", source: "moex", engine: "futures", market: "forts", board: "RFUD", auto: true, asset, kind: "quarterly" }) as MarketItem);
    case "crypto":
      return POPULAR_CRYPTO.map(cryptoItem);
    case "forex":
      return POPULAR_FOREX.map(fxItem);
    case "all":
      return mixAll((g) => staticPopular(g));
    default:
      return [];
  }
}

/** «Все»: a few rows of every group (chip order), duplicates dropped. */
export function mixAll(listOf: (g: MarketGroup) => MarketItem[]): MarketItem[] {
  const out: MarketItem[] = [];
  const seen = new Set<string>();
  for (const [g, n] of ALL_MIX) {
    for (const it of listOf(g).slice(0, n)) {
      const k = `${it.source}:${it.secid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
  }
  return out;
}
