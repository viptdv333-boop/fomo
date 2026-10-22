/* Check of the Wolfe Wave indicator (src/lib/chart/analysis/wolfe.ts detection, indicators/wolfe-def.ts, registry / i18n wiring) on
   synthetic candles with known answers: a bullish and a bearish wave (points, lines, target), the open states (point 5 still forming,
   points 1-4 waiting for the line), finished states (complete / target hit / failed), negative cases (lines do not converge, point 5
   does not pierce the 1-3 line, point 5 far beyond the zone, point 3 not beyond point 1 = overlapping legs, a wave that is too short),
   option filters, a live bar growing candle by candle, the percent swing mode, speed on 20000 bars, the registry and the dictionaries.
   OFFLINE, pure. Run:  npx tsx scripts/check-wolfe.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import type { Candle } from "../src/lib/chart/types";
import { DEFAULT_WOLFE, detectWolfe, lineAt, type WolfePattern } from "../src/lib/chart/analysis/wolfe";
import { INDICATOR_DEFS, computeIndicator, defaultParams, getIndicatorDef, sanitizeParams } from "../src/lib/chart/indicators/registry";
import patterns2 from "../src/lib/i18n/dict/patterns2";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const near = (a: number, b: number, name: string, eps = 1e-6) => ok(Math.abs(a - b) <= eps, name, `${a} != ${b}`);

const T0 = 1_790_000_000_000;
const STEP = 3_600_000;

/** Candles through waypoints [bar, price]: close = straight line between them, every bar is `pad` taller than its close-to-close move. */
function through(way: [number, number][], pad = 0.4): Candle[] {
  const out: Candle[] = [];
  const last = way[way.length - 1][0];
  let prev = way[0][1];
  let w = 0;
  for (let i = 0; i <= last; i++) {
    while (w < way.length - 2 && i > way[w + 1][0]) w++;
    const [b0, p0] = way[w];
    const [b1, p1] = way[w + 1];
    const c = i <= b0 ? p0 : p0 + ((p1 - p0) * (i - b0)) / (b1 - b0);
    out.push({ t: T0 + STEP * i, o: prev, h: Math.max(prev, c) + pad, l: Math.min(prev, c) - pad, c, v: 1000 });
    prev = c;
  }
  return out;
}

/* Bullish wave: 1 low (bar 20, 100), 2 high (36, 120), 3 lower low (52, 92), 4 lower high (68, 108), 5 low piercing the 1-3 line (84, 80).
   1-3 line: 100 - 0.25 (bar - 20) = 84 at bar 84.  2-4 line: 120 - 0.375 (bar - 36).  Channel at point 4 = 20, 5 is 4 beyond the line.
   1->4 line: 100 + (8 / 48) (bar - 20), the target. */
const PRE: [number, number][] = [[0, 104], [20, 100]];
const BULL: [number, number][] = [...PRE, [36, 120], [52, 92], [68, 108], [84, 80]];
const REBOUND_SHORT: [number, number][] = [[98, 96]]; // rebound that confirms point 5 but stays far from the target
const REBOUND_HIT: [number, number][] = [[100, 104], [118, 125]]; // reaches the 1->4 line (113 at bar 100, 117 at bar 110...)
const mirror = (cs: Candle[]): Candle[] => cs.map((c) => ({ ...c, o: 200 - c.o, h: 200 - c.l, l: 200 - c.h, c: 200 - c.c }));

const only = (cs: Candle[], o: Partial<typeof DEFAULT_WOLFE> = {}) => detectWolfe(cs, { minConf: 0, ...o });
const bulls = (cs: Candle[], o: Partial<typeof DEFAULT_WOLFE> = {}) => only(cs, { bearish: false, ...o });
const bears = (cs: Candle[], o: Partial<typeof DEFAULT_WOLFE> = {}) => only(cs, { bullish: false, ...o });
const pick = (r: WolfePattern[], dir: 1 | -1) => r.filter((p) => p.dir === dir);

