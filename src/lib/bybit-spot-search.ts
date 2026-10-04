/**
 * Crypto search over the whole Bybit spot (USDT quote) pair list. The filtering / ranking is pure (no Next / network imports,
 * safe on the client and in scripts/check-crypto-search.ts); the list itself is fetched from the public `instruments-info`
 * endpoint (category=spot), cached for an hour with one in-flight request, a stale copy is served when Bybit is unreachable.
 */

import type { MarketItem } from "./market-types";

export interface SpotPair {
  /** BTCUSDT: the terminal ticker and the Bybit symbol of a spot pair */
  symbol: string;
  /** BTC */
  base: string;
  quote: string;
}

/** Readable names (en / ru aliases) of the popular coins: shown as the row name and matched by the query ("bitcoin", "биткоин"). */
const COINS: Record<string, { name: string; alias?: string[] }> = {
  BTC: { name: "Bitcoin", alias: ["биткоин", "биткойн"] },
  ETH: { name: "Ethereum", alias: ["эфириум", "эфир"] },
  SOL: { name: "Solana", alias: ["солана"] },
  XRP: { name: "XRP", alias: ["рипл", "ripple"] },
  BNB: { name: "BNB", alias: ["бинанс"] },
  DOGE: { name: "Dogecoin", alias: ["догикоин", "дож"] },
  ADA: { name: "Cardano", alias: ["кардано"] },
  AVAX: { name: "Avalanche", alias: ["аваланч"] },
  TON: { name: "Toncoin", alias: ["тон", "тонкоин", "toncoin"] },
  SUI: { name: "Sui" },
  TRX: { name: "TRON", alias: ["трон"] },
  LINK: { name: "Chainlink", alias: ["чейнлинк"] },
  DOT: { name: "Polkadot", alias: ["полкадот"] },
  LTC: { name: "Litecoin", alias: ["лайткоин"] },
  PEPE: { name: "Pepe" },
  SHIB: { name: "Shiba Inu", alias: ["шиба"] },
  POL: { name: "Polygon", alias: ["matic", "полигон"] },
  MATIC: { name: "Polygon", alias: ["полигон"] },
  ATOM: { name: "Cosmos", alias: ["космос"] },
  NEAR: { name: "NEAR Protocol" },
  UNI: { name: "Uniswap" },
  APT: { name: "Aptos" },
  ARB: { name: "Arbitrum" },
  OP: { name: "Optimism" },
  BCH: { name: "Bitcoin Cash" },
  ETC: { name: "Ethereum Classic" },
  XLM: { name: "Stellar" },
  FIL: { name: "Filecoin" },
  HBAR: { name: "Hedera" },
  INJ: { name: "Injective" },
  WLD: { name: "Worldcoin" },
  AAVE: { name: "Aave" },
  USDC: { name: "USD Coin" },
};

/** The popular pairs shown under the crypto tab before anything is typed (the terminal's own list). */
export const POPULAR_CRYPTO = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "TON", "SUI"].map((b) => ({ symbol: `${b}USDT`, base: b, quote: "USDT" }) as SpotPair);

