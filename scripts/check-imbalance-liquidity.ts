/* Check of the imbalance / liquidity indicators (src/lib/chart/analysis/zones.ts, indicators/liquidity-defs.ts) on synthetic candles with
   known answers: fair value gaps (detection, size filter, mitigation modes, partial shrink, gaps, volume imbalances), liquidity pools
   (equal highs / lows, tolerance, sweep by wick / close, min touches), high-volume nodes, order blocks, candle-approximated delta imbalance,
   the live (forming) bar, speed on 5000 bars and the registry / i18n wiring. OFFLINE, pure. Run:  npx tsx scripts/check-imbalance-liquidity.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import type { Candle } from "../src/lib/chart/types";
import {
  DEFAULT_DELTA,
  DEFAULT_FVG,
  DEFAULT_HVN,
  DEFAULT_LIQ,
  DEFAULT_OB,
  detectDeltaImbalance,
  detectFvg,
  detectHvn,
  detectLiquidity,
  detectOrderBlocks,
} from "../src/lib/chart/analysis/zones";
import { INDICATOR_DEFS, computeIndicator, defaultParams, getIndicatorDef, sanitizeParams } from "../src/lib/chart/indicators/registry";
import liquidityDict from "../src/lib/i18n/dict/liquidity";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const eq = (a: unknown, b: unknown, name: string) => ok(JSON.stringify(a) === JSON.stringify(b), name, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const near = (a: number, b: number, name: string, eps = 1e-9) => ok(Math.abs(a - b) <= eps, name, `${a} != ${b}`);

const T0 = 1_790_000_000_000;
const STEP = 60_000;
let tick = 0;
function bar(o: number, h: number, l: number, c: number, v = 1000): Candle {
  return { t: T0 + STEP * tick++, o, h, l, c, v };
}
/** A quiet bar around `p`: range p-1 .. p+1 (ATR settles at 2). */
const flat = (p = 100, v = 1000) => bar(p, p + 1, p - 1, p, v);
const flats = (n: number, p = 100) => Array.from({ length: n }, () => flat(p));
function fresh<T>(f: () => T): T {
  tick = 0;
  return f();
}

/* ───────────── fair value gaps ───────────── */

// 20 quiet bars, then: a (h=101), a big bullish middle bar, a third bar whose low (103) is above a's high -> bull FVG [101, 103]
const bullBase = (): Candle[] => [...flats(20), bar(100, 101, 99, 100.5), bar(100.5, 106, 100.5, 105.5), bar(105.5, 107, 103, 106)];
const O = { ...DEFAULT_FVG, atrLen: 5, minSize: 0.25 };

{
  const cs = fresh(bullBase);
  const z = detectFvg(cs, O);
  eq(z.length, 1, "bullish FVG: exactly one zone");
  const f = z[0];
  eq([f.kind, f.dir, f.i0, f.born], ["fvg", 1, 21, 22], "bullish FVG: kind / direction / starts at the middle candle / born at the third");
  near(f.lo, 101, "bullish FVG: low edge = high of the first candle");
  near(f.hi, 103, "bullish FVG: high edge = low of the third candle");
  eq(f.i1, -1, "bullish FVG: alive");
  const none = detectFvg(cs, { ...O, minSize: 3 });
  eq(none.length, 0, "min size 3 ATR filters the 2-point gap");
  const pct = detectFvg(cs, { ...O, unit: "pct", minSize: 1 });
  eq(pct.length, 1, "min size 1 % of price keeps a gap of 2 (~1.9 %)");
  eq(detectFvg(cs, { ...O, unit: "pct", minSize: 2.5 }).length, 0, "min size 2.5 % drops it");
}

{
  // bearish mirror: a low=99, big down bar, third bar high=97 -> bear FVG [97, 99]
  const cs = fresh(() => [...flats(20), bar(100, 101, 99, 99.5), bar(99.5, 99.5, 94, 94.5), bar(94.5, 97, 93, 94)]);
  const z = detectFvg(cs, O);
  eq(z.length, 1, "bearish FVG: one zone");
  eq([z[0].dir, z[0].i0], [-1, 21], "bearish FVG: direction / start");
  near(z[0].lo, 97, "bearish FVG: low edge = high of the third candle");
  near(z[0].hi, 99, "bearish FVG: high edge = low of the first candle");
}

