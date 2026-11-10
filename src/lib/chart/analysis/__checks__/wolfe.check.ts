/* Checks for the Wolfe wave detector. Run: npx tsx src/lib/chart/analysis/__checks__/wolfe.check.ts */
import type { SwingCandle } from "../swings";
import { detectWolfe, lineAt, type WolfePattern } from "../wolfe";
import { makeRng } from "./synth";

let failed = 0;
function ok(cond: boolean, msg: string) {
  if (!cond) {
    failed++;
    console.log("  FAIL: " + msg);
  } else console.log("  ok:   " + msg);
}

type Pt = [number, number]; // [bar, price]

/** Exact piecewise linear path through the [bar, price] points (h = l = c): the zigzag pivots are exactly the corner bars. */
function path(pts: Pt[], flip = false, upto = Infinity): SwingCandle[] {
  const out: SwingCandle[] = [];
  let t = 1_700_000_000_000;
  for (let k = 1; k < pts.length; k++) {
    const [i0, p0] = pts[k - 1];
    const [i1, p1] = pts[k];
    for (let i = k === 1 ? i0 : i0 + 1; i <= i1; i++) {
      let c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
      if (flip) c = 200 - c;
      out.push({ t, o: c, h: c, l: c, c, v: 10 });
      t += 60_000;
    }
  }
  return upto < out.length ? out.slice(0, upto) : out;
}

const show = (p: WolfePattern) =>
  `${p.dir > 0 ? "bull" : "bear"} ${p.variant} ${p.status} ${p.confidence}% pts=${p.pts.map((q) => `${q.i}@${q.p.toFixed(1)}`).join(" ")} eta=${p.eta}${
    p.etaApex ? " (apex)" : " (est)"
  } cross=${p.cross.toFixed(1)} epa=${p.epa.toFixed(2)} zonePos=${p.zonePos.toFixed(2)}`;

/** The classic rules, checked independently of the detector, on the returned pattern. */
function classic(p: WolfePattern): string {
  const s = p.dir;
  const y = p.pts.map((q) => s * q.p);
  if (!(y[2] < y[0])) return "point 3 is not beyond point 1";
  if (!(y[3] > y[0] && y[3] < y[1])) return "point 4 is not inside wave 1-2";
  if (y.length === 5 && !(y[4] < y[2])) return "point 5 is not beyond point 3";
  const l12 = p.pts[1].i - p.pts[0].i;
  const l34 = p.pts[3].i - p.pts[2].i;
  if (Math.max(l12, l34) / Math.min(l12, l34) > 3) return "waves 1-2 and 3-4 are not symmetric in time";
  if (p.etaApex && p.eta !== Math.round(p.cross)) return "eta is not the apex";
  if (Math.abs(p.epa - lineAt(p.l14, p.eta)) > 1e-6) return "epa is not the 1-4 line at eta";
  if (p.variant === "parallel" && (p.etaApex || p.cross !== Infinity)) return "parallel variant with an apex";
  return "";
}
const at = (p: WolfePattern, bars: number[]) => bars.every((b, k) => p.pts[k]?.i === b);

const O = { minConf: 0, maxShown: 10 };

/* ───── 1. textbook bullish / bearish ───── */
// 1 (20,100) 2 (35,112) 3 (50,96) 4 (65,103) 5 (80,90): 1-3 line at bar 80 = 92, the parallel to 2-4 through 3 = 87 -> 5 in the sweet zone.
// apex: 100 - (4/30)(i-20) = 112 - (9/30)(i-35)  ->  i = 119
const TEXT: Pt[] = [[0, 120], [20, 100], [35, 112], [50, 96], [65, 103], [80, 90], [100, 110]];
const APEX = 119;
const EPA = 100 + ((103 - 100) / 45) * (APEX - 20);
for (const flip of [false, true]) {
  console.log(`\n== textbook ${flip ? "bearish" : "bullish"} Wolfe`);
  const dir = flip ? -1 : 1;
  const res = detectWolfe(path(TEXT, flip), O);
  res.forEach((p) => console.log("  " + show(p)));
  const p = res.find((q) => q.dir === dir && at(q, [20, 35, 50, 65, 80]));
  ok(!!p, "found on points 20-35-50-65-80");
  if (p) {
    ok(classic(p) === "", "classic rules hold" + (classic(p) ? ": " + classic(p) : ""));
    ok(p.variant === "classic", "variant classic");
    ok(p.confidence >= 70, `confidence >= 70 (${p.confidence})`);
    ok(p.etaApex && p.eta === APEX, `ETA = apex bar ${APEX} (got ${p.eta})`);
    const epa = flip ? 200 - EPA : EPA;
    ok(Math.abs(p.epa - epa) < 1e-6, `EPA = 1-4 line at the apex ${epa.toFixed(3)} (got ${p.epa.toFixed(3)})`);
    ok(p.zonePos > 0 && p.zonePos < 1, `point 5 inside the sweet zone (${p.zonePos.toFixed(2)})`);
    ok(p.status === "hit", "target reached -> hit");
    const z = lineAt(p.lz, 80);
    ok(Math.abs(z - (flip ? 113 : 87)) < 1e-6, `sweet zone border at point 5 = ${flip ? 113 : 87} (got ${z.toFixed(3)})`);
  }
  // live: cut at point 5 (still the running extreme) and before it reaches the 1-3 line
  const forming = detectWolfe(path(TEXT, flip, 81), O).find((q) => q.dir === dir && at(q, [20, 35, 50, 65]));
  ok(!!forming && forming.status === "forming" && forming.eta === APEX, `cut at point 5: forming, ETA ${forming?.eta}`);
  ok(!!forming && forming.confidence >= 70, `forming: confidence >= 70 (${forming?.confidence})`);
  const setup = detectWolfe(path(TEXT, flip, 73), O).find((q) => q.dir === dir && at(q, [20, 35, 50, 65]));
  ok(!!setup && setup.status === "setup" && setup.pts.length === 4 && setup.eta === APEX, `cut before the 1-3 line: setup with 4 points, ETA ${setup?.eta}`);
  ok(!!setup && setup.confidence >= 70, `setup: confidence >= 70 (${setup?.confidence})`);
}

