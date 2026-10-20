/* MOEX second candles (src/lib/moex-seconds.ts): T-Invest trades (the documented GetLastTrades / stream `trade` shape) -> 1-second bars on the server
   (SecondBook) -> N-second bars of the chart (SecondsAgg): OHLCV per second, lots -> units, the exchange clock, quiet seconds without bars, the 1-hour window
   edge, duplicates between the history and the stream, cumulative updates that must not be counted twice.
   Run: npx tsx scripts/check-trades-seconds.ts   (exit code 1 on a failed assertion) */
import { HOUR_MS, MSK_MS, SecondBook, SecondsAgg, moexSecondsOn, parseTrade, quotationOf, windowSince, type RawTrade, type SecWire } from "../src/lib/moex-seconds";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// 2026-10-13 14:10:00 UTC = 17:10:00 Moscow
const T0 = Date.parse("2026-10-13T14:10:00Z");
const iso = (ms: number, micro = "000") => new Date(ms).toISOString().replace("Z", `${micro}Z`);
/** a trade in the shape of the API: price {units, nano}, quantity (int64 as a string) in lots, time with microseconds */
const api = (ms: number, price: number, lots: number, dir: "BUY" | "SELL" = "BUY", micro = "000") => {
  const units = Math.trunc(price);
  const nano = Math.round((price - units) * 1e9);
  return { figi: "BBG004730N88", direction: `TRADE_DIRECTION_${dir}`, price: { units: String(units), nano }, quantity: String(lots), time: iso(ms, micro), instrumentUid: "uid-1" };
};
const tr = (ms: number, price: number, lots = 1, dir: "BUY" | "SELL" = "BUY", micro = "000"): RawTrade => parseTrade(api(ms, price, lots, dir, micro), 1)!;

// --- the wire format (the example of the official docs: a SELL of 200 lots at 178.86)
{
  const doc = { figi: "BBG004730RP0", direction: "TRADE_DIRECTION_SELL", price: { units: "178", nano: 860000000 }, quantity: "200", time: "2023-05-16T08:50:22.807741Z", instrumentUid: "962e2a95-02a9-4171-abd7-aa198dbe643a" };
  const p = parseTrade(doc, 10)!;
  eq("docs example: price, volume = lots x lot size, direction, ms time", [p.p, p.v, p.buy, p.t], [178.86, 2000, false, Date.parse("2023-05-16T08:50:22.807Z")]);
  eq("the trade key keeps the microseconds", p.key, "2023-05-16T08:50:22.807741Z|178.86|200|TRADE_DIRECTION_SELL");
  eq("quotation with nano and negative units", [quotationOf({ units: "274", nano: 660000000 }), quotationOf({ units: "-1", nano: -500000000 }), quotationOf({ units: "0", nano: 10000000 }), quotationOf(null), quotationOf({ units: "x" })], [274.66, -1.5, 0.01, null, null]);
  eq("unusable trades are dropped", [parseTrade(null, 1), parseTrade({}, 1), parseTrade({ ...doc, quantity: "0" }, 1), parseTrade({ ...doc, price: { units: "0", nano: 0 } }, 1), parseTrade({ ...doc, time: "garbage" }, 1), parseTrade({ ...doc, time: "1970-01-01T00:00:00Z" }, 1)], [null, null, null, null, null, null]);
  eq("a lot of 0 / missing counts as 1", parseTrade(doc, 0)!.v, 200);
}