/* ───────────── bullish, finished (point 5 confirmed) ───────────── */
{
  const cs = through([...BULL, ...REBOUND_SHORT]);
  const r = pick(bulls(cs), 1);
  ok(r.length === 1, "bullish: exactly one wave found", `got ${r.length}`);
  const p = r[0];
  if (p) {
    ok(p.pts.length === 5, "bullish: five points");
    const idx = p.pts.map((q) => q.i);
    ok(idx.every((v, k) => Math.abs(v - [20, 36, 52, 68, 84][k]) <= 1), "bullish: points sit on bars 20 / 36 / 52 / 68 / 84", JSON.stringify(idx));
    ok(p.pts[0].p < 101 && p.pts[2].p < p.pts[0].p, "bullish: point 3 is beyond point 1");
    ok(p.pts[3].p < p.pts[1].p, "bullish: point 4 is below point 2");
    near(p.l13.b, -0.25, "bullish: 1-3 line slope", 0.02);
    near(p.l24.b, -0.375, "bullish: 2-4 line slope", 0.03);
    ok(p.l24.b < p.l13.b, "bullish: the lines converge");
    ok(p.pts[4].p < lineAt(p.l13, p.pts[4].i), "bullish: point 5 is below the 1-3 line (pierces it)");
    ok(p.zone > 15 && p.zone < 25, "bullish: sweet zone depth = channel width at point 4 (~20)", String(p.zone));
    near(p.l14.b, 8 / 48, "bullish: target (1->4) line slope", 0.02);
    ok(p.epa > p.pts[4].p + 20 && p.epa < 130, "bullish: EPA is above point 5", String(p.epa));
    ok(p.eta > p.pts[4].i, "bullish: ETA after point 5");
    ok(p.status === "complete", "bullish: point 5 is confirmed -> complete", p.status);
    ok(p.confidence >= 55 && p.confidence <= 100, "bullish: sensible confidence", String(p.confidence));
    ok(p.hitIdx === -1, "bullish: target not reached yet");
  }
  ok(pick(bears(cs), -1).length === 0, "bullish series: no bearish wave");
}

/* ───────────── bearish (mirror) ───────────── */
{
  const cs = mirror(through([...BULL, ...REBOUND_SHORT]));
  const r = pick(bears(cs), -1);
  ok(r.length === 1, "bearish: exactly one wave found", `got ${r.length}`);
  const p = r[0];
  if (p) {
    ok(p.pts.length === 5 && p.pts[0].p > 99 && p.pts[2].p > p.pts[0].p, "bearish: point 3 is beyond point 1 (higher)");
    ok(p.pts[4].p > lineAt(p.l13, p.pts[4].i), "bearish: point 5 is above the 1-3 line");
    ok(p.epa < p.pts[4].p - 20, "bearish: EPA is below point 5", String(p.epa));
    ok(p.l24.b > p.l13.b, "bearish: the lines converge (upper line rises slower)");
    ok(p.status === "complete", "bearish: complete", p.status);
  }
  ok(pick(bulls(cs), 1).length === 0, "bearish series: no bullish wave");
}

/* ───────────── open states ───────────── */
{
  // the series ends two bars after the low of point 5: it is still the running extreme -> live
  const live = through([...BULL.slice(0, -1), [84, 80], [86, 80.8]]);
  const r = pick(bulls(live), 1);
  ok(r.length === 1 && r[0].status === "forming", "live: point 5 still forming", r.map((x) => x.status).join(","));
  ok(!!r[0] && r[0].pts.length === 5 && !r[0].pts[4].confirmed, "live: point 5 is the unconfirmed extreme");
  // price is on the way down to the 1-3 line, has not reached it: setup (points 1-4)
  const setup = through([...PRE, [36, 120], [52, 92], [68, 108], [78, 88], [80, 87]]);
  const s = pick(bulls(setup), 1);
  ok(s.length === 1 && s[0].status === "setup" && s[0].pts.length === 4, "setup: points 1-4 only, waiting for the line", s.map((x) => x.status + ":" + x.pts.length).join(","));
  ok(!!s[0] && s[0].epa > 100, "setup: target already known");
}

/* ───────────── finished states ───────────── */
{
  const hit = through([...BULL, ...REBOUND_HIT]);
  const r = pick(bulls(hit), 1);
  ok(r.length === 1 && r[0].status === "hit" && r[0].hitIdx > 84, "target hit: price reached the 1->4 line", r.map((x) => `${x.status}@${x.hitIdx}`).join(","));
  // after point 5 price bounces a little, then falls far below the sweet zone: the wave failed
  const fail = through([...BULL, [90, 90], [100, 40], [112, 62]]);
  const f = pick(bulls(fail), 1);
  ok(f.length === 1 && f[0].status === "failed" && f[0].pts[4].i >= 83 && f[0].pts[4].i <= 85, "failed: price fell far below point 5 before reaching the target", f.map((x) => `${x.status}@${x.pts[4]?.i}`).join(","));
  const noDone = bulls(hit, { showDone: false });
  ok(pick(noDone, 1).length === 0, "showDone=false hides finished waves");
}