{
  // the third bar touching the edge exactly (low == a.high) is no gap
  const cs = fresh(() => [...flats(20), bar(100, 101, 99, 100.5), bar(100.5, 106, 100.5, 105.5), bar(105.5, 107, 101, 106)]);
  eq(detectFvg(cs, O).length, 0, "no gap when the third low equals the first high");
}

{
  // mitigation modes (bull zone [101, 103])
  const wick = (extra: Candle[]) => fresh(() => [...bullBase(), ...extra]);
  const partial = wick([bar(106, 106.5, 102, 105)]); // dips to 102: half of the gap
  let z = detectFvg(partial, O)[0];
  eq(z.i1, -1, "wick mode: a dip into the zone is not a full mitigation");
  near(z.hi, 102, "partial fill shrinks the zone to what is left (top edge = the dip)");
  near(z.filled, 0.5, "filled share 0.5");
  z = detectFvg(partial, { ...O, shrink: false })[0];
  near(z.hi, 103, "shrink off keeps the original top edge");
  const full = wick([bar(106, 106.5, 100.9, 105)]); // wick through the far edge (101)
  eq(detectFvg(full, O)[0].i1, 23, "wick mode: wick through the far edge mitigates it at that bar");
  const wickOnly = wick([bar(106, 106.5, 100.9, 105)]);
  eq(detectFvg(wickOnly, { ...O, mitigation: "close" })[0].i1, -1, "close mode: a wick through the far edge with the close above does not mitigate");
  const closeThrough = wick([bar(106, 106.5, 100.5, 100.7)]);
  eq(detectFvg(closeThrough, { ...O, mitigation: "close" })[0].i1, 23, "close mode: a close beyond the far edge mitigates");
  const touch = wick([bar(106, 106.5, 102.9, 105)]);
  eq(detectFvg(touch, { ...O, mitigation: "touch" })[0].i1, 23, "touch mode: entering the zone mitigates it");
  eq(detectFvg(touch, O)[0].i1, -1, "the same dip does not mitigate in wick mode");
  const later = wick([bar(106, 107, 104, 106), bar(106, 107, 104, 106), bar(106, 106, 100, 101)]);
  eq(detectFvg(later, O)[0].i1, 25, "mitigation index is the bar that fills it");
  // a mitigated zone is not revived, and a zone does not shrink below the far edge
  const deep = wick([bar(106, 106.5, 100.9, 105), bar(105, 106, 104, 105)]);
  eq(detectFvg(deep, O)[0].i1, 23, "stays mitigated");
}

{
  // bear zone [97, 99] partial fill from below
  const base = (): Candle[] => [...flats(20), bar(100, 101, 99, 99.5), bar(99.5, 99.5, 94, 94.5), bar(94.5, 97, 93, 94)];
  const cs = fresh(() => [...base(), bar(94, 98, 93.5, 94)]);
  const z = detectFvg(cs, O)[0];
  eq(z.i1, -1, "bear zone: a rally into the gap is a partial fill");
  near(z.lo, 98, "bear zone shrinks from below (low edge = the high of the rally)");
  const cs2 = fresh(() => [...base(), bar(94, 99.2, 93.5, 94)]);
  eq(detectFvg(cs2, O)[0].i1, 23, "bear zone: high above the far edge (99) mitigates");
}

{
  // opening gaps (not part of an FVG) and volume imbalances
  const gapCs = fresh(() => [...flats(20), bar(100, 110, 100, 101), bar(101, 101, 99.5, 100), bar(103.5, 105, 103, 104.5)]);
  eq(detectFvg(gapCs, O).length, 0, "gap that is no FVG is ignored by default");
  const g = detectFvg(gapCs, { ...O, gaps: true });
  eq(g.map((z) => z.kind), ["gap"], "opening gap detected with the option on");
  near(g[0].lo, 101, "gap low edge = high of the previous bar");
  near(g[0].hi, 103, "gap high edge = low of the bar");
  // volume imbalance: bodies do not touch, wicks do
  const viCs = fresh(() => [...flats(20), bar(100, 104, 99, 101), bar(102, 103.5, 101.5, 103)]);
  eq(detectFvg(viCs, O).length, 0, "volume imbalance ignored by default");
  const vi = detectFvg(viCs, { ...O, volImb: true });
  eq(vi.map((z) => z.kind), ["vi"], "volume imbalance detected");
  near(vi[0].lo, 101, "VI low edge = top of the previous body");
  near(vi[0].hi, 102, "VI high edge = bottom of this body");
}

