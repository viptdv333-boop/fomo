/* Upstream candle cache (src/lib/kline-cache.ts): closed-history vs live TTLs, single-flight, eviction, failure handling.
   Run: npx tsx scripts/check-kline-cache.ts   (exit code 1 on a failed assertion) */
import assert from "node:assert/strict";
import {
  LIVE_TTL_MS,
  CLOSED_TTL_MS,
  issPeriodStart,
  issCacheTtl,
  bybitBucketMs,
  bybitCacheTtl,
  UpstreamCache,
} from "../src/lib/kline-cache";

let passes = 0;
function ok(cond: boolean, label: string) {
  assert.ok(cond, label);
  passes++;
}

// Fixed "now": Wednesday 2026-11-25 12:00 UTC (Monday of that week = 2026-11-23).
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const today = "2026-11-25";
const yesterday = "2026-11-24";
const monday = "2026-11-23";
const lastWeek = "2026-11-22";
const monthStart = "2026-11-01";
const lastMonth = "2026-10-31";

// --- period starts ---------------------------------------------------------
ok(issPeriodStart(1, NOW) === today, "intraday period = today");
ok(issPeriodStart(60, NOW) === today, "hourly period = today");
ok(issPeriodStart(24, NOW) === today, "daily period = today");
ok(issPeriodStart(7, NOW) === monday, "weekly period = Monday");
ok(issPeriodStart(31, NOW) === monthStart, "monthly period = the 1st");

// --- ISS TTLs --------------------------------------------------------------
ok(issCacheTtl(undefined, 1, NOW) === LIVE_TTL_MS, "live edge (no till) is live");
ok(issCacheTtl(today, 1, NOW) === LIVE_TTL_MS, "till=today keeps the forming bar live");
ok(issCacheTtl(yesterday, 1, NOW) === CLOSED_TTL_MS, "intraday history before today is closed");
ok(issCacheTtl(yesterday, 24, NOW) === CLOSED_TTL_MS, "daily bar before today is closed");
ok(issCacheTtl(today, 24, NOW) === LIVE_TTL_MS, "today's daily bar is still forming");
ok(issCacheTtl(lastWeek, 7, NOW) === CLOSED_TTL_MS, "week before the current one is closed");
ok(issCacheTtl(monday, 7, NOW) === LIVE_TTL_MS, "current week's bar is still forming");
ok(issCacheTtl(lastMonth, 31, NOW) === CLOSED_TTL_MS, "month before the current one is closed");
ok(issCacheTtl(monthStart, 31, NOW) === LIVE_TTL_MS, "current month's bar is still forming");
ok(issCacheTtl("2026-11-20", 31, NOW) === LIVE_TTL_MS, "mid-month scroll-back still holds the forming monthly bar");

// --- Bybit TTLs ------------------------------------------------------------
ok(bybitBucketMs("5") === 300_000, "5m bucket");
ok(bybitBucketMs("D") === 86_400_000, "D bucket");
ok(bybitCacheTtl(undefined, "5", NOW) === LIVE_TTL_MS, "first page (no end) is live");
ok(bybitCacheTtl(NOW, "5", NOW) === LIVE_TTL_MS, "end=now is live");
ok(bybitCacheTtl(NOW - 3 * 300_000, "5", NOW) === CLOSED_TTL_MS, "end 3 buckets back is closed");
ok(bybitCacheTtl(NOW - 3 * 86_400_000, "D", NOW) === CLOSED_TTL_MS, "daily page 3 days back is closed");
ok(bybitCacheTtl(NOW - 86_400_000, "D", NOW) === LIVE_TTL_MS, "daily page 1 day back may hold the forming bar");

// --- UpstreamCache behaviour ----------------------------------------------
async function main() {
  const cache = new UpstreamCache<string[]>(4);
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return ["row"];
  };

  // hit within TTL
  const a = await cache.get("k", 60_000, fetcher);
  const b = await cache.get("k", 60_000, fetcher);
  ok(a === b && calls === 1, "second get within TTL is a cache hit (one fetch)");

  // single-flight: concurrent gets share one fetch
  let slowCalls = 0;
  const slow = () =>
    new Promise<string[]>((res) => {
      slowCalls++;
      setTimeout(() => res(["x"]), 30);
    });
  const [c1, c2] = await Promise.all([cache.get("sf", 60_000, slow), cache.get("sf", 60_000, slow)]);
  ok(c1 === c2 && slowCalls === 1, "concurrent identical requests share one upstream fetch");

  // expiry
  const cache2 = new UpstreamCache<number>(4);
  let n = 0;
  const inc = async () => ++n;
  await cache2.get("e", 20, inc);
  await new Promise((r) => setTimeout(r, 40));
  await cache2.get("e", 20, inc);
  ok(n === 2, "expired entry is fetched again");

  // eviction at max entries
  const cache3 = new UpstreamCache<number>(2);
  let m = 0;
  const mk = async () => ++m;
  await cache3.get("a", 60_000, mk);
  await cache3.get("b", 60_000, mk);
  await cache3.get("c", 60_000, mk); // evicts "a"
  const before = m;
  await cache3.get("a", 60_000, mk);
  ok(m === before + 1, "oldest entry evicted beyond max");

  // failures are not cached
  const cache4 = new UpstreamCache<number>(4);
  let tries = 0;
  const failing = async () => {
    tries++;
    throw new Error("upstream down");
  };
  await assert.rejects(cache4.get("f", 60_000, failing));
  await assert.rejects(cache4.get("f", 60_000, failing));
  ok(tries === 2, "a failed fetch is retried, not cached");

  // result-dependent TTL (empty result gets the short TTL)
  const cache5 = new UpstreamCache<string[]>(4);
  let emptyCalls = 0;
  const empty = async () => {
    emptyCalls++;
    return [];
  };
  await cache5.get("empty", (r) => (r.length ? CLOSED_TTL_MS : LIVE_TTL_MS), empty);
  ok(emptyCalls === 1, "empty result cached (short TTL path exercised)");

  console.log(`check-kline-cache: ${passes} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
