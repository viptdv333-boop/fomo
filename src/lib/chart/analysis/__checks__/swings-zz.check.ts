/* Checks for the Double ZigZag swing detectors. Run: npx tsx src/lib/chart/analysis/__checks__/swings-zz.check.ts */
import { detectSwings, type Pivot, type SwingCandle, type SwingSpec } from "../swings";
import { analyzeZz } from "../swings-zz";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log("  FAIL: " + msg);
  } else console.log("  ok:   " + msg);
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Exact piecewise linear path through `pts`, `bars` bars per leg, h = c, l = c (no noise). */
function path(pts: number[], bars = 10): SwingCandle[] {
  const out: SwingCandle[] = [];
  let t = 1_700_000_000_000;
  const push = (c: number) => {
    out.push({ t, o: c, h: c, l: c, c, v: 10 });
    t += 60_000;
  };
  push(pts[0]);
  for (let k = 1; k < pts.length; k++) for (let i = 1; i <= bars; i++) push(pts[k - 1] + ((pts[k] - pts[k - 1]) * i) / bars);
  return out;
}

const show = (pv: Pivot[]) => pv.map((q) => `${q.type}${q.i}@${q.p}${q.confirmed ? "" : "~"}`).join(" ");

/* ───── 1. exact pivots per mode ───── */
console.log("\n== exact pivots (100 > 120 > 105 > 130 > 110 > 125, 10 bars per leg)");
const cs = path([100, 120, 105, 130, 110, 125]);
const want = "H10@120 L20@105 H30@130 L40@110 H50@125~";
{
  const pct = detectSwings(cs, { mode: "pct", pct: 5 });
  console.log("  pct :", show(pct));
  ok(show(pct) === "L0@100 " + want, "Deviation 5%");
  const atr = detectSwings(cs, { mode: "atr", atr: 3 });
  console.log("  atr :", show(atr));
  ok(show(atr) === "L0@100 " + want, "ATR x 3");
  const piv = detectSwings(cs, { mode: "pivot", bars: 3 });
  console.log("  piv :", show(piv));
  ok(show(piv) === want, "Pivot bars 3");
  // a bigger reversal threshold swallows the small legs
  const big = detectSwings(cs, { mode: "pct", pct: 20 });
  console.log("  pct20:", show(big));
  ok(big.length >= 2 && big[big.length - 1].confirmed === false, "bigger threshold -> fewer swings, last provisional");
  ok(big.length < detectSwings(cs, { mode: "pct", pct: 5 }).length, "bigger threshold gives fewer swings than smaller");
  // a window wider than any leg finds nothing confirmed
  ok(detectSwings(cs, { mode: "pivot", bars: 22 }).filter((q) => q.confirmed).length === 0, "Pivot bars 22 on 10-bar legs: nothing");
}

/* ───── 2. live provisional leg, no repaint ───── */
console.log("\n== live provisional leg / no repaint");
{
  const specs: SwingSpec[] = [{ mode: "pct", pct: 5 }, { mode: "atr", atr: 3 }, { mode: "pivot", bars: 3 }];
  for (const sp of specs) {
    // cut in the middle of the 4th leg (130 -> 110)
    const cut = cs.slice(0, 36);
    const pv = detectSwings(cut, sp);
    const last = pv[pv.length - 1];
    ok(!!last && !last.confirmed && last.type === "L", `${sp.mode}: last pivot is a provisional low (${show(pv.slice(-2))})`);
    const full = detectSwings(cs, sp);
    const a = pv.filter((q) => q.confirmed);
    const b = full.filter((q) => q.confirmed);
    ok(a.every((q, k) => b[k] && b[k].i === q.i && b[k].p === q.p && b[k].type === q.type), `${sp.mode}: confirmed pivots of the shorter series are a prefix of the longer one`);
  }
}