// --- one second: OHLCV
{
  const b = new SecondBook();
  b.add(tr(T0 + 100, 100, 2));
  b.add(tr(T0 + 400, 103, 3));
  b.add(tr(T0 + 600, 99, 1));
  b.add(tr(T0 + 900, 101, 4));
  eq("open = first, high/low = extremes, close = last, volume = sum", b.wire(), [[T0, 100, 103, 99, 101, 10]]);
  eq("the next second is a separate bar", (b.add(tr(T0 + 1000, 102, 1)), b.wire().map((w) => w[0])), [T0, T0 + 1000]);
  eq("a quiet stretch has no bars (no fake flat seconds)", (b.add(tr(T0 + 7500, 104, 1)), b.wire().map((w) => w[0])), [T0, T0 + 1000, T0 + 7000]);
}
// --- out of order: the history arrives after the stream
{
  const b = new SecondBook();
  b.add(tr(T0 + 800, 105, 1)); // stream, the last trade of the second
  b.add(tr(T0 + 200, 100, 2)); // history, the first trade of the same second
  b.add(tr(T0 + 500, 110, 1));
  eq("open/close follow trade time, not arrival", b.wire(), [[T0, 100, 110, 100, 105, 4]]);
}
// --- the same trade from the history and from the stream is counted once
{
  const b = new SecondBook();
  const a = api(T0 + 300, 100, 5, "BUY", "123");
  b.add(parseTrade(a, 1)!);
  const again = b.add(parseTrade(a, 1)!);
  eq("duplicate (same time to the microsecond, price, quantity, direction) is ignored", [again, b.wire()], [0, [[T0, 100, 100, 100, 100, 5]]]);
  b.add(parseTrade(api(T0 + 300, 100, 5, "BUY", "124"), 1)!);
  b.add(parseTrade(api(T0 + 300, 100, 5, "SELL", "123"), 1)!);
  eq("another microsecond or another direction is another trade", b.wire()[0][5], 15);
}
// --- lot size: ISS / minute-bar convention (units, not lots)
{
  const b = new SecondBook();
  b.add(parseTrade(api(T0, 250.5, 3), 10)!);
  eq("3 lots of a 10-share lot = 30 shares", b.wire()[0][5], 30);
}
// --- one hour, bounded
{
  const b = new SecondBook();
  const now = T0 + 2 * HOUR_MS;
  b.add(tr(now - HOUR_MS - 5000, 100)); // out of the hour
  b.add(tr(now - HOUR_MS + 5000, 101));
  b.add(tr(now - 1000, 102));
  b.trim(now);
  eq("seconds older than one hour are dropped", b.wire().map((w) => w[4]), [101, 102]);
  const big = new SecondBook();
  for (let i = 0; i < 5000; i++) big.add(tr(now - HOUR_MS + i * 1000, 100 + (i % 7), 1, "BUY", String(i % 1000).padStart(3, "0")));
  big.trim(now + 1000);
  eq("never more than ~3700 seconds in memory", big.size <= 3700, true);
  const dense = new SecondBook();
  for (let i = 0; i < 100_000; i++) dense.add(tr(T0 + (i % 3_600_000), 100 + (i % 5), 1, "BUY", String(i % 997).padStart(3, "0")));
  eq("a very busy instrument still has one row per traded second", dense.size <= 3601, true);
  const k = new SecondBook();
  for (let i = 0; i < 1000; i++) k.add(tr(T0 + i * 100, 100, 1, "BUY", String(i % 1000).padStart(3, "0")));
  k.trim(T0 + 200_000);
  eq("the de-dup keys of old trades are forgotten (memory)", (k as unknown as { keys: Map<string, number> }).keys.size <= 201, true);
}
eq("history window start: the first whole second", [windowSince(1000), windowSince(1001), windowSince(1999)], [1000, 2000, 2000]);

