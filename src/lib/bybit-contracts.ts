/**
 * Bybit contracts per base coin: spot / linear perpetual / dated futures / inverse. Public `instruments-info` endpoints,
 * cached for an hour, stale copy served on failures, never throws. (Bybit is blocked from some networks: then the answer is
 * `unavailable` and the terminal simply shows no picker for crypto.)
 *
 * NOT verified against the live API from the development machine (blocked there): parsed per Bybit v5 documentation.
 */

import { bybitTicker, parseBybitTicker, type BybitCategory } from "./bybit-symbol";
import type { ContractInfo, ContractsResponse } from "./market-types";
import type { Lang } from "./moex-contracts";

interface Inst {
  category: BybitCategory;
  symbol: string;
  base: string;
  quote: string;
  settle: string;
  perpetual: boolean;
  /** ms, 0 for a perpetual / spot */
  delivery: number;
  status: string;
}

const API = "https://api.bybit.com/v5/market/instruments-info";
const TTL_MS = 3_600_000;
const G = globalThis as unknown as { __fomoBybitInst?: { at: number; list: Inst[]; failedAt: number; inflight: Promise<void> | null } };
const S = (G.__fomoBybitInst ??= { at: 0, list: [], failedAt: 0, inflight: null });

async function fetchCategory(category: BybitCategory): Promise<Inst[] | null> {
  const out: Inst[] = [];
  let cursor = "";
  for (let page = 0; page < 8; page++) {
    const url = `${API}?category=${category}&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    let j: any;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12_000) });
      if (!res.ok) return null;
      j = await res.json();
    } catch {
      return null;
    }
    if (j?.retCode !== 0) return null;
    for (const it of j?.result?.list ?? []) {
      const type = String(it.contractType ?? "");
      out.push({
        category,
        symbol: String(it.symbol),
        base: String(it.baseCoin ?? ""),
        quote: String(it.quoteCoin ?? ""),
        settle: String(it.settleCoin ?? ""),
        perpetual: category === "spot" ? false : /Perpetual/i.test(type) || !Number(it.deliveryTime),
        delivery: Number(it.deliveryTime) || 0,
        status: String(it.status ?? ""),
      });
    }
    cursor = String(j?.result?.nextPageCursor ?? "");
    if (!cursor) break;
  }
  return out;
}

async function load(): Promise<Inst[]> {
  if (S.list.length && Date.now() - S.at < TTL_MS) return S.list;
  if (Date.now() - S.failedAt < 60_000) return S.list;
  if (!S.inflight) {
    S.inflight = (async () => {
      const [spot, linear, inverse] = await Promise.all([fetchCategory("spot"), fetchCategory("linear"), fetchCategory("inverse")]);
      // linear is the one that matters: without it nothing useful can be offered
      if (!linear) {
        S.failedAt = Date.now();
        return;
      }
      S.list = [...(spot ?? []), ...linear, ...(inverse ?? [])];
      S.at = Date.now();
    })().finally(() => {
      S.inflight = null;
    });
  }
  await S.inflight;
  return S.list;
}

const L = {
  ru: { spot: "спот", perp: "бессрочный", linear: "линейный", inverse: "инверсный", current: "текущий", next: "следующий" },
  en: { spot: "spot", perp: "perpetual", linear: "linear", inverse: "inverse", current: "current", next: "next" },
  cn: { spot: "现货", perp: "永续", linear: "正向", inverse: "反向", current: "当前", next: "次季" },
} as const;

function dateOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Contracts of the base coin the ticker belongs to ("BTCUSDT", "BTCUSDT.P", "BTC-26DEC25" ...). */
export async function getBybitContracts(ticker: string, lang: Lang = "ru"): Promise<ContractsResponse | null> {
  const list = await load();
  const p = parseBybitTicker(ticker);
  const known = list.find((i) => i.category === p.category && i.symbol === p.symbol);
  const base = known?.base ?? p.symbol.replace(/(USDT|USDC|PERP|USD)$/, "").replace(/-\d{1,2}[A-Z]{3}\d{2}$/, "");
  if (!base) return null;
  if (list.length === 0) {
    return { source: "bybit", asset: base, name: base, auto: ticker, contracts: [], unavailable: true };
  }
  const l = L[lang];
  const now = Date.now();
  const mine = list.filter((i) => i.base === base && (i.status === "Trading" || i.status === "") && (i.perpetual || i.delivery === 0 || i.delivery > now));
  const out: ContractInfo[] = [];
  const spot = mine.filter((i) => i.category === "spot");
  const pickSpot = spot.find((i) => i.quote === "USDT") ?? spot[0];
  const add = (i: Inst, order: number, kind: ContractInfo["kind"], label: string) => {
    out.push({
      secid: bybitTicker(i.category, i.symbol, i.perpetual),
      ticker: bybitTicker(i.category, i.symbol, i.perpetual),
      shortname: i.symbol,
      kind,
      expiry: i.delivery ? dateOf(i.delivery) : null,
      order,
      daysLeft: i.delivery ? Math.max(0, Math.round((i.delivery - now) / 86_400_000)) : null,
      badge: kind === "spot" ? l.spot : kind === "perpetual" ? l.perp : order === 1 ? l.current : order === 2 ? l.next : `#${order}`,
      label,
    });
  };
  if (pickSpot) add(pickSpot, 0, "spot", `${pickSpot.symbol} · ${l.spot}`);
  for (const cat of ["linear", "inverse"] as const) {
    const ofCat = mine.filter((i) => i.category === cat);
    const perps = ofCat.filter((i) => i.perpetual).sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const i of perps) add(i, 0, "perpetual", `${i.symbol} · ${l.perp} (${cat === "linear" ? l.linear : l.inverse}, ${i.settle || i.quote})`);
    const dated = ofCat.filter((i) => !i.perpetual).sort((a, b) => a.delivery - b.delivery);
    dated.forEach((i, ix) => {
      const m = new Date(i.delivery).getUTCMonth() + 1;
      const days = Math.max(0, Math.round((i.delivery - now) / 86_400_000));
      add(i, ix + 1, m % 3 === 0 ? "quarterly" : "monthly", `${i.symbol} · ${ix === 0 ? l.current : ix === 1 ? l.next : `#${ix + 1}`} (${dateOf(i.delivery)}, ${days} d)`);
    });
  }
  const spotTicker = pickSpot ? pickSpot.symbol : ticker;
  return { source: "bybit", asset: base, name: base, auto: spotTicker, current: ticker, contracts: out };
}
