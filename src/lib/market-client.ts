/* Client helpers for exact-contract selection and the universal market search (talks to /api/contracts and /api/market-search). */

import type { ContractInfo, ContractsResponse, GroupTab, MarketItem, MarketPage } from "./market-types";
import type { Filters } from "./instrument-filters";
import { rememberInstrument, type ChartSource, type TerminalInstrument } from "./terminal-data";
import { listUserData, saveUserData } from "./chart/userdata";

const CONTRACTS_TTL = 5 * 60_000;
const contractCache = new Map<string, { at: number; p: Promise<ContractsResponse | null> }>();

/** Contracts of the underlying a ticker belongs to. null on network errors; `unavailable` answers are not cached for long. */
export function fetchContracts(source: "moex" | "bybit", asset: string, lang: string): Promise<ContractsResponse | null> {
  const key = `${source}|${asset}|${lang}`;
  const hit = contractCache.get(key);
  if (hit && Date.now() - hit.at < CONTRACTS_TTL) return hit.p;
  const p = fetch(`/api/contracts?asset=${encodeURIComponent(asset)}&source=${source}&lang=${lang}`)
    .then(async (r) => (r.ok ? ((await r.json()) as ContractsResponse) : null))
    .then((j) => {
      if (!j || j.unavailable) contractCache.delete(key);
      return j;
    })
    .catch(() => {
      contractCache.delete(key);
      return null;
    });
  contractCache.set(key, { at: Date.now(), p });
  return p;
}

export type ContractBadgeInfo = ContractInfo & { asset: string; name: string; auto: string };
const infoCache = new Map<string, ContractBadgeInfo | null>();

/** Badge data (kind, order, days left, underlying) of exact contract ids, for the watchlist rows. */
export async function fetchContractInfo(secids: string[], lang: string): Promise<Record<string, ContractBadgeInfo>> {
  const need = secids.filter((s) => !infoCache.has(`${lang}|${s}`));
  if (need.length) {
    try {
      const r = await fetch(`/api/contracts?secids=${encodeURIComponent(need.join(","))}&lang=${lang}`);
      const info: Record<string, ContractBadgeInfo> = r.ok ? (await r.json()).info ?? {} : {};
      for (const s of need) infoCache.set(`${lang}|${s}`, info[s] ?? null);
    } catch {
      /* try again on the next render */
    }
  }
  const out: Record<string, ContractBadgeInfo> = {};
  for (const s of secids) {
    const v = infoCache.get(`${lang}|${s}`);
    if (v) out[s] = v;
  }
  return out;
}

/** What a page request asks for: the query (empty: the chip's popular list), the chip, its filters and the paging. */
export interface PageRequest {
  q: string;
  group: GroupTab;
  filters: Filters;
  offset?: number;
  limit?: number;
}

/** One page of a chip's list (server: ranked / popular rows, tagged, filtered, with the options of the dropdowns). null on network errors. */
export async function fetchMarketPage(req: PageRequest, signal?: AbortSignal): Promise<MarketPage | null> {
  const sp = new URLSearchParams({ q: req.q, group: req.group, limit: String(req.limit ?? PAGE_SIZE), offset: String(req.offset ?? 0) });
  if (req.filters.country) sp.set("country", req.filters.country);
  if (req.filters.venue) sp.set("venue", req.filters.venue);
  if (req.filters.asset && req.group === "future") sp.set("asset", req.filters.asset);
  try {
    const r = await fetch(`/api/market-search?${sp}`, { signal });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j?.items) ? (j as MarketPage) : null;
  } catch {
    return null;
  }
}

/** rows per page of the dialog (the «Показать ещё» step) */
export const PAGE_SIZE = 40;