/* ───────────── negative cases ───────────── */
{
  const rebound = REBOUND_SHORT;
  // the lines do not converge: point 4 almost as high as point 2 (the 2-4 line is flatter than the 1-3 line)
  const flatTop = through([...PRE, [36, 120], [52, 92], [68, 119], [84, 80], ...rebound]);
  ok(pick(bulls(flatTop), 1).length === 0, "negative: lines do not converge -> no wave");
  // point 5 does not pierce the 1-3 line (84): it stops at 90
  const noPierce = through([...PRE, [36, 120], [52, 92], [68, 108], [84, 90], [98, 104]]);
  ok(pick(bulls(noPierce), 1).length === 0, "negative: point 5 does not reach the 1-3 line -> no wave");
  // point 5 far beyond the sweet zone (more than a channel width past the line)
  const tooDeep = through([...PRE, [36, 120], [52, 92], [68, 108], [84, 50], [98, 66]]);
  ok(pick(bulls(tooDeep), 1).length === 0, "negative: point 5 far beyond the zone -> no wave");
  // overlapping legs: point 3 above point 1
  const overlapping = through([...PRE, [36, 120], [52, 104], [68, 112], [84, 90], ...rebound]);
  ok(pick(bulls(overlapping), 1).length === 0, "negative: point 3 not beyond point 1 (overlapping legs) -> no wave");
  // point 4 above point 2
  const higher = through([...PRE, [36, 120], [52, 92], [68, 124], [84, 80], ...rebound]);
  ok(pick(bulls(higher), 1).length === 0, "negative: point 4 above point 2 -> no wave");
  // a wave squeezed into a few bars
  const tiny = through([[0, 104], [3, 100], [5, 120], [7, 92], [9, 108], [11, 80], [14, 96]]);
  ok(only(tiny).length === 0, "negative: too short a wave -> none");
  // one leg a giant next to the others
  const uneven = through([...PRE, [24, 120], [60, 92], [68, 108], [84, 80], ...rebound]);
  ok(pick(bulls(uneven, { maxLegRatio: 2 }), 1).length === 0, "negative: very uneven legs with a strict ratio -> none");
  // noise / flat
  const flat = through([[0, 100], [200, 100]], 0.5);
  ok(only(flat).length === 0, "negative: flat series -> none");
  ok(only([]).length === 0 && only(through([[0, 1], [10, 2]])).length === 0, "negative: too few candles -> none");
}

/* ───────────── options ───────────── */
{
  const cs = through([...BULL, ...REBOUND_SHORT]);
  ok(only(cs, { bullish: false, bearish: true }).length === 0, "options: bullish off");
  ok(only(cs, { minConf: 101 }).length === 0, "options: min confidence filters");
  ok(only(cs, { minBars: 100 }).length === 0, "options: min bars filters");
  ok(only(cs, { maxBars: 30 }).length === 0, "options: max bars filters");
  ok(Array.isArray(only(cs, { window: 60 })), "options: a small window does not crash");
  // percent mode finds the same wave
  const pct = pick(only(cs, { mode: "pct", devPct: 5 }), 1);
  ok(pct.length === 1, "options: percent swing mode finds the wave", `got ${pct.length}`);
  // a longer series: indices refer to the full array (window cuts the front)
  const longer = through([[0, 100], [200, 100]].map(([a, b]) => [a, b] as [number, number])).slice(0, 120);
  const full = longer.concat(through([...BULL, ...REBOUND_SHORT]).map((c, i) => ({ ...c, t: T0 + STEP * (120 + i) })));
  const w = pick(bulls(full, { window: 150 }), 1);
  ok(w.length === 1 && w[0].pts[0].i >= 120 + 18 && w[0].pts[0].i <= 120 + 22, "window: indices are those of the full array", w.map((x) => x.pts[0].i).join(","));
  near(lineAt(w[0].l13, w[0].pts[0].i), w[0].pts[0].p, "window: lines use full-array indices", 0.6);
}

/* ───────────── live bar: the series grows candle by candle ───────────── */
{
  const full = through([...BULL, ...REBOUND_SHORT]);
  const states: string[] = [];
  for (let n = 60; n <= full.length; n++) {
    const r = pick(bulls(full.slice(0, n)), 1);
    states.push(r.length ? r[r.length - 1].status : "-");
  }
  const seq = states.join(" ");
  ok(states[0] === "-", "live bar: nothing before the wave exists");
  ok(states.includes("setup") || states.includes("forming"), "live bar: the wave shows while it is forming", seq);
  ok(states[states.length - 1] === "complete", "live bar: ends as a finished wave", seq);
  // the same candles twice give the same answer (no hidden state)
  const a = JSON.stringify(bulls(full));
  const b = JSON.stringify(bulls(full));
  ok(a === b, "deterministic: same candles -> same result");
  // an in-place update of the last candle (live tick) does not throw and keeps the count
  const tick = full.slice();
  tick[tick.length - 1] = { ...tick[tick.length - 1], c: tick[tick.length - 1].c + 0.3, h: tick[tick.length - 1].h + 0.3 };
  ok(pick(bulls(tick), 1).length === 1, "live tick: updating the last candle keeps the wave");
}

