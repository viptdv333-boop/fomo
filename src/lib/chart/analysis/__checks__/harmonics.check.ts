/* Checks for the harmonic pattern detector. Run: npx tsx src/lib/chart/analysis/__checks__/harmonics.check.ts */
import type { SwingCandle } from "../swings";
import { detectHarmonics, HARMONIC_SPECS, HARMONIC_TYPES, type HarmonicPattern, type HarmonicType } from "../harmonics";
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

const show = (p: HarmonicPattern) =>
  `${p.dir > 0 ? "bull" : "bear"} ${p.type} ${p.status} ${p.confidence}% ${p.pts.map((q) => `${q.label}${q.i}@${q.p.toFixed(2)}${q.projected ? "*" : ""}`).join(" ")} | ${p.ratios
    .map((r) => `${r.name}=${r.value.toFixed(3)}`)
    .join(" ")} | prz ${p.prz.lo.toFixed(2)}..${p.prz.hi.toFixed(2)} t1 ${p.t1.toFixed(2)} t2 ${p.t2.toFixed(2)} stop ${p.stop.toFixed(2)}`;

const O = { minConf: 0, maxShown: 10, maxAge: 1000 };

/* Bullish textbook shapes: X(20) A(40) B(55) C(68) D(85); XA = 100 -> 120 for the five-point ones. */
const X: Pt = [20, 100];
const A: Pt = [40, 120];
const IDEAL: Record<HarmonicType, { b: number; c: number; d: number; x?: number }> = {
  // b, c, d are the prices of B, C, D
  gartley: { b: 107.64, c: 115.28, d: 104.28 }, // .618 / .618 / .786 XA
  bat: { b: 111, c: 116.4, d: 102.28 }, // .45 / .6 / .886 XA
  butterfly: { b: 104.28, c: 113.71, d: 94.56 }, // .786 / .6 / 1.272 XA
  crab: { b: 107.64, c: 116.29, d: 87.64 }, // .618 / .7 / 1.618 XA
  deep_crab: { b: 102.28, c: 112.91, d: 87.64 }, // .886 / .6 / 1.618 XA
  shark: { b: 110, c: 124, d: 100 }, // .5 / 1.4 AB / 1.0 XC
  cypher: { b: 110, c: 127, d: 105.78 }, // .5 / XC 1.35 XA / .786 XC
  abcd: { b: 105, c: 114.27, d: 99.27 }, // BC .618 AB, CD = AB
};

const shape = (t: HarmonicType, after: Pt): Pt[] => {
  const s = IDEAL[t];
  // AB=CD has no X: the rally into A starts from a level no five-point pattern fits
  const lead: Pt[] = t === "abcd" ? [[0, 108.5], [20, 108]] : [[0, 116], X];
  return [...lead, A, [55, s.b], [68, s.c], [85, s.d], after];
};

