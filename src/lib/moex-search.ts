/**
 * Universal MOEX search: FORTS futures (our own classified list: families + exact contracts, perpetuals included) and
 * everything else ISS knows (shares of all boards, OFZ / corporate bonds, ETFs and mutual funds, depositary receipts,
 * currency pairs and metals, indices). No Next / DB imports.
 */

import { baseName, getFortsFamilies, refreshDays, type ContractFamily, type FortsContract } from "./moex-contracts";
import { groupOfMarket } from "./moex-resolve";
import type { MarketGroup, MarketItem } from "./market-types";
import { parseFxSymbol, POPULAR_FOREX, pairToItem as fxPairToItem, searchForex } from "./forex-meta";
import { getBybitSpotList, looksLikeCoin, pairToItem, searchCrypto, searchSpotPairs } from "./bybit-spot-search";
import { bondItem, currencyItem, fundItem, FUTURES_PRIORITY, mixAll, parseBoard, pickBonds, pickCurrency, pickFunds, pickStocks, staticPopular, stockItem, type BoardRow, type PopularGroup } from "./market-popular";

const ISS = "https://iss.moex.com/iss";

/** ISS search group -> terminal group (null = not offered) */
const ISS_GROUP: Record<string, MarketGroup | null> = {
  stock_shares: "stock",
  stock_dr: "stock",
  stock_foreign_shares: "stock",
  stock_qnv: "stock",
  stock_bonds: "bond",
  stock_eurobond: "bond",
  stock_mortgage: "bond",
  stock_ppif: "fund",
  stock_etf: "fund",
  currency_selt: "currency",
  currency_metal: "currency",
  currency_futures: null,
  currency_indices: null,
  currency_otcindices: null,
  stock_index: "index",
  stock_gcc: null,
  stock_deposit: null,
  futures_forts: null, // served from the classified FORTS list
  futures_options: null,
};

/** Russian names of the popular underlyings (ISS only has the English short names): used for display and for matching "золото", "нефть" ... */
const RU_NAMES: Record<string, string> = {
  MIX: "Индекс МосБиржи", MXI: "Индекс МосБиржи (мини)", RTS: "Индекс РТС", RTSM: "Индекс РТС (мини)", IMOEX: "Индекс МосБиржи (вечный)", RGBI: "Индекс RGBI (ОФЗ)",
  BR: "Нефть Brent", BRM: "Нефть Brent (мини)", WTI: "Нефть WTI", NG: "Природный газ", NGM: "Природный газ (мини)", TTF: "Газ TTF",
  GOLD: "Золото", GOLDM: "Золото (мини)", SILV: "Серебро", SILVM: "Серебро (мини)", PLT: "Платина", PLTM: "Платина (мини)", PLD: "Палладий", PLDM: "Палладий (мини)",
  COPPER: "Медь", ALUM: "Алюминий", NICKEL: "Никель", ZINC: "Цинк", COCOA: "Какао", COFFEE: "Кофе", SUGAR: "Сахар-сырец", SUGR: "Сахар белый", WHEAT: "Пшеница",
  ORANGE: "Апельсиновый сок", AI92: "Бензин Аи-92", AI95: "Бензин Аи-95",
  Si: "Доллар США / рубль", Eu: "Евро / рубль", CNY: "Юань / рубль", USDM: "Доллар США / рубль (мини)", EURM: "Евро / рубль (мини)", ED: "Евро / доллар", GBPU: "Фунт / доллар",
  UCNY: "Доллар / юань", UTRY: "Доллар / лира", UKZT: "Доллар / тенге", KZT: "Тенге / рубль", HKD: "Гонконгский доллар / рубль", AED: "Дирхам ОАЭ / рубль", BYN: "Белорусский рубль / рубль", INR: "Рупия / рубль", TRY: "Лира / рубль",
  NASD: "Nasdaq 100", SPYF: "S&P 500", DJ30: "Dow Jones", DAX: "DAX", HANG: "Hang Seng", NIKK: "Nikkei 225", R2000: "Russell 2000", STOX: "Euro Stoxx 50", VI: "Индекс волатильности RVI", RVI: "Индекс волатильности RVI",
  BTC: "Биткоин", ETH: "Эфириум", SOL: "Solana", XRP: "XRP", TRX: "TRON", KEYRATE: "Ключевая ставка", RUONIA: "RUONIA",
  SBRF: "Сбербанк", SBPR: "Сбербанк (прив.)", GAZR: "Газпром", LKOH: "ЛУКОЙЛ", ROSN: "Роснефть", GMKN: "Норникель", VTBR: "ВТБ", MGNT: "Магнит", AFLT: "Аэрофлот", ALRS: "АЛРОСА",
  CHMF: "Северсталь", MAGN: "ММК", NLMK: "НЛМК", MTSI: "МТС", MOEX: "Московская биржа", OZON: "Озон", YDEX: "Яндекс", T: "Т-Технологии", TATN: "Татнефть", SNGR: "Сургутнефтегаз", SNGP: "Сургутнефтегаз (прив.)",
  PHOR: "ФосАгро", PLZLM: "Полюс", POSI: "Positive Technologies", RUAL: "РУСАЛ", HYDR: "РусГидро", IRAO: "Интер РАО", FEES: "ФСК Россети", RTKM: "Ростелеком", RNFT: "РуссНефть", VKCO: "VK", X5: "X5 Group", MVID: "М.Видео",
  SBERF: "Сбербанк (вечный)", GAZPF: "Газпром (вечный)", USDRUBF: "Доллар / рубль (вечный)", EURRUBF: "Евро / рубль (вечный)", CNYRUBF: "Юань / рубль (вечный)", GLDRUBF: "Золото в рублях (вечный)", SLVRUBF: "Серебро в рублях (вечный)",
  IMOEXF: "Индекс МосБиржи (вечный)", BTCUSDF: "Биткоин (вечный)", ETHUSDF: "Эфириум (вечный)", SOLUSDF: "Solana (вечный)", XRPUSDF: "XRP (вечный)", TRXUSDF: "TRON (вечный)", SP500F: "S&P 500 (вечный)", QQQF: "Nasdaq QQQ (вечный)", RGBIF: "RGBI (вечный)",
  GL: "Золото в рублях", SL: "Серебро в рублях", AMD: "Армянский драм", AMDF: "AMD (акция США, вечный)", TSLAF: "Tesla (вечный)", AMZNF: "Amazon (вечный)", NFLXF: "Netflix (вечный)", COINF: "Coinbase (вечный)",
};
const ruName = (f: ContractFamily) => RU_NAMES[f.asset] ?? RU_NAMES[f.name];

