import { buildCommodityEvents, dropOfficialDuplicates } from "./commodities";
import { filterEvents, mergeEvents, normalizeFmpRows } from "./normalize";
import { ffCoverage, normalizeForexFactory } from "./forexfactory";
import { buildMoexExpirations, buildMoexHolidays, DAYOFF_URL, ISS_FORTS_URL, parseForts, type ForstRow, type MoexLang } from "./moex";
import { normalizeTradingView, TV_HEADERS, TV_URL } from "./tradingview";
import { addDays, utcWeekBlocks, type DateRange } from "./time";
import type { CalEvent, CalReason, CalSource } from "./types";

/*
 * Server side data source of the calendar. A chain of providers in priority order:
 *   1. TradingView's calendar endpoint (unofficial, all countries, descriptions, 31 days per request)
 *   2. FMP stable/economic-calendar (key from process.env.FMP_API_KEY only; a paid plan takes over automatically)
 *   3. Forex Factory weekly feeds (unofficial, last resort: this + next week, no actual values)
 * The first provider that answers (ok, or returns events) wins; the Moscow Exchange layer and the commodities / agriculture layer
 * (commodities.ts: static, verified report schedule) are merged on top of any of them.
 * Block providers (1, 2) are fetched in Monday-aligned 7-day UTC blocks, so every tab, range and the chart overlay share the
 * same few upstream calls; cached per block with stale-if-error and a negative cache, one in-flight request per key.
 * Override the chain with ECON_CALENDAR_PROVIDERS="fmp,forexfactory" (comma list); ECON_CALENDAR_MOCK is for development only.
 */

const FRESH_MS = 10 * 60_000; // blocks that contain today or the future
const OLD_FRESH_MS = 6 * 3_600_000; // finished weeks (actuals do not change any more)
const HOT_MS = 60_000; // a release is due / just happened without an actual: refresh every minute
const STALE_OK_MS = 24 * 3_600_000; // how long an old copy may stand in for a failed refresh
const NEG_MS: Record<string, number> = { restricted: 10 * 60_000, unauthorized: 10 * 60_000, "no-key": 60_000, "upstream-error": 45_000, "rate-limited": 120_000 };
const MAX_BLOCKS = 60;
const TIMEOUT_MS = 9000;
const POOL = 2; // parallel upstream calls per request

/** Replaceable for the tests. */
let doFetch: typeof fetch = (...a) => fetch(...a);
export function _setFetch(f: typeof fetch | null) {
  doFetch = f ?? ((...a) => fetch(...a));
}

/** ECON_CALENDAR_MOCK is honoured outside production only: "1" = fixture, "restricted" | "error" | "empty" = simulate that failure. */
export function mockMode(): string {
  if (process.env.NODE_ENV === "production") return "";
  return (process.env.ECON_CALENDAR_MOCK || "").trim().toLowerCase();
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ───────────── generic block cache ───────────── */

type BlockFetch = (r: DateRange, now: number) => Promise<{ events: CalEvent[] | null; reason: CalReason }>;
interface BlockEntry {
  events: CalEvent[];
  at: number;
  to: string;
}
const blocks = new Map<string, BlockEntry>();
const negative = new Map<string, { at: number; reason: CalReason }>();
const inflight = new Map<string, Promise<{ events: CalEvent[] | null; reason: CalReason }>>();

function blockFresh(b: BlockEntry, now: number): boolean {
  if (b.to < addDays(isoDay(now), -2)) return now - b.at < OLD_FRESH_MS;
  const hot = b.events.some((e) => !e.allDay && e.actual === null && now - e.ts > -60_000 && now - e.ts < 20 * 60_000);
  return now - b.at < (hot ? HOT_MS : FRESH_MS);
}

async function getBlock(pid: string, fetchBlock: BlockFetch, r: DateRange, now: number): Promise<{ events: CalEvent[]; reason: CalReason; stale: boolean }> {
  const k = `${pid}:${r.from}`;
  const hit = blocks.get(k);
  if (hit && blockFresh(hit, now)) return { events: hit.events, reason: "ok", stale: false };
  const keep = (reason: CalReason) => (hit && now - hit.at < STALE_OK_MS ? { events: hit.events, reason, stale: true } : { events: [], reason, stale: false });
  const neg = negative.get(k);
  if (neg && now - neg.at < (NEG_MS[neg.reason] ?? 45_000)) return keep(neg.reason);
  let p = inflight.get(k);
  if (!p) {
    p = fetchBlock(r, now).finally(() => inflight.delete(k));
    inflight.set(k, p);
  }
  const res = await p;
  if (res.events) {
    negative.delete(k);
    blocks.set(k, { events: res.events, at: now, to: r.to });
    if (blocks.size > MAX_BLOCKS) {
      const oldest = [...blocks.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) blocks.delete(oldest[0]);
    }
    return { events: res.events, reason: res.reason, stale: false };
  }
  negative.set(k, { at: now, reason: res.reason });
  return keep(res.reason);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const my = i++;
        out[my] = await fn(items[my]);
      }
    })
  );
  return out;
}

