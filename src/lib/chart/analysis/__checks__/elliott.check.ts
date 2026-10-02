/* Sanity checks for the Elliott engine. Run: npx tsx src/lib/chart/analysis/__checks__/elliott.check.ts [--real] */
import { analyze, DEFAULT_OPTIONS, alertLevels, type ElliottOptions, type ElliottResult, type WaveCount } from "../elliott";
import type { SwingCandle } from "../swings";

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

/** Candles that walk through the given turning points; `bars[i]` bars for leg i. */
function build(points: number[], bars: number[], noise = 0.004, seed = 7): SwingCandle[] {
  const r = rng(seed);
  const out: SwingCandle[] = [];
  let t = 1_700_000_000_000;
  let prev = points[0];
  for (let leg = 0; leg < bars.length; leg++) {
    const a = points[leg];
    const b = points[leg + 1];
    for (let i = 1; i <= bars[leg]; i++) {
      const base = a + ((b - a) * i) / bars[leg];
      const c = base * (1 + (r() - 0.5) * noise * 2);
      const o = prev;
      const h = Math.max(o, c) * (1 + r() * noise);
      const l = Math.min(o, c) * (1 - r() * noise);
      out.push({ t, o, h, l, c, v: 100 });
      t += 3_600_000;
      prev = c;
    }
  }
  return out;
}

function show(title: string, res: ElliottResult) {
  console.log(`\n== ${title}`);
  for (const d of res.degrees) {
    console.log(`  [${d.degree}] pivots=${d.pivotCount} counts=${d.counts.length}`);
    for (const c of d.counts) console.log("   ", fmt(c));
    if (d.alt) console.log("    alt:", fmt(d.alt));
    if (d.live) {
      const p = d.live.proj;
      console.log(`    LIVE phase=${p.phase} mode=${p.mode} next=${p.next ? p.next.tag + "=" + p.next.price.toFixed(2) : "-"} invalid=${p.invalid ? p.invalid.price.toFixed(2) : "-"}`);
      console.log("      levels: " + p.levels.map((l) => `${l.tag}=${l.price.toFixed(2)}${l.core ? "*" : ""}`).join("  "));
    }
  }
  console.log("  alert levels:", alertLevels(res));
}
function fmt(c: WaveCount): string {
  return `${c.kind} ${c.dir > 0 ? "up" : "down"} ${c.labels.join("")} conf=${c.conf} score=${c.score} forming=${c.forming} complete=${c.complete} idx=${c.pivots.map((p) => p.i).join(",")} ${c.ratios.map((r) => r.k + "=" + r.v).join(" ")}`;
}

const opt = (o: Partial<ElliottOptions> = {}): ElliottOptions => ({ ...DEFAULT_OPTIONS, ...o });
let failed = 0;
function expect(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failed++;
}

/* (a) textbook bullish impulse + ABC */
const bull = [100, 120, 108.4, 144.4, 130.65, 150.65, 128, 140, 112];
const barsBull = [15, 8, 25, 10, 15, 14, 8, 14];
const cBull = build(bull, barsBull);
const tail = build([112, 130], [12], 0.004, 11);
const full = [...cBull, ...tail.map((k, i) => ({ ...k, t: cBull[cBull.length - 1].t + (i + 1) * 3_600_000 }))];
for (const dg of ["minor", "intermediate"] as const) {
  const res = analyze(full, opt({ degree: dg, maxCounts: 3, minConfidence: 40 }), false);
  show(`(a) bullish impulse + ABC, ${dg}`, res);
}
{
  // cut right after wave 5 completed and the first part of A: impulse must be seen 1..5 with a high score
  const cut = build(bull.slice(0, 6), barsBull.slice(0, 5)).concat(build([150.65, 128], [14], 0.004, 5).map((k, i) => ({ ...k, t: 1_700_000_000_000 + (60 + i) * 3_600_000 })));
  const res = analyze(cut, opt({ degree: "minor", maxCounts: 2, minConfidence: 40 }), false);
  show("(a2) impulse 1-5 then pullback A", res);
  const imp = res.degrees[0].counts.find((c) => c.kind === "impulse" && c.labels.length === 5);
  expect("a2: impulse 1-5 found", !!imp, imp ? `conf=${imp.conf}` : "");
  expect("a2: impulse conf >= 70", !!imp && imp.conf >= 70);
}