for (const t of HARMONIC_TYPES) {
  const s = IDEAL[t];
  for (const flip of [false, true]) {
    const dir = flip ? -1 : 1;
    const name = `${dir > 0 ? "bullish" : "bearish"} ${t}`;
    console.log(`\n== ${name}`);
    const up: Pt = [110, s.d + 0.8 * ((t === "shark" || t === "cypher" ? s.c : 120) - s.d)];
    const pts = shape(t, up);

    // 1. the whole story: D, then the rally through both targets
    let res = detectHarmonics(path(pts, flip), O);
    for (const p of res) console.log("  " + show(p));
    let hit = res.find((p) => p.type === t && p.dir === dir);
    ok(!!hit, `${name} found`);
    if (hit) {
      const bars = t === "abcd" ? [40, 55, 68, 85] : [20, 40, 55, 68, 85];
      ok(hit.pts.every((q, k) => q.i === bars[k]), "points on the corner bars");
      ok(hit.confidence >= 85, `ideal ratios -> high confidence (${hit.confidence})`);
      ok(hit.status === "target" && hit.t1Idx > 85 && hit.t2Idx >= hit.t1Idx, `targets reached (${hit.status}, t1 at ${hit.t1Idx}, t2 at ${hit.t2Idx})`);
      const dP = flip ? 200 - s.d : s.d;
      ok(Math.abs(hit.d - dP) < 1e-6 && hit.prz.lo <= dP && hit.prz.hi >= dP, "D inside the PRZ");
      ok(dir * (hit.t1 - hit.d) > 0 && dir * (hit.t2 - hit.t1) > 0 && dir * (hit.d - hit.stop) > 0, "stop < D < T1 < T2 (in the direction of the trade)");
      const e = flip ? 200 - (t === "shark" || t === "cypher" ? s.c : 120) : t === "shark" || t === "cypher" ? s.c : 120;
      ok(Math.abs(hit.t1 - (hit.d + 0.382 * (e - hit.d))) < 1e-6 && Math.abs(hit.t2 - (hit.d + 0.618 * (e - hit.d))) < 1e-6, "targets = 0.382 / 0.618 of the reaction leg");
      const spec = t === "abcd" ? null : HARMONIC_SPECS.find((q) => q.type === t)!;
      if (spec && spec.inv === 1 && spec.base === "xa") ok(Math.abs(hit.stop - (flip ? 100 : 100)) < 1e-6, "invalidation at X");
      if (t === "cypher") ok(Math.abs(hit.stop - 100) < 1e-6, "invalidation at X");
      if (t === "butterfly") ok(Math.abs(hit.stop - (flip ? 200 - (120 - 1.618 * 20) : 120 - 1.618 * 20)) < 1e-6, "invalidation at the 1.618 XA extension");
      if (t === "crab" || t === "deep_crab") ok(Math.abs(hit.stop - (flip ? 200 - 80 : 80)) < 1e-6, "invalidation at the 2.0 XA extension");
    }
    ok(res.filter((p) => p.dir === dir && p.pts[p.pts.length - 1].i === 85).length === 1, "one reading per D");

    // 2. C -> D still running: forming, D projected into the PRZ
    res = detectHarmonics(path(pts, flip, 79), O);
    hit = res.find((p) => p.type === t && p.dir === dir);
    if (hit) console.log("  forming: " + show(hit));
    ok(!!hit && hit.status === "forming", `forming while C->D is running (${hit?.status ?? "nothing"})`);
    if (hit) {
      const d = hit.pts[hit.pts.length - 1];
      ok(!!d.projected && d.i > 78 && d.p >= hit.prz.lo - 1e-9 && d.p <= hit.prz.hi + 1e-9, "projected D ahead of the last candle, inside the PRZ");
      // a window of ratios (Shark) is projected at its near edge
      if (t !== "shark") ok(Math.abs(d.p - (flip ? 200 - s.d : s.d)) < 0.02 * 20 + 1e-6, `projected D close to the real one (${d.p.toFixed(2)})`);
    }
    ok(detectHarmonics(path(pts, flip, 79), { ...O, forming: false }).every((p) => p.status !== "forming"), "forming switched off");

    // 3. the extreme has just been printed: provisional D in the PRZ
    res = detectHarmonics(path(pts, flip, 86), O);
    hit = res.find((p) => p.type === t && p.dir === dir);
    ok(!!hit && hit.status === "prz", `provisional D inside the zone -> prz (${hit?.status ?? "nothing"})`);

    // 4. D confirmed, no target yet
    res = detectHarmonics(path(pts, flip, 91), O);
    hit = res.find((p) => p.type === t && p.dir === dir);
    ok(!!hit && (hit.status === "complete" || hit.status === "target"), `confirmed D -> complete (${hit?.status ?? "nothing"})`);

    // 5. failure: a bounce that confirms D but stops short of T1, then a slide through the invalidation level
    const bounce: Pt = [89, s.d + 0.2 * ((t === "shark" || t === "cypher" ? s.c : 120) - s.d)];
    res = detectHarmonics(path([...pts.slice(0, -1), bounce, [120, 60]], flip), O);
    hit = res.find((p) => p.type === t && p.dir === dir);
    ok(!!hit && hit.status === "failed" && hit.failIdx > 89, `invalidation -> failed (${hit?.status ?? "nothing"})`);
    ok(detectHarmonics(path([...pts.slice(0, -1), bounce, [120, 60]], flip), { ...O, showDone: false }).every((p) => p.status !== "failed" && p.status !== "target"), "finished patterns hidden");
  }
}

/* ───── minor pivots inside a leg ───── */
console.log("\n== Gartley with pullbacks inside XA and CD");
{
  const g = IDEAL.gartley;
  const pts: Pt[] = [[0, 116], X, [28, 111], [31, 106.5], A, [55, g.b], [68, g.c], [74, 110], [77, 113], [88, g.d], [110, 118]];
  const res = detectHarmonics(path(pts), O);
  for (const p of res) console.log("  " + show(p));
  const hit = res.find((p) => p.type === "gartley");
  ok(!!hit && hit.pts[0].i === 20 && hit.pts[1].i === 40 && hit.pts[4].i === 88, "X and D are the real extremes, the pullbacks are skipped");
  const clean = detectHarmonics(path(shape("gartley", [110, 118])), O).find((p) => p.type === "gartley");
  ok(!!hit && !!clean && hit.confidence < clean.confidence - 10, `swallowed pullbacks cost confidence (${hit?.confidence} vs ${clean?.confidence})`);
  ok(!detectHarmonics(path(pts), { ...O, maxSkip: 0 }).some((p) => p.type === "gartley" && p.pts[0].i === 20), "maxSkip = 0 does not skip");
}

/* ───── tolerance ───── */
console.log("\n== tolerance");
{
  // B at 0.66 XA: 6.8 % off 0.618 -> not a Gartley at 5 %, a Gartley at 10 %
  const pts: Pt[] = [[0, 116], X, A, [55, 106.8], [68, 115], [85, 104.28], [110, 118]];
  ok(!detectHarmonics(path(pts), { ...O, tol: 0.05 }).some((p) => p.type === "gartley"), "0.66 retracement rejected at 5 %");
  const hit = detectHarmonics(path(pts), { ...O, tol: 0.1 }).find((p) => p.type === "gartley");
  ok(!!hit, "accepted at 10 %");
  if (hit) ok(hit.confidence < 95, `off-ratio costs confidence (${hit.confidence})`);
}

