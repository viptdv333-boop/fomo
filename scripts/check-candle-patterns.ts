/* Check of the candlestick patterns indicator (src/lib/chart/analysis/candles.ts detection, candle-meta.ts catalogue, indicators/candles-def.ts
   schema / legend / painter, registry and dictionary wiring) on hand-built candles with known answers.
   Every one of the 39 patterns gets a positive case plus its mirror image (a bullish pattern turned upside down is the bearish twin), and
   for each: wrong or missing trend context, trend context switched off, the ATR size filter (the same shape among much bigger candles is
   noise), the checklist, the forming bar (hidden / shown faded), and "a closed bar never changes" (appending bars leaves the earlier hits as
   they were). Then the gap modes (24h body rule vs real price gap), engulfing with shadows, doji kinds, hammer vs hanging man, priority
   when several patterns end on one bar, the window cap, reliability, the SMA trend mode, speed on 20000 bars, the legend / tooltip text and
   the painter on a recording canvas.
   OFFLINE, pure. Run:  npx tsx scripts/check-candle-patterns.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import type { Candle, SeriesContext } from "../src/lib/chart/types";
import { CANDLE_BY_ID, CANDLE_DISCLAIMER, CANDLE_IDS, CANDLE_META, MAIN_IDS, type CandleId } from "../src/lib/chart/analysis/candle-meta";
import { DEFAULT_CANDLES, detectCandles, type CandleHit, type CandleOptions } from "../src/lib/chart/analysis/candles";
import { INDICATOR_DEFS, computeIndicator, defaultParams, getIndicatorDef, sanitizeParams } from "../src/lib/chart/indicators/registry";
import { candleName, enabledIds, groupKeyOf } from "../src/lib/chart/indicators/candles-def";
import patterns2 from "../src/lib/i18n/dict/patterns2";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}

const T0 = 1_790_000_000_000;
const STEP = 3_600_000;

type Bar = [number, number, number, number] | [number, number, number, number, number]; // o h l c [v]
type Kind = "down" | "up" | "flat";

/** `n` bars of the wanted drift ending at close `end`; every bar is about 2s tall (so ATR ~ 2s). */
function filler(kind: Kind, end: number, s = 1, n = 24): Candle[] {
  const out: Candle[] = [];
  const step = kind === "down" ? -1.2 * s : kind === "up" ? 1.2 * s : 0;
  let p = end - step * n;
  for (let k = 0; k < n; k++) {
    const o = p;
    const c = kind === "flat" ? o + (k % 2 === 0 ? 0.3 : -0.3) * s : o + step;
    const hi = kind === "flat" ? Math.max(o, c) + 0.85 * s : Math.max(o, c) + 0.4 * s;
    const lo = kind === "flat" ? Math.min(o, c) - 0.85 * s : Math.min(o, c) - 0.4 * s;
    out.push({ t: 0, o, h: hi, l: lo, c, v: 1000 });
    p = c;
  }
  return out;
}

interface Built {
  cs: Candle[];
  first: number;
  last: number;
}
/** filler + pattern bars (+ a tiny tail bar so that the pattern is not the forming one). */
function build(kind: Kind, base: number, bars: Bar[], o: { tail?: boolean; scale?: number } = {}): Built {
  const cs = filler(kind, base, o.scale ?? 1);
  const first = cs.length;
  for (const b of bars) cs.push({ t: 0, o: b[0], h: b[1], l: b[2], c: b[3], v: b[4] ?? 1000 });
  const last = cs.length - 1;
  if (o.tail !== false) {
    const c = cs[last].c;
    cs.push({ t: 0, o: c, h: c + 0.3, l: c - 0.3, c: c + 0.05, v: 1000 });
  }
  cs.forEach((k, i) => (k.t = T0 + STEP * i));
  return { cs, first, last };
}
const flip = (cs: Candle[]): Candle[] => cs.map((c) => ({ ...c, o: 200 - c.o, h: 200 - c.l, l: 200 - c.h, c: 200 - c.c }));
const opposite = (k: Kind): Kind => (k === "down" ? "up" : k === "up" ? "down" : "flat");

const has = (hits: CandleHit[], i: number, id: CandleId) => hits.some((h) => h.i === i && (h.id === id || h.others.includes(id)));
const only = (id: CandleId): Partial<CandleOptions> => ({ enabled: new Set([id]) });

interface Case {
  id: CandleId;
  /** The id of the upside-down twin. */
  twin: CandleId;
  kind: Kind;
  base: number;
  bars: Bar[];
}

