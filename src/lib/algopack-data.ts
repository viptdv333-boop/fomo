/**
 * Data layer of the ALGOPACK routes and of scripts/check-algopack.ts: one function per dataset, each returning
 * `{ ok, reason, ... }` and never throwing. Paths / blocks / fields are the ones documented in the algopack-* skills.
 * No Next / DB imports. The caller has already applied the access policy.
 */

import { apGet, apRows } from "./algopack";
import {
  attachAlertPrices,
  futoiCandidates,
  mskDateOf,
  normAlerts,
  normFutoi,
  normHi2,
  normObstats,
  normOrderstats,
  normTradestats,
  parseBook,
  type AlertRow,
  type Book,
  type Hi2Table,
  type Tbl,
} from "./algopack-parse";
import { getFortsFamilies, resolveContract } from "./moex-contracts";
import { issSecurityPath, resolveMoex, type MoexSecurity } from "./moex-resolve";

export type DsMarket = "eq" | "fo" | "fx";

export const TTL = { orderbook: 2000, supercandles: 30_000, futoi: 45_000, alerts: 20_000, hi2: 15 * 60_000, candles: 1000 } as const;

/** shares -> eq, futures -> fo, currency -> fx; anything else has no ALGOPACK datasets */
export function dsMarket(sec: Pick<MoexSecurity, "engine" | "market"> | null): DsMarket | null {
  if (!sec) return null;
  if (sec.engine === "stock" && sec.market === "shares") return "eq";
  if (sec.engine === "futures") return "fo";
  if (sec.engine === "currency") return "fx";
  return null;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Clamps a `from` date to at most `maxDays` before today (Moscow) and to a valid date. */
export function clampFrom(from: string | null | undefined, defDays: number, maxDays: number, now = Date.now()): string {
  const today = mskDateOf(now);
  const lo = mskDateOf(now - maxDays * 86_400_000);
  const def = mskDateOf(now - defDays * 86_400_000);
  if (!from || !DATE_RE.test(from)) return def;
  if (from > today) return today;
  return from < lo ? lo : from;
}

export interface Located {
  sec: MoexSecurity;
  market: DsMarket;
}

export async function locate(ticker: string): Promise<Located | { error: string }> {
  if (!/^[A-Za-z0-9_.-]{1,24}$/.test(ticker)) return { error: "bad-ticker" };
  const sec = await resolveMoex(ticker);
  if (!sec) return { error: "unknown-instrument" };
  const market = dsMarket(sec);
  if (!market) return { error: "unsupported-market" };
  return { sec, market };
}

/** apRows rows (objects) -> an ISS-shaped payload the normalisers take */
function asBlock(rows: Record<string, any>[], block: string): any {
  const columns = rows.length ? Object.keys(rows[0]) : [];
  return { [block]: { columns, data: rows.map((x) => columns.map((c) => x[c])) } };
}

/* ── SuperCandles ── */

export interface SuperCandles {
  ok: boolean;
  reason: string;
  basis?: string;
  ts?: Tbl;
  os?: Tbl;
  ob?: Tbl;
  reasons: Record<string, string>;
}

export async function loadSuperCandles(secid: string, market: DsMarket, from: string, sets: string[]): Promise<SuperCandles> {
  const till = mskDateOf(Date.now());
  const out: SuperCandles = { ok: false, reason: "ok", reasons: {} };
  const jobs = sets.map(async (set) => {
    const name = set === "ts" ? "tradestats" : set === "os" ? "orderstats" : set === "ob" ? "obstats" : "";
    if (!name) return;
    const r = await apRows(`/iss/datashop/algopack/${market}/${name}/${encodeURIComponent(secid)}.json`, { from, till }, "data", { ttlMs: TTL.supercandles, family: `datashop/${name}`, maxPages: 12 });
    out.reasons[set] = r.ok ? (r.rows.length ? "ok" : "empty") : r.reason;
    if (!r.ok) return;
    const payload = asBlock(r.rows, "data");
    const n = set === "ts" ? normTradestats(payload) : set === "os" ? normOrderstats(payload) : normObstats(payload);
    out[set as "ts" | "os" | "ob"] = n.tbl;
    out.basis = n.basis;
  });
  await Promise.all(jobs);
  out.ok = Object.values(out.reasons).some((x) => x === "ok" || x === "empty");
  if (!out.ok) out.reason = Object.values(out.reasons)[0] ?? "no-sets";
  return out;
}

/* ── FUTOI ── */

const futoiTickerCache = new Map<string, { at: number; ticker: string | null }>();

export async function loadFutoi(sec: MoexSecurity, from: string): Promise<{ ok: boolean; reason: string; ticker?: string; tbl?: Tbl }> {
  if (sec.engine !== "futures") return { ok: false, reason: "futures-only" };
  const till = mskDateOf(Date.now());
  let asset: string | undefined;
  try {
    asset = resolveContract(await getFortsFamilies(), sec.secid)?.family.asset;
  } catch {}
  const hit = futoiTickerCache.get(sec.secid);
  const fresh = !!hit && Date.now() - hit.at < (hit.ticker ? 3_600_000 : 10 * 60_000);
  const cands = fresh ? (hit!.ticker ? [hit!.ticker] : []) : futoiCandidates(sec.secid, asset);
  let lastReason = fresh ? "unknown-ticker" : "no-candidates";
  for (const t of cands) {
    const r = await apRows(`/iss/analyticalproducts/futoi/securities/${encodeURIComponent(t)}.json`, { from, till }, "futoi", { ttlMs: TTL.futoi, family: "analyticalproducts/futoi", maxPages: 10 });
    if (!r.ok) {
      lastReason = r.reason;
      // a cool-down / entitlement problem will not be different for the next candidate
      if (/^http-40[13]|cooldown|no-key/.test(r.reason)) break;
      continue;
    }
    if (r.rows.length === 0) {
      lastReason = "empty";
      continue;
    }
    futoiTickerCache.set(sec.secid, { at: Date.now(), ticker: t });
    return { ok: true, reason: "ok", ticker: t, tbl: normFutoi(asBlock(r.rows, "futoi")) };
  }
  if (cands.length && lastReason === "empty") futoiTickerCache.set(sec.secid, { at: Date.now(), ticker: null });
  return { ok: false, reason: lastReason };
}

/* ── Mega Alerts ── */

export async function loadAlerts(secid: string, market: DsMarket, from: string, withPrice = true): Promise<{ ok: boolean; reason: string; alerts?: AlertRow[] }> {
  if (market === "fx") return { ok: false, reason: "eq-fo-only" };
  const till = mskDateOf(Date.now());
  const r = await apRows(`/iss/datashop/algopack/${market}/alerts/${encodeURIComponent(secid)}.json`, { from, till }, "data", { ttlMs: TTL.alerts, family: "datashop/alerts", maxPages: 6 });
  if (!r.ok) return { ok: false, reason: r.reason };
  const alerts = normAlerts(asBlock(r.rows, "data"));
  if (withPrice && alerts.length) {
    const ts = await loadSuperCandles(secid, market, from, ["ts"]);
    attachAlertPrices(alerts, ts.ts ?? null);
  }
  return { ok: true, reason: alerts.length ? "ok" : "empty", alerts: alerts.slice(-300) };
}

/* ── HI2 ── */

export async function loadHi2(secid: string, market: DsMarket, from: string): Promise<{ ok: boolean; reason: string; hi2?: Hi2Table }> {
  const till = mskDateOf(Date.now());
  const r = await apRows(`/iss/datashop/algopack/${market}/hi2/${encodeURIComponent(secid)}.json`, { from, till }, "data", { ttlMs: TTL.hi2, family: "datashop/hi2", maxPages: 12 });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, reason: r.rows.length ? "ok" : "empty", hi2: normHi2(asBlock(r.rows, "data")) };
}

/* ── order book ── */

export async function loadBook(sec: MoexSecurity): Promise<{ ok: boolean; reason: string; book?: Book }> {
  const r = await apGet(`${issSecurityPath(sec)}/orderbook.json`, { "iss.meta": "off", "iss.only": "orderbook" }, { ttlMs: TTL.orderbook, family: "orderbook", timeoutMs: 6000 });
  if (!r.ok) return { ok: false, reason: r.reason };
  return { ok: true, reason: "ok", book: parseBook(r.data) };
}