/* ───── switches ───── */
console.log("\n== switches");
{
  const pts = shape("bat", [110, 118]);
  ok(detectHarmonics(path(pts), { ...O, bullish: false }).every((p) => p.dir < 0), "bullish off");
  ok(detectHarmonics(path(pts, true), { ...O, bearish: false }).every((p) => p.dir > 0), "bearish off");
  ok(!detectHarmonics(path(pts), { ...O, enabled: { bat: false } }).some((p) => p.type === "bat"), "type off");
  ok(detectHarmonics([], O).length === 0 && detectHarmonics(path(pts, false, 10), O).length === 0, "empty / short input");
  // the window: indexes stay those of the full array
  const long = [...path([[0, 116], [300, 116.01]]), ...path(pts)].map((k, i) => ({ ...k, t: 1_700_000_000_000 + i * 60_000 }));
  const hit = detectHarmonics(long, { ...O, window: 200 }).find((p) => p.type === "bat");
  ok(!!hit && hit.pts[0].i === 321 && hit.pts[4].i === 386, `window: indexes of the full array (${hit?.pts.map((q) => q.i).join(",") ?? "nothing"})`);
}

/* ───── random walks ───── */
console.log("\n== random walks (3000 candles x 30 seeds)");
{
  let total = 0;
  let sum = 0;
  let worst = 0;
  let strong = 0;
  const kinds: Record<string, number> = {};
  const stat: Record<string, number> = {};
  let bad = "";
  for (let seed = 1; seed <= 30; seed++) {
    const rnd = makeRng(seed * 7919);
    const cs: SwingCandle[] = [];
    let p = 100;
    for (let i = 0; i < 3000; i++) {
      const o = p;
      p = Math.max(5, p * (1 + (rnd() - 0.5) * 0.012));
      cs.push({ t: 1_700_000_000_000 + i * 60_000, o, h: Math.max(o, p) * (1 + rnd() * 0.002), l: Math.min(o, p) * (1 - rnd() * 0.002), c: p, v: 100 });
    }
    // as on a live chart: a snapshot every 150 candles
    for (let end = 600; end <= 3000; end += 150) {
      const snap = cs.slice(0, end);
      const t0 = performance.now();
      const res = detectHarmonics(snap);
      const ms = performance.now() - t0;
      sum += ms;
      worst = Math.max(worst, ms);
      total += res.length;
      if (res.length > 4) bad = `more than maxShown (${res.length})`;
      const ids = new Set(res.map((q) => q.id));
      if (ids.size !== res.length) bad = "duplicate ids";
      // a five-point pattern and an AB=CD never share the C-D leg
      for (const q of res)
        if (q.type === "abcd" && res.some((v) => v.type !== "abcd" && v.dir === q.dir && v.pts[3].i === q.pts[2].i && (v.pts[4].projected || q.pts[3].projected || v.pts[4].i === q.pts[3].i))) bad = `AB=CD next to a five-point pattern on the same C-D: ${show(q)}`;
      for (const q of res) {
        kinds[q.type] = (kinds[q.type] ?? 0) + 1;
        stat[q.status] = (stat[q.status] ?? 0) + 1;
        if (q.confidence >= 85) strong++;
        if (![q.d, q.t1, q.t2, q.stop, q.prz.lo, q.prz.hi].every(Number.isFinite)) bad = "non-finite level";
        if (!(q.prz.lo <= q.prz.hi)) bad = "inverted PRZ";
        if (!(q.dir * (q.t1 - q.d) > 0 && q.dir * (q.d - q.stop) > 0)) bad = `levels out of order: ${show(q)}`;
        if (q.pts.some((v) => !v.projected && (v.i < 0 || v.i >= end))) bad = "point outside the data";
      }
    }
  }
  const calls = 30 * 17;
  console.log(`  ${total} patterns in ${calls} snapshots (${(total / calls).toFixed(2)} per snapshot, ${strong} at >= 85 %)`);
  console.log(`  by type ${JSON.stringify(kinds)}`);
  console.log(`  by status ${JSON.stringify(stat)}`);
  console.log(`  mean ${(sum / calls).toFixed(2)} ms, worst ${worst.toFixed(2)} ms per call`);
  ok(!bad, bad || "all outputs sane");
  ok(sum / calls < 8, "fast enough for every tick");
  // random data must score low: few patterns pass the default threshold, next to none of them look "strong"
  ok(total / calls <= 0.5, `at most 0.5 patterns per snapshot (${(total / calls).toFixed(2)})`);
  ok(strong <= 0.1 * total, `at most 10 % of them at >= 85 % (${strong} of ${total})`);
  ok((kinds.abcd ?? 0) <= 0.36 * total, `AB=CD is no more than about a third of them (${kinds.abcd ?? 0} of ${total})`);
}

console.log(failed ? `\n${failed} FAILED` : "\nALL OK");
if (failed) process.exit(1);
