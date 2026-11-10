/* Regression check for the "long green line at the newest bar" bug: a bar whose open is null / 0 is drawn by the canvas as a solid
   body from the close down to the bottom of the pane (null reads as 0 in Math and in isFinite()), while the auto-scale only looks at
   high / low and does not move. Candles must be repaired before they reach the engine.
   Run: npx tsx src/lib/chart/analysis/__checks__/candles.check.ts */
import { cleanCandle, cleanCandles, isDrawable, mergeCandle } from "../../candles";
import type { Candle } from "../../types";
import { detectCandles, type CandleOptions } from "../candles";
import { CANDLE_BY_ID, type CandleId } from "../candle-meta";

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

/* ───── candlestick pattern detector: one synthetic textbook sequence per pattern ─────
   30 quiet bars (true range 1, so ATR = 1), a 12-bar trend leg of 0.5 a bar, the pattern itself and one trailing bar (the forming one,
   which the detector skips). Pattern rows are [open, close, upper shadow = 0.1, lower shadow = 0.1] in ATR units from the last close. */
type Row = [number, number, number?, number?];
const flip = (rows: Row[]): Row[] => rows.map(([o, c, u = 0.1, d = 0.1]) => [-o, -c, d, u] as Row);

function mk(dir: -1 | 0 | 1, rows: Row[]): Candle[] {
  const out: Candle[] = [];
  let t = 1_700_000_000_000;
  const push = (o: number, c: number, u: number, d: number) => {
    out.push({ t, o, h: Math.max(o, c) + u, l: Math.min(o, c) - d, c, v: 100 });
    t += 3_600_000;
  };
  let p = 100;
  for (let k = 0; k < 30; k++) push(p, p + 0.1, 0.45, 0.45), (p = 100);
  for (let k = 0; k < 12; k++) {
    const c = p + (dir === 0 ? (k % 2 ? 0.1 : -0.1) : 0.5 * dir);
    push(p, c, 0.25, 0.25);
    p = c;
  }
  let last = p;
  for (const [o, c, u = 0.1, d = 0.1] of rows) push(p + o, (last = p + c), u, d);
  push(last, last + 0.02, 0.05, 0.05);
  return out;
}

function scan(dir: -1 | 0 | 1, rows: Row[], over?: Partial<CandleOptions>) {
  const cs = mk(dir, rows);
  const hits = detectCandles(cs, over);
  const i = cs.length - 2;
  const hit = hits.find((x) => x.i === i);
  const ids: string[] = hit ? [hit.id, ...hit.others] : [];
  return { cs, hits, hit, i, ids, len: hit ? hit.i - hit.start + 1 : 0 };
}

