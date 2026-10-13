/* The live (forming) bar of the terminal chart (src/lib/chart/live-bar.ts): which bar a quote belongs to on every interval, rollover at the period boundary
   (MOEX clock, aggregated intervals), the quote kept over a refreshed bar, the retry pause, the «delayed» mark, the ISS trade lag.
   Run: npx tsx scripts/check-live-bar.ts   (exit code 1 on a failed assertion) */
import { DAY_MS, MSK_MS, bucketStartWall, gateQuote, keepLive, liveTarget, mergeQuote, onChartGrid, quoteDelayed, quoteMoment, remember, retryDelayMs, type LiveMemo } from "../src/lib/chart/live-bar";
import { tradeLag } from "../src/lib/moex-resolve";
import type { Candle } from "../src/lib/chart/types";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const bar = (t: number, o: number, h: number, l: number, c: number, v = 100): Candle => ({ t, o, h, l, c, v });
const utc = (s: string) => Date.parse(s + "Z");

// --- 2026-10-13 14:10:30 UTC = 17:10:30 Moscow. MOEX candle times are the Moscow wall clock read as UTC by a UTC server (tzMs 0): chart time = real + 3 h.
const NOW = utc("2026-10-13T14:10:30");
const moex = (interval: string, last: Candle, now = NOW, tzMs = 0) => liveTarget({ interval, source: "moex", now, tzMs, offsetMs: MSK_MS - tzMs, last });
const wall = (s: string) => utc(s); // a candle time of the wall clock "2026-10-13T17:10:00"

