// Stored candles of the chart: «the last bars we had», painted at once when a chart opens (stale-while-revalidate), replaced by the live answer a moment later,
// and shown with a badge «Нет сети — данные на HH:MM» when the network is gone. Public market data (not per user), kept in IndexedDB with a small
// in-memory front. Bounded: at most MAX_SYMBOLS symbols and MAX_BYTES bytes, least recently used first. Wiped by «Очистить сохранённые данные».
// The live feed / polling of the chart is untouched: this only supplies the first picture.
//
// Pure functions (key, eviction plan, staleness, labels) are exported for scripts/check-candle-cache.ts; the IndexedDB part is best effort and silent.
import type { Candle } from "./types";

export const MAX_SYMBOLS = 12;
export const MAX_BYTES = 8 * 1024 * 1024;
/** one stored answer is never bigger than this (a 3000-bar answer is ~200 KB) */
export const MAX_ENTRY_BYTES = 1024 * 1024;
/** nothing older than this is shown, however the network is */
export const MAX_AGE_MS = 30 * 24 * 3600 * 1000;

/** What the chart's loader gets back from fetchBars(): the bars and the facts that came with them. */
export interface BarsResult {
  candles: Candle[];
  tzMin: number;
  delayed: boolean | undefined;
  fx: { provider: string; volumeKind: string; proxy?: string } | undefined;
  err: "limit" | "plan" | "network" | undefined;
}

export interface StoredBars {
  key: string;
  source: string;
  ticker: string;
  interval: string;
  limit: number;
  /** when the answer came from the server */
  savedAt: number;
  /** when the entry was last used (LRU) */
  usedAt: number;
  bytes: number;
  res: BarsResult;
}

/** Cache key: source, ticker, interval and the range asked for (the number of bars). Scroll-back pages (`to`) are never stored. */
export function candleKey(source: string, ticker: string, interval: string, limit: number): string {
  return `${source}|${ticker.toUpperCase()}|${interval}|${Math.floor(limit)}`;
}

/** Rough size of a stored answer (the bars dominate). */
export function estimateBytes(res: BarsResult): number {
  return res.candles.length * 56 + 200;
}

/** Is this answer worth storing? Bars present, no provider error, not absurdly large. */
export function storable(res: BarsResult): boolean {
  return res.candles.length > 0 && !res.err && estimateBytes(res) <= MAX_ENTRY_BYTES;
}

export interface EvictItem {
  key: string;
  source: string;
  ticker: string;
  usedAt: number;
  bytes: number;
}

/**
 * Keys to delete so that at most `maxSymbols` symbols and `maxBytes` bytes remain: the symbols used least recently go first (with all their intervals),
 * then, if the bytes are still over, single entries by age of use. `keep` (the entry just written) is never chosen.
 */
export function planEviction(items: readonly EvictItem[], maxSymbols: number = MAX_SYMBOLS, maxBytes: number = MAX_BYTES, keep: string | null = null): string[] {
  const drop = new Set<string>();
  const symOf = (i: EvictItem) => `${i.source}|${i.ticker.toUpperCase()}`;
  // symbols by their most recent use
  const last = new Map<string, number>();
  for (const i of items) last.set(symOf(i), Math.max(last.get(symOf(i)) ?? 0, i.usedAt));
  const keepSym = keep ? items.find((i) => i.key === keep) : undefined;
  const syms = [...last.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
  const allowed = new Set(syms.slice(0, Math.max(1, maxSymbols)));
  if (keepSym) allowed.add(symOf(keepSym));
  for (const i of items) if (!allowed.has(symOf(i)) && i.key !== keep) drop.add(i.key);
  let total = items.filter((i) => !drop.has(i.key)).reduce((s, i) => s + i.bytes, 0);
  if (total > maxBytes) {
    for (const i of [...items].filter((x) => !drop.has(x.key) && x.key !== keep).sort((a, b) => a.usedAt - b.usedAt)) {
      if (total <= maxBytes) break;
      drop.add(i.key);
      total -= i.bytes;
    }
  }
  return [...drop];
}

export type BarsFreshness = "live" | "stale" | "offline";

/**
 * How to present stored bars: "offline" (no network: the data time is always shown), "stale" (online but older than one bar of the interval: the data
 * time is shown until the live answer replaces it), "live" (young enough to need no label). The live update replaces the stored picture either way.
 */
export function freshness(savedAt: number, now: number, intervalMs: number, online: boolean): BarsFreshness {
  if (!online) return "offline";
  return now - savedAt > Math.max(60_000, intervalMs) ? "stale" : "live";
}

/** HH:MM of a time in the viewer's zone (the badge text). */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** An entry that may still be shown. */
export function usable(e: Pick<StoredBars, "savedAt">, now: number): boolean {
  return Number.isFinite(e.savedAt) && now - e.savedAt >= 0 && now - e.savedAt <= MAX_AGE_MS;
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------------------------------------------------------------------------------------

const DB_NAME = "fomo-candles";
const STORE = "bars";
const MEM_MAX = 6;
const mem = new Map<string, StoredBars>();
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

function remember(e: StoredBars): void {
  mem.delete(e.key);
  mem.set(e.key, e);
  while (mem.size > MEM_MAX) {
    const first = mem.keys().next().value;
    if (first === undefined) break;
    mem.delete(first);
  }
}

function reqDone<T>(r: IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    r.onsuccess = () => resolve(r.result as T);
    r.onerror = () => resolve(null);
  });
}