/* Numbers (ATR of the filler is 2): a long body is >= 1.6, a pattern spans >= 1, doji body <= 8% of range, tails are 0.3 tall. */
const CASES: Case[] = [
  /* one candle */
  { id: "doji", twin: "doji", kind: "flat", base: 100, bars: [[100, 100.8, 99.6, 100.05]] },
  { id: "dragonfly", twin: "gravestone", kind: "flat", base: 100, bars: [[100, 100.1, 98, 100.05]] },
  { id: "gravestone", twin: "dragonfly", kind: "flat", base: 100, bars: [[100, 102, 99.95, 100]] },
  { id: "longlegged", twin: "longlegged", kind: "flat", base: 100, bars: [[100, 101.2, 98.8, 100.1]] },
  { id: "hammer", twin: "shooting", kind: "down", base: 100, bars: [[99.2, 100.1, 97.4, 100]] },
  { id: "invhammer", twin: "hanging", kind: "down", base: 100, bars: [[99, 101.6, 98.9, 99.8]] },
  { id: "maru_bull", twin: "maru_bear", kind: "flat", base: 100, bars: [[100, 102.05, 99.98, 102]] },
  { id: "spinning", twin: "spinning", kind: "flat", base: 100, bars: [[99.8, 101, 99, 100.2]] },
  { id: "belt_bull", twin: "belt_bear", kind: "down", base: 100, bars: [[99, 101.2, 99, 100.8]] },
  /* two candles */
  { id: "engulf_bull", twin: "engulf_bear", kind: "down", base: 100, bars: [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]] },
  { id: "harami_bull", twin: "harami_bear", kind: "down", base: 100, bars: [[100, 100.2, 97.8, 98], [98.4, 99.4, 98.2, 99.2]] },
  { id: "haramix_bull", twin: "haramix_bear", kind: "down", base: 100, bars: [[100, 100.2, 97.8, 98], [99, 99.6, 98.5, 99.05]] },
  { id: "piercing", twin: "darkcloud", kind: "down", base: 101, bars: [[101, 101.2, 98.8, 99], [98.8, 100.5, 98.6, 100.3]] },
  { id: "tweezer_bottom", twin: "tweezer_top", kind: "down", base: 100, bars: [[100, 100.1, 98.6, 99], [99, 100, 98.65, 99.8]] },
  { id: "kicker_bull", twin: "kicker_bear", kind: "down", base: 100, bars: [[100, 100.1, 97.9, 98], [100.4, 102.7, 100.3, 102.6]] },
  /* three candles */
  { id: "morning", twin: "evening", kind: "down", base: 101, bars: [[101, 101.1, 98.9, 99], [98.7, 98.85, 98.2, 98.5], [98.9, 100.5, 98.9, 100.4]] },
  { id: "morning_doji", twin: "evening_doji", kind: "down", base: 101, bars: [[101, 101.1, 98.9, 99], [98.45, 98.6, 98.3, 98.47], [98.9, 100.5, 98.8, 100.4]] },
  { id: "abandoned_bull", twin: "abandoned_bear", kind: "down", base: 101, bars: [[101, 101.1, 98.9, 99], [98.45, 98.6, 98.3, 98.47], [98.9, 100.5, 98.8, 100.4]] },
  { id: "soldiers", twin: "crows", kind: "flat", base: 100, bars: [[100, 101.7, 99.9, 101.5], [101, 102.8, 100.9, 102.6], [102.2, 103.9, 102.1, 103.7]] },
  { id: "inside_up", twin: "inside_down", kind: "down", base: 101, bars: [[101, 101.1, 98.9, 99], [99.4, 100.4, 99.3, 100.2], [100.2, 101.8, 100.1, 101.6]] },
  { id: "outside_up", twin: "outside_down", kind: "down", base: 100, bars: [[100, 100.1, 99, 99.2], [99, 100.8, 98.9, 100.6], [100.6, 102, 100.5, 101.8]] },
  /* five candles */
  {
    id: "rising3", twin: "falling3", kind: "up", base: 100,
    bars: [[100, 102.6, 99.9, 102.5], [102.4, 102.5, 101.4, 101.6], [101.6, 101.7, 100.8, 101], [101, 101.2, 100.4, 100.6], [100.7, 103.5, 100.6, 103.4]],
  },
];

/** Each case and its upside-down twin go through the same set of checks. */
interface Run {
  id: CandleId;
  kind: Kind;
  bars: Bar[];
  base: number;
  flipped: boolean;
}
const RUNS: Run[] = [];
for (const c of CASES) {
  RUNS.push({ id: c.id, kind: c.kind, bars: c.bars, base: c.base, flipped: false });
  RUNS.push({ id: c.twin, kind: opposite(c.kind), bars: c.bars, base: c.base, flipped: true });
}
// the same id may come twice (doji, longlegged, spinning are their own twins; morning_doji twin == the abandoned twin's partner): fine
const make = (r: Run, kind: Kind, o: { tail?: boolean; scale?: number } = {}): Built => {
  const b = build(r.flipped ? opposite(kind) : kind, r.base, r.bars, o);
  return r.flipped ? { ...b, cs: flip(b.cs) } : b;
};

/* ───────────── every pattern: positive, mirror, context, size, checklist, forming, no repaint ───────────── */
{
  const tolerantTrendOff = new Set<CandleId>(["hanging", "invhammer"]); // told apart from hammer / shooting star by the trend alone
  for (const r of RUNS) {
    const m = CANDLE_BY_ID[r.id];
    const tag = `${r.id}${r.flipped ? " (twin)" : ""}`;
    const b = make(r, r.kind);
    const hits = detectCandles(b.cs);
    ok(has(hits, b.last, r.id), `${tag}: found on the last candle of the pattern`, JSON.stringify(hits.filter((h) => h.i >= b.first)));
    const hit = hits.find((h) => h.i === b.last);
    if (hit && (hit.id === r.id)) ok(hit.i - hit.start + 1 === m.bars && hit.bias === m.bias, `${tag}: spans ${m.bars} candle(s), bias ${m.bias}`, JSON.stringify(hit));

    // trend context: needed -> the wrong trend and no trend kill it; not needed -> it stays
    if (m.trend !== 0) {
      ok(!has(detectCandles(make(r, opposite(r.kind === "flat" ? "down" : r.kind)).cs), b.last, r.id), `${tag}: the opposite trend before it -> not found`);
      ok(!has(detectCandles(make(r, "flat").cs), b.last, r.id), `${tag}: no trend before it -> not found`);
      if (!tolerantTrendOff.has(r.id)) ok(has(detectCandles(make(r, "flat").cs, { trend: false }), b.last, r.id), `${tag}: trend context off -> found without a trend`);
    } else {
      ok(has(detectCandles(make(r, "flat").cs, { trend: true }), b.last, r.id) || has(detectCandles(make(r, opposite(r.kind)).cs), b.last, r.id), `${tag}: needs no trend`);
    }

    // size: the same shape among much bigger candles is noise
    ok(!has(detectCandles(make(r, r.kind, { scale: 10 }).cs, { trend: false }), b.last, r.id), `${tag}: tiny against ATR -> not found`);

    // checklist
    ok(!has(detectCandles(b.cs, { enabled: new Set(CANDLE_IDS.filter((x) => x !== r.id)) }), b.last, r.id), `${tag}: switched off in the checklist -> not found`);
    ok(has(detectCandles(b.cs, only(r.id)), b.last, r.id), `${tag}: alone in the checklist -> found`);

    // forming bar
    const f = make(r, r.kind, { tail: false });
    ok(!detectCandles(f.cs).some((h) => h.i === f.last), `${tag}: last bar is the forming one -> hidden by default`);
    const fh = detectCandles(f.cs, { forming: true }).find((h) => h.i === f.last);
    ok(!!fh && fh.forming === true && has([fh], f.last, r.id), `${tag}: forming option -> shown, marked forming`);
    ok(detectCandles(b.cs, { forming: true }).every((h) => h.i !== b.cs.length - 1 || h.forming), `${tag}: only the last bar is ever marked forming`);

    // a closed bar never changes when bars are appended
    const ext = b.cs.slice();
    let seed = 11 + r.id.length;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) - 0.5;
    let pv = ext[ext.length - 1].c;
    for (let k = 0; k < 40; k++) {
      const o = pv;
      pv += rnd() * 4;
      ext.push({ t: 0, o, h: Math.max(o, pv) + Math.abs(rnd()), l: Math.min(o, pv) - Math.abs(rnd()), c: pv, v: 1000 });
    }
    const lastClosed = b.cs.length - 2;
    const a1 = JSON.stringify(detectCandles(b.cs, { window: 100000 }).filter((h) => h.i <= lastClosed));
    const a2 = JSON.stringify(detectCandles(ext, { window: 100000 }).filter((h) => h.i <= lastClosed));
    ok(a1 === a2, `${tag}: no repaint of closed bars when later bars arrive`);
  }
  // each id of the catalogue is covered by a case or its twin
  const covered = new Set(RUNS.map((r) => r.id));
  const missing = CANDLE_IDS.filter((id) => !covered.has(id));
  ok(missing.length === 0, "catalogue: every pattern has a test case", missing.join(", "));
  ok(CANDLE_IDS.length === 39 && new Set(CANDLE_IDS).size === 39, "catalogue: 39 distinct patterns", String(CANDLE_IDS.length));
}

