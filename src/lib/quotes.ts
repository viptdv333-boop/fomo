import { prisma } from "@/lib/prisma";
import { frontSecid } from "./moex-contracts";
import { issQuote, resolveMoex, type MoexSecurity } from "./moex-resolve";
import { parseBybitTicker, type BybitCategory } from "./bybit-symbol";
import { fmpSymbol } from "@/lib/fmp-alias";
import { getForexQuotes } from "@/lib/forex";

/**
 * Batch quotes for the terminal watchlist.
 *
 * One Tinkoff GetLastPrices call covers every MOEX instrument, one Bybit tickers call covers every
 * crypto pair, and results are cached for a couple of seconds so any number of clients polling the
 * same list costs the upstream APIs the same handful of requests.
 * (Instrument resolution mirrors /api/quote, which stays untouched.)
 */

export interface BatchQuote {
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  time: string;
  open?: number;
  high?: number;
  low?: number;
}

export interface QuoteRequest {
  source: "moex" | "bybit" | "fmp" | "forex";
  ticker: string;
}

const TINKOFF_URL = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const TINKOFF_TOKEN = process.env.TINKOFF_TOKEN || "";

const QUOTE_TTL_MS = 2000;
const CLOSE_TTL_MS = 10 * 60_000;

const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", GOLD: "GD", SILV: "SV", PLT: "PT", PLD: "PD", NG: "NG", WHEAT: "W4", COCOA: "CC", SUGAR: "SA",
  CU: "CE", Si: "Si", Eu: "Eu", CR: "CR", NASD: "NA", SPYF: "SF", MIX: "MX", RTS: "RI", BTCF: "BT",
};

/* ── shared helpers ── */

function parseQuotation(q?: { units?: string; nano?: number }): number {
  if (!q) return 0;
  return parseInt(q.units || "0") + (q.nano || 0) / 1_000_000_000;
}