export async function lookupSecid(id: string): Promise<MarketItem | null> {
  try {
    const r = await fetch(`/api/market-search?secid=${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    return ((await r.json()).item ?? null) as MarketItem | null;
  } catch {
    return null;
  }
}

/* ── items -> terminal instruments ── */

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** «MIX-12.26» style short name of a dated contract from its expiry */
function datedName(base: string, expiry: string): string {
  const [y, m] = expiry.split("-");
  return `${base} ${MONTHS_EN[(+m || 1) - 1]}-${y.slice(2)}`;
}

/** A search / lookup result as a terminal instrument. `parentIcon` is the underlying's icon for futures contracts. */
export function itemToInstrument(item: MarketItem, parentIcon = ""): TerminalInstrument {
  let name = item.name;
  if (item.group === "future" && !item.auto && item.expiry) name = `${datedName(item.asset ?? item.name.replace(/-\d{1,2}\.\d{2}$/, ""), item.expiry)} · ${item.secid}`;
  else if (item.group === "future" && !item.auto && item.name === item.secid) name = item.secid;
  else if (item.unit === "%") name = `${item.name} · %`;
  const inst: TerminalInstrument = {
    ticker: item.ticker,
    name,
    source: item.source as ChartSource,
    dataTicker: item.secid,
    emoji: parentIcon,
    group: item.group,
    unit: item.unit,
  };
  rememberInstrument(inst);
  return inst;
}

/** An exact contract of `base`'s underlying as a terminal instrument (ticker = the secid). */
export function contractToInstrument(c: ContractInfo, base: TerminalInstrument, assetName: string): TerminalInstrument {
  const dated = c.expiry && c.kind !== "perpetual" ? datedName(assetName, c.expiry) : c.shortname;
  const inst: TerminalInstrument = {
    ticker: c.ticker,
    name: c.kind === "spot" || dated === c.ticker ? c.shortname : `${dated} · ${c.ticker}`,
    source: base.source,
    dataTicker: c.ticker,
    emoji: base.emoji,
    group: base.source === "moex" ? "future" : undefined,
  };
  rememberInstrument(inst);
  return inst;
}

/** terminal auto ticker -> underlying code the contracts are grouped by ("CU" -> COPPER, "SBRF.F" -> SBRF, "MIX" -> MIX) */
const AUTO_ASSET: Record<string, string> = { CU: "COPPER", CR: "CNY", BTCF: "BTC", KC: "COFFEE" };
export function autoToAsset(ticker: string): string {
  return AUTO_ASSET[ticker] ?? ticker.replace(/\.F$/, "");
}

/* ── last chosen contract per underlying ── */

const LS_PREFIX = "fomo-terminal-contract:";
let accountSynced = false;

export function getLastContract(asset: string): string | null {
  try {
    return localStorage.getItem(LS_PREFIX + asset);
  } catch {
    return null;
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Remembers the choice in this browser and, for signed-in users, on the account (userdata kind terminal_prefs, key contracts). */
export function setLastContract(asset: string, secid: string | null) {
  try {
    if (secid) localStorage.setItem(LS_PREFIX + asset, secid);
    else localStorage.removeItem(LS_PREFIX + asset);
  } catch {
    /* private mode */
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const map: Record<string, string> = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) map[k.slice(LS_PREFIX.length)] = localStorage.getItem(k) ?? "";
      }
    } catch {
      return;
    }
    void saveUserData("terminal_prefs", "contracts", map);
  }, 800);
}

/** Pulls the account copy into localStorage once per page load (the local value wins when both exist). */
export async function syncContractPrefs(): Promise<void> {
  if (accountSynced) return;
  accountSynced = true;
  try {
    const items = await listUserData<Record<string, string>>("terminal_prefs", "contracts");
    const map = items[0]?.data;
    if (!map || typeof map !== "object") return;
    for (const [asset, secid] of Object.entries(map)) {
      if (typeof secid === "string" && secid && !localStorage.getItem(LS_PREFIX + asset)) localStorage.setItem(LS_PREFIX + asset, secid);
    }
  } catch {
    /* offline / guest */
  }
}