const P: Partial<Record<CandleId, [-1 | 0 | 1, Row[]]>> = {};
// two candles
P.window_up = [1, [[0.6, 1.1]]];
P.counter_bull = [-1, [[0, -1.5], [-3, -1.5]]];
P.separating_bull = [1, [[0, -0.6], [0, 1.2]]];
P.onneck = [-1, [[0, -1.5, 0.1, 0.2], [-2.2, -1.7]]];
P.inneck = [-1, [[0, -1.5, 0.1, 0.3], [-2.1, -1.45]]];
P.thrusting = [-1, [[0, -1.5], [-2.0, -1.0]]];
P.homing_pigeon = [-1, [[0, -1.5], [-0.4, -1.0]]];
P.matching_low = [-1, [[0, -1.5], [-0.7, -1.5]]];
// three candles
P.tasuki_up = [1, [[0, 1.0], [1.3, 2.3], [1.8, 1.15]]];
P.sidebyside_bull = [1, [[0, 1.0], [1.3, 2.0], [1.3, 2.05]]];
P.sidebyside_bear = [-1, [[0, -1.0], [-2.0, -1.3], [-2.0, -1.25]]];
P.tristar_bull = [-1, [[0, 0.02, 0.4, 0.4], [-0.6, -0.58, 0.2, 0.2], [0, 0.02, 0.4, 0.4]]];
P.advance_block = [1, [[0, 1.5], [1.0, 2.2, 0.5, 0.1], [1.8, 2.6, 0.6, 0.1]]];
P.deliberation = [1, [[0, 1.5], [1.2, 2.7], [2.7, 3.0]]];
P.two_crows = [1, [[0, 1.5], [2.2, 1.8], [2.0, 0.8]]];
P.upgap_two_crows = [1, [[0, 1.5], [2.2, 1.8], [2.4, 1.65]]];
P.three_river = [-1, [[0, -1.5], [-0.9, -1.2, 0.1, 0.8], [-1.6, -1.35]]];
P.stick_sandwich = [-1, [[0, -1.0], [-0.8, 0.2], [0.3, -1.0]]];
// four candles
P.strike_bull = [1, [[0, 1.0], [0.6, 1.6], [1.2, 2.2], [2.3, -0.2]]];
P.concealing_swallow = [-1, [[0, -1.2, 0.02, 0.02], [-1.0, -2.2, 0.02, 0.02], [-2.5, -2.8, 0.5, 0.05], [-1.9, -3.0]]];
// five candles
P.mathold = [1, [[0, 1.5], [1.8, 2.1], [2.0, 1.7], [1.7, 1.4], [1.5, 2.8]]];
P.ladder_bottom = [-1, [[0, -0.8], [-0.5, -1.3], [-1.0, -1.8], [-2.0, -2.2, 0.4, 0.05], [-2.0, -1.0]]];
P.breakaway_bull = [-1, [[0, -1.5], [-1.9, -2.4], [-2.3, -2.7], [-2.6, -3.0], [-3.0, -1.7]]];
// island: the candles between the two gaps, then the candle after the second gap
P.island_top = [1, [[1.0, 1.3], [1.3, 1.1], [1.1, 1.25], [0.6, 0.1]]];
// mirrored twins
const TWINS: [CandleId, CandleId][] = [
  ["window_down", "window_up"], ["counter_bear", "counter_bull"], ["separating_bear", "separating_bull"], ["matching_high", "matching_low"],
  ["tasuki_down", "tasuki_up"], ["tristar_bear", "tristar_bull"], ["strike_bear", "strike_bull"], ["breakaway_bear", "breakaway_bull"],
  ["island_bottom", "island_top"],
];
for (const [id, src] of TWINS) {
  const [d, rows] = P[src]!;
  P[id] = [-d as -1 | 0 | 1, flip(rows)];
}
/** Patterns that must also be the main hit of their bar (the priority pick), not only one of the matches. */
const MAIN = new Set<CandleId>([
  "counter_bull", "counter_bear", "tasuki_up", "tasuki_down", "tristar_bull", "tristar_bear", "two_crows", "upgap_two_crows", "three_river",
  "strike_bull", "strike_bear", "concealing_swallow", "mathold", "ladder_bottom", "breakaway_bull", "breakaway_bear", "island_top", "island_bottom",
  "advance_block", "deliberation", "stick_sandwich", "sidebyside_bull", "sidebyside_bear",
]);
const NEW_IDS = Object.keys(P) as CandleId[];
expect("33 new patterns have a sequence", NEW_IDS.length === 33, `n=${NEW_IDS.length}`);
for (const id of NEW_IDS) {
  const m = CANDLE_BY_ID[id];
  expect(`${id}: catalogue entry with ru / en / cn texts`, !!m && [m.name, m.short, m.desc].every((s) => s.length === 3 && s.every((w) => w.length > 0)));
  const [d, rows] = P[id]!;
  const r = scan(d, rows);
  const ok = MAIN.has(id) ? r.hit?.id === id : r.ids.includes(id);
  expect(`${id}: found${MAIN.has(id) ? " as the main hit" : ""}`, ok, `[${r.ids.join(", ")}]`);
  if (!m.span) expect(`${id}: spans ${m.bars} candle(s)`, r.hits.some((x) => x.i === r.i && (x.id === id ? x.start === r.i - m.bars + 1 : true)));
}