// --- the browser: 1-second bars -> N-second bars on the exchange clock
const w = (ms: number, o: number, h: number, l: number, c: number, v: number): SecWire => [ms, o, h, l, c, v];
const wall = (ms: number) => ms + MSK_MS;
{
  // 14:10:00 UTC -> bucket 15s: 17:10:00 .. 17:10:15 in chart time
  const agg = new SecondsAgg(15_000, MSK_MS);
  agg.setSince(T0);
  const out = agg.apply([w(T0, 100, 101, 99, 100, 5), w(T0 + 3000, 100, 104, 100, 103, 2), w(T0 + 14_000, 103, 103, 98, 98, 1), w(T0 + 15_000, 98, 99, 97, 99, 7)]);
  eq("15s bars: open of the first second, extremes, close of the last, summed volume", out, [
    { t: wall(T0), o: 100, h: 104, l: 98, c: 98, v: 8 },
    { t: wall(T0 + 15_000), o: 98, h: 99, l: 97, c: 99, v: 7 },
  ]);
  eq("bars sit on the Moscow clock (17:10:00 wall)", new Date(out[0].t).toISOString(), "2026-10-13T17:10:00.000Z");
  // a live update of the forming second: cumulative, replaces — never double counted
  const upd1 = agg.apply([w(T0 + 15_000, 98, 100, 97, 100, 9)]);
  const upd2 = agg.apply([w(T0 + 15_000, 98, 100, 97, 100, 9)]);
  eq("a cumulative second sent again replaces the earlier copy (volume 9, not 16 / 25)", [upd1, upd2], [[{ t: wall(T0 + 15_000), o: 98, h: 100, l: 97, c: 100, v: 9 }], [{ t: wall(T0 + 15_000), o: 98, h: 100, l: 97, c: 100, v: 9 }]]);
  // a new second in the same bucket moves the close
  eq("a second added to a forming bar", agg.apply([w(T0 + 17_000, 100, 106, 100, 106, 1)]), [{ t: wall(T0 + 15_000), o: 98, h: 106, l: 97, c: 106, v: 10 }]);
  eq("all() is the whole series, ascending", agg.all().map((b) => b.t), [wall(T0), wall(T0 + 15_000)]);
}
{
  // empty seconds: gaps stay gaps
  const agg = new SecondsAgg(5_000, MSK_MS);
  agg.setSince(T0);
  const out = agg.apply([w(T0 + 1000, 10, 10, 10, 10, 1), w(T0 + 21_000, 11, 11, 11, 11, 1)]);
  eq("buckets without a traded second give no bar", out.map((b) => (b.t - MSK_MS - T0) / 1000), [0, 20]);
  eq("a bar with one traded second is a normal bar", out[0], { t: wall(T0), o: 10, h: 10, l: 10, c: 10, v: 1 });
}
{
  // the edge of the one-hour window: the bucket that starts before the first whole second is partial and is not drawn
  const since = T0 + 7000; // history starts at second 7
  const agg = new SecondsAgg(5_000, MSK_MS);
  agg.setSince(since);
  const out = agg.apply([w(T0 + 7000, 1, 1, 1, 1, 1), w(T0 + 9000, 2, 2, 2, 2, 1), w(T0 + 10_000, 3, 3, 3, 3, 1)]);
  eq("the 5s bucket 5..10 starts before the window (7): partial, dropped; 10..15 stays", out.map((b) => (b.t - MSK_MS - T0) / 1000), [10]);
  const a1 = new SecondsAgg(1_000, MSK_MS);
  a1.setSince(since);
  eq("1s bars: the first whole second is drawn", a1.apply([w(T0 + 6000, 1, 1, 1, 1, 1), w(T0 + 7000, 2, 2, 2, 2, 1)]).map((b) => b.o), [2]);
  // a re-subscription later: `since` never moves forward (the browser keeps the hour it already has)
  const a2 = new SecondsAgg(5_000, MSK_MS);
  a2.setSince(T0);
  a2.setSince(T0 + 600_000);
  eq("a later snapshot does not shrink the history", a2.apply([w(T0 + 5000, 1, 1, 1, 1, 1)]).length, 1);
}
{
  // junk is ignored, the order of a batch does not matter
  const agg = new SecondsAgg(5_000, 0);
  agg.setSince(0);
  const out = agg.apply([w(T0 + 2000, 5, 6, 4, 6, 1), w(T0, 3, 3, 3, 3, 1), [NaN, 1, 1, 1, 1, 1] as unknown as SecWire, w(T0 + 1000, 0, 0, 0, 0, 1)]);
  eq("bad rows (NaN time, zero close) are skipped; the first second by time gives the open", out, [{ t: T0, o: 3, h: 6, l: 3, c: 6, v: 2 }]);
}
{
  // end to end: trades -> book -> wire -> browser
  const book = new SecondBook();
  const raw = [api(T0 + 100, 100, 1), api(T0 + 4900, 101, 2, "SELL"), api(T0 + 5100, 99, 1), api(T0 + 31_000, 102, 1)];
  for (const r of raw) book.add(parseTrade(r, 10)!);
  const agg = new SecondsAgg(30_000, MSK_MS);
  agg.setSince(T0);
  eq("trades -> 1s book -> 30s chart bars (volume in shares)", agg.apply(book.wire()), [
    { t: wall(T0), o: 100, h: 101, l: 99, c: 99, v: 40 },
    { t: wall(T0 + 30_000), o: 102, h: 102, l: 102, c: 102, v: 10 },
  ]);
}

// --- the kill switch
eq("MOEX_SECONDS=0 / false / off switch the feature off, anything else leaves it on", [{}, { MOEX_SECONDS: "1" }, { MOEX_SECONDS: "0" }, { MOEX_SECONDS: "false" }, { MOEX_SECONDS: " OFF " }, { MOEX_SECONDS: "" }].map((e) => moexSecondsOn(e)), [true, true, false, false, false, true]);

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall trades-seconds checks passed");
process.exit(fails ? 1 : 0);