async function tinkoff(endpoint: string, body: object): Promise<any> {
  try {
    const res = await fetch(`${TINKOFF_URL}.${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TINKOFF_TOKEN}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/* ── which MOEX tickers are shares (TQBR) rather than futures (SPBFUT) ── */

let shareTickers: Set<string> | null = null;
let shareTickersAt = 0;

async function getShareTickers(): Promise<Set<string>> {
  if (shareTickers && Date.now() - shareTickersAt < 10 * 60_000) return shareTickers;
  try {
    const rows = await prisma.instrument.findMany({
      where: { dataSource: "moex", instrumentType: "stock", dataTicker: { not: null } },
      select: { dataTicker: true },
    });
    shareTickers = new Set(rows.map((r) => r.dataTicker!));
    shareTickersAt = Date.now();
  } catch {
    shareTickers = shareTickers ?? new Set();
  }
  return shareTickers;
}

/* ── active futures contract (front month) ── */

let futuresList: { at: number; rows: [string, string][] } | null = null;
const contractCache = new Map<string, { contract: string; at: number }>();

async function loadFuturesList(): Promise<[string, string][]> {
  if (futuresList && Date.now() - futuresList.at < 3600_000) return futuresList.rows;
  try {
    const res = await fetch(
      "https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE",
      { cache: "no-store" }
    );
    if (!res.ok) return futuresList?.rows ?? [];
    const data = await res.json();
    const rows: [string, string][] = (data.securities?.data ?? []).map((r: any[]) => [r[0], r[2]]);
    futuresList = { at: Date.now(), rows };
    return rows;
  } catch {
    return futuresList?.rows ?? [];
  }
}

async function findActiveContract(base: string): Promise<string | null> {
  const front = await frontSecid(base);
  if (front) return front;
  const prefix = FUTURES_PREFIX[base];
  if (!prefix) return null;
  const cached = contractCache.get(base);
  if (cached && Date.now() - cached.at < 3600_000) return cached.contract;
  const rows = await loadFuturesList();
  const today = new Date().toISOString().slice(0, 10);
  const candidates = rows
    .filter(([id, last]) => id.startsWith(prefix) && id !== base && last && last >= today)
    .sort((a, b) => a[1].localeCompare(b[1]));
  const contract = candidates[0]?.[0] ?? null;
  if (contract) contractCache.set(base, { contract, at: Date.now() });
  return contract;
}

/* ── Tinkoff instrument uid (resolved once per ticker+class) ── */

const uidCache = new Map<string, string>();

async function resolveUid(ticker: string, classCode: string): Promise<string | null> {
  const key = `${ticker}_${classCode}`;
  const hit = uidCache.get(key);
  if (hit) return hit;
  const data = await tinkoff("InstrumentsService/GetInstrumentBy", {
    idType: "INSTRUMENT_ID_TYPE_TICKER",
    classCode,
    id: ticker,
  });
  const uid: string | undefined = data?.instrument?.uid;
  if (uid) uidCache.set(key, uid);
  return uid ?? null;
}

/** Previous session close per uid, refreshed every few minutes. */
const closeCache = new Map<string, { price: number; at: number }>();

async function loadCloses(uids: string[]): Promise<void> {
  const need = uids.filter((u) => {
    const c = closeCache.get(u);
    return !c || Date.now() - c.at > CLOSE_TTL_MS;
  });
  if (need.length === 0) return;
  const data = await tinkoff("MarketDataService/GetClosePrices", {
    instruments: need.map((instrumentId) => ({ instrumentId })),
  });
  const rows: any[] = data?.closePrices ?? [];
  const now = Date.now();
  for (const r of rows) {
    const p = parseQuotation(r.price);
    if (r.instrumentUid && p > 0) closeCache.set(r.instrumentUid, { price: p, at: now });
  }
  // Instruments the API did not answer for: do not ask again on every poll.
  for (const u of need) if (!closeCache.has(u)) closeCache.set(u, { price: 0, at: now });
}

async function fetchMoex(tickers: string[], realtime = true): Promise<Map<string, BatchQuote>> {
  const out = new Map<string, BatchQuote>();
  const shares = realtime ? await getShareTickers() : new Set<string>();

  // ticker -> uid
  const uidByTicker = new Map<string, string>();
  const secByTicker = new Map<string, MoexSecurity>();
  await Promise.all(
    tickers.map(async (ticker) => {
      let resolved = ticker;
      let classCode = "SPBFUT";
      if (shares.has(ticker)) classCode = "TQBR";
      else {
        // any MOEX id: exact futures contract / perpetual as is, generic futures ticker -> front contract, everything else
        // (shares of any board, bonds, funds, currency) on its primary board from ISS
        const sec = await resolveMoex(ticker);
        if (sec) {
          secByTicker.set(ticker, sec);
          resolved = sec.secid;
          classCode = sec.classCode;
        } else if (!realtime) {
          return; // delayed feed: only what ISS knows
        } else if (FUTURES_PREFIX[ticker]) {
          const contract = await findActiveContract(ticker);
          if (!contract) return;
          resolved = contract;
        }
      }
      if (!realtime) return; // no T-Invest lookup for a guest: the ISS fallback below answers
      const uid = await resolveUid(resolved, classCode);
      if (uid) uidByTicker.set(ticker, uid);
    })
  );
  if (uidByTicker.size > 0) await fillFromTinkoff(out, uidByTicker);

  // Instruments Tinkoff did not answer for (no token, an id it does not list): ISS marketdata, 15 minutes delayed
  const missing = [...secByTicker.entries()].filter(([t]) => !out.has(t));
  for (let i = 0; i < missing.length; i += 6) {
    await Promise.all(
      missing.slice(i, i + 6).map(async ([ticker, sec]) => {
        const q = await issQuote(sec);
        if (q) out.set(ticker, { price: q.price, change: q.change, changePercent: q.changePercent, volume: q.volume, time: q.time, open: q.open, high: q.high, low: q.low });
      })
    );
  }
  return out;
}

async function fillFromTinkoff(out: Map<string, BatchQuote>, uidByTicker: Map<string, string>): Promise<void> {

  const uids = [...new Set(uidByTicker.values())];
  const [prices] = await Promise.all([
    tinkoff("MarketDataService/GetLastPrices", { instrumentId: uids, lastPriceType: "LAST_PRICE_EXCHANGE" }),
    loadCloses(uids),
  ]);
  const priceByUid = new Map<string, { price: number; time: string }>();
  for (const lp of prices?.lastPrices ?? []) {
    const p = parseQuotation(lp.price);
    if (lp.instrumentUid && p > 0) priceByUid.set(lp.instrumentUid, { price: p, time: lp.time || new Date().toISOString() });
  }

  for (const [ticker, uid] of uidByTicker) {
    const lp = priceByUid.get(uid);
    if (!lp) continue;
    const prev = closeCache.get(uid)?.price || 0;
    const change = prev > 0 ? lp.price - prev : 0;
    out.set(ticker, {
      price: lp.price,
      change,
      changePercent: prev > 0 ? (change / prev) * 100 : 0,
      volume: 0,
      time: lp.time,
      open: prev > 0 ? prev : undefined,
    });
  }
}

/* ── Bybit: one tickers request per category covers every pair ── */

const bybitAll: Partial<Record<BybitCategory, { at: number; map: Map<string, BatchQuote> }>> = {};
const bybitInflight: Partial<Record<BybitCategory, Promise<Map<string, BatchQuote>>>> = {};

async function loadBybit(category: BybitCategory = "spot"): Promise<Map<string, BatchQuote>> {
  const cached = bybitAll[category];
  if (cached && Date.now() - cached.at < QUOTE_TTL_MS) return cached.map;
  const running = bybitInflight[category];
  if (running) return running;
  const p = (async () => {
    try {
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=${category}`, { cache: "no-store" });
      if (!res.ok) return bybitAll[category]?.map ?? new Map();
      const data = await res.json();
      const map = new Map<string, BatchQuote>();
      const time = new Date().toISOString();
      for (const it of data?.result?.list ?? []) {
        const price = parseFloat(it.lastPrice || "0");
        if (!(price > 0)) continue;
        const prev = parseFloat(it.prevPrice24h || "0");
        const change = prev > 0 ? price - prev : 0;
        map.set(it.symbol, {
          price,
          change,
          changePercent: prev > 0 ? (change / prev) * 100 : 0,
          volume: parseFloat(it.volume24h || "0"),
          time,
          open: prev > 0 ? prev : undefined,
          high: parseFloat(it.highPrice24h || "0") || undefined,
          low: parseFloat(it.lowPrice24h || "0") || undefined,
        });
      }
      bybitAll[category] = { at: Date.now(), map };
      return map;
    } catch {
      return bybitAll[category]?.map ?? new Map();
    } finally {
      delete bybitInflight[category];
    }
  })();
  bybitInflight[category] = p;
  return p;
}