{
  // lookback limits where detection starts
  const cs = fresh(() => [...bullBase(), ...flats(30, 106)]);
  eq(detectFvg(cs, { ...O, lookback: 100 }).length, 1, "zone inside the lookback");
  eq(detectFvg(cs, { ...O, lookback: 20 }).length, 0, "zone older than the lookback is not looked for");
}

/* ───────────── liquidity pools ───────────── */

// quiet bars (h 101 / l 99) with spikes: equal highs at 10 and 20 (110 / 110.05), equal lows at 15 and 25 (90 / 90.1), a lone high at 35 (105, a separate pool)
function liqSeries(extra: Candle[] = []): Candle[] {
  const cs = flats(45);
  cs[10] = { ...cs[10], h: 110, c: 100 };
  cs[20] = { ...cs[20], h: 110.05, c: 100 };
  cs[15] = { ...cs[15], l: 90 };
  cs[25] = { ...cs[25], l: 90.1 };
  cs[35] = { ...cs[35], h: 105 };
  return [...cs, ...extra];
}
const LQ = { ...DEFAULT_LIQ, pivot: 2, atrLen: 5, tol: 0.15 };

{
  const cs = fresh(() => liqSeries());
  const pools = detectLiquidity(cs, LQ);
  const bsl = pools.filter((p) => p.side > 0);
  const ssl = pools.filter((p) => p.side < 0);
  eq(bsl.length, 1, "equal highs: one buy-side pool (the lone high is not a pool with 2 touches)");
  eq(bsl[0].pts, [10, 20], "buy-side pool: the two swing highs");
  near(bsl[0].level, 110.05, "buy-side level = the highest of the cluster");
  near(bsl[0].edge, 110, "cluster edge = the lowest of the cluster");
  eq(bsl[0].swept, -1, "buy-side pool is alive");
  eq(bsl[0].known, 22, "known only after 2 confirming bars");
  eq(ssl.length, 1, "equal lows: one sell-side pool");
  eq(ssl[0].pts, [15, 25], "sell-side pool: the two swing lows");
  near(ssl[0].level, 90, "sell-side level = the lowest of the cluster");
  const all = detectLiquidity(cs, { ...LQ, minTouches: 1 });
  ok(all.some((p) => p.side > 0 && p.pts.length === 1 && p.level === 105), "min touches 1 also lists the lone high");
  const tight = detectLiquidity(cs, { ...LQ, tol: 0.001 });
  eq(tight.filter((p) => p.pts.length >= 2).length, 0, "tolerance too tight: 110 and 110.05 are not equal any more");
  const pct = detectLiquidity(cs, { ...LQ, unit: "pct", tol: 0.1 });
  eq(pct.filter((p) => p.side > 0 && p.pts.length === 2).length, 1, "0.1 % tolerance joins 110 and 110.05");
}