/* ───────────── providers ───────────── */

interface Part {
  events: CalEvent[];
  reason: CalReason;
  stale: boolean;
  /** UTC span the provider knows about (Forex Factory only); null = unlimited. */
  coverage: { from: number; to: number } | null;
}
interface Provider {
  id: CalSource;
  range(from: string, to: string, now: number): Promise<Part>;
}

async function timed(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await doFetch(url, { ...init, cache: "no-store", signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function blockProvider(id: CalSource, fetchBlock: BlockFetch): Provider {
  return {
    id,
    async range(from, to, now) {
      const weeks = utcWeekBlocks(from, to);
      const parts = await pool(weeks, POOL, (b) => getBlock(id, fetchBlock, b, now));
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
      const events = mergeEvents(parts.map((p) => p.events)).filter((e) => e.ts >= start && e.ts < end);
      const bad = parts.filter((p) => p.reason !== "ok" && p.reason !== "mock");
      let reason: CalReason = "ok";
      if (bad.length) reason = events.length ? "partial" : bad[0].reason;
      // the feed knows only the next few weeks: a tail of empty future weeks is "no data", not "nothing happens"
      let coverage: { from: number; to: number } | null = null;
      const todayIso = isoDay(now);
      let lastFull = -1;
      parts.forEach((p, i) => {
        if (p.events.length > 0) lastFull = i;
      });
      const tail = weeks.slice(lastFull + 1).filter((w) => w.from > todayIso);
      if (lastFull >= 0 && tail.length > 0 && tail.length === weeks.length - lastFull - 1) {
        coverage = { from: 0, to: Date.parse(`${addDays(weeks[lastFull].to, 1)}T00:00:00Z`) };
      } else if (lastFull < 0 && bad.length === 0 && weeks[0].from > todayIso) {
        coverage = { from: 0, to: Date.parse(`${weeks[0].from}T00:00:00Z`) };
      }
      return { events, reason, stale: parts.some((p) => p.stale), coverage };
    },
  };
}

const tradingViewBlock: BlockFetch = async (r) => {
  try {
    const url = `${TV_URL}?from=${r.from}T00:00:00.000Z&to=${r.to}T23:59:59.000Z&minImportance=-1`;
    const res = await timed(url, { headers: TV_HEADERS });
    if (res.status === 429) return { events: null, reason: "rate-limited" };
    if (res.status === 401 || res.status === 403) return { events: null, reason: "unauthorized" };
    if (!res.ok) return { events: null, reason: "upstream-error" };
    const body: unknown = await res.json();
    // weeks the feed has nothing for yet answer {"status":"ok"} without a result
    const result = body && typeof body === "object" ? (body as { status?: string; result?: unknown }) : null;
    if (!result || result.status !== "ok" || (result.result !== undefined && !Array.isArray(result.result))) return { events: null, reason: "upstream-error" };
    return { events: normalizeTradingView(body), reason: "ok" };
  } catch {
    return { events: null, reason: "upstream-error" };
  }
};

const fmpBlock: BlockFetch = async (r) => {
  const key = process.env.FMP_API_KEY || "";
  if (!key) return { events: null, reason: "no-key" };
  try {
    const res = await timed(`https://financialmodelingprep.com/stable/economic-calendar?from=${r.from}&to=${r.to}&apikey=${encodeURIComponent(key)}`, {});
    if (res.status === 402 || res.status === 403) return { events: null, reason: "restricted" };
    if (res.status === 401) return { events: null, reason: "unauthorized" };
    if (!res.ok) return { events: null, reason: "upstream-error" };
    const body: unknown = await res.json();
    if (!Array.isArray(body)) {
      const msg = JSON.stringify(body ?? "").toLowerCase();
      return { events: null, reason: msg.includes("invalid api key") ? "unauthorized" : msg.includes("restricted") || msg.includes("subscription") ? "restricted" : "upstream-error" };
    }
    return { events: normalizeFmpRows(body), reason: "ok" };
  } catch {
    return { events: null, reason: "upstream-error" };
  }
};

/* Forex Factory: two whole-week files, not blocks. Fresh 15 min, stale-if-error 24 h, never refetched sooner than 5 min after the
   last attempt (successful or not): the public feed rate-limits hard. */
const FF_FILES = ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"];
const FF_URL = "https://nfs.faireconomy.media/";
const FF_FRESH = 15 * 60_000;
const FF_MIN_GAP = 5 * 60_000;
interface FfEntry {
  events: CalEvent[];
  coverage: { from: number; to: number } | null;
  at: number; // last good copy
  attempt: number; // last try
  reason: CalReason;
  missing: boolean; // 404: not published yet
  /** do not try again before this time (5 min after an attempt, or the Retry-After of a 429) */
  retryAt: number;
}
const ff = new Map<string, FfEntry>();
const ffInflight = new Map<string, Promise<void>>();

async function loadFf(file: string, now: number): Promise<FfEntry | undefined> {
  const cur = ff.get(file);
  const fresh = cur && cur.reason === "ok" && now - cur.at < FF_FRESH;
  if (fresh || (cur && now < cur.retryAt)) return cur;
  let p = ffInflight.get(file);
  if (!p) {
    p = (async () => {
      const prev = ff.get(file);
      try {
        const res = await timed(FF_URL + file, { headers: { "User-Agent": TV_HEADERS["User-Agent"], Accept: "application/json" } });
        if (res.status === 404) {
          ff.set(file, { events: [], coverage: null, at: now, attempt: now, reason: "ok", missing: true, retryAt: now + FF_FRESH });
          return;
        }
        if (!res.ok) {
          const ra = Number(res.headers.get("Retry-After"));
          throw Object.assign(new Error(String(res.status)), { retryMs: Number.isFinite(ra) && ra > 0 ? Math.min(ra, 3600) * 1000 : 0 });
        }
        const rows: unknown = await res.json();
        if (!Array.isArray(rows)) throw new Error("shape");
        ff.set(file, { events: normalizeForexFactory(rows), coverage: ffCoverage(rows), at: now, attempt: now, reason: "ok", missing: false, retryAt: now + FF_MIN_GAP });
      } catch (e) {
        // keep the old copy (if any) as stale; no new attempt for 5 minutes (or as long as Retry-After says)
        const wait = Math.max(FF_MIN_GAP, (e as { retryMs?: number })?.retryMs ?? 0);
        ff.set(file, prev ? { ...prev, attempt: now, reason: "upstream-error", retryAt: now + wait } : { events: [], coverage: null, at: 0, attempt: now, reason: "upstream-error", missing: false, retryAt: now + wait });
      }
    })().finally(() => ffInflight.delete(file));
    ffInflight.set(file, p);
  }
  await p;
  return ff.get(file);
}

const forexFactory: Provider = {
  id: "forexfactory",
  async range(from, to, now) {
    const entries = (await Promise.all(FF_FILES.map((f) => loadFf(f, now)))).filter((e): e is FfEntry => !!e);
    const usable = entries.filter((e) => !e.missing && e.at > 0 && now - e.at < STALE_OK_MS);
    const stale = usable.some((e) => e.reason !== "ok" || now - e.at >= FF_FRESH);
    if (usable.length === 0) return { events: [], reason: "upstream-error", stale: false, coverage: null };
    const covs = usable.map((e) => e.coverage).filter((c): c is { from: number; to: number } => !!c);
    const coverage = covs.length ? { from: Math.min(...covs.map((c) => c.from)), to: Math.max(...covs.map((c) => c.to)) } : null;
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
    const events = mergeEvents(usable.map((e) => e.events)).filter((e) => e.ts >= start && e.ts < end);
    const inside = !!coverage && coverage.from < end && coverage.to > start;
    return { events, reason: inside ? "ok" : "range-unsupported", stale, coverage };
  },
};

/* development fixture and simulated failures */
function mockProvider(mode: string): Provider {
  return {
    id: mode === "1" ? "mock" : "none",
    async range(from, to, now) {
      if (mode === "restricted") return { events: [], reason: "restricted", stale: false, coverage: null };
      if (mode === "error") return { events: [], reason: "upstream-error", stale: false, coverage: null };
      if (mode === "empty") return { events: [], reason: "mock", stale: false, coverage: null };
      const { mockFmpRows } = await import("./fixture");
      const events = normalizeFmpRows(mockFmpRows(addDays(from, -1), addDays(to, 1), now));
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
      return { events: events.filter((e) => e.ts >= start && e.ts < end), reason: "mock", stale: false, coverage: null };
    },
  };
}

const REAL: Record<string, Provider> = {
  tradingview: blockProvider("tradingview", tradingViewBlock),
  fmp: blockProvider("fmp", fmpBlock),
  forexfactory: forexFactory,
};
let override: Provider[] | null = null;
export function _setProviders(p: Provider[] | null) {
  override = p;
}
export type { Provider, Part };
export { blockProvider };

function chain(): Provider[] {
  if (override) return override;
  const mock = mockMode();
  if (mock) return [mockProvider(mock)];
  const names = (process.env.ECON_CALENDAR_PROVIDERS || "tradingview,fmp,forexfactory")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => REAL[s]);
  return (names.length ? names : ["tradingview", "fmp", "forexfactory"]).map((n) => REAL[n]);
}

/* ───────────── Moscow Exchange layer ───────────── */

const MOEX_FRESH = 6 * 3_600_000;
let fortsCache: { rows: ForstRow[]; at: number; attempt: number } | null = null;
const dayoffCache = new Map<number, { digits: string; at: number; attempt: number }>();
const MOEX_GAP = 5 * 60_000;

async function loadForts(now: number): Promise<ForstRow[]> {
  if (fortsCache && (now - fortsCache.at < MOEX_FRESH || now - fortsCache.attempt < MOEX_GAP)) return fortsCache.rows;
  const prev = fortsCache;
  try {
    const res = await timed(ISS_FORTS_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const rows = parseForts(await res.json());
    if (rows.length === 0) throw new Error("empty");
    fortsCache = { rows, at: now, attempt: now };
  } catch {
    fortsCache = prev ? { ...prev, attempt: now } : { rows: [], at: 0, attempt: now };
  }
  return fortsCache.rows;
}

async function loadDayoff(year: number, now: number): Promise<string> {
  const c = dayoffCache.get(year);
  if (c && (now - c.at < 24 * 3_600_000 || now - c.attempt < MOEX_GAP)) return c.digits;
  try {
    const res = await timed(DAYOFF_URL(year), {});
    const text = (await res.text()).trim();
    if (!res.ok || !/^[0-9]{365,366}$/.test(text)) throw new Error("shape");
    dayoffCache.set(year, { digits: text, at: now, attempt: now });
    return text;
  } catch {
    dayoffCache.set(year, { digits: c?.digits ?? "", at: c?.at ?? 0, attempt: now });
    return c?.digits ?? "";
  }
}

/** Futures expirations and non-trading days of the Moscow Exchange in [from, to]; never throws, empty when the sources are down. */
export async function getMoexEvents(from: string, to: string, lang: MoexLang = "ru", now = Date.now()): Promise<CalEvent[]> {
  try {
    const years = [...new Set([+from.slice(0, 4), +to.slice(0, 4)])];
    const [forts, ...days] = await Promise.all([loadForts(now), ...years.map((y) => loadDayoff(y, now))]);
    const out = buildMoexExpirations(forts, from, to, lang);
    years.forEach((y, i) => {
      if (days[i]) out.push(...buildMoexHolidays(y, days[i], from, to, lang));
    });
    return out;
  } catch {
    return [];
  }
}

/* ───────────── the range ───────────── */

export interface RangeResult {
  events: CalEvent[];
  reason: CalReason;
  stale: boolean;
  /** The provider that answered ("none" when all failed). */
  source: CalSource;
  /** What each provider said, e.g. ["tradingview:upstream-error", "fmp:restricted"]. */
  tried: string[];
  coverage: { from: number; to: number } | null;
  moex: boolean;
  /** The commodities / agriculture layer is part of the answer. */
  commodity: boolean;
}

export interface RangeOptions {
  moex?: boolean;
  /** false switches the commodities / agriculture layer off (API: agro=0). */
  agro?: boolean;
  lang?: MoexLang;
}

/** Events of [from, to] (inclusive UTC dates) from the first provider of the chain that answers, plus the MOEX layer. Never throws. */
export async function getCalendarRange(from: string, to: string, now = Date.now(), opts: RangeOptions = {}): Promise<RangeResult> {
  const providers = chain();
  const tried: string[] = [];
  let part: Part | null = null;
  let source: CalSource = "none";
  let last: Part = { events: [], reason: "upstream-error", stale: false, coverage: null };
  for (const p of providers) {
    try {
      const res = await p.range(from, to, now);
      tried.push(`${p.id}:${res.reason}`);
      last = res;
      if (res.reason === "ok" || res.reason === "mock" || res.reason === "partial" || res.reason === "range-unsupported" || res.events.length > 0) {
        part = res;
        source = p.id;
        break;
      }
    } catch {
      tried.push(`${p.id}:upstream-error`);
    }
  }
  const useMoex = opts.moex !== false && !mockMode();
  const moexEvents = useMoex ? await getMoexEvents(from, to, opts.lang ?? "ru", now) : [];
  const useAgro = opts.agro !== false && !mockMode();
  const agroEvents = useAgro ? buildCommodityEvents(from, to, opts.lang ?? "ru") : [];
  const main = part ?? last;
  // the official WASDE / Grain Stocks of the commodity layer replace the same reports of the feed (same UTC day)
  const events = mergeEvents([dropOfficialDuplicates(main.events, agroEvents), moexEvents, agroEvents]);
  let reason: CalReason = main.reason;
  if (!part && (moexEvents.length || agroEvents.length)) reason = "partial"; // the chain failed but an extra layer is there
  if (!part && !moexEvents.length && !agroEvents.length) reason = last.reason;
  return {
    events,
    reason,
    stale: main.stale,
    source,
    tried,
    coverage: main.coverage,
    moex: useMoex && (moexEvents.length > 0 || (fortsCache?.rows.length ?? 0) > 0),
    commodity: agroEvents.length > 0,
  };
}

/** Test hook. */
export function _resetCalendarCache() {
  blocks.clear();
  negative.clear();
  inflight.clear();
  ff.clear();
  ffInflight.clear();
  fortsCache = null;
  dayoffCache.clear();
}

export { filterEvents };