/* (b) bearish mirror */
const mirror = (a: number[]) => a.map((v) => 300 - v);
const cBear = build(mirror(bull), barsBull, 0.004, 3);
{
  const res = analyze(cBear.slice(0, build(mirror(bull.slice(0, 6)), barsBull.slice(0, 5)).length), opt({ degree: "minor", maxCounts: 2, minConfidence: 40 }), false);
  show("(b) bearish impulse", res);
  const imp = res.degrees[0].counts.find((c) => c.kind === "impulse" && c.labels.length === 5);
  expect("b: bearish impulse found", !!imp && imp.dir === -1, imp ? `conf=${imp.conf}` : "");
}

/* (d) live: truncated mid wave 3 */
{
  const upto = build(bull.slice(0, 3), barsBull.slice(0, 2));
  // wave 3 is 36 points; show 60% of it (to 108.4 + 21.6 = 130)
  const w3 = build([108.4, 142], [18], 0.004, 21).map((k, i) => ({ ...k, t: upto[upto.length - 1].t + (i + 1) * 3_600_000 }));
  const cut = [...upto, ...w3];
  const res = analyze(cut, opt({ degree: "minor", maxCounts: 1, minConfidence: 0 }), false);
  show("(d) live, wave 3 forming", res);
  expect("d: conf >= 55 at default threshold", (res.degrees[0].live?.count.conf ?? 0) >= 55, String(res.degrees[0].live?.count.conf));
  const live = res.degrees[0].live;
  expect("d: live count exists", !!live);
  expect("d: phase w3", live?.proj.phase === "w3", live ? live.proj.phase : "");
  const t = live?.proj.levels.find((l) => l.tag === "1.618");
  expect("d: 1.618 target = 108.4 + 1.618*20 = 140.76", !!t && Math.abs(t.price - 140.76) < 2.5, t ? t.price.toFixed(2) : "");
}

/* (c) random walks must not give high-confidence counts */
{
  let high = 0;
  let liveShown = 0;
  let maxConf = 0;
  const runs = 40;
  const hist: number[] = [];
  for (let s = 1; s <= runs; s++) {
    const r = rng(1000 + s);
    const cs: SwingCandle[] = [];
    let p = 100;
    for (let i = 0; i < 1500; i++) {
      const o = p;
      p *= 1 + (r() - 0.5) * 0.02;
      cs.push({ t: i * 3_600_000, o, h: Math.max(o, p) * (1 + r() * 0.003), l: Math.min(o, p) * (1 - r() * 0.003), c: p, v: 1 });
    }
    for (const dg of ["minor", "intermediate", "primary"] as const) {
      const res = analyze(cs, opt({ degree: dg, minConfidence: 0, maxCounts: 1 }), false);
      const live = res.degrees[0].live;
      if (live) {
        hist.push(live.count.conf);
        if (live.count.conf >= 55) liveShown++;
        if (live.count.conf >= 75) high++;
        maxConf = Math.max(maxConf, live.count.conf);
      }
    }
  }
  hist.sort((a, b) => a - b);
  const med = hist[Math.floor(hist.length / 2)] ?? 0;
  console.log(`\n== (c) random walk: ${runs * 3} runs, live counts >=55: ${liveShown}, >=75: ${high}, max=${maxConf}, median=${med}`);
  expect("c: random walk rarely >= 55 (<= 15%)", liveShown <= runs * 3 * 0.15);
  expect("c: random walk never >= 75", high === 0);
}

