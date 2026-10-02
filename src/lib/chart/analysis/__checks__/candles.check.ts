/* Regression check for the "long green line at the newest bar" bug: a bar whose open is null / 0 is drawn by the canvas as a solid
   body from the close down to the bottom of the pane (null reads as 0 in Math and in isFinite()), while the auto-scale only looks at
   high / low and does not move. Candles must be repaired before they reach the engine.
   Run: npx tsx src/lib/chart/analysis/__checks__/candles.check.ts */
import { cleanCandle, cleanCandles, isDrawable, mergeCandle } from "../../candles";
import type { Candle } from "../../types";

let failed = 0;
function expect(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failed++;
}

// what /api/klines sends for a bar the exchange delivered without an open: JSON null
const apiRows = JSON.parse(
  `[{"timestamp":60000,"open":468.5,"high":468.9,"low":468.3,"close":468.6,"volume":10},
    {"timestamp":120000,"open":null,"high":468.6,"low":468.3,"close":468.3,"volume":3},
    {"timestamp":180000,"open":0,"high":468.7,"low":468.2,"close":468.4,"volume":1},
    {"timestamp":240000,"open":468.5,"high":468.5,"low":468.5,"close":468.6,"volume":1},
    {"timestamp":300000,"open":468.6,"high":null,"low":null,"close":468.7,"volume":null},
    {"timestamp":360000,"open":468.6,"high":468.9,"low":468.2,"close":null,"volume":2}]`,
);
const mapped = apiRows.map((d: any) => ({ t: d.timestamp, o: d.open, h: d.high, l: d.low, c: d.close, v: d.volume }));

// the old client filter let nulls through: isFinite(null) === true
expect("old filter really passes a null open", isFinite(apiRows[1].open) && !isDrawable(mapped[1]));

const clean = cleanCandles(mapped);
expect("bar without a close is dropped", clean.length === 5, `len=${clean.length}`);
expect("every cleaned bar is drawable", clean.every(isDrawable));
expect("null open -> previous close", clean[1].o === 468.6, JSON.stringify(clean[1]));
expect("zero open -> previous close", clean[2].o === clean[1].c, JSON.stringify(clean[2]));
expect("close above the high stretches the high", clean[3].h === 468.6 && clean[3].l === 468.5, JSON.stringify(clean[3]));
expect("null high / low -> extremes of open and close", clean[4].h === 468.7 && clean[4].l === 468.6 && clean[4].v === 0, JSON.stringify(clean[4]));
expect("a bar that is already fine is not copied", cleanCandles([clean[0], clean[1]]).length === 2 && cleanCandles(clean) === clean);
expect("no body can reach 0: every open stays within 1% of its close", clean.every((c) => Math.abs(c.o - c.c) / c.c < 0.01));

// merge: the live loop (quote -> new flat bar; bar refresh -> API bars, the newest and the ones that closed a moment ago)
const base: Candle[] = [
  { t: 60_000, o: 100, h: 101, l: 99, c: 100.5, v: 50 },
  { t: 120_000, o: 100.5, h: 101.5, l: 100, c: 101, v: 60 },
];
const series = base.map((c) => ({ ...c }));
expect("newer bar is appended", mergeCandle(series, { t: 180_000, o: 101, h: 101, l: 101, c: 101, v: 0 }) === "append" && series.length === 3);
expect("same time replaces the newest", mergeCandle(series, { t: 180_000, o: 101, h: 101.4, l: 100.9, c: 101.2, v: 7 }) === "last" && series[2].v === 7);
expect("a bar that closed a moment ago gets its final numbers", mergeCandle(series, { t: 120_000, o: 100.5, h: 101.6, l: 100, c: 101.1, v: 900 }) === "older" && series[1].v === 900 && series[1].h === 101.6);
expect("the newest bar is untouched by that", series[2].t === 180_000 && series[2].v === 7);
expect("an unknown older time is ignored", mergeCandle(series, { t: 90_000, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 }) === "none" && series.length === 3);
expect("a null open in a refreshed bar is repaired, not drawn", (() => {
  const r = mergeCandle(series, { t: 180_000, o: null as unknown as number, h: 101.5, l: 100.8, c: 101.3, v: 8 });
  return r === "last" && series[2].o === series[1].c && isDrawable(series[2]);
})());
expect("a bar without a close is not merged", mergeCandle(series, { t: 240_000, o: 1, h: 2, l: 1, c: null as unknown as number, v: 1 }) === "none" && series.length === 3);
expect("a new bar with a null open opens at the previous close", (() => {
  const r = mergeCandle(series, { t: 240_000, o: null as unknown as number, h: 101.6, l: 101.2, c: 101.5, v: 1 });
  return r === "append" && series[3].o === series[2].c;
})());
expect("cleanCandle keeps the Kagi / P&F flag", cleanCandle({ t: 1, o: 1, h: 2, l: 1, c: 2, v: 0, k: 1 })?.k === 1);

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