/* ───── 2. point 4 outside wave 1-2 ───── */
console.log("\n== point 4 below point 1 (outside wave 1-2): rejected");
{
  const res = detectWolfe(path([[0, 120], [20, 100], [35, 112], [50, 96], [65, 99], [80, 90], [100, 110]]), O);
  res.forEach((p) => console.log("  " + show(p)));
  ok(!res.some((p) => p.dir === 1), "no bullish Wolfe");
  const res2 = detectWolfe(path([[0, 120], [20, 100], [35, 112], [50, 96], [65, 99], [80, 90], [100, 110]], true), O);
  ok(!res2.some((p) => p.dir === -1), "mirror: no bearish Wolfe");
  // point 4 above point 2
  const res3 = detectWolfe(path([[0, 120], [20, 100], [35, 108], [50, 96], [65, 109], [80, 93], [100, 115]]), O);
  ok(!res3.some((p) => p.dir === 1 && p.pts[0].i === 20), "point 4 above point 2: no bullish Wolfe from point 1");
}

/* ───── 3. parallel channel ───── */
console.log("\n== parallel channel variant");
{
  const PAR: Pt[] = [[0, 120], [20, 100], [35, 110], [50, 96], [65, 106], [80, 91.5], [100, 112]];
  const res = detectWolfe(path(PAR), O);
  res.forEach((p) => console.log("  " + show(p)));
  const p = res.find((q) => q.dir === 1 && at(q, [20, 35, 50, 65, 80]));
  ok(!!p && p.variant === "parallel", "found, flagged parallel");
  if (p) {
    ok(classic(p) === "", "classic price rules hold" + (classic(p) ? ": " + classic(p) : ""));
    ok(!p.etaApex && p.cross === Infinity && p.eta === 80 + 30, `no apex, ETA estimated = point 5 + (3->5) = 110 (got ${p.eta})`);
    const cl = detectWolfe(path(TEXT), O).find((q) => q.dir === 1)!;
    ok(p.confidence < cl.confidence, `scored lower than the classic one (${p.confidence} < ${cl.confidence})`);
    ok(p.confidence >= 70, `confidence >= 70 (${p.confidence})`);
  }
  ok(!detectWolfe(path(PAR), { ...O, parallel: false }).some((q) => q.dir === 1 && q.pts[0].i === 20), "parallel: false -> not reported");
  // a widening channel is neither
  const wide = detectWolfe(path([[0, 120], [20, 100], [35, 110], [50, 96], [65, 109], [80, 90], [100, 115]]), O);
  ok(!wide.some((q) => q.dir === 1 && q.pts[0].i === 20), "widening channel rejected");
}