/* odd data must not throw */
{
  const flat: SwingCandle[] = Array.from({ length: 300 }, (_, i) => ({ t: i, o: 5, h: 5, l: 5, c: 5, v: 0 }));
  const nan: SwingCandle[] = Array.from({ length: 300 }, (_, i) => ({ t: i, o: i % 7 === 0 ? NaN : 5 + Math.sin(i / 5), h: i % 11 === 0 ? NaN : 6 + Math.sin(i / 5), l: 4 + Math.sin(i / 5), c: 5 + Math.sin(i / 5), v: 0 }));
  const tiny = full.slice(0, 7);
  let ok = true;
  for (const [name, cs] of [["flat", flat], ["nan", nan], ["tiny", tiny], ["empty", []]] as const) {
    try {
      analyze([...cs], opt({ minConfidence: 0 }), true);
    } catch (e) {
      ok = false;
      console.log("THROW", name, e);
    }
  }
  expect("odd data does not throw", ok);
}

/* performance: 20k candles */
{
  const r = rng(5);
  const cs: SwingCandle[] = [];
  let p = 100;
  for (let i = 0; i < 20000; i++) {
    const o = p;
    p *= 1 + (r() - 0.5) * 0.02;
    cs.push({ t: i * 60_000, o, h: Math.max(o, p) * 1.001, l: Math.min(o, p) * 0.999, c: p, v: 1 });
  }
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) analyze(cs, opt({ minConfidence: 0, sensitivity: 9 }), true);
  const ms = (Date.now() - t0) / 5;
  // tick updates (same pivots, last candle changes)
  const t1 = Date.now();
  for (let i = 0; i < 200; i++) {
    const last = cs[cs.length - 1];
    cs[cs.length - 1] = { ...last, c: last.c * 1.0001, h: Math.max(last.h, last.c * 1.0001) };
    analyze(cs, opt({ minConfidence: 0, sensitivity: 9 }), true);
  }
  const tick = (Date.now() - t1) / 200;
  console.log(`\n== perf 20k candles x3 degrees: full ${ms.toFixed(1)} ms, tick ${tick.toFixed(2)} ms`);
  expect("perf: < 60 ms per analysis", ms < 60);
}

/* real data: MOEX through the local /api/klines; Bybit is geo-blocked from some regions, so BTCUSDT falls back to the Binance public mirror */
async function real() {
  const base = process.env.KL_BASE ?? "http://localhost:3001";
  type Row = Record<string, number>;
  const fromRows = (arr: Row[]): SwingCandle[] => arr.map((k) => ({ t: k.timestamp, o: k.open, h: k.high, l: k.low, c: k.close, v: k.volume ?? 0 }));
  const jobs: [string, () => Promise<SwingCandle[]>][] = [
    ["SBER moex 1h", async () => fromRows(((await (await fetch(`${base}/api/klines?source=moex&ticker=SBER&interval=60&limit=1500`)).json()) as { candles: Row[] }).candles)],
    ["SBER moex D", async () => fromRows(((await (await fetch(`${base}/api/klines?source=moex&ticker=SBER&interval=D&limit=1500`)).json()) as { candles: Row[] }).candles)],
    ["BTCUSDT bybit 1h", async () => fromRows(((await (await fetch(`${base}/api/klines?source=bybit&ticker=BTCUSDT&interval=60&limit=1500`)).json()) as { candles: Row[] }).candles)],
    ["BTCUSDT binance-mirror 1h", async () => ((await (await fetch("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000")).json()) as string[][]).map((k) => ({ t: +k[0], o: +k[1], h: +k[2], l: +k[3], c: +k[4], v: +k[5] }))],
  ];
  for (const [name, load] of jobs) {
    try {
      const cs = await load();
      console.log(`
#### ${name}: ${cs.length} candles, last close ${cs[cs.length - 1]?.c}`);
      if (cs.length < 10) continue;
      for (const dg of ["minor", "intermediate", "primary"] as const) show(`${name} ${dg}`, analyze(cs, opt({ degree: dg, maxCounts: 3, showAlternate: true, minConfidence: 45 }), false));
    } catch (e) {
      console.log("real data failed", name, e instanceof Error ? e.message : e);
    }
  }
}

(async () => {
  if (process.argv.includes("--real")) await real();
  console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
})();