{
  // sweep: a wick above the level (111 > 110.05 + tol), a close above it
  const wickAbove = fresh(() => liqSeries([bar(100, 111, 99, 100.5)]));
  let p = detectLiquidity(wickAbove, LQ).find((q) => q.side > 0 && q.pts.length === 2)!;
  eq(p.swept, 45, "wick mode: swept at the bar that pierced the level");
  p = detectLiquidity(wickAbove, { ...LQ, sweep: "close" }).find((q) => q.side > 0 && q.pts.length === 2)!;
  eq(p.swept, -1, "close mode: a wick with the close back below does not sweep");
  const closeAbove = fresh(() => liqSeries([bar(100, 112, 99, 111.5)]));
  p = detectLiquidity(closeAbove, { ...LQ, sweep: "close" }).find((q) => q.side > 0 && q.pts.length === 2)!;
  eq(p.swept, 45, "close mode: swept by a close above the level");
  const inside = fresh(() => liqSeries([bar(100, 110.1, 99, 100.5)]));
  p = detectLiquidity(inside, LQ).find((q) => q.side > 0 && q.pts.length === 2)!;
  eq(p.swept, -1, "a poke inside the tolerance is not a sweep");
  const lowSweep = fresh(() => liqSeries([bar(100, 101, 89, 99.5)]));
  const s = detectLiquidity(lowSweep, LQ).find((q) => q.side < 0 && q.pts.length === 2)!;
  eq(s.swept, 45, "sell-side pool swept by a wick below the lowest low");
  // a wick through 111 also takes the lower lone high at 105
  const lone = detectLiquidity(wickAbove, { ...LQ, minTouches: 1 }).find((q) => q.level === 105)!;
  eq(lone.swept, 45, "a lower pool is swept by the same wick");
  const below = fresh(() => liqSeries([bar(100, 107, 99, 100.5)]));
  const loneAlive = detectLiquidity(below, { ...LQ, minTouches: 1 });
  eq([loneAlive.find((q) => q.level === 105)!.swept, loneAlive.find((q) => q.level === 110.05)!.swept], [45, -1], "a wick to 107 takes 105 but not the 110 pool");
}

{
  // a swing after a sweep starts a new pool instead of joining the swept one
  const cs = fresh(() => {
    const a = liqSeries([bar(100, 111, 99, 100.5), ...flats(4)]);
    a.push(bar(100, 110.04, 99, 100), ...flats(4));
    return a;
  });
  const bsl = detectLiquidity(cs, LQ).filter((q) => q.side > 0 && q.level < 111);
  ok(bsl.some((q) => q.swept >= 0), "the swept pool is kept as swept");
}

/* ───────────── high-volume nodes ───────────── */

{
  // 100 bars inside 100..102 with big volume (cluster A), 60 bars inside 110..112 with less volume per price row (B), a few spread bars with little volume
  const cs = fresh(() => {
    const out: Candle[] = [];
    for (let i = 0; i < 100; i++) out.push(bar(100.5, 102, 100, 101.5, 1000));
    for (let i = 0; i < 60; i++) out.push(bar(110.5, 112, 110, 111.5, 1000));
    for (let i = 0; i < 10; i++) out.push(bar(102, 111, 101, 109, 20));
    return out;
  });
  const h = detectHvn(cs, { ...DEFAULT_HVN, lookback: 300, rows: 60, top: 2, smooth: 0 })!;
  ok(!!h, "HVN: profile built");
  eq(h.nodes.length, 2, "HVN: two nodes");
  ok(h.nodes[0].lo >= 99.5 && h.nodes[0].hi <= 102.5, "HVN: the strongest node sits in the 100..102 cluster", `${h.nodes[0].lo}..${h.nodes[0].hi}`);
  ok(h.nodes[1].lo >= 109.5 && h.nodes[1].hi <= 112.5, "HVN: the second node sits in the 110..112 cluster", `${h.nodes[1].lo}..${h.nodes[1].hi}`);
  eq(h.nodes.map((n) => n.rank), [1, 2], "HVN: ranks by volume");
  ok(h.poc > 100 && h.poc < 102, "HVN: POC inside the strongest node", String(h.poc));
  ok(h.nodes[0].share > h.nodes[1].share && h.nodes[0].share > 40, "HVN: shares ordered, the big node holds most of the volume", `${h.nodes[0].share} ${h.nodes[1].share}`);
  const one = detectHvn(cs, { ...DEFAULT_HVN, lookback: 300, rows: 60, top: 1, smooth: 0 })!;
  eq(one.nodes.length, 1, "HVN: top 1");
  // window: only the last 60 bars -> the 110..112 cluster / spread bars; the cluster at 100 is outside
  const win = detectHvn(cs, { ...DEFAULT_HVN, lookback: 70, rows: 60, top: 3, smooth: 0 })!;
  ok(win.nodes.every((n) => n.lo > 105), "HVN: the window cuts off the older cluster", JSON.stringify(win.nodes.map((n) => [n.lo, n.hi])));
  const minv = detectHvn(cs, { ...DEFAULT_HVN, lookback: 300, rows: 60, top: 3, smooth: 0, minVol: 90 })!;
  eq(minv.nodes.length, 1, "HVN: min volume 90 % of POC leaves only the POC node");
  eq(detectHvn([], DEFAULT_HVN), null, "HVN: no candles -> null");
  eq(detectHvn(fresh(() => flats(5).map((c) => ({ ...c, v: 0 }))), DEFAULT_HVN), null, "HVN: no volume -> null");
}

