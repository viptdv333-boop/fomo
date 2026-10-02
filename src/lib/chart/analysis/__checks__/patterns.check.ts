/* Run: npx tsx src/lib/chart/analysis/__checks__/patterns.check.ts  — synthetic textbook cases + random walk + robustness. */
import { detectPatterns, type DetectedPattern } from "../patterns";
import type { SwingCandle } from "../swings";
import { SCENARIOS, makeRng } from "./synth";

const OPT = { minConfidence: 50, maxShown: 12, window: 1500 };
let fails = 0;

for (const [name, sc] of Object.entries(SCENARIOS)) {
  // each family is checked in isolation first (overlapping neighbours may legitimately outrank it in the full list)
  const t0 = performance.now();
  const res = detectPatterns(sc.cs, OPT);
  const ms = performance.now() - t0;
  const hit: DetectedPattern | undefined = res.find((p) => sc.want.includes(p.type));
  const line = res.map((p) => `${p.type}/${p.status}/${p.confidence}%/b${p.bias}/T${p.target?.toFixed(1) ?? "-"}/S${p.stop?.toFixed(1) ?? "-"}`).join(" | ");
  let ok = !!hit && hit.bias === sc.bias && hit.target !== null && hit.level !== null && Math.sign(hit.target - hit.level) === sc.bias;
  if (!ok && sc.required) fails++;
  console.log(`${ok ? "PASS" : sc.required ? "FAIL" : "info"} ${name.padEnd(14)} (${ms.toFixed(1)} ms) -> ${line || "nothing"}`);
}

// forming states: cut before the breakout, a target must be projected and the status must be "forming"
for (const [name, cut] of [["double_top", 114], ["tri_asc", 131], ["hs", 118]] as const) {
  const sc = SCENARIOS[name];
  const cs = sc.cs.slice(0, cut);
  const res = detectPatterns(cs, { ...OPT, minConfidence: 35 });
  const hit = res.find((p) => sc.want.includes(p.type));
  const ok = !!hit && (hit.status === "forming" || hit.status === "breakout") && hit.target !== null;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name} while forming -> ${hit ? `${hit.type}/${hit.status}/${hit.confidence}% T${hit.target?.toFixed(1)}` : "nothing"}`);
}

// flat / short / NaN robustness
const flat: SwingCandle[] = Array.from({ length: 300 }, (_, i) => ({ t: i, o: 10, h: 10, l: 10, c: 10, v: 0 }));
const robust = (label: string, ok: boolean) => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
};
robust("flat data -> nothing", detectPatterns(flat, OPT).length === 0);
robust("short data -> nothing", detectPatterns(flat.slice(0, 20), OPT).length === 0);
robust("empty -> nothing", detectPatterns([], OPT).length === 0);
{
  const nan = SCENARIOS.double_top.cs.map((k) => ({ ...k }));
  nan[100].h = NaN;
  nan[101].c = NaN;
  nan[102].l = NaN;
  nan[103].o = Infinity;
  let ok = true;
  try {
    detectPatterns(nan, OPT);
  } catch {
    ok = false;
  }
  robust("NaN / Infinity in candles does not throw", ok);
}

// random walks must not produce high-confidence patterns
{
  const rnd = makeRng(777);
  let total = 0, hi70 = 0, hi80 = 0, snaps = 0;
  const t0 = performance.now();
  for (let w = 0; w < 12; w++) {
    const r = makeRng(777 + w * 31);
    void rnd;
    const cs: SwingCandle[] = [];
    let p = 100;
    for (let i = 0; i < 4000; i++) {
      const o = p;
      p = p * (1 + (r() - 0.5) * 0.02);
      cs.push({ t: i * 3600_000, o, h: Math.max(o, p) * (1 + r() * 0.004), l: Math.min(o, p) * (1 - r() * 0.004), c: p, v: 1000 + r() * 500 });
    }
    for (let end = 600; end <= cs.length; end += 100) {
      const res = detectPatterns(cs.slice(0, end), { minConfidence: 55, maxShown: 20, window: 500 });
      snaps++;
      total += res.length;
      hi70 += res.filter((x) => x.confidence >= 70).length;
      hi80 += res.filter((x) => x.confidence >= 80).length;
    }
  }
  const ok = hi80 <= 2 && hi70 <= 25;
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} random walk, 48000 bars in ${snaps} snapshots: >=55: ${total}, >=70: ${hi70}, >=80: ${hi80}; ${((performance.now() - t0) / snaps).toFixed(1)} ms/snapshot`);
}

// performance on 20k candles (window limits the work) and live ticks of the last bar
{
  const r = makeRng(99);
  const big: SwingCandle[] = [];
  let bp = 100;
  for (let i = 0; i < 20000; i++) {
    const o = bp;
    bp = bp * (1 + (r() - 0.5) * 0.01);
    big.push({ t: i * 60000, o, h: Math.max(o, bp) * 1.001, l: Math.min(o, bp) * 0.999, c: bp, v: 100 });
  }
  const tb = performance.now();
  detectPatterns(big, OPT);
  const full = performance.now() - tb;
  const tk = performance.now();
  for (let i = 0; i < 100; i++) {
    const last = big[big.length - 1];
    big[big.length - 1] = { ...last, c: last.c * 1.0001, h: Math.max(last.h, last.c * 1.0001) };
    detectPatterns(big, OPT);
  }
  const tick = (performance.now() - tk) / 100;
  robust(`20k candles: ${full.toFixed(1)} ms, tick update ${tick.toFixed(2)} ms (< 40 ms)`, full < 40 && tick < 40);
}

// identity stays stable while the picture grows bar by bar (no id appears and vanishes repeatedly)
{
  const cs = SCENARIOS.tri_asc.cs;
  const seen = new Map<string, number[]>();
  let prev: ReadonlySet<string> = new Set();
  for (let end = 120; end <= cs.length; end++) {
    const res = detectPatterns(cs.slice(0, end), { ...OPT, prevIds: prev });
    prev = new Set(res.map((x) => x.id));
    for (const x of res) (seen.get(x.id) ?? seen.set(x.id, []).get(x.id)!).push(end);
  }
  let flicker = 0;
  for (const ends of seen.values()) for (let i = 1; i < ends.length; i++) if (ends[i] - ends[i - 1] > 1) flicker++;
  robust(`id stability while growing: ${seen.size} ids, ${flicker} gaps`, flicker <= 2);
}

console.log(fails === 0 ? "ALL OK" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