/* ── public entry ── */

const cache = new Map<string, { at: number; q: BatchQuote | null }>();

/* FMP (US stocks, spot commodities): one request per symbol, cached longer than the exchange feeds */
const FMP_TTL_MS = 15_000;
const FMP_KEY = process.env.FMP_API_KEY || "";

async function fetchFmpOne(ticker: string): Promise<BatchQuote | null> {
  if (!FMP_KEY) return null;
  try {
    const r = await fetch(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(fmpSymbol(ticker))}&apikey=${FMP_KEY}`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    const it = Array.isArray(data) ? data[0] : data;
    if (!it || !it.price) return null;
    return {
      price: it.price,
      change: it.change || 0,
      changePercent: it.changePercentage ?? it.changesPercentage ?? 0,
      volume: it.volume || 0,
      time: it.timestamp ? new Date(it.timestamp * 1000).toISOString() : new Date().toISOString(),
      open: it.open || undefined,
      high: it.dayHigh || undefined,
      low: it.dayLow || undefined,
    };
  } catch {
    return null;
  }
}
let moexInflight: { key: string; p: Promise<Map<string, BatchQuote>> } | null = null;

/**
 * `opts.realtime === false` (a guest): MOEX quotes come from the delayed ISS marketdata only, never from T-Invest, and are
 * cached apart from the real-time ones so a delayed answer is never served as real time or the other way round.
 */
export async function getBatchQuotes(items: QuoteRequest[], opts: { realtime?: boolean } = {}): Promise<Record<string, BatchQuote>> {
  const realtime = opts.realtime !== false;
  const moexKey = (ticker: string) => (realtime ? `moex:${ticker}` : `delayed:moex:${ticker}`);
  const out: Record<string, BatchQuote> = {};
  const now = Date.now();
  const staleMoex: string[] = [];
  const staleFmp: string[] = [];
  const fxTickers: string[] = [];
  let needBybit = false;

  for (const it of items) {
    const key = `${it.source}:${it.ticker}`;
    if (it.source === "forex") {
      fxTickers.push(it.ticker); // cached inside the forex layer (about 8 s, shared in-flight requests)
      continue;
    }
    const hit = cache.get(it.source === "moex" ? moexKey(it.ticker) : key);
    if (hit && now - hit.at < (it.source === "fmp" ? FMP_TTL_MS : QUOTE_TTL_MS)) {
      if (hit.q) out[key] = hit.q;
      continue;
    }
    if (it.source === "moex") staleMoex.push(it.ticker);
    else if (it.source === "fmp") staleFmp.push(it.ticker);
    else needBybit = true;
  }

  const jobs: Promise<void>[] = [];

  if (staleMoex.length) {
    const list = [...new Set(staleMoex)].sort();
    const jobKey = `${realtime ? "rt" : "dl"}|${list.join(",")}`;
    jobs.push(
      (async () => {
        let job = moexInflight && moexInflight.key === jobKey ? moexInflight : null;
        if (!job) {
          job = { key: jobKey, p: fetchMoex(list, realtime) };
          moexInflight = job;
        }
        const map = await job.p;
        if (moexInflight === job) moexInflight = null;
        const at = Date.now();
        for (const ticker of list) {
          const q = map.get(ticker) ?? null;
          // A failed fetch keeps serving the previous value for a while instead of blanking the row.
          const prev = cache.get(moexKey(ticker))?.q ?? null;
          const keep = q ?? (prev && at - (cache.get(moexKey(ticker))?.at ?? 0) < 60_000 ? prev : null);
          cache.set(moexKey(ticker), { at, q: keep });
          if (keep) out[`moex:${ticker}`] = keep;
        }
      })()
    );
  }

  if (staleFmp.length) {
    jobs.push(
      (async () => {
        const list = [...new Set(staleFmp)].slice(0, 30);
        const res = await Promise.all(list.map((t) => fetchFmpOne(t)));
        const at = Date.now();
        list.forEach((t, i) => {
          const key = `fmp:${t}`;
          const prev = cache.get(key);
          const keep = res[i] ?? (prev?.q && at - prev.at < 5 * 60_000 ? prev.q : null);
          cache.set(key, { at, q: keep });
          if (keep) out[key] = keep;
        });
      })()
    );
  }

  if (fxTickers.length) {
    jobs.push(
      (async () => {
        const res = await getForexQuotes(fxTickers);
        for (const t of fxTickers) {
          const r = res[t.toUpperCase()];
          if (r) out[`forex:${t}`] = { ...r.quote };
        }
      })()
    );
  }

  if (needBybit) {
    jobs.push(
      (async () => {
        // BTCUSDT is spot, BTCUSDT.P / BTC-26DEC25 linear, BTCUSD.I inverse: one tickers request per category in use
        const cats = [...new Set(items.filter((i) => i.source === "bybit").map((i) => parseBybitTicker(i.ticker).category))];
        const maps = new Map<BybitCategory, Map<string, BatchQuote>>();
        await Promise.all(cats.map(async (c) => maps.set(c, await loadBybit(c))));
        const at = Date.now();
        for (const it of items) {
          if (it.source !== "bybit") continue;
          const key = `bybit:${it.ticker}`;
          const hit = cache.get(key);
          if (hit && at - hit.at < QUOTE_TTL_MS) continue; // already answered from cache above
          const bb = parseBybitTicker(it.ticker);
          const q = maps.get(bb.category)?.get(bb.symbol) ?? null;
          cache.set(key, { at, q });
          if (q) out[key] = q;
        }
      })()
    );
  }

  await Promise.all(jobs);
  return out;
}