/* ───── 4. inner pullback inside a leg ───── */
console.log("\n== inner pullback inside wave 2-3 (pivot skipping)");
{
  const PULL: Pt[] = [[0, 120], [20, 100], [35, 112], [42, 103], [47, 107], [58, 96], [73, 102.5], [88, 91], [108, 110]];
  const res = detectWolfe(path(PULL), O);
  res.forEach((p) => console.log("  " + show(p)));
  const p = res.find((q) => q.dir === 1 && at(q, [20, 35, 58, 73, 88]));
  ok(!!p, "found on 20-35-58-73-88 (swings 42 / 47 absorbed by wave 2-3)");
  if (p) ok(classic(p) === "", "classic rules hold" + (classic(p) ? ": " + classic(p) : ""));
  if (p) ok(p.confidence >= 70, `confidence >= 70 (${p.confidence})`);
  const res0 = detectWolfe(path(PULL), { ...O, maxSkip: 0 });
  ok(!res0.some((q) => q.dir === 1), "maxSkip: 0 (five consecutive swings only) does not find it");
  const resM = detectWolfe(path(PULL, true), O);
  ok(resM.some((q) => q.dir === -1 && at(q, [20, 35, 58, 73, 88])), "mirror: bearish found");
  // the pullback goes beyond the end of the leg: 3 is not the extreme of wave 2-3 any more -> not that pattern
  const BAD: Pt[] = [[0, 120], [20, 100], [35, 112], [42, 95], [47, 107], [58, 96], [73, 102.5], [88, 91], [108, 110]];
  ok(!detectWolfe(path(BAD), O).some((q) => q.dir === 1 && at(q, [20, 35, 58])), "inner swing beyond point 3: the leg is not absorbed");
}

/* ───── 5. analysis window: indices of the full array ───── */
console.log("\n== analysis window shorter than the series");
{
  const lead: Pt[] = [[0, 120], [300, 120.0001]];
  const shifted = TEXT.map(([i, p]) => [i + 300, p] as Pt);
  const cs = path([...lead, ...shifted.slice(1)]);
  const p = detectWolfe(cs, { ...O, window: 110 }).find((q) => q.dir === 1);
  if (p) console.log("  " + show(p));
  ok(!!p && at(p, [320, 335, 350, 365, 380]) && p.eta === APEX + 300, "points and ETA are in full-array indices");
  ok(!!p && Math.abs(lineAt(p.l13, 350) - 96) < 1e-6 && Math.abs(lineAt(p.lz, 380) - 87) < 1e-6, "lines are in full-array indices");
}

/* ───── 6. random walks ───── */
console.log("\n== random walks (3000 candles x 30 seeds)");
{
  let total = 0;
  let bad = "";
  let worst = 0;
  let sum = 0;
  let crashed = "";
  const kinds: Record<string, number> = {};
  for (let seed = 1; seed <= 30; seed++) {
    const rnd = makeRng(seed * 7919);
    const cs: SwingCandle[] = [];
    let price = 100;
    let t = 1_700_000_000_000;
    for (let i = 0; i < 3000; i++) {
      const o = price;
      const c = Math.max(1, o + (rnd() - 0.5) * 2 * (seed % 3 === 0 ? 0.02 * o : 1));
      cs.push({ t, o, h: Math.max(o, c) + rnd() * 0.5, l: Math.min(o, c) - rnd() * 0.5, c, v: 100 });
      price = c;
      t += 60_000;
    }
    try {
      const t0 = performance.now();
      const res = detectWolfe(cs, { window: 3000, maxShown: 1000 });
      const dt = performance.now() - t0;
      worst = Math.max(worst, dt);
      sum += dt;
      total += res.length;
      for (const p of res) {
        kinds[p.variant] = (kinds[p.variant] ?? 0) + 1;
        const e = classic(p);
        if (e && !bad) bad = `seed ${seed}: ${e}: ${show(p)}`;
        if (!(p.confidence >= 50 && p.confidence <= 100) || !Number.isFinite(p.eta) || !Number.isFinite(p.epa)) bad = bad || `seed ${seed}: bad numbers: ${show(p)}`;
      }
      // the live call (default options): at most maxShown
      const live = detectWolfe(cs);
      if (live.length > 3) bad = bad || `seed ${seed}: more than maxShown`;
    } catch (e) {
      crashed = String(e);
    }
  }
  console.log(`  ${total} patterns in 30 walks (${JSON.stringify(kinds)}), mean ${(sum / 30).toFixed(2)} ms, worst ${worst.toFixed(2)} ms per call`);
  ok(!crashed, "no crash" + (crashed ? ": " + crashed : ""));
  ok(!bad, "every reported pattern obeys the classic rules" + (bad ? ": " + bad : ""));
  ok(total / 30 <= 5, `few detections: ${(total / 30).toFixed(1)} per 3000 candles (non-overlapping, min confidence 50)`);
  ok(worst < 50, `fast enough: worst ${worst.toFixed(1)} ms for 3000 candles`);
  // degenerate input
  ok(detectWolfe([]).length === 0 && detectWolfe(path([[0, 100], [200, 100]])).length === 0, "empty / flat series: nothing, no crash");
}

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall Wolfe checks passed");
process.exit(failed ? 1 : 0);
