import { filterEvents, mergeEvents, normalizeFmpRows } from "./normalize";
import { addDays, utcWeekBlocks, type DateRange } from "./time";
import type { CalEvent, CalReason } from "./types";

/* Server side data source of the calendar: FMP stable/economic-calendar, fetched in Monday-aligned 7-day UTC blocks
   (so every tab, range and the chart overlay share the same few upstream calls), cached in memory per block with
   stale-if-error and a short negative cache so a restricted plan or an outage is not hammered. The key comes only from
   process.env.FMP_API_KEY. */

const FRESH_MS = 10 * 60_000; // blocks that contain today or the future
const OLD_FRESH_MS = 6 * 3_600_000; // finished weeks (actuals do not change any more)
const STALE_OK_MS = 24 * 3_600_000; // how long an old copy may stand in for a failed refresh
const NEG_MS: Record<string, number> = { restricted: 10 * 60_000, unauthorized: 10 * 60_000, "no-key": 60_000, "upstream-error": 30_000 };
const MAX_BLOCKS = 24;
const TIMEOUT_MS = 9000;

interface BlockEntry {
  events: CalEvent[];
  at: number;
  /** end of the block (YYYY-MM-DD): decides how long it stays fresh */
  to: string;
}
interface NegEntry {
  at: number;
  reason: CalReason;
}

const blocks = new Map<string, BlockEntry>();
const negative = new Map<string, NegEntry>();
const inflight = new Map<string, Promise<{ events: CalEvent[] | null; reason: CalReason }>>();

/** ECON_CALENDAR_MOCK is honoured outside production only: "1" = fixture, "restricted" | "error" | "empty" = simulate that failure. */
export function mockMode(): string {
  if (process.env.NODE_ENV === "production") return "";
  return (process.env.ECON_CALENDAR_MOCK || "").trim().toLowerCase();
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** A release is due (or just happened without an actual yet): refresh this block every minute so the figures appear quickly. */
const HOT_MS = 60_000;
function blockFresh(b: BlockEntry, now: number): boolean {
  if (b.to < addDays(isoDay(now), -2)) return now - b.at < OLD_FRESH_MS;
  const hot = b.events.some((e) => !e.allDay && e.actual === null && now - e.ts > -60_000 && now - e.ts < 20 * 60_000);
  return now - b.at < (hot ? HOT_MS : FRESH_MS);
}

async function fetchBlock(r: DateRange, now: number): Promise<{ events: CalEvent[] | null; reason: CalReason }> {
  const mock = mockMode();
  if (mock) {
    if (mock === "restricted") return { events: null, reason: "restricted" };
    if (mock === "error") return { events: null, reason: "upstream-error" };
    if (mock === "empty") return { events: [], reason: "mock" };
    const { mockFmpRows } = await import("./fixture");
    return { events: normalizeFmpRows(mockFmpRows(r.from, r.to, now)), reason: "mock" };
  }
  const key = process.env.FMP_API_KEY || "";
  if (!key) return { events: null, reason: "no-key" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/economic-calendar?from=${r.from}&to=${r.to}&apikey=${encodeURIComponent(key)}`, {
      cache: "no-store",
      signal: ctl.signal,
    });
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
  } finally {
    clearTimeout(timer);
  }
}

async function getBlock(r: DateRange, now: number): Promise<{ events: CalEvent[]; reason: CalReason; stale: boolean }> {
  const k = `${mockMode() || "fmp"}:${r.from}`;
  const hit = blocks.get(k);
  if (hit && blockFresh(hit, now)) return { events: hit.events, reason: "ok", stale: false };
  const neg = negative.get(k);
  if (neg && now - neg.at < (NEG_MS[neg.reason] ?? 30_000)) {
    return hit && now - hit.at < STALE_OK_MS ? { events: hit.events, reason: neg.reason, stale: true } : { events: [], reason: neg.reason, stale: false };
  }
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
  return hit && now - hit.at < STALE_OK_MS ? { events: hit.events, reason: res.reason, stale: true } : { events: [], reason: res.reason, stale: false };
}

export interface RangeResult {
  events: CalEvent[];
  reason: CalReason;
  stale: boolean;
  source: "fmp" | "mock";
}

/** Events of [from, to] (inclusive UTC dates) from the cached week blocks, trimmed to the exact range. Never throws. */
export async function getCalendarRange(from: string, to: string, now = Date.now()): Promise<RangeResult> {
  const mock = mockMode();
  try {
    const parts = await Promise.all(utcWeekBlocks(from, to).map((b) => getBlock(b, now)));
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${addDays(to, 1)}T00:00:00Z`);
    const events = filterEvents(mergeEvents(parts.map((p) => p.events)), {}).filter((e) => e.ts >= start && e.ts < end);
    const bad = parts.filter((p) => p.reason !== "ok" && p.reason !== "mock");
    let reason: CalReason = mock ? "mock" : "ok";
    if (bad.length) reason = bad.length === parts.length && events.length === 0 ? bad[0].reason : events.length ? "partial" : bad[0].reason;
    return { events, reason, stale: parts.some((p) => p.stale), source: mock ? "mock" : "fmp" };
  } catch {
    return { events: [], reason: "upstream-error", stale: false, source: mock ? "mock" : "fmp" };
  }
}

/** Test hook. */
export function _resetCalendarCache() {
  blocks.clear();
  negative.clear();
  inflight.clear();
}
