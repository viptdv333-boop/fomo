/* The chart's stored candles (src/lib/chart/candle-cache.ts): key, what is stored, the LRU / size plan, how stored bars are labelled.
   Pure logic only; the IndexedDB part is best effort and covered by the browser demonstration.
   Run: npx tsx scripts/check-candle-cache.ts   (exit code 1 on a failed assertion) */
import { MAX_AGE_MS, MAX_BYTES, MAX_ENTRY_BYTES, MAX_SYMBOLS, candleKey, clockLabel, estimateBytes, freshness, planEviction, storable, usable, type BarsResult } from "../src/lib/chart/candle-cache";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const bars = (n: number, extra: Partial<BarsResult> = {}): BarsResult => ({
  candles: Array.from({ length: n }, (_, i) => ({ t: i * 60_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 })),
  tzMin: 180,
  delayed: undefined,
  fx: undefined,
  err: undefined,
  ...extra,
});

// --- key: source, ticker, interval and the range
eq("key has source / ticker / interval / bars", candleKey("moex", "sber", "60", 600), "moex|SBER|60|600");
eq("another interval or range is another entry", [candleKey("moex", "SBER", "D", 600) !== candleKey("moex", "SBER", "60", 600), candleKey("moex", "SBER", "60", 3000) !== candleKey("moex", "SBER", "60", 600)], [true, true]);
eq("another source is another entry", candleKey("bybit", "SBER", "60", 600) !== candleKey("moex", "SBER", "60", 600), true);

// --- what is stored
eq("bars are stored", storable(bars(600)), true);
eq("an empty answer is not stored", storable(bars(0)), false);
eq("a provider error is not stored", [storable(bars(10, { err: "limit" })), storable(bars(10, { err: "network" }))], [false, false]);
eq("an absurdly big answer is not stored", storable(bars(Math.ceil(MAX_ENTRY_BYTES / 56) + 10)), false);
eq("size estimate follows the bar count", [estimateBytes(bars(0)), estimateBytes(bars(100))], [200, 5800]);

// --- eviction plan: 12 symbols, 8 MB, least recently used first
const mk = (sym: string, iv: string, usedAt: number, bytes = 40_000) => ({ key: `moex|${sym}|${iv}|600`, source: "moex", ticker: sym, usedAt, bytes });
{
  const items = Array.from({ length: 14 }, (_, i) => mk(`S${i}`, "60", 1000 + i));
  eq("two symbols over the limit: the two least recently used go", planEviction(items).sort(), ["moex|S0|60|600", "moex|S1|60|600"]);
}
{
  const items = [...Array.from({ length: 12 }, (_, i) => mk(`S${i}`, "60", 1000 + i)), mk("S0", "D", 5000), mk("S0", "15", 5001)];
  eq("a symbol's other intervals count as one symbol and keep it alive", planEviction(items), []);
}
{
  const items = [...Array.from({ length: 13 }, (_, i) => mk(`S${i}`, "60", 1000 + i)), mk("S0", "D", 1)];
  eq("an evicted symbol takes all its intervals with it, the entry just written is never chosen", planEviction(items, MAX_SYMBOLS, MAX_BYTES, "moex|S1|60|600").sort(), ["moex|S0|60|600", "moex|S0|D|600"]);
}
{
  const items = Array.from({ length: 6 }, (_, i) => mk(`S${i}`, "60", 100 + i, 2_000_000));
  eq("over the byte budget: oldest entries go until it fits", planEviction(items).sort(), ["moex|S0|60|600", "moex|S1|60|600"]);
  eq("the entry just written stays even if it alone is big", planEviction([mk("A", "60", 1, 9_000_000)], MAX_SYMBOLS, MAX_BYTES, "moex|A|60|600"), []);
  eq("exactly at the budget: nothing goes", planEviction(Array.from({ length: 4 }, (_, i) => mk(`S${i}`, "60", i, 2_000_000))), []);
}
eq("limits", [MAX_SYMBOLS, MAX_BYTES], [12, 8 * 1024 * 1024]);

// --- how stored bars are presented (never as live when online and old)
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
eq("offline: always labelled", [freshness(NOW - 10_000, NOW, 60 * MIN, false), freshness(NOW - 5 * 24 * 60 * MIN, NOW, 60 * MIN, false)], ["offline", "offline"]);
eq("online and younger than one bar (at least a minute): no label", [freshness(NOW - 30_000, NOW, MIN, true), freshness(NOW - 50 * MIN, NOW, 60 * MIN, true)], ["live", "live"]);
eq("online and older than one bar: labelled until the live answer replaces it", [freshness(NOW - 2 * MIN, NOW, MIN, true), freshness(NOW - 61 * MIN, NOW, 60 * MIN, true), freshness(NOW - 3 * 24 * 60 * MIN, NOW, 24 * 60 * MIN, true)], ["stale", "stale", "stale"]);
eq("clock label HH:MM", clockLabel(new Date(2026, 9, 10, 7, 5).getTime()), "07:05");
eq("usable: not older than a month, not from the future", [usable({ savedAt: NOW - 1000 }, NOW), usable({ savedAt: NOW - MAX_AGE_MS - 1 }, NOW), usable({ savedAt: NOW + 5000 }, NOW), usable({ savedAt: NaN }, NOW)], [true, false, false, false]);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