/* ───────────── order blocks ───────────── */

{
  // flat, a down candle (the block), then an up impulse closing above its high
  const build = (extra: Candle[] = []): Candle[] => [...flats(20), bar(100.5, 100.7, 99.3, 99.5), bar(99.6, 104.2, 99.5, 104), ...flats(3, 104), ...extra];
  const ob = { ...DEFAULT_OB, atrLen: 5, impulse: 1.5 };
  const cs = fresh(() => build());
  const z = detectOrderBlocks(cs, ob);
  eq(z.length, 1, "OB: one block");
  eq([z[0].dir, z[0].i0, z[0].kind], [1, 20, "ob"], "OB: bullish, the last down candle");
  near(z[0].lo, 99.3, "OB low = candle low");
  near(z[0].hi, 100.7, "OB high = candle high");
  eq(z[0].i1, -1, "OB alive");
  eq(detectOrderBlocks(cs, { ...ob, impulse: 4 }).length, 0, "OB: a weaker impulse threshold filters it");
  const wickIn = fresh(() => build([bar(104, 104, 99.2, 103.5)]));
  eq(detectOrderBlocks(wickIn, ob)[0].i1, -1, "OB close mode: a wick below the block with the close above does not mitigate");
  eq(detectOrderBlocks(wickIn, { ...ob, mitigation: "wick" })[0].i1, 25, "OB wick mode: mitigated by the wick");
  const closeIn = fresh(() => build([bar(104, 104, 98.5, 99)]));
  eq(detectOrderBlocks(closeIn, ob)[0].i1, 25, "OB close mode: mitigated by a close below the block");
  // bearish
  const bear = fresh(() => [...flats(20), bar(99.5, 100.7, 99.3, 100.5), bar(100.4, 100.5, 95.8, 96), ...flats(3, 96)]);
  const bz = detectOrderBlocks(bear, ob);
  eq(bz.map((q) => [q.dir, q.i0]), [[-1, 20]], "OB: bearish block = the last up candle before a down impulse");
}

/* ───────────── delta imbalance (candle approximation) ───────────── */

{
  // quiet bars, then 3 strong buy bars in a row (close = high, open = low), 2 strong sell bars, a low-volume strong bar
  const cs = fresh(() => [
    ...flats(25),
    bar(100, 105, 100, 105, 3000),
    bar(105, 110, 105, 110, 3000),
    bar(110, 115, 110, 115, 3000),
    flat(114),
    bar(115, 115, 110, 110, 3000),
    bar(110, 110, 105, 105, 3000),
    flat(105),
    bar(105, 110, 105, 110, 100),
  ]);
  const r = detectDeltaImbalance(cs, { ...DEFAULT_DELTA, ratio: 0.6, stack: 3, volMult: 1, maLen: 20 });
  eq(Array.from(r.imb.slice(25, 33)), [1, 1, 1, 0, -1, -1, 0, 0], "delta: buy x3, none, sell x2, none, low-volume bar is no imbalance");
  eq(Array.from(r.stacked.slice(25, 33)), [1, 1, 1, 0, 0, 0, 0, 0], "delta: the stack of 3 buys is marked, the pair of sells is not");
  near(r.delta[25], 3000, "delta of an all-up bar = +volume");
  near(r.delta[29], -3000, "delta of an all-down bar = -volume");
  const st2 = detectDeltaImbalance(cs, { ...DEFAULT_DELTA, ratio: 0.6, stack: 2, volMult: 1, maLen: 20 });
  eq(Array.from(st2.stacked.slice(25, 33)), [1, 1, 1, 0, 1, 1, 0, 0], "delta: stack of 2 marks the sells too");
  const low = detectDeltaImbalance(cs, { ...DEFAULT_DELTA, volMult: 0 });
  eq(low.imb[32], 1, "delta: volume filter off lets the low-volume bar count");
}

/* ───────────── live (forming) bar and TF switch ───────────── */