// near misses
{
  const no = (name: string, id: CandleId, d: -1 | 0 | 1, rows: Row[], over?: Partial<CandleOptions>) => {
    const r = scan(d, rows, over);
    expect(`near miss: ${name}`, !r.ids.includes(id), `[${r.ids.join(", ")}]`);
  };
  no("tasuki whose third candle fills the gap", "tasuki_up", 1, [[0, 1.0], [1.3, 2.3], [1.8, 0.9]]);
  no("tasuki against the trend", "tasuki_up", -1, [[0, 1.0], [1.3, 2.3], [1.8, 1.15]]);
  no("three-line strike that does not close beyond the first open", "strike_bull", 1, [[0, 1.0], [0.6, 1.6], [1.2, 2.2], [2.3, 0.3]]);
  no("thrusting that closes above the middle is a piercing line", "thrusting", -1, [[0, -1.5], [-2.0, -0.5]]);
  no("matching low with different closes", "matching_low", -1, [[0, -1.5], [-0.7, -1.2]]);
  no("counterattack that does not come back to the close", "counter_bull", -1, [[0, -1.5], [-3, -1.9]]);
  no("separating lines with different opens", "separating_bull", 1, [[0, -0.6], [0.4, 1.6]]);
  no("upside-gap two crows without the gap", "upgap_two_crows", 1, [[0, 1.5], [1.4, 1.2], [1.6, 1.1]]);
  no("two crows is not upside-gap two crows", "upgap_two_crows", 1, P.two_crows![1]);
  no("upside-gap two crows is not two crows", "two_crows", 1, P.upgap_two_crows![1]);
  no("island with one gap only", "island_top", 1, [[1.0, 1.3], [1.3, 1.1], [0.9, 0.4]]);
  no("island of six candles", "island_top", 1, [[1.0, 1.3], [1.3, 1.1], [1.1, 1.25], [1.25, 1.1], [1.1, 1.3], [1.3, 1.15], [0.6, 0.1]]);
  no("window without a price gap", "window_up", 1, [[0.2, 0.7]]);
  no("mat hold whose pause falls below the first open", "mathold", 1, [[0, 1.5], [1.8, 2.1], [2.0, 0.6], [0.6, -0.3], [-0.2, 2.8]]);
  no("stick sandwich with a different last close", "stick_sandwich", -1, [[0, -1.0], [-0.8, 0.2], [0.3, -0.6]]);
}

// island reversal: 1 to 5 candles on the island, the hit starts on the candle before the first gap
for (const k of [1, 2, 3, 4, 5]) {
  const isl: Row[] = [];
  for (let j = 0; j < k; j++) isl.push(j % 2 ? [1.3, 1.1] : [1.1, 1.3]);
  const top = scan(1, [...isl, [0.6, 0.1]]);
  expect(`island top with ${k} candle(s)`, top.hit?.id === "island_top" && top.len === k + 2, `[${top.ids.join(", ")}] len=${top.len}`);
  const bot = scan(-1, flip([...isl, [0.6, 0.1]]));
  expect(`island bottom with ${k} candle(s)`, bot.hit?.id === "island_bottom" && bot.len === k + 2, `[${bot.ids.join(", ")}] len=${bot.len}`);
}

// three-line strike takes over the soldiers / crows hit of the bar before; without the strike that hit stays
{
  const r = scan(1, P.strike_bull![1]);
  expect("strike absorbs the three soldiers of the bar before", r.hit?.id === "strike_bull" && !r.hits.some((x) => x.i === r.i - 1 && x.id === "soldiers"), `[${r.ids.join(", ")}]`);
  expect("the engulfing candle of a strike is listed under it", r.ids.includes("engulf_bear"), `[${r.ids.join(", ")}]`);
  const miss = scan(1, [[0, 1.0], [0.6, 1.6], [1.2, 2.2], [2.3, 0.3]]);
  expect("no strike: the soldiers stay", miss.hits.some((x) => x.i === miss.i - 1 && x.id === "soldiers"));
  const dn = scan(-1, P.strike_bear![1]);
  expect("bearish strike absorbs the three crows", dn.hit?.id === "strike_bear" && !dn.hits.some((x) => x.i === dn.i - 1 && x.id === "crows"), `[${dn.ids.join(", ")}]`);
}