const SEARCH_TTL = 60_000;
const CRYPTO_IN_ALL = 5;
/** «Все» + a query that names a currency pair or one currency exactly («eurusd», «eur», «евро»): this many forex rows at the end */
const FOREX_IN_ALL = 4;
const searchCache = new Map<string, { at: number; items: MarketItem[] }>();

function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е");
}

function famItem(f: ContractFamily): MarketItem {
  const dated = f.contracts.filter((c) => c.kind !== "perpetual");
  return {
    secid: f.auto,
    ticker: f.auto,
    name: ruName(f) ? `${f.name} · ${ruName(f)}` : f.name,
    group: "future",
    source: "moex",
    engine: "futures",
    market: "forts",
    board: "RFUD",
    auto: true,
    asset: f.asset,
    contracts: f.contracts.length,
    kind: dated.length ? dated[0].kind : "perpetual",
  };
}

function contractItem(c: FortsContract, f: ContractFamily): MarketItem {
  return {
    secid: c.secid,
    ticker: c.secid,
    name: c.shortname,
    group: "future",
    source: "moex",
    engine: "futures",
    market: "forts",
    board: c.board,
    asset: f.asset,
    kind: c.kind,
    expiry: c.expiry,
    order: c.order,
    daysLeft: c.daysLeft,
  };
}

function searchFutures(families: ContractFamily[], q: string, limit: number): MarketItem[] {
  const n = norm(q);
  if (!n) return [];
  const scored: { s: number; item: MarketItem }[] = [];
  for (const raw of families) {
    const f = refreshDays(raw);
    const keys = [f.asset, f.auto, f.name, ...f.contracts.map((c) => baseName(c.shortname))].map(norm);
    const ru = ruName(f);
    let fs = 0;
    if (keys.some((k) => k === n)) fs = 95;
    else if (keys.some((k) => k.startsWith(n))) fs = 70;
    else if (n.length >= 3 && keys.some((k) => k.includes(n))) fs = 40;
    else if (ru && n.length >= 3 && norm(ru).includes(n)) fs = norm(ru).startsWith(n) ? 65 : 45;
    if (fs) scored.push({ s: fs, item: famItem(f) });
    // exact contract ids typed by the user (MXZ6, MXH, IMOEXF)
    if (n.length >= 3 || fs === 0) {
      for (const c of f.contracts) {
        const id = norm(c.secid);
        const cs = id === n ? 100 : id.startsWith(n) && n.length >= 3 ? 60 : 0;
        if (cs) scored.push({ s: cs - (c.order || 9) * 0.01, item: contractItem(c, f) });
      }
    }
  }
  scored.sort((a, b) => b.s - a.s || a.item.secid.localeCompare(b.item.secid));
  return scored.slice(0, limit).map((x) => x.item);
}