/* ───────────── doji kinds and look-alikes ───────────── */
{
  const flat = (bars: Bar[]) => build("flat", 100, bars);
  const idAt = (b: Built, o?: Partial<CandleOptions>) => detectCandles(b.cs, o).find((h) => h.i === b.last)?.id;
  ok(idAt(flat([[100, 100.8, 99.6, 100.05]])) === "doji", "doji: standard");
  ok(idAt(flat([[100, 100.1, 98, 100.05]])) === "dragonfly", "doji: long lower shadow, no upper -> dragonfly");
  ok(idAt(flat([[100, 102, 99.95, 100]])) === "gravestone", "doji: long upper shadow, no lower -> gravestone");
  ok(idAt(flat([[100, 101.2, 98.8, 100.1]])) === "longlegged", "doji: both shadows long and tall -> long-legged");
  ok(idAt(flat([[100, 100.6, 99.4, 100.05]])) === "doji", "doji: both shadows long but a short candle -> plain doji");
  ok(idAt(flat([[99.8, 101, 99, 100.2]])) === "spinning", "body 20% of the range -> spinning top, not a doji");
  ok(idAt(flat([[99.0, 100.2, 98.8, 99.3]])) === undefined || idAt(flat([[99.0, 100.2, 98.8, 99.3]])) !== "doji", "a body of 21% is not a doji");
  ok(detectCandles(flat([[100, 100, 100, 100]]).cs).every((h) => h.i !== flat([[100, 100, 100, 100]]).last), "four equal prices (no range) -> nothing, no crash");
  ok(idAt(flat([[100, 100.8, 99.6, 100.05]]), { dojiBody: 0.02 }) !== "doji", "doji body threshold is a parameter");
}

/* ───────────── hammer vs hanging man, inverted hammer vs shooting star ───────────── */
{
  const HAM: Bar = [99.2, 100.1, 97.4, 100];
  const down = build("down", 100, [HAM]);
  const up = build("up", 100, [HAM]);
  const flatB = build("flat", 100, [HAM]);
  ok(detectCandles(down.cs).find((h) => h.i === down.last)?.id === "hammer", "hammer: after a decline");
  ok(detectCandles(up.cs).find((h) => h.i === up.last)?.id === "hanging", "same shape after a rise -> hanging man");
  ok(!detectCandles(flatB.cs).some((h) => h.i === flatB.last), "same shape with no trend -> nothing (trend context on)");
  ok(detectCandles(flatB.cs, { trend: false }).find((h) => h.i === flatB.last)?.id === "hammer", "trend context off -> the bullish name only");
  ok(!detectCandles(up.cs, { trend: false }).some((h) => h.i === up.last && h.id === "hanging"), "trend context off -> no hanging man");
  const weak = build("down", 100, [[99.2, 100.1, 98.1, 100]]); // lower shadow 1.1 < 2 bodies
  ok(!detectCandles(weak.cs).some((h) => h.i === weak.last), "hammer: lower shadow shorter than 2 bodies -> not a hammer");
  ok(detectCandles(weak.cs, { hammerRatio: 1 }).some((h) => h.i === weak.last && h.id === "hammer"), "hammer: the shadow/body ratio is a parameter");
  const upperShadow = build("down", 100, [[99.2, 100.8, 97.4, 100]]); // 0.8 upper = 25% of range
  ok(!has(detectCandles(upperShadow.cs), upperShadow.last, "hammer"), "hammer: noticeable upper shadow -> not a hammer");
  const INV: Bar = [99, 101.6, 98.9, 99.8];
  ok(detectCandles(build("up", 100, [INV]).cs).find((h) => h.i === build("up", 100, [INV]).last)?.id === "shooting", "shooting star: after a rise");
  const invD = build("down", 100, [INV]);
  ok(detectCandles(invD.cs).find((h) => h.i === invD.last)?.id === "invhammer", "inverted hammer: the same shape after a decline");
  const invF = build("flat", 100, [INV]);
  ok(detectCandles(invF.cs, { trend: false }).find((h) => h.i === invF.last)?.id === "shooting", "trend context off -> the bearish name only (shooting star)");
}

/* ───────────── trend measure ───────────── */
{
  const HAM: Bar = [99.2, 100.1, 97.4, 100];
  const down = build("down", 100, [HAM]);
  const up = build("up", 100, [HAM]);
  ok(has(detectCandles(down.cs, { trendMode: "sma" }), down.last, "hammer"), "SMA trend mode: close under SMA -> down");
  ok(!has(detectCandles(up.cs, { trendMode: "sma" }), up.last, "hammer"), "SMA trend mode: close over SMA -> not down");
  const slow = build("down", 100, [HAM], {});
  ok(!has(detectCandles(slow.cs, { trendAtr: 20 }), slow.last, "hammer"), "slope trend needs at least trendAtr x ATR of move");
  ok(has(detectCandles(slow.cs, { trendLen: 4, trendAtr: 1 }), slow.last, "hammer"), "trend length is a parameter");
  const short = build("down", 100, [HAM]);
  ok(!has(detectCandles(short.cs.slice(short.cs.length - 5)), 3, "hammer"), "too little history for the trend -> not claimed");
}