// tweezers: equal lows / highs are enough, the colours are free; opposite colours only add strength
{
  const same = scan(-1, [[0, -0.6, 0.1, 0.5], [-0.3, -0.6, 0.1, 0.5]]);
  const opp = scan(-1, [[0, -0.6, 0.1, 0.5], [-0.6, -0.3, 0.1, 0.5]]);
  expect("tweezer bottom of two black candles", same.hit?.id === "tweezer_bottom", `[${same.ids.join(", ")}]`);
  expect("tweezer bottom of opposite colours", opp.hit?.id === "tweezer_bottom", `[${opp.ids.join(", ")}]`);
  expect("opposite colours make the bottom stronger", !!same.hit && !!opp.hit && opp.hit.strength > same.hit.strength, `${opp.hit?.strength} > ${same.hit?.strength}`);
  const sameT = scan(1, flip([[0, -0.6, 0.1, 0.5], [-0.3, -0.6, 0.1, 0.5]]));
  const oppT = scan(1, flip([[0, -0.6, 0.1, 0.5], [-0.6, -0.3, 0.1, 0.5]]));
  expect("tweezer top of two white candles", sameT.hit?.id === "tweezer_top", `[${sameT.ids.join(", ")}]`);
  expect("tweezer top of opposite colours", oppT.hit?.id === "tweezer_top", `[${oppT.ids.join(", ")}]`);
  expect("opposite colours make the top stronger", !!sameT.hit && !!oppT.hit && oppT.hit.strength > sameT.hit.strength, `${oppT.hit?.strength} > ${sameT.hit?.strength}`);
  expect("near miss: lows 0.3 ATR apart are no tweezer", !scan(-1, [[0, -0.6, 0.1, 0.5], [-0.3, -0.6, 0.1, 0.2]]).ids.includes("tweezer_bottom"));
  expect("near miss: tweezer bottom in an uptrend", !scan(1, [[0, -0.6, 0.1, 0.5], [-0.3, -0.6, 0.1, 0.5]]).ids.includes("tweezer_bottom"));
}

// three methods: 2 to 5 small candles in the pause
{
  const pause = (k: number): Row[] => {
    const rows: Row[] = [[0, 1.5]];
    const step = 1.2 / k;
    for (let j = 0; j < k; j++) rows.push([1.35 - j * step, 1.35 - (j + 1) * step, 0.05, 0.05]);
    rows.push([0.15, 2.2]);
    return rows;
  };
  for (const k of [2, 3, 4, 5]) {
    const up = scan(1, pause(k));
    expect(`rising three methods with ${k} inner candles`, up.hit?.id === "rising3" && up.len === k + 2, `[${up.ids.join(", ")}] len=${up.len}`);
    const dn = scan(-1, flip(pause(k)));
    expect(`falling three methods with ${k} inner candles`, dn.hit?.id === "falling3" && dn.len === k + 2, `[${dn.ids.join(", ")}] len=${dn.len}`);
  }
  expect("near miss: one inner candle is no three methods", !scan(1, pause(1)).ids.includes("rising3"));
  expect("near miss: six inner candles are no three methods", !scan(1, pause(6)).ids.includes("rising3"));
  const out = pause(3);
  out[2] = [1.2, 1.5, 0.4, 0.05]; // a candle of the pause above the high of the first one
  expect("near miss: an inner candle outside the first range", !scan(1, out).ids.includes("rising3"));
  const weak = pause(3);
  weak[4] = [0.15, 1.4]; // the last candle does not close above the first close
  expect("near miss: the last candle does not close beyond the first", !scan(1, weak).ids.includes("rising3"));
}

if (failed) {
  console.log(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