{
  // third bar still forming: its low is 104 (gap), then it falls back to 100.5 -> the zone must disappear; and a fresh bar of volume 0
  const mk = (low: number) => fresh(() => [...flats(20), bar(100, 101, 99, 100.5), bar(100.5, 106, 100.5, 105.5), bar(105.5, 107, low, 106)]);
  eq(detectFvg(mk(104), O).length, 1, "live bar: gap present while the forming bar holds above the first high");
  eq(detectFvg(mk(100.5), O).length, 0, "live bar: the gap vanishes when the forming bar retraces into it");
  const flatNew = fresh(() => [...bullBase(), bar(106, 106, 106, 106, 0)]);
  const z = detectFvg(flatNew, O);
  eq([z.length, z[0].i1], [1, -1], "a freshly opened bar (v=0, o=h=l=c) neither breaks nor mitigates");
  // a different series (another timeframe) gives an independent answer
  const other = fresh(() => flats(30));
  eq([detectFvg(other, O).length, detectLiquidity(other, LQ).length, detectOrderBlocks(other, DEFAULT_OB).length], [0, 0, 0], "quiet series: nothing detected");
}

/* ───────────── speed on a long series ───────────── */

{
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const big: Candle[] = [];
  let p = 5000;
  for (let i = 0; i < 5000; i++) {
    const o = p;
    const c = o + rnd() * 30;
    const h = Math.max(o, c) + Math.abs(rnd()) * 12;
    const l = Math.min(o, c) - Math.abs(rnd()) * 12;
    big.push({ t: T0 + i * STEP, o, h, l, c, v: 1000 + Math.floor(Math.abs(rnd()) * 3000) });
    p = c;
  }
  const time = (f: () => unknown): number => {
    f();
    const t = performance.now();
    for (let k = 0; k < 5; k++) f();
    return (performance.now() - t) / 5;
  };
  const tF = time(() => detectFvg(big, { ...DEFAULT_FVG, lookback: 20000, gaps: true, volImb: true }));
  const tL = time(() => detectLiquidity(big, { ...DEFAULT_LIQ, lookback: 20000 }));
  const tH = time(() => detectHvn(big, { ...DEFAULT_HVN, lookback: 20000 }));
  const tO = time(() => detectOrderBlocks(big, { ...DEFAULT_OB, lookback: 20000 }));
  const tD = time(() => detectDeltaImbalance(big, DEFAULT_DELTA));
  console.log(`      5000 bars: fvg ${tF.toFixed(1)} ms, liquidity ${tL.toFixed(1)} ms, hvn ${tH.toFixed(1)} ms, ob ${tO.toFixed(1)} ms, delta ${tD.toFixed(1)} ms`);
  ok(tF < 60 && tL < 60 && tH < 60 && tO < 60 && tD < 30, "5000 bars: every detector well under one frame budget");
  const z = detectFvg(big, { ...DEFAULT_FVG, lookback: 20000 });
  ok(z.length > 50, "random walk: plenty of FVGs", String(z.length));
  ok(z.every((q) => (q.i1 < 0 || q.i1 > q.born) && q.lo <= q.hi), "every zone is ordered and is mitigated strictly after its birth");
  ok(z.every((q) => q.i1 < 0 || q.filled === 1), "mitigated zones are fully filled");
  const l = detectLiquidity(big, { ...DEFAULT_LIQ, lookback: 20000 });
  ok(l.every((q) => q.swept < 0 || q.swept > q.known - 5), "pools are swept after their swings");
}

/* ───────────── registry / i18n wiring ───────────── */