/* ───────────── gaps: 24h body rule vs real price gap ───────────── */
{
  // crypto style: every bar opens where the previous closed
  const crypto = build("down", 101, [[101, 101.1, 98.9, 99], [99, 99.1, 98.5, 98.8], [98.8, 100.5, 98.7, 100.4]]);
  ok(has(detectCandles(crypto.cs), crypto.last, "morning"), "morning star without gaps: found with the body-beyond-body rule (24h market)");
  ok(!has(detectCandles(crypto.cs, { gaps: "price" }), crypto.last, "morning"), "morning star without gaps: not found when a real price gap is required");
  const gapped = build("down", 101, [[101, 101.1, 98.9, 99], [98.7, 98.85, 98.2, 98.5], [98.9, 100.5, 98.9, 100.4]]);
  ok(has(detectCandles(gapped.cs, { gaps: "price" }), gapped.last, "morning") && has(detectCandles(gapped.cs), gapped.last, "morning"), "morning star with real gaps: found in both modes");
  const overlapping = build("down", 101, [[101, 101.1, 98.9, 99], [99.6, 99.8, 99.2, 99.3], [99.3, 100.7, 99.2, 100.6]]); // star body inside the first body
  ok(!has(detectCandles(overlapping.cs), overlapping.last, "morning"), "morning star: star body overlapping the first body too much -> not found");
  ok(has(detectCandles(overlapping.cs, { overlap: 1 }), overlapping.last, "morning"), "morning star: the allowed overlap is a parameter");
  // kicker: needs an opening gap, rare on 24h markets
  const kick = build("down", 100, [[100, 100.1, 97.9, 98], [98, 100.2, 97.9, 100.1]]);
  ok(!has(detectCandles(kick.cs), kick.last, "kicker_bull"), "kicker: a bar opening where the last closed (no gap) is not a kicker");
  const kickGap = build("down", 100, [[100, 100.1, 97.9, 98], [100.4, 102.7, 100.3, 102.6]]);
  ok(has(detectCandles(kickGap.cs), kickGap.last, "kicker_bull") && has(detectCandles(kickGap.cs, { gaps: "price" }), kickGap.last, "kicker_bull"), "kicker: a gap above the previous open -> found in both modes");
  const kickBody = build("down", 100, [[100, 100.1, 97.9, 98], [99.95, 102.5, 99.9, 102.4]]); // body gap only: opens at the old open, the ranges overlap
  ok(has(detectCandles(kickBody.cs), kickBody.last, "kicker_bull") && !has(detectCandles(kickBody.cs, { gaps: "price" }), kickBody.last, "kicker_bull"), "kicker: opens at the old open -> body rule yes, real gap no");
  // abandoned baby: shadows gap in price mode
  const ab = build("down", 101, [[101, 101.1, 98.9, 99], [98.45, 98.6, 98.3, 98.47], [98.9, 100.5, 98.8, 100.4]]);
  ok(has(detectCandles(ab.cs, { gaps: "price" }), ab.last, "abandoned_bull"), "abandoned baby: doji gapped on both sides (shadows) -> found in price mode");
  const abCrypto = build("down", 101, [[101, 101.1, 98.9, 99], [99, 99.2, 98.8, 99.01], [99, 100.7, 98.9, 100.6]]);
  ok(!has(detectCandles(abCrypto.cs, { gaps: "price" }), abCrypto.last, "abandoned_bull"), "abandoned baby: no shadow gap -> not found in price mode");
  ok(has(detectCandles(abCrypto.cs), abCrypto.last, "morning_doji"), "…but it is a doji star in a 24h market");
  // piercing: opening below the previous low in price mode
  const pierceEq = build("down", 101, [[101, 101.2, 98.8, 99], [98.8, 100.5, 98.6, 100.3]]);
  const pierceBelow = build("down", 101, [[101, 101.2, 98.8, 99], [98.5, 100.5, 98.4, 100.3]]);
  ok(has(detectCandles(pierceEq.cs), pierceEq.last, "piercing") && !has(detectCandles(pierceEq.cs, { gaps: "price" }), pierceEq.last, "piercing"), "piercing: opening at the low -> body rule yes, price gap no");
  ok(has(detectCandles(pierceBelow.cs, { gaps: "price" }), pierceBelow.last, "piercing"), "piercing: opening under the previous low -> found in price mode");
  const notDeep = build("down", 101, [[101, 101.2, 98.8, 99], [98.8, 100.2, 98.6, 99.8]]); // closes under the middle (100)
  ok(!has(detectCandles(notDeep.cs), notDeep.last, "piercing"), "piercing: closing under the middle of the first body -> not found");
  const engulfing = build("down", 101, [[101, 101.2, 98.8, 99], [98.8, 101.8, 98.6, 101.6]]);
  ok(!has(detectCandles(engulfing.cs), engulfing.last, "piercing") && has(detectCandles(engulfing.cs), engulfing.last, "engulf_bull"), "piercing: closing over the old open is an engulfing, not a piercing");
}