async function issSearch(q: string, group: MarketGroup | "all", limit: number): Promise<MarketItem[]> {
  const url = `${ISS}/securities.json?q=${encodeURIComponent(q)}&limit=${Math.min(100, limit * 3)}&is_trading=1&iss.meta=off&securities.columns=secid,shortname,name,isin,type,group,primary_boardid`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const data = await res.json();
    const out: MarketItem[] = [];
    for (const r of (data?.securities?.data ?? []) as any[][]) {
      const [secid, shortname, name, isin, , grp, board] = r as [string, string, string, string | null, string, string, string];
      const g0 = ISS_GROUP[grp];
      if (!g0 || !secid || !board) continue;
      // ETFs / funds are listed in the shares market: the search group tells them apart
      const [engine, market] = engineMarketOf(grp, board);
      const g = g0 === "fund" || g0 === "index" || g0 === "currency" || g0 === "bond" ? g0 : groupOfMarket(engine, market, board) === "fund" ? "fund" : g0;
      if (group !== "all" && g !== group) continue;
      // bonds are identified by ISIN / SU number: show the readable short name
      const ticker = g === "bond" && secid.length > 10 ? shortname || secid : secid;
      out.push({
        secid,
        ticker,
        name: name || shortname || secid,
        isin: isin || undefined,
        group: g,
        source: "moex",
        engine,
        market,
        board,
        unit: g === "bond" ? "%" : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function engineMarketOf(grp: string, board: string): [string, string] {
  void board;
  if (grp.startsWith("currency")) return ["currency", "selt"];
  if (grp === "stock_index") return ["stock", "index"];
  if (grp === "stock_bonds" || grp === "stock_eurobond" || grp === "stock_mortgage") return ["stock", "bonds"];
  return ["stock", "shares"];
}

function rank(items: MarketItem[], q: string): MarketItem[] {
  const n = norm(q);
  const score = (i: MarketItem) => {
    const id = norm(i.secid);
    const tk = norm(i.ticker);
    if (id === n || tk === n) return 3;
    if (id.startsWith(n) || tk.startsWith(n)) return 2;
    if (norm(i.name).startsWith(n)) return 1.5;
    return 1;
  };
  return items.map((i, ix) => ({ i, s: score(i), ix })).sort((a, b) => b.s - a.s || a.ix - b.ix).map((x) => x.i);
}

export async function searchMarket(q: string, group: MarketGroup | "all" = "all", limit = 30): Promise<MarketItem[]> {
  q = q.trim();
  if (group === "crypto") return searchCrypto(q, limit); // the whole Bybit spot list (has its own 1 h cache)
  if (group === "forex") return q ? searchForex(q, limit) : POPULAR_FOREX.slice(0, limit).map(fxPairToItem); // static curated list, no network
  if (q.length < 1) return [];
  const key = `${group}|${limit}|${norm(q)}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL) return hit.items;

  const wantFut = group === "all" || group === "future";
  const wantCash = group !== "future";
  const [families, cash] = await Promise.all([
    wantFut ? getFortsFamilies() : Promise.resolve([] as ContractFamily[]),
    wantCash && q.length >= 2 ? issSearch(q, group, limit) : Promise.resolve([] as MarketItem[]),
  ]);
  const fut = wantFut ? searchFutures(families, q, limit) : [];
  const exactFut = fut.filter((f) => norm(f.secid) === norm(q));
  const rest = rank([...fut.filter((f) => !exactFut.includes(f)), ...cash], q);
  // an exact secid always on top; otherwise cash groups and futures interleave by relevance
  const items = [...exactFut, ...rest].slice(0, limit);
  // «Все» + a coin-like query («btc», «sol»): a few Bybit spot pairs after the MOEX hits
  if (group === "all" && looksLikeCoin(q)) {
    const spot = await getBybitSpotList();
    items.push(...searchSpotPairs(spot, q, CRYPTO_IN_ALL).map(pairToItem));
  }
  if (group === "all") {
    const have = new Set(items.map((i) => `${i.source}:${i.secid}`));
    items.push(...searchForex(q, FOREX_IN_ALL, 75).filter((i) => !have.has(`${i.source}:${i.secid}`)));
  }
  if (searchCache.size > 500) searchCache.clear();
  searchCache.set(key, { at: Date.now(), items });
  return items;
}

/* ── «popular» lists: what a group chip shows while nothing is typed ── */

const POPULAR_TTL = 10 * 60_000;
/** after a failed ISS call the curated fallback is served for this long before the next try */
const POPULAR_RETRY = 60_000;
const popularCache = new Map<string, { at: number; items: MarketItem[]; live: boolean }>();
const popularInflight = new Map<string, Promise<MarketItem[] | null>>();

async function issBoard(path: string, cols: string): Promise<BoardRow[]> {
  const url = `${ISS}/engines/${path}/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=${cols}&marketdata.columns=SECID,VALTODAY_RUR,VALTODAY`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    return parseBoard(await res.json());
  } catch {
    return [];
  }
}

const SHARE_COLS = "SECID,SHORTNAME,SECNAME,ISIN,SECTYPE";
const BOND_COLS = "SECID,SHORTNAME,SECNAME,ISIN";

/** Live list of one group from ISS (turnover ranking / curated order checked against the board), null when it cannot be built. */
async function livePopular(group: Exclude<PopularGroup, "all" | "crypto" | "forex" | "index" | "other">): Promise<MarketItem[] | null> {
  switch (group) {
    case "stock":
    case "fund": {
      // shares and funds / ETFs trade on the same board: one listing serves both chips
      const rows = await issBoard("stock/markets/shares/boards/TQBR", SHARE_COLS);
      const picked = group === "stock" ? pickStocks(rows).map(stockItem) : pickFunds(rows).map(fundItem);
      return picked.length ? picked : null;
    }
    case "bond": {
      const [ofz, corp] = await Promise.all([issBoard("stock/markets/bonds/boards/TQOB", BOND_COLS), issBoard("stock/markets/bonds/boards/TQCB", BOND_COLS)]);
      const picked = pickBonds(ofz, corp).map((x) => bondItem(x.row, x.corp ? "TQCB" : "TQOB"));
      return picked.length ? picked : null;
    }
    case "currency": {
      const picked = pickCurrency(await issBoard("currency/markets/selt/boards/CETS", BOND_COLS)).map(currencyItem);
      return picked.length ? picked : null;
    }
    case "future": {
      const families = await getFortsFamilies();
      const by = new Map(families.map((f) => [f.asset, f]));
      const picked = FUTURES_PRIORITY.map((a) => by.get(a)).filter((f): f is ContractFamily => !!f).map((f) => famItem(refreshDays(f)));
      return picked.length >= 3 ? picked : null;
    }
  }
}

/**
 * The «popular» list of a group chip for an empty query: stocks / bonds by today's turnover (ISS TQBR / TQOB + big issuers of TQCB), funds and FX
 * by the curated order checked against the boards, futures families with their contract counts, «Все» a mix of all of them. Cached 10 min;
 * when ISS fails the stale copy, else the static curated list, is served (never empty).
 */
export async function popularMarket(group: PopularGroup, limit = 30): Promise<MarketItem[]> {
  limit = Math.max(1, limit);
  if (group === "crypto" || group === "forex") return staticPopular(group).slice(0, limit);
  if (group === "all") {
    const parts = await Promise.all((["stock", "bond", "fund", "future", "currency"] as const).map(async (g) => [g, await popularMarket(g)] as const));
    const by = new Map<string, MarketItem[]>(parts);
    return mixAll((g) => by.get(g) ?? staticPopular(g));
  }
  if (group !== "stock" && group !== "bond" && group !== "fund" && group !== "future" && group !== "currency") return [];
  const hit = popularCache.get(group);
  if (hit && Date.now() - hit.at < (hit.live ? POPULAR_TTL : POPULAR_RETRY)) return hit.items.slice(0, limit);
  let p = popularInflight.get(group);
  if (!p) {
    p = livePopular(group)
      .catch(() => null)
      .finally(() => popularInflight.delete(group));
    popularInflight.set(group, p);
  }
  const live = await p;
  if (live) {
    popularCache.set(group, { at: Date.now(), items: live, live: true });
    return live.slice(0, limit);
  }
  // ISS is down: the stale live list if there is one, else the curated one; the next try comes in a minute
  const items = hit?.items ?? staticPopular(group);
  popularCache.set(group, { at: Date.now(), items, live: false });
  return items.slice(0, limit);
}

/** Exact lookup by SECID / ISIN / auto ticker: the item a URL ?symbol= stands for. */
export async function lookupMarket(id: string): Promise<MarketItem | null> {
  id = id.trim();
  if (!id) return null;
  const fx = parseFxSymbol(id);
  if (fx && /^[A-Za-z]{6}$/.test(id)) return fxPairToItem(fx);
  const families = await getFortsFamilies();
  for (const raw of families) {
    const f = refreshDays(raw);
    const c = f.contracts.find((x) => x.secid === id);
    if (c) return contractItem(c, f);
    if (f.auto === id) return famItem(f);
  }
  // cash instrument: ISS description of the id (exact)
  const items = await issSearch(id, "all", 10).catch(() => []);
  return items.find((i) => i.secid === id || i.isin === id) ?? null;
}