{
  const IDS = ["fvg", "liq_pools", "liq_hvn", "order_blocks", "delta_imb"];
  const cs = fresh(() => liqSeries(bullBase().slice(20)));
  const ru = liquidityDict.ru;
  const en = liquidityDict.en;
  const cn = liquidityDict.cn;
  ok(!!ru["ind.cat.liquidity"] && !!en["ind.cat.liquidity"] && !!cn["ind.cat.liquidity"], "category name in ru / en / cn");
  for (const id of IDS) {
    const def = getIndicatorDef(id);
    ok(!!def, `${id}: registered`);
    if (!def) continue;
    eq(def.category, "liquidity", `${id}: category`);
    for (const k of [`ind.${id}.name`, `ind.${id}.desc`]) ok(!!ru[k] && !!en[k] && !!cn[k], `${id}: ${k} in ru / en / cn`);
    const missing: string[] = [];
    for (const p of def.params) {
      const k = `ind.p.${p.key}`;
      if (!ru[k] || !en[k] || !cn[k]) missing.push(k);
      if (p.type === "select") for (const o of p.options) if (o.label.startsWith("ind") && (!ru[o.label] || !en[o.label] || !cn[o.label])) missing.push(o.label);
    }
    for (const g of new Set(Object.values(def.paramGroup ?? {}))) if (!ru[g] || !en[g] || !cn[g]) missing.push(g);
    eq(missing, [], `${id}: every parameter / option / group has a ru, en and cn text`);
    const keys = def.params.map((p) => p.key);
    ok(new Set(keys).size === keys.length, `${id}: parameter keys are unique`);
    ok((def.styleParams ?? []).every((k) => def.params.some((p) => p.key === k && p.type === "color")) || id === "delta_imb", `${id}: style params are colour params`);
    const params = defaultParams(def);
    eq(sanitizeParams(def, params), params, `${id}: defaults survive sanitize unchanged`);
    const res = computeIndicator(def, cs, params, { flow: null, intervalMs: STEP });
    ok(Array.isArray(res.plots), `${id}: computes on the synthetic series`);
    ok(res.error === undefined, `${id}: no error`);
    // forming bar and an empty-volume bar do not throw
    const tail = [...cs, bar(100, 100, 100, 100, 0)];
    let threw = false;
    try {
      computeIndicator(def, tail, params, { flow: null, intervalMs: STEP });
      computeIndicator(def, cs.slice(0, 2), params, { flow: null, intervalMs: STEP });
      computeIndicator(def, cs.slice(0, 1), params, { flow: null, intervalMs: STEP });
    } catch {
      threw = true;
    }
    ok(!threw, `${id}: forming bar / 1-2 bars do not throw`);
    // out-of-range stored values are clamped, not trusted
    const wild: Record<string, number> = {};
    for (const p of def.params) if (p.type === "number") wild[p.key] = 1e9;
    const clamped = sanitizeParams(def, wild);
    ok(def.params.every((p) => p.type !== "number" || (clamped[p.key] as number) <= p.max), `${id}: stored numbers are clamped to the schema`);
  }
  const ids = INDICATOR_DEFS.map((d) => d.id);
  ok(new Set(ids).size === ids.length, "registry: indicator ids are unique");
  // the shapes the painter / legend rely on
  const fv = computeIndicator(getIndicatorDef("fvg")!, cs, defaultParams(getIndicatorDef("fvg")!), { flow: null, intervalMs: STEP });
  const fx = fv.extra as { zones: { dir: number }[] };
  ok(fx.zones.length >= 1, "fvg: default parameters find the gap in the synthetic series");
  const legend = getIndicatorDef("fvg")!.legendItems!(fv, defaultParams(getIndicatorDef("fvg")!), "ru");
  eq(legend.map((l) => l.text.slice(0, 1)), ["▲", "▼"], "fvg: legend shows bullish / bearish counts");
  const lq = getIndicatorDef("liq_pools")!;
  const lres = computeIndicator(lq, fresh(() => liqSeries()), { ...defaultParams(lq), lqPivot: 2 }, { flow: null, intervalMs: STEP });
  const flags = lq.axisFlags!(lres, { ...defaultParams(lq), lqPivot: 2 });
  ok(flags.length === 2 && flags.some((f) => f.caption === "BSL") && flags.some((f) => f.caption === "SSL"), "liq_pools: price-scale tags for the nearest BSL and SSL");
  eq(lq.axisFlags!(lres, { ...defaultParams(lq), lqAxis: false }), [], "liq_pools: price-scale tags can be switched off");
  const di = getIndicatorDef("delta_imb")!;
  const dres = computeIndicator(di, cs, defaultParams(di), { flow: null, intervalMs: STEP });
  eq(dres.plots.length, 1, "delta_imb: one histogram plot");
  ok(di.legendItems!(dres, defaultParams(di), "ru")[0].text.length > 0, "delta_imb: the legend says the values are approximate");
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
