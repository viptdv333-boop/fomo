/**
 * Binance spot market data (public, no key): candles, the 24 h ticker, the list of USDT pairs for the search (server only).
 * Hosts: data-api.binance.vision serves market data from anywhere (api.binance.com refuses some countries), api.binance.com is the fallback.
 */
import type { SpotPair } from "./bybit-spot-search";

const HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];

/** the terminal's interval ids -> Binance kline intervals */
const INTERVAL: Record<string, string> = {
  "1": "1m",
  "3": "3m",
  "5": "5m",
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "360": "6h",
  "720": "12h",
  D: "1d",
  W: "1w",
  M: "1M",
};

export const BINANCE_INTERVALS = Object.keys(INTERVAL);

async function getJson(path: string): Promise<any | null> {
  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}${path}`, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* next host */
    }
  }
  return null;
}

export interface BinanceCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const PAGE = 1000;

/** The newest `limit` bars up to `toMs` (when scrolling back), oldest first. Pages of 1000 walk backwards. */
export async function binanceCandles(symbol: string, interval: string, limit: number, toMs?: number): Promise<BinanceCandle[]> {
  const bi = INTERVAL[interval];
  if (!bi || !/^[A-Z0-9]{2,20}$/.test(symbol)) return [];
  const want = Math.min(Math.max(limit, 1), 5000);
  let all: BinanceCandle[] = [];
  let end = toMs;
  for (let page = 0; page < Math.ceil(want / PAGE); page++) {
    const n = Math.min(PAGE, want - all.length);
    const j = await getJson(`/api/v3/klines?symbol=${symbol}&interval=${bi}&limit=${n}${end ? `&endTime=${end}` : ""}`);
    if (!Array.isArray(j) || j.length === 0) break;
    const rows: BinanceCandle[] = j.map((r: any[]) => ({ timestamp: Number(r[0]), open: parseFloat(r[1]), high: parseFloat(r[2]), low: parseFloat(r[3]), close: parseFloat(r[4]), volume: parseFloat(r[5]) || 0 }));
    all = [...rows, ...all];
    if (j.length < n) break;
    end = Number(j[0][0]) - 1;
  }
  return all;
}

export interface BinanceTicker {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
}

function toTicker(it: any): BinanceTicker | null {
  const price = parseFloat(it?.lastPrice);
  if (!(price > 0)) return null;
  const open = parseFloat(it.openPrice) || price;
  return {
    price,
    open,
    high: parseFloat(it.highPrice) || price,
    low: parseFloat(it.lowPrice) || price,
    volume: parseFloat(it.volume) || 0,
    change: parseFloat(it.priceChange) || price - open,
    changePercent: parseFloat(it.priceChangePercent) || 0,
  };
}

export async function binanceTicker(symbol: string): Promise<BinanceTicker | null> {
  if (!/^[A-Z0-9]{2,20}$/.test(symbol)) return null;
  return toTicker(await getJson(`/api/v3/ticker/24hr?symbol=${symbol}`));
}

/* ── every ticker at once (watchlist quotes): one request, cached a few seconds ── */

const G = globalThis as unknown as { __fomoBinance?: { allAt: number; all: Map<string, BinanceTicker>; allInflight: Promise<void> | null; listAt: number; list: SpotPair[]; failedAt: number; listInflight: Promise<void> | null } };
const S = (G.__fomoBinance ??= { allAt: 0, all: new Map(), allInflight: null, listAt: 0, list: [], failedAt: 0, listInflight: null });

export async function binanceAllTickers(): Promise<Map<string, BinanceTicker>> {
  if (S.all.size && Date.now() - S.allAt < 4_000) return S.all;
  if (!S.allInflight) {
    S.allInflight = (async () => {
      const j = await getJson("/api/v3/ticker/24hr");
      if (!Array.isArray(j)) return;
      const map = new Map<string, BinanceTicker>();
      for (const it of j) {
        const t = toTicker(it);
        if (t && typeof it.symbol === "string") map.set(it.symbol, t);
      }
      if (map.size) {
        S.all = map;
        S.allAt = Date.now();
      }
    })().finally(() => {
      S.allInflight = null;
    });
  }
  await S.allInflight;
  return S.all;
}

/* ── the USDT spot pairs for the search ── */

const LIST_TTL_MS = 3_600_000;

export async function getBinanceSpotList(): Promise<SpotPair[]> {
  if (S.list.length && Date.now() - S.listAt < LIST_TTL_MS) return S.list;
  if (Date.now() - S.failedAt < 60_000) return S.list;
  if (!S.listInflight) {
    S.listInflight = (async () => {
      const j = await getJson("/api/v3/exchangeInfo?symbolStatus=TRADING");
      const list: SpotPair[] = [];
      for (const it of j?.symbols ?? []) {
        if (it?.quoteAsset !== "USDT" || it?.status !== "TRADING" || it?.isSpotTradingAllowed === false) continue;
        const symbol = String(it.symbol ?? "");
        const base = String(it.baseAsset ?? "");
        if (/^[A-Z0-9]{2,20}$/.test(symbol) && base) list.push({ symbol, base, quote: "USDT" });
      }
      if (list.length) {
        S.list = list;
        S.listAt = Date.now();
      } else S.failedAt = Date.now();
    })().finally(() => {
      S.listInflight = null;
    });
  }
  await S.listInflight;
  return S.list;
}