/** Synchronous look into the in-memory front only (true: readBars() will answer without waiting for IndexedDB). */
export function peekBars(key: string, now: number = Date.now()): boolean {
  const m = mem.get(key);
  return !!m && usable(m, now);
}

/** The stored bars for a key, or null. Memory first (instant, same session), then IndexedDB. Marks the entry as used. */
export async function readBars(key: string, now: number = Date.now()): Promise<StoredBars | null> {
  const m = mem.get(key);
  if (m) {
    if (!usable(m, now)) return null;
    m.usedAt = now;
    return m;
  }
  const d = await db();
  if (!d) return null;
  try {
    const e = await reqDone<StoredBars | undefined>(d.transaction(STORE, "readonly").objectStore(STORE).get(key));
    if (!e || !usable(e, now) || !Array.isArray(e.res?.candles)) return null;
    e.usedAt = now;
    remember(e);
    // the use is recorded lazily (an IndexedDB write for every chart open would be wasted work)
    void db().then((x) => {
      try {
        x?.transaction(STORE, "readwrite").objectStore(STORE).put(e);
      } catch {
        /* ignore */
      }
    });
    return e;
  } catch {
    return null;
  }
}

async function trim(keep: string): Promise<void> {
  const d = await db();
  if (!d) return;
  try {
    const all = (await reqDone<StoredBars[]>(d.transaction(STORE, "readonly").objectStore(STORE).getAll())) ?? [];
    const drop = planEviction(
      all.map((e) => ({ key: e.key, source: e.source, ticker: e.ticker, usedAt: e.usedAt, bytes: e.bytes })),
      MAX_SYMBOLS,
      MAX_BYTES,
      keep,
    );
    if (!drop.length) return;
    const tx = d.transaction(STORE, "readwrite");
    for (const k of drop) {
      tx.objectStore(STORE).delete(k);
      mem.delete(k);
    }
  } catch {
    /* ignore */
  }
}

/** Store a fresh answer (best effort, never throws). */
export async function writeBars(source: string, ticker: string, interval: string, limit: number, res: BarsResult, now: number = Date.now()): Promise<void> {
  if (!storable(res)) return;
  const e: StoredBars = { key: candleKey(source, ticker, interval, limit), source, ticker, interval, limit, savedAt: now, usedAt: now, bytes: estimateBytes(res), res };
  remember(e);
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, "readwrite").objectStore(STORE).put(e);
    void trim(e.key);
  } catch {
    /* ignore */
  }
}

/** «Очистить сохранённые данные». */
export async function clearBars(): Promise<void> {
  mem.clear();
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, "readwrite").objectStore(STORE).clear();
  } catch {
    /* ignore */
  }
}

/** Numbers for the storage line of the settings. */
export async function barsStats(): Promise<{ entries: number; symbols: number; bytes: number }> {
  const d = await db();
  if (!d) return { entries: 0, symbols: 0, bytes: 0 };
  try {
    const all = (await reqDone<StoredBars[]>(d.transaction(STORE, "readonly").objectStore(STORE).getAll())) ?? [];
    return { entries: all.length, symbols: new Set(all.map((e) => `${e.source}|${e.ticker}`)).size, bytes: all.reduce((s, e) => s + e.bytes, 0) };
  } catch {
    return { entries: 0, symbols: 0, bytes: 0 };
  }
}