/* ───────────── engulfing / harami / tweezers / soldiers / methods: negatives ───────────── */
{
  const notEng = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.3, 98.7, 99.9]]); // top 99.9 < 100
  ok(!has(detectCandles(notEng.cs), notEng.last, "engulf_bull"), "engulfing: the body does not cover the previous body -> not found");
  const eng = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
  ok(has(detectCandles(eng.cs, { engulfFull: true }), eng.last, "engulf_bull"), "engulfing with shadows: covered -> found");
  const narrowShadow = build("down", 100, [[100, 100.9, 98.8, 99], [98.9, 100.8, 98.9, 100.6]]); // previous high 100.9 > 100.8
  ok(has(detectCandles(narrowShadow.cs), narrowShadow.last, "engulf_bull") && !has(detectCandles(narrowShadow.cs, { engulfFull: true }), narrowShadow.last, "engulf_bull"), "engulfing: body covered but a shadow sticks out -> only without the shadows rule");
  const sameColour = build("down", 100, [[99, 100.2, 98.8, 100], [98.9, 101.8, 98.7, 101.6]]); // both bullish
  ok(!has(detectCandles(sameColour.cs), sameColour.last, "engulf_bull"), "engulfing: same colours -> not found");
  const dojiEngulfed = build("down", 100, [[100, 100.5, 99.5, 100.02], [99.9, 101.8, 99.8, 101.6]]);
  ok(!has(detectCandles(dojiEngulfed.cs), dojiEngulfed.last, "engulf_bull"), "engulfing: a doji being engulfed is no engulfing");

  const big = build("down", 100, [[100, 100.2, 97.8, 98], [98.4, 99.9, 98.2, 99.8]]); // inner body 1.4 > 50% of 2
  ok(!has(detectCandles(big.cs), big.last, "harami_bull"), "harami: inner body bigger than half of the outer -> not found");
  ok(has(detectCandles(big.cs, { haramiRatio: 0.8 }), big.last, "harami_bull"), "harami: the ratio is a parameter");
  const sticksOut = build("down", 100, [[100, 100.2, 97.8, 98], [98.4, 100.4, 98.2, 100.2]]); // top above the outer open
  ok(!has(detectCandles(sticksOut.cs), sticksOut.last, "harami_bull"), "harami: inner body sticks out -> not found");
  const smallOuter = build("down", 100, [[100, 100.2, 99.0, 99.2], [99.3, 99.9, 99.25, 99.8]]);
  ok(!has(detectCandles(smallOuter.cs), smallOuter.last, "harami_bull"), "harami: the outer candle is not long -> not found");
  const cross = build("down", 100, [[100, 100.2, 97.8, 98], [99, 99.6, 98.5, 99.05]]);
  ok(!has(detectCandles(cross.cs), cross.last, "harami_bull") && has(detectCandles(cross.cs), cross.last, "haramix_bull"), "harami cross is its own pattern, not a plain harami");

  const tw = build("down", 100, [[100, 100.1, 98.6, 99], [99, 100, 99.6, 99.8]]);
  ok(!has(detectCandles(tw.cs), tw.last, "tweezer_bottom"), "tweezer bottom: the lows differ -> not found");
  const tw2 = build("down", 100, [[100, 100.1, 98.6, 99], [99, 100, 98.65, 99.8]]);
  ok(has(detectCandles(tw2.cs), tw2.last, "tweezer_bottom") && !has(detectCandles(tw2.cs, { tweezerTol: 0.01 }), tw2.last, "tweezer_bottom"), "tweezer: the equality tolerance is a parameter");

  const gapS = build("flat", 100, [[100, 101.7, 99.9, 101.5], [101.8, 103.2, 101.7, 103.1], [103, 104.6, 102.9, 104.5]]); // 2nd opens above the 1st body
  ok(!has(detectCandles(gapS.cs), gapS.last, "soldiers"), "three soldiers: the 2nd opens above the 1st body -> not found");
  const wickS = build("flat", 100, [[100, 101.7, 99.9, 101.5], [101, 103.9, 100.9, 102.6], [102.2, 103.9, 102.1, 103.7]]); // long upper shadow on the 2nd
  ok(!has(detectCandles(wickS.cs), wickS.last, "soldiers"), "three soldiers: a long upper shadow -> not found");
  const dojiS = build("flat", 100, [[100, 101.7, 99.9, 101.5], [101, 101.4, 100.6, 101.1], [101, 103.9, 100.9, 103.7]]);
  ok(!has(detectCandles(dojiS.cs), dojiS.last, "soldiers"), "three soldiers: a small middle candle -> not found");

  const brk = build("up", 100, [[100, 102.6, 99.9, 102.5], [102.4, 102.5, 101.4, 101.6], [101.6, 101.7, 99.2, 101], [101, 101.2, 100.4, 100.6], [100.7, 103.5, 100.6, 103.4]]); // 3rd goes under the first low
  ok(!has(detectCandles(brk.cs), brk.last, "rising3"), "rising three methods: a middle candle leaves the range of the first -> not found");
  const noBreak = build("up", 100, [[100, 102.6, 99.9, 102.5], [102.4, 102.5, 101.4, 101.6], [101.6, 101.7, 100.8, 101], [101, 101.2, 100.4, 100.6], [100.7, 102.4, 100.6, 102.3]]); // last closes under the first close
  ok(!has(detectCandles(noBreak.cs), noBreak.last, "rising3"), "rising three methods: the last candle must close above the first close");

  const noConfirm = build("down", 101, [[101, 101.1, 98.9, 99], [99.4, 100.4, 99.3, 100.2], [100.2, 100.9, 99.9, 100.6]]); // closes under the first open
  ok(!has(detectCandles(noConfirm.cs), noConfirm.last, "inside_up"), "three inside up: the 3rd must close above the 1st open");
  const noOut = build("down", 100, [[100, 100.1, 99, 99.2], [99, 100.8, 98.9, 100.6], [100.6, 100.7, 99.9, 100.1]]);
  ok(!has(detectCandles(noOut.cs), noOut.last, "outside_up"), "three outside up: the 3rd must close above the 2nd");
  const longStar = build("down", 101, [[101, 101.1, 98.9, 99], [98.7, 99.4, 97.2, 97.4], [97.5, 100.5, 97.4, 100.4]]); // the 'star' has a body 1.3 > 35% of 2
  ok(!has(detectCandles(longStar.cs), longStar.last, "morning"), "morning star: the middle body is not small -> not found");
  const weakClose = build("down", 101, [[101, 101.1, 98.9, 99], [98.7, 98.85, 98.2, 98.5], [98.6, 99.7, 98.55, 99.6]]); // closes under the middle 100
  ok(!has(detectCandles(weakClose.cs), weakClose.last, "morning"), "morning star: the 3rd must close above the middle of the 1st");
}

/* ───────────── priority / overlap when several patterns end on one bar ───────────── */
{
  const b = build("down", 100, [[100, 100.1, 99, 99.2], [99.1, 101.35, 99.05, 101.3]]);
  const hs = detectCandles(b.cs);
  const h = hs.find((x) => x.i === b.last);
  ok(!!h && h.id === "engulf_bull" && h.others.includes("maru_bull"), "priority: engulfing beats the marubozu it contains, the marubozu is listed as +1", JSON.stringify(h));
  ok(hs.filter((x) => x.i === b.last).length === 1, "priority: one hit per bar");
  const off = detectCandles(b.cs, { enabled: new Set(CANDLE_IDS.filter((x) => x !== "engulf_bull")) }).find((x) => x.i === b.last);
  ok(off?.id === "tweezer_bottom" && off.others.includes("maru_bull"), "priority: with the engulfing off the next strongest (tweezer bottom: equal lows) is shown", JSON.stringify(off));
  const off2 = detectCandles(b.cs, { enabled: new Set(CANDLE_IDS.filter((x) => x !== "engulf_bull" && x !== "tweezer_bottom")) }).find((x) => x.i === b.last);
  ok(off2?.id === "maru_bull" && off2.others.length === 0, "priority: …and with that off too, the marubozu");
  // priorities are a strict order inside a group and the catalogue is sane
  ok(CANDLE_META.every((m) => m.prio > 0 && m.prio <= 100), "priority: every pattern has one (1-100)");
  ok(CANDLE_BY_ID.abandoned_bull.prio > CANDLE_BY_ID.morning_doji.prio && CANDLE_BY_ID.morning_doji.prio > CANDLE_BY_ID.morning.prio && CANDLE_BY_ID.morning.prio > CANDLE_BY_ID.engulf_bull.prio && CANDLE_BY_ID.engulf_bull.prio > CANDLE_BY_ID.hammer.prio && CANDLE_BY_ID.hammer.prio > CANDLE_BY_ID.doji.prio, "priority: abandoned > doji star > star > engulfing > hammer > doji");
  const h3 = detectCandles(build("down", 101, [[101, 101.1, 98.9, 99], [98.45, 98.6, 98.3, 98.47], [98.9, 100.5, 98.8, 100.4]]).cs);
  const p3 = h3[h3.length - 1];
  ok(p3.id === "abandoned_bull" && p3.others.includes("morning_doji"), "priority: abandoned baby wins over its own doji star", JSON.stringify(p3));
}