// --- every native interval opens the bar of the exchange clock
eq("M1: the minute of now", moex("1", bar(wall("2026-10-13T17:09:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T17:10:00") });
eq("M5", moex("5", bar(wall("2026-10-13T17:05:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T17:10:00") });
eq("M15", moex("15", bar(wall("2026-10-13T17:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T17:00:00") });
eq("H1: the hour is open although the server (15 min late) ends at 15:00", moex("60", bar(wall("2026-10-13T15:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T17:00:00") });
eq("H4", moex("240", bar(wall("2026-10-13T16:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T16:00:00") });
eq("D: Moscow midnight", moex("D", bar(wall("2026-10-13T00:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T00:00:00") });
eq("W: Monday", moex("W", bar(wall("2026-10-12T00:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-12T00:00:00") });
eq("M: the 1st", moex("M", bar(wall("2026-10-01T00:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-01T00:00:00") });
eq("Y: January 1st", moex("Y", bar(wall("2026-01-01T00:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-01-01T00:00:00") });

// --- the server's zone is not UTC (tzMs +3 h): candle times are wall - 3 h, the bucket follows
eq("server zone +3: D bucket is the wall midnight in the server basis", moex("D", bar(1, 1, 1, 1, 1), NOW, MSK_MS), { kind: "bar", t: wall("2026-10-13T00:00:00") - MSK_MS });
eq("server zone +3: M5", moex("5", bar(1, 1, 1, 1, 1), NOW, MSK_MS), { kind: "bar", t: wall("2026-10-13T17:10:00") - MSK_MS });

// --- the Moscow day starts at 21:00 UTC: 23:30 UTC on the 12th is already the 13th in Moscow
eq("D rolls over at Moscow midnight", moex("D", bar(wall("2026-10-12T00:00:00"), 1, 1, 1, 1), utc("2026-10-12T21:00:05")), { kind: "bar", t: wall("2026-10-13T00:00:00") });
eq("D still yesterday one second before Moscow midnight", moex("D", bar(wall("2026-10-12T00:00:00"), 1, 1, 1, 1), utc("2026-10-12T20:59:59")), { kind: "bar", t: wall("2026-10-12T00:00:00") });
eq("M1 rolls over at the minute", [moex("1", bar(1, 1, 1, 1, 1), utc("2026-10-13T14:10:59")), moex("1", bar(1, 1, 1, 1, 1), utc("2026-10-13T14:11:00"))], [{ kind: "bar", t: wall("2026-10-13T17:10:00") }, { kind: "bar", t: wall("2026-10-13T17:11:00") }]);
eq("Saturday: the week and the month stay", [moex("W", bar(1, 1, 1, 1, 1), utc("2026-10-17T10:00:00")), moex("M", bar(1, 1, 1, 1, 1), utc("2026-10-17T10:00:00"))], [{ kind: "bar", t: wall("2026-10-12T00:00:00") }, { kind: "bar", t: wall("2026-10-01T00:00:00") }]);

// --- crypto: UTC clock, no shift
const btc = (interval: string, last: Candle, now: number) => liveTarget({ interval, source: "bybit", now, tzMs: 0, offsetMs: 0, last });
eq("Bybit D: UTC midnight", btc("D", bar(1, 1, 1, 1, 1), utc("2026-10-13T00:00:01")), { kind: "bar", t: utc("2026-10-13T00:00:00") });
eq("Bybit H4: 12:00 bucket at 14:10", btc("240", bar(1, 1, 1, 1, 1), NOW), { kind: "bar", t: utc("2026-10-13T12:00:00") });
eq("Bybit W: Monday 00:00 UTC", btc("W", bar(1, 1, 1, 1, 1), NOW), { kind: "bar", t: utc("2026-10-12T00:00:00") });
eq("bucketStartWall: Sunday belongs to the week that began on Monday", bucketStartWall(utc("2026-10-18T10:00:00"), "W"), utc("2026-10-12T00:00:00"));

// --- spot FX Sunday: the daily / weekly bar is the Monday one
eq("FX on Sunday: D is Monday", liveTarget({ interval: "D", source: "forex", now: utc("2026-10-18T22:30:00"), tzMs: 0, offsetMs: 0, last: bar(1, 1, 1, 1, 1) }), { kind: "bar", t: utc("2026-10-19T00:00:00") });

// --- aggregated intervals (45m): bars continue from the newest one in whole steps, a new day asks for a reload
const A = 45 * 60_000;
const first = wall("2026-10-13T10:00:00");
eq("45m: the step containing now", moex("45", bar(first + 8 * A, 1, 1, 1, 1)), { kind: "bar", t: first + 9 * A }); // 10:00 + 9 x 45 min = 16:45
eq("45m: still the newest bar inside its step", moex("45", bar(first + 9 * A, 1, 1, 1, 1)), { kind: "bar", t: first + 9 * A });
eq("45m: a missing step in the middle of the day does not break the grid", moex("45", bar(first + 3 * A, 1, 1, 1, 1)), { kind: "bar", t: first + 9 * A });
eq("45m: the day changed (the first bar of today is not known here): reload, do not touch yesterday's bar", moex("45", bar(wall("2026-10-12T18:45:00"), 1, 1, 1, 1)), { kind: "reload" });
eq("2h: aggregated too", moex("120", bar(wall("2026-10-13T14:00:00"), 1, 1, 1, 1)), { kind: "bar", t: wall("2026-10-13T16:00:00") });
eq("45m: a clock a little behind the newest bar keeps it", moex("45", bar(first + 10 * A, 1, 1, 1, 1)), { kind: "bar", t: first + 10 * A });

// --- merging the quote
const b0 = bar(wall("2026-10-13T17:10:00"), 100, 101, 99, 100.5, 7);
eq("same bar: close, high and low follow the price", [mergeQuote(b0, b0.t, 102), mergeQuote(b0, b0.t, 98.5)], [{ ...b0, c: 102, h: 102 }, { ...b0, c: 98.5, l: 98.5 }]);
eq("a price inside the range changes only the close", mergeQuote(b0, b0.t, 100.2), { ...b0, c: 100.2 });
eq("a newer bucket opens a bar at the price", mergeQuote(b0, b0.t + 60_000, 101.5), { t: b0.t + 60_000, o: 101.5, h: 101.5, l: 101.5, c: 101.5, v: 0 });

// --- the same quote gives the same last price on EVERY interval (the point of the whole thing)
{
  const px = 287.59;
  const lasts: Record<string, Candle> = {
    "1": bar(wall("2026-10-13T17:08:00"), 287.0, 287.1, 286.9, 287.02),
    "15": bar(wall("2026-10-13T17:00:00"), 287.4, 287.4, 286.8, 287.02),
    "60": bar(wall("2026-10-13T15:00:00"), 286.59, 287.56, 286.57, 287.39),
    D: bar(wall("2026-10-13T00:00:00"), 285.23, 287.94, 284.41, 287.03),
    W: bar(wall("2026-10-12T00:00:00"), 285.8, 287.94, 283.6, 287.03),
    M: bar(wall("2026-10-01T00:00:00"), 273.8, 287.94, 272.91, 287.03),
  };
  const closes: Record<string, number> = {};
  for (const [iv, last] of Object.entries(lasts)) {
    const tg = moex(iv, last);
    if (tg.kind !== "bar") throw new Error("target");
    closes[iv] = mergeQuote(last, tg.t, px).c;
  }
  eq("M1 / M15 / H1 / D / W / M end on the quote", Object.values(closes), [px, px, px, px, px, px]);
}

// --- the quote belongs to the bar of its last trade
eq("a delayed quote (trade 15 min ago) lands in the delayed M1 bar", moex("1", bar(wall("2026-10-13T16:53:00"), 1, 1, 1, 1), quoteMoment(utc("2026-10-13T13:54:54"), NOW)), { kind: "bar", t: wall("2026-10-13T16:54:00") });
eq("... and in the 16:00 hour on H1", moex("60", bar(wall("2026-10-13T15:00:00"), 1, 1, 1, 1), quoteMoment(utc("2026-10-13T13:54:54"), NOW)), { kind: "bar", t: wall("2026-10-13T16:00:00") });
eq("a closed market (last trade yesterday evening) opens no bar today", moex("D", bar(wall("2026-10-12T00:00:00"), 1, 1, 1, 1), quoteMoment(utc("2026-10-12T20:49:00"), utc("2026-10-13T05:00:00"))), { kind: "bar", t: wall("2026-10-12T00:00:00") });
eq("no usable trade time: now", [quoteMoment(NaN, NOW), quoteMoment(0, NOW), quoteMoment(NOW + 3_600_000, NOW)], [NOW, NOW, NOW]);
eq("a trade a moment ago", quoteMoment(NOW - 2000, NOW), NOW - 2000);

// --- one bad print is held back until the next quote confirms it
eq("small move: accepted", gateQuote(100.5, 100, 0), { accept: true, pending: 0 });
eq("a 5% print: held", gateQuote(105, 100, 0), { accept: false, pending: 105 });
eq("the next quote confirms it: accepted", gateQuote(105.2, 100, 105), { accept: true, pending: 0 });
eq("the next quote is back to normal: the print was a glitch", gateQuote(100.1, 100, 105), { accept: true, pending: 0 });
eq("a second, different far print: held again", gateQuote(110, 100, 105), { accept: false, pending: 110 });

// --- a bar from the server (the 60 s refresh) keeps the live price for a moment
{
  let memo: LiveMemo | null = null;
  const live = mergeQuote(b0, b0.t, 102.3);
  memo = remember(memo, live, 102.3, 1000);
  memo = remember(memo, mergeQuote(live, b0.t, 99.5), 99.5, 5000);
  eq("the memo follows the quotes of one bar", memo, { t: b0.t, price: 99.5, hi: 102.3, lo: 99.5, at: 5000 });
  const server = bar(b0.t, 100, 101, 99.2, 100.7, 9); // older than the quotes
  eq("a young quote stays in the refreshed bar", keepLive(server, memo, 8000, 10_000), { t: b0.t, o: 100, h: 102.3, l: 99.2, c: 99.5, v: 9 });
  eq("an old quote does not", keepLive(server, memo, 30_000, 10_000), server);
  eq("another bar is untouched", keepLive(bar(b0.t - 60_000, 1, 2, 0.5, 1.5), memo, 8000, 10_000), bar(b0.t - 60_000, 1, 2, 0.5, 1.5));
  eq("no memo: the server's bar", keepLive(server, null, 8000, 10_000), server);
  const next = remember(memo, bar(b0.t + 60_000, 1, 1, 1, 1), 1, 9000);
  eq("a new bar starts a new memo", next, { t: b0.t + 60_000, price: 1, hi: 1, lo: 1, at: 9000 });
}

// --- aggregated refresh: only bars on the chart's grid
eq("same bar", onChartGrid(first + 9 * A, first + 9 * A, A), true);
eq("a step after", onChartGrid(first + 10 * A, first + 9 * A, A), true);
eq("misaligned (anchored to the middle of the window)", onChartGrid(first + 9 * A + 60_000, first + 9 * A, A), false);
eq("older bars are not the newest", onChartGrid(first + 8 * A, first + 9 * A, A), false);
eq("another day is not on this day's grid", onChartGrid(first + DAY_MS, first, A), false);

// --- the retry pause of a failed load
eq("retry pauses grow and stop at 30 s", [0, 1, 2, 3, 4, 10].map(retryDelayMs), [4000, 8000, 16000, 30000, 30000, 30000]);

// --- the «delayed» mark of the quote
eq("15 min lag: delayed", quoteDelayed(900), true);
eq("real time or a minute behind: not delayed", [quoteDelayed(0), quoteDelayed(60), quoteDelayed(299)], [false, false, false]);
eq("a quiet or closed market (hours): not delayed", [quoteDelayed(2701), quoteDelayed(3 * 3600)], [false, false]);
eq("no lag field: not delayed", [quoteDelayed(undefined), quoteDelayed("900"), quoteDelayed(NaN)], [false, false, false]);

// --- ISS trade time: TIME (Moscow) against SYSTIME
eq("ISS: trade 16:54:54 at 17:09:55 Moscow", tradeLag("2026-10-13 17:09:55", "16:54:54", true), { tradeTime: "2026-10-13T13:54:54.000Z", lagSec: 901 });
eq("ISS: a time of day after SYSTIME is yesterday's trade", tradeLag("2026-10-13 06:30:00", "23:49:58", true), { tradeTime: "2026-10-12T20:49:58.000Z", lagSec: 24002 });
eq("ISS: no trade / odd fields: nothing", [tradeLag("2026-10-13 17:09:55", "16:54:54", false), tradeLag("x", "16:54:54", true), tradeLag("2026-10-13 17:09:55", "", true), tradeLag("2026-10-13 17:09:55", null, true)], [{}, {}, {}, {}]);

console.log(fails ? `${fails} check(s) FAILED` : "all live-bar checks passed");
process.exit(fails ? 1 : 0);
