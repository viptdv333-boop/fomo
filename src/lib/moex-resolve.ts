/**
 * Any MOEX instrument id -> where to get its data.
 *
 *   futures:  generic ticker ("MIX", "SBRF.F") -> front contract; exact SECID (MXZ6, IMOEXF) as is; board RFUD
 *   others:   ISS /securities/<SECID>.json lists the boards the instrument trades on, the primary one (is_primary) is used
 *             (TQBR shares and ETFs, TQOB OFZ, TQCB corporate bonds, TQTF/TQTD/TQIF funds, TQBD, CETS currency ...)
 *
 * Also provides the ISS "marketdata" quote used when Tinkoff does not know an instrument (or has no token configured).
 * No Next / DB imports (used by the alert scheduler too).
 */

import { resolveFuturesTicker } from "./moex-contracts";

const ISS = "https://iss.moex.com/iss";

import type { MarketGroup } from "./market-types";
export type { MarketGroup };

export interface MoexSecurity {
  /** the id the data is requested for (front contract SECID for a generic futures ticker) */
  secid: string;
  /** what was asked for */
  requested: string;
  engine: string;
  market: string;
  board: string;
  /** Tinkoff Invest API class code of the board */
  classCode: string;
  group: MarketGroup;
  /** unit of the price when it is not money: bonds quote in % of par */
  unit?: "%";
  decimals?: number;
  /** a generic futures ticker was mapped to the front contract */
  auto?: boolean;
}

const G = globalThis as unknown as { __fomoMoexRes?: { cache: Map<string, { at: number; r: MoexSecurity | null }>; inflight: Map<string, Promise<MoexSecurity | null>> } };
const S = (G.__fomoMoexRes ??= { cache: new Map(), inflight: new Map() });
const HIT_TTL = 6 * 3_600_000;
const FRONT_TTL = 10 * 60_000;
const MISS_TTL = 5 * 60_000;
const ID_RE = /^[A-Za-z0-9_.-]{1,24}$/;

/** MOEX market -> terminal group (a fund looks like a share on TQBR/TQTF: told apart by the search, not here) */
export function groupOfMarket(engine: string, market: string, board: string): MarketGroup {
  if (engine === "futures") return "future";
  if (engine === "currency") return "currency";
  if (market === "bonds") return "bond";
  if (/^(TQTF|TQTD|TQIF|TQPI)$/.test(board)) return "fund";
  if (market === "index") return "index";
  if (engine === "stock") return "stock";
  return "other";
}

async function issJson(url: string): Promise<any | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function lookup(ticker: string): Promise<MoexSecurity | null> {
  // 1. futures: generic ticker or an exact current contract
  const fut = await resolveFuturesTicker(ticker);
  if (fut) {
    return { secid: fut.secid, requested: ticker, engine: "futures", market: "forts", board: fut.board, classCode: "SPBFUT", group: "future", auto: fut.auto };
  }
  if (!ID_RE.test(ticker)) return null;
  // 2. everything else: the primary board from ISS
  const data = await issJson(`${ISS}/securities/${encodeURIComponent(ticker)}.json?iss.meta=off&iss.only=boards&boards.columns=boardid,market,engine,is_traded,decimals,is_primary`);
  const rows: any[][] = data?.boards?.data ?? [];
  if (rows.length === 0) return null;
  const real = rows.filter((r) => r[2] === "stock" || r[2] === "currency" || r[2] === "futures");
  const pick = real.find((r) => r[5] === 1) ?? real.find((r) => r[3] === 1) ?? real[0];
  if (!pick) return null;
  const [board, market, engine, , decimals] = pick as [string, string, string, number, number];
  const group = groupOfMarket(engine, market, board);
  return {
    secid: ticker,
    requested: ticker,
    engine,
    market,
    board,
    classCode: engine === "futures" ? "SPBFUT" : board,
    group,
    unit: market === "bonds" ? "%" : undefined,
    decimals: typeof decimals === "number" ? decimals : undefined,
  };
}

/** Resolve any MOEX id. Cached (6 h, 10 min for a generic futures ticker, 5 min for a miss). Never throws. */
export async function resolveMoex(ticker: string): Promise<MoexSecurity | null> {
  const hit = S.cache.get(ticker);
  if (hit && Date.now() - hit.at < (hit.r === null ? MISS_TTL : hit.r.auto ? FRONT_TTL : HIT_TTL)) return hit.r;
  let p = S.inflight.get(ticker);
  if (!p) {
    p = lookup(ticker)
      .catch(() => null)
      .then((r) => {
        // a miss caused by an ISS outage must not shadow an older good answer
        if (r || !hit?.r) {
          if (S.cache.size > 3000) S.cache.clear();
          S.cache.set(ticker, { at: Date.now(), r });
        }
        return r ?? hit?.r ?? null;
      })
      .finally(() => S.inflight.delete(ticker));
    S.inflight.set(ticker, p);
  }
  return p;
}

export function issSecurityPath(sec: Pick<MoexSecurity, "engine" | "market" | "board" | "secid">): string {
  return `${ISS}/engines/${sec.engine}/markets/${sec.market}/boards/${sec.board}/securities/${encodeURIComponent(sec.secid)}`;
}

export interface IssQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  time: string;
}

const qCache = new Map<string, { at: number; q: IssQuote | null }>();

/** Last price of an instrument from ISS marketdata (15 minutes delayed on the free feed). Cached 5 s. */
export async function issQuote(sec: MoexSecurity): Promise<IssQuote | null> {
  const key = `${sec.board}:${sec.secid}`;
  const hit = qCache.get(key);
  if (hit && Date.now() - hit.at < 5000) return hit.q;
  const data = await issJson(`${issSecurityPath(sec)}.json?iss.meta=off&iss.only=marketdata,securities`);
  let q: IssQuote | null = null;
  try {
    const md = rowOf(data?.marketdata);
    const sc = rowOf(data?.securities);
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : 0);
    // LAST is empty before the first trade of a session: fall back to the previous close
    const price = num(md.LAST) || num(md.CLOSEPRICE) || num(md.MARKETPRICE) || num(md.SETTLEPRICE) || num(sc.PREVPRICE) || num(sc.PREVSETTLEPRICE);
    if (price > 0) {
      const prev = num(sc.PREVPRICE) || num(sc.PREVSETTLEPRICE) || num(md.LCLOSEPRICE);
      const change = typeof md.LASTCHANGE === "number" && num(md.LAST) ? md.LASTCHANGE : prev > 0 ? price - prev : 0;
      const base = price - change;
      q = {
        price,
        open: num(md.OPEN) || prev || price,
        high: num(md.HIGH) || price,
        low: num(md.LOW) || price,
        volume: num(md.VOLTODAY),
        change,
        changePercent: base > 0 ? (change / base) * 100 : 0,
        time: sysTime(md.SYSTIME),
      };
    }
  } catch {
    q = null;
  }
  if (qCache.size > 2000) qCache.clear();
  qCache.set(key, { at: Date.now(), q });
  return q;
}

function rowOf(block: { columns?: string[]; data?: unknown[][] } | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  const cols = block?.columns ?? [];
  const row = block?.data?.[0];
  if (row) cols.forEach((c, i) => (out[c] = row[i]));
  return out;
}

/** ISS SYSTIME "2026-10-03 12:41:23" is Moscow wall clock */
function sysTime(v: unknown): string {
  if (typeof v === "string" && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v)) return new Date(Date.parse(v.replace(" ", "T") + "+03:00")).toISOString();
  return new Date().toISOString();
}