/* ───── 3. random walk ───── */
console.log("\n== random walk sanity (20000 candles)");
{
  const r = rng(42);
  const n = 20000;
  const walk: SwingCandle[] = [];
  let price = 1000;
  let t = 1_700_000_000_000;
  for (let i = 0; i < n; i++) {
    const o = price;
    const c = o * (1 + (r() - 0.5) * 0.01);
    walk.push({ t, o, h: Math.max(o, c) * (1 + r() * 0.003), l: Math.min(o, c) * (1 - r() * 0.003), c, v: 100 + r() * 50 });
    price = c;
    t += 60_000;
  }
  const specs: SwingSpec[] = [{ mode: "pct", pct: 1 }, { mode: "atr", atr: 2 }, { mode: "pivot", bars: 5 }, { mode: "pivot", bars: 30 }];
  for (const sp of specs) {
    const t0 = Date.now();
    const pv = detectSwings(walk, sp);
    const dt = Date.now() - t0;
    let alt = true;
    let inc = true;
    let exact = true;
    for (let k = 0; k < pv.length; k++) {
      if (k > 0 && pv[k].type === pv[k - 1].type) alt = false;
      if (k > 0 && pv[k].i <= pv[k - 1].i) inc = false;
      const c = walk[pv[k].i];
      if (pv[k].p !== (pv[k].type === "H" ? c.h : c.l)) exact = false;
      if (k < pv.length - 1 && !pv[k].confirmed) exact = false;
    }
    ok(pv.length > 10 && alt && inc && exact, `${sp.mode}${sp.bars ?? sp.pct ?? sp.atr}: ${pv.length} pivots, alternating, increasing, on real highs/lows (${dt} ms)`);
    ok(dt < 400, `${sp.mode}: fast enough`);
    if (sp.mode !== "pivot") {
      // no repaint: pivots found on a prefix of the history stay (all but the provisional one)
      let same = true;
      for (const cutAt of [3000, 7777, 15000]) {
        const a = detectSwings(walk.slice(0, cutAt), sp).filter((q) => q.confirmed);
        const b = detectSwings(walk, sp).filter((q) => q.confirmed);
        if (!a.every((q, k) => b[k] && b[k].i === q.i && b[k].p === q.p)) same = false;
      }
      ok(same, `${sp.mode}: confirmed pivots do not repaint when bars are appended`);
    }
  }
  const t0 = Date.now();
  const res = analyzeZz(walk, { spec1: { mode: "pivot", bars: 5 }, spec2: { mode: "pivot", bars: 30 }, window: 2000, levels: 4, mergeAtr: 0.5 });
  console.log(`  analyzeZz window 2000: ${Date.now() - t0} ms, L1=${res.layers[0].pivots.length} L2=${res.layers[1].pivots.length} levels=${res.levels.length}`);
  ok(res.layers[0].pivots.length > res.layers[1].pivots.length && res.levels.length > 0 && res.levels.length <= 4, "fast layer has more swings than the slow one; levels <= 4");
  ok(res.layers[0].pivots.every((q) => q.i >= res.start), "pivots inside the window");
  const full = analyzeZz(walk, { spec1: { mode: "pct", pct: 1 }, spec2: { mode: "atr", atr: 3 }, window: 20000, levels: 6, mergeAtr: 0 });
  ok(full.layers[0].pivots.length > 100, "full 20k window analysed");
}

/* ───── 4. enrichment: tags, %, bars, volume, levels ───── */
console.log("\n== enrichment");
{
  const pts = path([100, 120, 105, 130, 110, 125]);
  const r = analyzeZz(pts, { spec1: { mode: "pct", pct: 5 }, spec2: { mode: "pct", pct: 5 }, window: 2000, levels: 3, mergeAtr: 0 });
  const pv = r.layers[0].pivots;
  const tags = pv.map((q) => q.tag).join(",");
  console.log("  tags:", tags, " pct:", pv.map((q) => (isNaN(q.pct) ? "-" : q.pct.toFixed(1))).join(","));
  ok(tags === ",,HL,HH,HL,LH", "tags: L100 H120 L105(HL) H130(HH) L110(HL: above 105) H125(LH) - got " + tags);
  ok(Math.abs(pv[1].pct - 20) < 1e-9 && pv[1].bars === 10 && pv[1].vol === 100, "pct/bars/volume of the first leg (+20%, 10 bars, volume 100)");
  const lv = r.levels;
  console.log("  levels:", lv.map((l) => `${l.type}${l.i}@${l.p} broken=${l.broken}`).join(" | "));
  ok(lv.length === 3 && lv[0].p === 110 && lv.some((l) => l.p === 130 && l.broken === -1), "3 levels, newest first; 130 not broken");
  const brk = analyzeZz(path([100, 120, 105, 130, 110, 135]), { spec1: { mode: "pct", pct: 5 }, spec2: { mode: "pct", pct: 5 }, window: 2000, levels: 4, mergeAtr: 0 });
  ok(brk.levels.some((l) => l.p === 130 && l.broken > 0), "a close above the 130 high marks that level as broken");
  const merged = analyzeZz(pts, { spec1: { mode: "pct", pct: 5 }, spec2: { mode: "pct", pct: 5 }, window: 2000, levels: 4, mergeAtr: 100 });
  ok(merged.levels.length === 1, "huge merge distance collapses levels into one");
}

/* ───── 5. robustness ───── */
console.log("\n== robustness");
{
  const modes: SwingSpec[] = [{ mode: "pct", pct: 1 }, { mode: "atr", atr: 2 }, { mode: "pivot", bars: 5 }];
  const flat: SwingCandle[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 60000, o: 5, h: 5, l: 5, c: 5, v: 0 }));
  const nan: SwingCandle[] = Array.from({ length: 300 }, (_, i) => ({ t: i * 60000, o: NaN, h: i % 7 === 0 ? NaN : 5 + Math.sin(i / 5), l: NaN, c: NaN, v: NaN }));
  let threw = false;
  try {
    for (const sp of modes) {
      for (const data of [[], flat.slice(0, 1), flat.slice(0, 4), flat, nan]) {
        detectSwings(data, sp);
        analyzeZz(data, { spec1: sp, spec2: sp, window: 2000, levels: 4, mergeAtr: 0.5 });
      }
    }
  } catch (e) {
    threw = true;
    console.log(e);
  }
  ok(!threw, "never throws on empty / short / flat / NaN data");
}

console.log(failed ? `\n${failed} FAILED` : "\nall ok");
process.exit(failed ? 1 : 0);