/** Icon of a coin the terminal has artwork for (empty: the row shows a letter badge). */
const COIN_ICONS: Record<string, string> = {
  BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "xrp", BNB: "bnb", DOGE: "dogecoin", ADA: "cardano", AVAX: "avalanche", TON: "toncoin",
  SUI: "sui-crypto", LINK: "chainlink", DOT: "polkadot", LTC: "litecoin", PEPE: "pepe", POL: "polygon", MATIC: "polygon",
};
export function coinIcon(base: string): string {
  const f = COIN_ICONS[base.toUpperCase()];
  return f ? `/icons/instruments/${f}.svg` : "";
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");

/** True when a free-text query can be a coin ticker (so the «Все» tab adds Bybit hits): «btc», «sol», «pepe», «btcusdt». */
export function looksLikeCoin(q: string): boolean {
  return /^[A-Za-z0-9]{2,14}$/.test(q.trim());
}

export function pairToItem(p: SpotPair): MarketItem {
  return {
    secid: p.symbol,
    ticker: p.symbol,
    name: COINS[p.base]?.name ?? p.base,
    group: "crypto",
    source: "bybit",
    asset: p.base,
  };
}

/**
 * Filters and ranks spot pairs by the query: exact symbol / coin, then coin prefix, symbol prefix, name prefix, then "contains".
 * Ties are alphabetical by symbol. Returns at most `limit` pairs (none for an empty query).
 */
export function searchSpotPairs(list: SpotPair[], q: string, limit = 30): SpotPair[] {
  const n = norm(q.trim().replace(/[\s/_-]+/g, ""));
  if (!n) return [];
  const scored: { s: number; p: SpotPair }[] = [];
  for (const p of list) {
    const base = norm(p.base);
    const sym = norm(p.symbol);
    const coin = COINS[p.base];
    const names = coin ? [norm(coin.name), ...(coin.alias ?? []).map(norm)] : [];
    let s = 0;
    if (sym === n) s = 100;
    else if (base === n) s = 95;
    else if (names.some((x) => x === n)) s = 90;
    else if (base.startsWith(n)) s = 80;
    else if (sym.startsWith(n)) s = 70;
    else if (names.some((x) => x.startsWith(n))) s = 65;
    else if (n.length >= 2 && base.includes(n)) s = 50;
    else if (n.length >= 3 && names.some((x) => x.includes(n))) s = 40;
    else if (n.length >= 3 && sym.includes(n)) s = 30;
    if (s) scored.push({ s, p });
  }
  scored.sort((a, b) => b.s - a.s || a.p.symbol.localeCompare(b.p.symbol));
  return scored.slice(0, limit).map((x) => x.p);
}

/** Parses the instruments-info answer: trading USDT-quoted spot pairs only. */
export function parseSpotList(j: any): SpotPair[] {
  const out: SpotPair[] = [];
  for (const it of j?.result?.list ?? []) {
    if (String(it?.quoteCoin) !== "USDT") continue;
    if (it?.status && String(it.status) !== "Trading") continue;
    const symbol = String(it?.symbol ?? "");
    const base = String(it?.baseCoin ?? "");
    if (!/^[A-Z0-9]{2,20}$/.test(symbol) || !base) continue;
    out.push({ symbol, base, quote: "USDT" });
  }
  return out;
}

/* ── server side: cached list ── */

const API = "https://api.bybit.com/v5/market/instruments-info?category=spot";
const TTL_MS = 3_600_000;
const G = globalThis as unknown as { __fomoBybitSpot?: { at: number; list: SpotPair[]; failedAt: number; inflight: Promise<void> | null } };
const S = (G.__fomoBybitSpot ??= { at: 0, list: [], failedAt: 0, inflight: null });

/** The whole spot USDT list. Never throws: on a failure the stale copy (or an empty list) is returned and a retry waits a minute. */
export async function getBybitSpotList(): Promise<SpotPair[]> {
  if (S.list.length && Date.now() - S.at < TTL_MS) return S.list;
  if (Date.now() - S.failedAt < 60_000) return S.list;
  if (!S.inflight) {
    S.inflight = (async () => {
      try {
        const res = await fetch(API, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
        const j = res.ok ? await res.json() : null;
        const list = j?.retCode === 0 ? parseSpotList(j) : [];
        if (list.length) {
          S.list = list;
          S.at = Date.now();
        } else S.failedAt = Date.now();
      } catch {
        S.failedAt = Date.now();
      }
    })().finally(() => {
      S.inflight = null;
    });
  }
  await S.inflight;
  return S.list;
}

/** Crypto search for the market-search API: query hits over the whole spot list; an empty query gives the popular pairs. */
export async function searchCrypto(q: string, limit = 30): Promise<MarketItem[]> {
  if (!q.trim()) return POPULAR_CRYPTO.slice(0, limit).map(pairToItem);
  // Bybit unreachable (blocked network): at least the popular pairs stay searchable
  const live = await getBybitSpotList();
  return searchSpotPairs(live.length ? live : POPULAR_CRYPTO, q, limit).map(pairToItem);
}
