/* Check of the heights of the chart panes (src/lib/chart/pane-layout.ts pure ratio logic + the way IndicatorsController stores them):
   clamps, the default look (price pane 60-80%, panes share the rest, not equal thirds), a new pane takes room from the others in
   proportion and does not reset them, a removed pane gives room back to the price pane only, divider drags (min / max / total cap),
   pixel floors, save -> restore round trip through IndicatorsController.serialize()/restore() with a stub engine (wide and narrow
   chart keep separate heights), old saved data without heights. OFFLINE, pure. Run:  npx tsx scripts/check-pane-layout.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import {
  COMPACT_MAX_WIDTH,
  DEFAULT_SUB_TOTAL,
  MAX_ONE_RATIO,
  MAX_SUB_TOTAL,
  MIN_MAIN_PX,
  MIN_SUB_PX,
  MIN_SUB_RATIO,
  addPane,
  capTotal,
  clampSub,
  dragRatio,
  isCompactWidth,
  layoutHeights,
  parseRatio,
  removePane,
  resolveRatios,
} from "../src/lib/chart/pane-layout";
import { IndicatorsController } from "../src/lib/chart/indicators/controller";
import type { ChartEngine } from "../src/lib/chart/engine";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const near = (a: number, b: number, name: string, eps = 1e-6) => ok(Math.abs(a - b) <= eps, name, `${a} != ${b}`);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const fmt = (a: number[]) => "[" + a.map((x) => x.toFixed(3)).join(", ") + "]";

/* ───────────── clamps / parsing ───────────── */
near(clampSub(0), MIN_SUB_RATIO, "clamp: below the minimum");
near(clampSub(0.9), MAX_ONE_RATIO, "clamp: above the maximum");
near(clampSub(0.2), 0.2, "clamp: inside is kept");
ok(parseRatio(undefined) === undefined && parseRatio(null) === undefined && parseRatio("0.2") === undefined && parseRatio(NaN) === undefined && parseRatio(-1) === undefined && parseRatio(0) === undefined, "parseRatio: junk -> undefined");
near(parseRatio(0.2) as number, 0.2, "parseRatio: number kept");
near(parseRatio(7) as number, MAX_ONE_RATIO, "parseRatio: clamped");
ok(isCompactWidth(375) && isCompactWidth(COMPACT_MAX_WIDTH - 1) && !isCompactWidth(COMPACT_MAX_WIDTH) && !isCompactWidth(1280) && !isCompactWidth(0), "compact width threshold");

/* ───────────── capTotal ───────────── */
{
  const c = capTotal([0.3, 0.3, 0.3]);
  near(sum(c), MAX_SUB_TOTAL, "capTotal: scaled to the cap");
  ok(c.every((x) => Math.abs(x - c[0]) < 1e-9), "capTotal: equal stay equal");
  const d = capTotal([0.5, 0.05, 0.3]);
  ok(Math.abs(sum(d) - MAX_SUB_TOTAL) < 1e-6 && d[1] >= MIN_SUB_RATIO - 1e-9 && d[0] > d[2], "capTotal: proportions kept, the strip is not squeezed under the minimum", fmt(d));
  const e = capTotal([0.1, 0.2]);
  ok(e[0] === 0.1 && e[1] === 0.2, "capTotal: under the cap -> untouched");
}

/* ───────────── default look ───────────── */
{
  const w = (n: number) => resolveRatios(Array.from({ length: n }, () => ({ saved: undefined, weight: 0.18 })));
  const one = w(1);
  near(one[0], 0.18, "default: one pane keeps its own weight");
  const two = w(2);
  ok(1 - sum(two) >= 0.6 && 1 - sum(two) <= 0.7, `default: price pane 60-70% with two panes (${(1 - sum(two)).toFixed(3)})`);
  const three = w(3);
  ok(Math.abs(sum(three) - DEFAULT_SUB_TOTAL) < 1e-9, "default: three panes share the 40% cap", fmt(three));
  ok(1 - sum(w(6)) >= 0.4 - 1e-9, "default: six panes never take more than the hard cap", fmt(w(6)));
  const mixed = resolveRatios([
    { saved: undefined, weight: 0.2 },
    { saved: undefined, weight: 0.1 },
  ]);
  ok(mixed[0] > mixed[1], "default: weights decide who is taller", fmt(mixed));
}