/* ───────────── window, reliability ───────────── */
{
  const eng = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
  const pad = filler("flat", eng.cs[0].o, 1, 600);
  const long = [...pad, ...eng.cs].map((c, i) => ({ ...c, t: T0 + STEP * i }));
  const lastIdx = long.length - 2;
  ok(has(detectCandles(long, { window: 100 }), lastIdx, "engulf_bull"), "window: a pattern inside the window is found");
  const far = [...eng.cs, ...filler("flat", eng.cs[eng.cs.length - 1].c, 1, 600)].map((c, i) => ({ ...c, t: T0 + STEP * i }));
  ok(!detectCandles(far, { window: 100 }).some((h) => h.i <= eng.last), "window: a pattern older than the window is not scanned");
  ok(detectCandles(far, { window: 100000 }).some((h) => h.i === eng.last), "window: …but it is there with a big window");
  ok(detectCandles(far, { window: 100 }).every((h) => h.i >= far.length - 100), "window: no marker outside it");

  const quiet = build("down", 100, [[100, 100.2, 98.8, 99, 1000], [98.9, 100.8, 98.7, 100.6, 1000]]);
  const loud = build("down", 100, [[100, 100.2, 98.8, 99, 3000], [98.9, 100.8, 98.7, 100.6, 3000]]);
  const sq = detectCandles(quiet.cs).find((h) => h.i === quiet.last)?.strength ?? -1;
  const sl = detectCandles(loud.cs).find((h) => h.i === loud.last)?.strength ?? -1;
  ok(sq >= 0 && sq <= 100 && sl >= 0 && sl <= 100, "reliability: within 0-100", `${sq} ${sl}`);
  ok(sl > sq, "reliability: higher volume -> higher reliability", `${sq} -> ${sl}`);
  const nov = build("down", 100, [[100, 100.2, 98.8, 99, 0], [98.9, 100.8, 98.7, 100.6, 0]]);
  ok((detectCandles(nov.cs).find((h) => h.i === nov.last)?.strength ?? -1) >= 0, "reliability: no volume data -> neutral, no crash");
  const atLow = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
  const filtered = detectCandles(atLow.cs, { minStrength: 101 });
  ok(filtered.length === 0, "reliability: the minimum filters hits out");
  ok(detectCandles(atLow.cs, { minStrength: 50 }).every((h) => h.strength >= 50), "reliability: every shown hit passes the minimum");
  const high = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
  const mid = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
  // the same engulfing in the middle of a range (not at a low) scores lower: put a deeper low before it
  for (let k = 0; k < 6; k++) mid.cs[mid.first - 10 + k] = { ...mid.cs[mid.first - 10 + k], l: 70, h: 72, o: 71, c: 71.5 };
  const sh = detectCandles(high.cs).find((h) => h.i === high.last)?.strength ?? 0;
  const sm = detectCandles(mid.cs).find((h) => h.i === mid.last)?.strength ?? 0;
  ok(sh >= sm, "reliability: at the recent low scores at least as much as away from it", `${sh} vs ${sm}`);
}

/* ───────────── odd data ───────────── */
{
  ok(detectCandles([]).length === 0 && detectCandles(filler("down", 100, 1, 2)).length === 0, "empty / 2 candles -> nothing");
  const flatLine: Candle[] = Array.from({ length: 60 }, (_, i) => ({ t: T0 + STEP * i, o: 5, h: 5, l: 5, c: 5, v: 0 }));
  ok(detectCandles(flatLine).length === 0, "a motionless price -> nothing, no crash");
  const bad: Candle[] = filler("down", 100, 1, 40);
  bad[30] = { t: 0, o: 100, h: 99, l: 101, c: 100, v: -5 }; // high under low, negative volume
  let threw = false;
  try {
    detectCandles(bad, { forming: true, window: 100000 });
  } catch {
    threw = true;
  }
  ok(!threw, "inconsistent high / low and negative volume -> no crash");
  const withNaN = filler("down", 100, 1, 40);
  withNaN[20] = { ...withNaN[20], c: NaN };
  threw = false;
  try {
    const r = detectCandles(withNaN, { window: 100000 });
    ok(r.every((h) => Number.isFinite(h.strength)), "a NaN close does not poison the strength");
  } catch {
    threw = true;
  }
  ok(!threw, "a NaN close -> no crash");
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
    cs.push({ t: T0 + STEP * i, o, h: Math.max(o, p) + Math.abs(rnd()) * 2, l: Math.min(o, p) - Math.abs(rnd()) * 2, c: p, v: 100 + Math.abs(rnd()) * 100 });
  }
  detectCandles(cs, { enabled: null, window: 20000 }); // warm up
  const t0 = performance.now();
  const hits = detectCandles(cs, { enabled: null, window: 20000 });
  const dt = performance.now() - t0;
  ok(dt < 40, `speed: 20000 bars, all 39 patterns: ${dt.toFixed(1)} ms (< 40), ${hits.length} hits`);
  const t1 = performance.now();
  for (let k = 0; k < 50; k++) detectCandles(cs.slice(0, 19000 + k), { enabled: null });
  const per = (performance.now() - t1) / 50;
  ok(per < 15, `speed: default window recompute on 19000 bars: ${per.toFixed(2)} ms per live tick (< 15)`);
  ok(hits.every((h) => h.strength >= 0 && h.strength <= 100 && h.i >= 1 && h.i < cs.length - 1), "random walk: hits are sane (strength, never the forming bar)");
  ok(hits.every((h, k) => k === 0 || hits[k - 1].i < h.i), "random walk: hits are sorted, one per bar");
  const kinds = new Set(hits.map((h) => h.id));
  ok(kinds.size >= 15, `random walk: many different patterns show up (${kinds.size})`);
}