/* ───────────── speed ───────────── */
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
  const cs: Candle[] = [];
  let p = 1000;
  for (let i = 0; i < 20000; i++) {
    const o = p;
    p = Math.max(5, p + rnd() * 6);
    cs.push({ t: T0 + STEP * i, o, h: Math.max(o, p) + Math.abs(rnd()) * 2, l: Math.min(o, p) - Math.abs(rnd()) * 2, c: p, v: 100 });
  }
  const t0 = performance.now();
  const r = detectWolfe(cs, { window: 20000, minConf: 0 });
  const dt = performance.now() - t0;
  ok(dt < 400, `speed: 20000 bars in ${dt.toFixed(0)} ms (< 400)`);
  ok(r.length <= DEFAULT_WOLFE.maxShown, "speed: the cap of shown waves holds", String(r.length));
  const t1 = performance.now();
  for (let k = 0; k < 20; k++) detectWolfe(cs.slice(0, 1500 + k), { minConf: 0 });
  const per = (performance.now() - t1) / 20;
  ok(per < 25, `speed: default window recompute ${per.toFixed(1)} ms per live tick (< 25)`);
  ok(r.every((q) => q.pts.every((x) => isFinite(x.p) && isFinite(x.i))), "random walk: all points finite");
}

/* ───────────── registry / i18n ───────────── */
{
  const def = getIndicatorDef("wolfe");
  ok(!!def, "wolfe: registered");
  if (def) {
    ok(def.category === "patterns" && def.pane === "overlay" && !!def.fixedPane, "wolfe: Patterns group, drawn on the price pane");
    ok(INDICATOR_DEFS.filter((d) => d.id === "wolfe").length === 1, "wolfe: registered once");
    ok(getIndicatorDef("patterns_auto")?.category === "patterns", "patterns auto stays in the same group");
    const ru = patterns2.ru;
    const en = patterns2.en;
    const cn = patterns2.cn;
    for (const k of ["ind.wolfe.name", "ind.wolfe.desc"]) ok(!!ru[k] && !!en[k] && !!cn[k], `${k} in ru / en / cn`);
    const missing: string[] = [];
    for (const p of def.params) {
      const k = `ind.p.${p.key}`;
      if (!ru[k] || !en[k] || !cn[k]) missing.push(k);
      if (p.type === "select") for (const o of p.options) if (o.label.startsWith("ind") && (!ru[o.label] || !en[o.label] || !cn[o.label])) missing.push(o.label);
    }
    ok(missing.length === 0, "wolfe: every parameter label and option in ru / en / cn", missing.join(", "));
    const params = defaultParams(def);
    ok(JSON.stringify(sanitizeParams(def, params)) === JSON.stringify(params), "wolfe: defaults pass sanitize unchanged");
    const cs = through([...BULL, ...REBOUND_SHORT]);
    const res = computeIndicator(def, cs, params);
    const ex = res.extra as { patterns: WolfePattern[]; prec: number };
    ok(res.plots.length === 0 && ex.patterns.length >= 1, "wolfe: compute() returns the pattern in extra", String(ex.patterns.length));
    const legend = def.legendItems?.(res, params, "ru-RU") ?? [];
    ok(legend.length >= 1 && /Вульфа/.test(legend[0].text) && /\d+%/.test(legend[0].text), "wolfe: legend item (ru)", JSON.stringify(legend));
    const legendEn = def.legendItems?.(res, params, "en-US") ?? [];
    ok(legendEn.length >= 1 && /Wolfe/.test(legendEn[0].text), "wolfe: legend item (en)");
    const legendZh = def.legendItems?.(res, params, "zh-CN") ?? [];
    ok(legendZh.length >= 1 && /沃尔夫/.test(legendZh[0].text), "wolfe: legend item (zh)");
    ok(typeof def.title(params) === "string" && def.title(params).includes("Wolfe"), "wolfe: title");
    ok((def.alertLevels?.(res) ?? []).length >= 1, "wolfe: alert levels");
    const empty = computeIndicator(def, through([[0, 100], [60, 100]], 0.5), params);
    ok((empty.extra as { patterns: WolfePattern[] }).patterns.length === 0 && (def.legendItems?.(empty, params, "en-US") ?? []).length === 1, "wolfe: nothing found -> a 'no waves' legend note");
    const tiny = computeIndicator(def, through([[0, 100], [10, 101]]), params);
    ok((tiny.extra as { patterns: WolfePattern[] }).patterns.length === 0, "wolfe: <40 candles -> nothing, no crash");
  }
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