/* ───────────── saved layouts are kept ───────────── */
{
  const r = resolveRatios([
    { saved: 0.08, weight: 0.18 },
    { saved: 0.07, weight: 0.18 },
  ]);
  near(r[0], 0.08, "restore: thin strip 1 kept");
  near(r[1], 0.07, "restore: thin strip 2 kept");
  near(1 - sum(r), 0.85, "restore: price pane is the rest");
  const j = resolveRatios([{ saved: "x", weight: 0.18 }, { saved: 9, weight: 0.18 }]);
  ok(j.every((x) => x >= MIN_SUB_RATIO && x <= MAX_ONE_RATIO) && j.length === 2, "restore: junk values become valid");
  const big = resolveRatios([{ saved: 0.5, weight: 0.18 }, { saved: 0.5, weight: 0.18 }]);
  near(sum(big), MAX_SUB_TOTAL, "restore: an impossible saved total is capped");
  eqArr(resolveRatios([]), [], "restore: nothing -> nothing");
}
function eqArr(a: number[], b: number[], name: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), name, `${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}

/* ───────────── adding a pane ───────────── */
{
  // the user made the price pane tall: two thin strips
  const strips = [0.08, 0.06];
  const a = addPane(strips, 0.18);
  near(a.added, 0.07, "add: the newcomer matches the average strip (not a fat 18%)", 1e-9);
  ok(a.existing[0] >= MIN_SUB_RATIO && a.existing[1] >= MIN_SUB_RATIO, "add: existing strips stay above the minimum");
  ok(a.existing[0] <= strips[0] && a.existing[1] <= strips[1] + 1e-9, "add: nobody grows");
  ok(1 - sum([...a.existing, a.added]) > 0.75, "add: the price pane stays the tallest", fmt([...a.existing, a.added]));
  // fresh layout: panes of 18% -> a third one of 18%, taken from everybody in proportion
  const b = addPane([0.18, 0.18], 0.18);
  near(b.added, 0.18, "add: default newcomer is its own weight");
  near(b.existing[0], 0.18 * 0.82, "add: the others give room in proportion", 1e-9);
  const main0 = 1 - 0.36;
  const main1 = 1 - sum([...b.existing, b.added]);
  near(main1, main0 * 0.82, "add: the price pane gives the same share", 1e-9);
  ok(addPane([], 0.2).added === 0.2 && addPane([], 0.2).existing.length === 0, "add: first pane takes its weight");
  const full = addPane([0.3, 0.3], 0.3);
  ok(sum([...full.existing, full.added]) <= MAX_SUB_TOTAL + 1e-9, "add: total never above the cap");
  // mixed restore: two saved panes and one unsaved
  const m = resolveRatios([
    { saved: 0.1, weight: 0.18 },
    { saved: undefined, weight: 0.18 },
    { saved: 0.12, weight: 0.18 },
  ]);
  ok(m[1] > 0 && m[0] <= 0.1 + 1e-9 && m[2] <= 0.12 + 1e-9 && m[0] >= 0.09 * 0.9, "mixed: new pane added without resetting the saved ones", fmt(m));
}

/* ───────────── removing a pane ───────────── */
{
  const r = removePane([0.1, 0.2, 0.15], 1);
  eqArr(r, [0.1, 0.15], "remove: the others keep their shares");
  eqArr(removePane([0.1], 5), [0.1], "remove: unknown index changes nothing");
}

/* ───────────── dragging a divider ───────────── */
{
  const a = dragRatio([0.2, 0.2], 1, 0.1);
  near(a[1], 0.3, "drag: grows by the delta");
  near(a[0], 0.2, "drag: the other pane is untouched");
  const b = dragRatio([0.2, 0.2], 1, -1);
  near(b[1], MIN_SUB_RATIO, "drag: down to the thin strip stops at the minimum");
  const c = dragRatio([0.2, 0.2], 0, 1);
  near(c[0], Math.min(MAX_ONE_RATIO, MAX_SUB_TOTAL - 0.2), "drag: stops at the total cap (the price pane keeps 40%)");
  const d = dragRatio([0.2], 3, 0.1);
  eqArr(d, [0.2], "drag: unknown pane changes nothing");
  eqArr(dragRatio([0.2], 0, NaN), [0.2], "drag: NaN delta changes nothing");
}

/* ───────────── pixel heights ───────────── */
{
  const l = layoutHeights(600, [0.2, 0.2]);
  near(l.main, 360, "px: price pane = the rest");
  near(l.subs[0], 120, "px: pane = share of the plot");
  near(l.main + sum(l.subs), 600, "px: heights add up to the plot");
  const thin = layoutHeights(600, [0.05, 0.05]);
  ok(thin.subs.every((h) => h >= MIN_SUB_PX - 1e-9), "px: a strip never gets under the floor", fmt(thin.subs));
  const small = layoutHeights(300, [0.3, 0.3]);
  ok(small.main >= Math.min(MIN_MAIN_PX, 300 * 0.35) - 1e-9, "px: small chart keeps a usable price pane", fmt([small.main, ...small.subs]));
  near(small.main + sum(small.subs), 300, "px: small chart heights add up");
  const none = layoutHeights(500, []);
  near(none.main, 500, "px: no panes -> all price");
  const huge = layoutHeights(900, [0.3, 0.3, 0.3]);
  ok(huge.main >= 900 * 0.4 - 1e-6, "px: three big panes are capped", fmt([huge.main, ...huge.subs]));
}

/* ───────────── IndicatorsController: save -> restore ───────────── */
class StubEngine {
  compact = false;
  panes = new Map<string, number>();
  order: string[] = [];
  onPanesResized: ((r: Record<string, number>) => void) | null = null;
  onCompactChange: ((c: boolean) => void) | null = null;
  hasPane(id: string) {
    return this.panes.has(id);
  }
  addPane(id: string, ratio = 0.2) {
    if (this.panes.has(id)) return;
    this.panes.set(id, ratio);
    this.order.push(id);
  }
  removePane(id: string) {
    this.panes.delete(id);
    this.order = this.order.filter((x) => x !== id);
  }
  getPaneRatios() {
    return Object.fromEntries(this.panes);
  }
  setPaneRatios(r: Record<string, number>) {
    for (const [k, v] of Object.entries(r)) if (this.panes.has(k)) this.panes.set(k, v);
  }
  isCompact() {
    return this.compact;
  }
  addSeries() {}
  removeSeries() {}
  requestRedraw() {}
  getCandles() {
    return [];
  }
  getPrecision() {
    return 2;
  }
  getIntervalMs() {
    return 60_000;
  }
  flow = null;
  algo = null;
  /** The user drags a divider. */
  drag(r: Record<string, number>) {
    for (const [k, v] of Object.entries(r)) this.panes.set(k, v);
    this.onPanesResized?.(this.getPaneRatios());
  }
}
const stubCtl = (e: StubEngine) => {
  const c = new IndicatorsController();
  c.attach(e as unknown as ChartEngine);
  return c;
};
const ratios = (e: StubEngine) => e.order.map((id) => e.panes.get(id) as number);
const savedRatios = (c: IndicatorsController): { id: string; pr?: number; pm?: number }[] => JSON.parse(c.serialize());

{
  // 1) an untouched chart: CVD + RSI get the default look
  const e1 = new StubEngine();
  const c1 = stubCtl(e1);
  c1.add("cvd");
  c1.add("rsi");
  const r1 = ratios(e1);
  ok(r1.length === 2 && 1 - sum(r1) >= 0.55 && 1 - sum(r1) <= 0.75, `controller: two new panes -> price pane ${(1 - sum(r1)).toFixed(2)}`, fmt(r1));

  // 2) the user drags both dividers: price pane tallest, thin strips
  e1.drag({ [e1.order[0]]: 0.07, [e1.order[1]]: 0.06 });
  const s = savedRatios(c1);
  ok(s[0].pr === 0.07 && s[1].pr === 0.06 && s[0].pm === undefined, "controller: dragged heights are in the saved JSON (wide slot only)", JSON.stringify(s));
  const json = c1.serialize();

  // 3) a new page: restore before the engine is attached -> the first layout is already right
  const e2 = new StubEngine();
  const c2 = new IndicatorsController();
  c2.restore(json);
  c2.attach(e2 as unknown as ChartEngine);
  const r2 = ratios(e2);
  ok(r2.length === 2 && Math.abs(r2[0] - 0.07) < 1e-9 && Math.abs(r2[1] - 0.06) < 1e-9, "controller: reload restores the dragged heights", fmt(r2));

  // 4) restore into an already attached engine (account copy arrives)
  const e3 = new StubEngine();
  const c3 = stubCtl(e3);
  c3.restore(json);
  const r3 = ratios(e3);
  ok(Math.abs(r3[0] - 0.07) < 1e-9 && Math.abs(r3[1] - 0.06) < 1e-9, "controller: restore into a live chart keeps the heights", fmt(r3));

  // 5) adding a pane keeps the thin strips thin, removing it keeps the rest
  const before = ratios(e2);
  const uid = c2.add("macd");
  const after = ratios(e2);
  ok(after.length === 3 && after[0] <= before[0] + 1e-9 && after[1] <= before[1] + 1e-9 && after[0] >= MIN_SUB_RATIO && 1 - sum(after) > 0.75, "controller: a new pane does not reset the strips", fmt(after));
  const kept = [after[0], after[1]];
  c2.remove(uid);
  const back = ratios(e2);
  ok(back.length === 2 && Math.abs(back[0] - kept[0]) < 1e-9 && Math.abs(back[1] - kept[1]) < 1e-9, "controller: removing a pane keeps the others as they are", fmt(back));

  // 6) a narrow chart keeps its own heights, the wide ones stay
  e2.compact = true;
  e2.onCompactChange?.(true);
  const narrow = ratios(e2);
  ok(Math.abs(narrow[0] - back[0]) < 1e-9, "controller: narrow chart starts from the wide heights", fmt(narrow));
  e2.drag({ [e2.order[0]]: 0.1, [e2.order[1]]: 0.09 });
  const s2 = savedRatios(c2);
  ok(s2[0].pm === 0.1 && s2[1].pm === 0.09 && s2[0].pr !== undefined && Math.abs((s2[0].pr as number) - back[0]) < 1e-3, "controller: narrow drag is saved in its own slot", JSON.stringify(s2));
  e2.compact = false;
  e2.onCompactChange?.(false);
  const wide = ratios(e2);
  ok(Math.abs(wide[0] - back[0]) < 1e-3, "controller: back to a wide chart -> wide heights again", fmt(wide));

  // 7) older saved data (no heights at all) still loads with the default look
  const e4 = new StubEngine();
  const c4 = new IndicatorsController();
  c4.restore(JSON.stringify([{ id: "cvd", params: {}, visible: true }, { id: "rsi", params: {}, visible: true }]));
  c4.attach(e4 as unknown as ChartEngine);
  const r4 = ratios(e4);
  ok(r4.length === 2 && 1 - sum(r4) >= 0.55, "controller: old data without heights -> default look", fmt(r4));

  // 8) junk in the saved heights
  const e5 = new StubEngine();
  const c5 = new IndicatorsController();
  c5.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true, pr: "wide", pm: -3 }]));
  c5.attach(e5 as unknown as ChartEngine);
  const r5 = ratios(e5);
  ok(r5.length === 1 && r5[0] >= MIN_SUB_RATIO && r5[0] <= MAX_ONE_RATIO, "controller: junk heights are ignored", fmt(r5));

  // 9) an indicator that moves out of its pane and back keeps its height
  const e6 = new StubEngine();
  const c6 = stubCtl(e6);
  const u = c6.add("ema");
  const other = c6.add("rsi");
  void other;
  c6.move(u, "own");
  e6.drag({ [e6.order[0]]: 0.07, [e6.order[1]]: 0.07 });
  c6.move(u, "main");
  c6.move(u, "own");
  const r6 = ratios(e6);
  ok(r6.length === 2 && r6.every((x) => Math.abs(x - 0.07) < 0.021), "controller: move out and back keeps the height", fmt(r6));
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