/* ───────────── registry / dictionaries / legend / painter ───────────── */
{
  const def = getIndicatorDef("candle_patterns");
  ok(!!def, "candle_patterns: registered");
  if (def) {
    ok(def.category === "patterns" && def.pane === "overlay" && !!def.fixedPane, "candle_patterns: Patterns group, drawn on the price pane");
    ok(INDICATOR_DEFS.filter((d) => d.id === "candle_patterns").length === 1, "candle_patterns: registered once");
    ok(getIndicatorDef("wolfe")?.category === "patterns" && getIndicatorDef("patterns_auto")?.category === "patterns", "chart patterns and Wolfe stay in the same group");
    const ru = patterns2.ru;
    const en = patterns2.en;
    const cn = patterns2.cn;
    for (const k of ["ind.candle_patterns.name", "ind.candle_patterns.desc"]) ok(!!ru[k] && !!en[k] && !!cn[k], `${k} in ru / en / cn`);
    const missing: string[] = [];
    for (const p of def.params) {
      const k = `ind.p.${p.key}`;
      if (!ru[k] || !en[k] || !cn[k]) missing.push(k);
      if (p.type === "select") for (const o of p.options) if (o.label.startsWith("ind") && (!ru[o.label] || !en[o.label] || !cn[o.label])) missing.push(o.label);
    }
    for (const g of new Set(Object.values(def.paramGroup ?? {}))) if (!ru[g] || !en[g] || !cn[g]) missing.push(g);
    ok(missing.length === 0, "candle_patterns: every parameter label, option and group heading in ru / en / cn", missing.join(", "));
    ok(CANDLE_META.every((m) => m.name.every(Boolean) && m.short.every(Boolean) && m.desc.every(Boolean)), "catalogue: names, short labels and meanings in ru / en / cn for every pattern");
    ok(CANDLE_DISCLAIMER.every((x) => x.length > 20), "catalogue: the 'not a guarantee' note in ru / en / cn");
    ok(def.params.filter((p) => p.key.startsWith("cp_")).length === 39, "candle_patterns: one checkbox per pattern");
    ok(CANDLE_META.every((m) => !!ru[groupKeyOf(m.bars, m.bias)]), "candle_patterns: a heading for every (candles, bias) group of the checklist");

    const params = defaultParams(def);
    ok(JSON.stringify(sanitizeParams(def, params)) === JSON.stringify(params), "candle_patterns: defaults pass sanitize unchanged");
    ok(JSON.stringify(enabledIds(params).sort()) === JSON.stringify([...MAIN_IDS].sort()), "defaults: the checklist is the «Main» set");
    ok(MAIN_IDS.every((id) => ["engulf_bull", "engulf_bear", "hammer", "shooting", "morning", "evening", "doji"].includes(id)) && MAIN_IDS.length === 7, "«Main» preset = engulfing x2, hammer, shooting star, morning / evening star, doji");
    ok(enabledIds({ ...params, cpPreset: "all" }).length === 39, "preset «All» -> 39 patterns");
    ok(JSON.stringify(enabledIds({ ...params, cpPreset: "main", cp_doji: false, cp_kicker_bull: true }).sort()) === JSON.stringify([...MAIN_IDS].sort()), "preset «Main» ignores the checklist");
    ok(JSON.stringify(enabledIds({ ...params, cp_doji: false, cp_kicker_bull: true }).sort()) === JSON.stringify([...MAIN_IDS.filter((x) => x !== "doji"), "kicker_bull"].sort()), "preset «list» follows the checklist");
    ok(params.cpForming === false && params.cpTrend === true && params.cpGaps === "body" && params.cpWindow === 500 && params.cpLabels === "short", "defaults: confirmed bars only, trend on, 24h gap rule, window 500, short labels");
    ok(def.title(params) === "Candles 7", "title", def.title(params));

    // compute: a known engulfing in the default set is found; one outside the default set is not until it is ticked
    const eng = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]]);
    const res = computeIndicator(def, eng.cs, params);
    const ex = res.extra as { hits: CandleHit[] };
    ok(res.plots.length === 0 && ex.hits.some((h) => h.i === eng.last && h.id === "engulf_bull"), "compute(): the engulfing is in extra", JSON.stringify(ex.hits));
    const harami = build("down", 100, [[100, 100.2, 97.8, 98], [98.4, 99.4, 98.2, 99.2]]);
    ok(!(computeIndicator(def, harami.cs, params).extra as { hits: CandleHit[] }).hits.some((h) => h.id === "harami_bull"), "compute(): a pattern that is not ticked is not looked for");
    ok((computeIndicator(def, harami.cs, { ...params, cp_harami_bull: true }).extra as { hits: CandleHit[] }).hits.some((h) => h.id === "harami_bull"), "compute(): …and found once ticked");
    ok(has((computeIndicator(def, harami.cs, { ...params, cpPreset: "all" }).extra as { hits: CandleHit[] }).hits, harami.last, "harami_bull"), "compute(): …or with the preset All");
    ok(!(computeIndicator(def, eng.cs, { ...params, cpTrend: true }).extra as { hits: CandleHit[] }).hits.some((h) => h.id === "engulf_bear"), "compute(): no bearish twin");
    const tiny = computeIndicator(def, eng.cs.slice(0, 2), params);
    ok((tiny.extra as { hits: CandleHit[] }).hits.length === 0, "compute(): <3 candles -> nothing, no crash");
    const live = build("down", 100, [[100, 100.2, 98.8, 99], [98.9, 100.8, 98.7, 100.6]], { tail: false });
    ok(!(computeIndicator(def, live.cs, params).extra as { hits: CandleHit[] }).hits.some((h) => h.i === live.last), "compute(): the forming bar is skipped by default");
    ok((computeIndicator(def, live.cs, { ...params, cpForming: true }).extra as { hits: CandleHit[] }).hits.some((h) => h.i === live.last && h.forming), "compute(): …and shown when asked");

    // legend: the count, then the pattern of the bar under the crosshair
    const item = def.legendItems?.(res, params, "ru-RU", eng.last) ?? [];
    ok(item.length === 2 && /Паттернов: 1/.test(item[0].text) && /Бычье поглощение/.test(item[1].text), "legend (ru): count + the pattern on the hovered bar", JSON.stringify(item));
    ok(item[1]?.color === params.cpColUp, "legend: bullish pattern in the bullish colour");
    const itemEn = def.legendItems?.(res, params, "en-US", eng.last) ?? [];
    ok(/Patterns: 1/.test(itemEn[0].text) && /Bullish engulfing/.test(itemEn[1].text), "legend (en)");
    const itemZh = def.legendItems?.(res, params, "zh-CN", eng.last) ?? [];
    ok(/形态数: 1/.test(itemZh[0].text) && /看涨吞没/.test(itemZh[1].text), "legend (zh)");
    const noBar = def.legendItems?.(res, params, "ru-RU", 3) ?? [];
    ok(noBar.length === 1, "legend: a bar without a pattern -> only the count");
    const tip = def.legendTip?.(res, params, "ru-RU", eng.last) ?? "";
    ok(/Бычье поглощение/.test(tip) && /Надёжность: \d+\/100/.test(tip) && tip.includes(CANDLE_DISCLAIMER[0]), "tooltip (ru): name, meaning, reliability, the 'not a guarantee' note", tip);
    ok((def.legendTip?.(res, params, "en-US", eng.last) ?? "").includes(CANDLE_DISCLAIMER[1]) && (def.legendTip?.(res, params, "zh-CN", eng.last) ?? "").includes(CANDLE_DISCLAIMER[2]), "tooltip: the note in en and zh");
    ok((def.legendTip?.(res, params, "en-US", 3) ?? "").startsWith("No pattern on this bar."), "tooltip: a bar without a pattern says so");
    ok(candleName("morning", "ru-RU") === "Утренняя звезда" && candleName("morning", "en-US") === "Morning star" && candleName("morning", "zh-CN") === "启明星", "names by locale");

    // search in the picker (the same rule as IndicatorsDialog.matchesQuery)
    const norm = (x: string) => x.toLowerCase().replace(/ё/g, "е");
    const matches = (q: string, hay: string) => norm(q).split(/\s+/).filter(Boolean).every((tok) => norm(hay).includes(tok.length > 5 ? tok.slice(0, 5) : tok));
    const hayOf = (lang: "ru" | "en" | "cn") => `${patterns2[lang]["ind.candle_patterns.name"]} ${patterns2[lang]["ind.candle_patterns.desc"]} candle_patterns ${def.keywords ?? ""}`;
    for (const q of ["свеч", "свечи", "свечные паттерны", "молот", "поглощение", "доджи", "утренняя звезда", "харами", "пинцет", "три солдата", "марубозу"]) ok(matches(q, hayOf("ru")), `search finds «${q}»`);
    for (const q of ["doji", "candlestick", "candle", "engulfing", "hammer", "harami", "morning star", "shooting star", "three white soldiers"]) ok(matches(q, hayOf("en")), `search finds «${q}»`);
    for (const q of ["蜡烛", "吞没", "锤头", "十字星"]) ok(matches(q, hayOf("cn")), `search finds «${q}»`);
    ok(!matches("свеч", `${patterns2.ru["ind.wolfe.name"]} ${patterns2.ru["ind.wolfe.desc"]} wolfe ${getIndicatorDef("wolfe")?.keywords ?? ""}`), "search «свеч» does not drag Wolfe waves in");

    // painter on a recording canvas
    const calls: Record<string, number> = {};
    const ctxStub = new Proxy({} as Record<string, unknown>, {
      get(t, k: string) {
        if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
        if (k in t) return t[k];
        return (..._a: unknown[]) => {
          calls[k] = (calls[k] ?? 0) + 1;
        };
      },
      set(t, k: string, v) {
        t[k] = v;
        return true;
      },
    });
    const mkSc = (cs: Candle[], bw: number): SeriesContext => {
      const lo = Math.min(...cs.map((c) => c.l));
      const hi = Math.max(...cs.map((c) => c.h));
      return {
        ctx: ctxStub as unknown as CanvasRenderingContext2D,
        dpr: 1,
        candles: cs,
        from: 0,
        to: cs.length - 1,
        x: (i: number) => 10 + i * bw,
        y: (v: number) => 340 - ((v - lo) / (hi - lo)) * 300,
        barSpacing: bw,
        paneWidth: 150 + cs.length * bw,
        paneHeight: 420,
        theme: { bg: "#ffffff" } as SeriesContext["theme"],
        options: { locale: "ru-RU", fontFamily: "sans-serif" } as SeriesContext["options"],
      } as SeriesContext;
    };
    const many = build("down", 100, [[100, 100.1, 97.9, 98], [100.4, 102.7, 100.3, 102.6]]);
    const allParams = { ...params, cpPreset: "all" };
    const r2 = computeIndicator(def, many.cs, allParams);
    for (const k of Object.keys(calls)) delete calls[k];
    def.drawExtra?.(mkSc(many.cs, 12), allParams, r2);
    ok((calls.fill ?? 0) >= 1 && (calls.stroke ?? 0) >= 1, "painter: markers and the box are drawn", JSON.stringify(calls));
    for (const k of Object.keys(calls)) delete calls[k];
    def.drawExtra?.(mkSc(many.cs, 12), { ...allParams, cpLabels: "full", cpStrength: "number", cpBrackets: false }, r2);
    ok((calls.fillText ?? 0) >= 1, "painter: labels are written (full names, reliability number)", JSON.stringify(calls));
    for (const k of Object.keys(calls)) delete calls[k];
    def.drawExtra?.(mkSc(many.cs, 12), { ...allParams, cpLabels: "none", cpStrength: "off" }, r2);
    ok((calls.fillText ?? 0) === 0 && (calls.fill ?? 0) >= 1, "painter: «markers only» writes no text");
    for (const k of Object.keys(calls)) delete calls[k];
    def.drawExtra?.(mkSc(many.cs, 12), allParams, { plots: [] });
    ok(Object.keys(calls).length === 0, "painter: no result -> draws nothing, no crash");
    let threw = false;
    try {
      def.drawExtra?.(mkSc(many.cs, 1.5), { ...allParams, cpForming: true }, computeIndicator(def, many.cs, { ...allParams, cpForming: true }));
    } catch {
      threw = true;
    }
    ok(!threw, "painter: very narrow bars -> no crash");
  }
  void DEFAULT_CANDLES;
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
