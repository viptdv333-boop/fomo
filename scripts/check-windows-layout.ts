/* Check of the multi-window layout of the chart (src/lib/chart/windows-layout.ts pure tree model + the way IndicatorsController keeps it):
   add / close / resize, geometry (tiles fill the area, floors, tiny areas), divider drag limits, stored-layout sanitising (junk never gives a
   broken tree), save -> restore round trip together with the indicators, old data without windows, windows folding back into the one stack
   when the chart is narrow (and the layout surviving it), moving indicators between windows, indicators that cannot leave the price chart.
   OFFLINE, pure (stub engines, no DOM). Run:  npx tsx scripts/check-windows-layout.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import {
  DIVIDER_PX,
  MAIN_ID,
  MAX_DEPTH,
  MAX_WINDOWS,
  MIN_MAIN_H,
  MIN_MAIN_W,
  MIN_RATIO,
  MIN_WIN_H,
  MIN_WIN_W,
  WIN_PANE,
  addWindow,
  clampRatio,
  closeWindow,
  computeGeometry,
  hasLeaf,
  isMulti,
  leafIds,
  mainLayout,
  newWindowId,
  nodeAt,
  parseLayout,
  ratioAtPointer,
  serializeLayout,
  setRatioAt,
  windowIds,
  windowNumber,
} from "../src/lib/chart/windows-layout";
import type { Rect, WinNode } from "../src/lib/chart/windows-layout";
import { IndicatorsController } from "../src/lib/chart/indicators/controller";
import type { ChartEngine } from "../src/lib/chart/engine";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const near = (a: number, b: number, name: string, eps = 1e-6) => ok(Math.abs(a - b) <= eps, name, `${a} != ${b}`);

const W = (id: string): WinNode => ({ kind: "win", id });
const S = (dir: "h" | "v", ratio: number, a: WinNode, b: WinNode): WinNode => ({ kind: "split", dir, ratio, a, b });
const area = (w: number, h: number): Rect => ({ x: 0, y: 0, w, h });

function main() {
  /* ───────────── queries ───────────── */
  ok(eq(leafIds(null), [MAIN_ID]) && eq(windowIds(null), []) && !isMulti(null) && !isMulti(mainLayout()), "single chart: one leaf, no windows");
  const t0 = S("v", 0.7, W("main"), S("h", 0.5, W("w2"), W("w1")));
  ok(eq(leafIds(t0), ["main", "w2", "w1"]) && eq(windowIds(t0), ["w2", "w1"]), "leaves are in reading order");
  ok(windowNumber(t0, "w2") === 1 && windowNumber(t0, "w1") === 2 && windowNumber(t0, "main") === 0 && windowNumber(t0, "zz") === 0, "window numbers follow the reading order");
  ok(newWindowId(null) === "w1" && newWindowId(t0) === "w3", "new window id is the lowest free one");

  /* ───────────── add ───────────── */
  const a1 = addWindow(null, "v");
  ok(!!a1 && a1.id === "w1" && eq(leafIds(a1.tree), ["main", "w1"]), "add: the first window goes below the chart");
  ok(!!a1 && a1.tree.kind === "split" && a1.tree.dir === "v" && Math.abs(a1.tree.ratio - 0.68) < 1e-9 && a1.tree.a.kind === "win" && a1.tree.a.id === MAIN_ID, "add: the chart keeps about two thirds");
  const a2 = a1 && addWindow(a1.tree, "h");
  ok(!!a2 && a2.id === "w2" && a2.tree.kind === "split" && a2.tree.dir === "h" && a2.tree.a === a1!.tree, "add without a target wraps the whole area (a strip on the right)");
  const a3 = a1 && addWindow(a1.tree, "h", "w1");
  ok(!!a3 && eq(leafIds(a3.tree), ["main", "w1", "w2"]) && nodeAt(a3.tree, "b")?.kind === "split", "add next to a window splits that window", JSON.stringify(a3));
  ok(a1 !== null && addWindow(a1.tree, "h", "nope") === null, "add next to an unknown window is refused");
  ok(a1 !== null && JSON.stringify(a1.tree).includes("w1") && eq(a1.tree, JSON.parse(JSON.stringify(a1.tree))), "tree is plain JSON");
  let full: WinNode | null = null;
  for (let i = 0; i < MAX_WINDOWS; i++) full = addWindow(full, i % 2 ? "h" : "v")?.tree ?? full;
  ok(windowIds(full).length === MAX_WINDOWS, `add: up to ${MAX_WINDOWS} windows`);
  ok(addWindow(full, "v") === null && addWindow(full, "h", "w1") === null, "add: one more is refused");
  const keep = JSON.stringify(a1?.tree);
  addWindow(a1!.tree, "h", "w1");
  ok(JSON.stringify(a1?.tree) === keep, "add never changes the tree it was given");

  /* ───────────── close ───────────── */
  ok(closeWindow(null, "w1") === null && closeWindow(a1!.tree, MAIN_ID) === a1!.tree, "close: nothing to close / the chart cannot be closed");
  ok(closeWindow(a1!.tree, "w1") === null, "close the only window: back to the single chart (null)");
  const c3 = closeWindow(a3!.tree, "w1");
  ok(eq(leafIds(c3), ["main", "w2"]) && isMulti(c3), "close: the sibling takes the room", JSON.stringify(c3));
  ok(closeWindow(a3!.tree, "zz") !== null && eq(leafIds(closeWindow(a3!.tree, "zz")), leafIds(a3!.tree)), "close an unknown window: nothing changes");
  ok(eq(leafIds(closeWindow(t0, "w2")), ["main", "w1"]), "close in a deep tree");
  const re = addWindow(c3, "v");
  ok(!!re && re.id === "w1", "a freed id is used again");

  /* ───────────── resize ───────────── */
  const r1 = setRatioAt(a1!.tree, "", 0.5);
  ok(r1 !== a1!.tree && r1!.kind === "split" && r1!.ratio === 0.5, "resize: new ratio");
  ok(setRatioAt(a1!.tree, "", (a1!.tree as { ratio: number }).ratio) === a1!.tree, "resize to the same value: same object (nothing to save)");
  ok((setRatioAt(a1!.tree, "", 0) as { ratio: number }).ratio === MIN_RATIO && (setRatioAt(a1!.tree, "", 5) as { ratio: number }).ratio === 1 - MIN_RATIO, "resize: clamped");
  ok(setRatioAt(a1!.tree, "", NaN) === a1!.tree && setRatioAt(a1!.tree, "ab", 0.3) === a1!.tree && setRatioAt(a1!.tree, "x", 0.3) === a1!.tree, "resize: NaN / a path that does not exist change nothing");
  const deep = setRatioAt(t0, "b", 0.25);
  ok(nodeAt(deep, "b")?.kind === "split" && (nodeAt(deep, "b") as { ratio: number }).ratio === 0.25 && (deep as { ratio: number }).ratio === 0.7, "resize a nested split");
  ok(clampRatio(0.5) === 0.5 && clampRatio(-3) === MIN_RATIO, "clampRatio");

  /* ───────────── stored form ───────────── */
  ok(eq(parseLayout(JSON.parse(JSON.stringify(serializeLayout(t0)))), t0), "serialise -> parse gives the same tree");
  const rounded = serializeLayout(S("h", 0.123456789, W("main"), W("w1"))) as { ratio: number };
  ok(rounded.ratio === 0.1235, "serialise rounds ratios");
  const junk: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["number", 7],
    ["string", "main"],
    ["array", [1, 2]],
    ["empty object", {}],
    ["unknown kind", { kind: "grid" }],
    ["win without id", { kind: "win" }],
    ["win with object id", { kind: "win", id: { x: 1 } }],
    ["only the chart", { kind: "win", id: "main" }],
    ["no chart", S("v", 0.5, W("w1"), W("w2"))],
    ["bad id", S("v", 0.5, W("main"), W("W 1!"))],
    ["bad dir", { kind: "split", dir: "x", ratio: 0.5, a: W("main"), b: W("w1") }],
    ["id with spaces", S("v", 0.5, W("main"), W("a b"))],
  ];
  for (const [label, v] of junk) ok(parseLayout(v) === null, `parse: ${label} -> null`, JSON.stringify(parseLayout(v)));
  const half = parseLayout({ kind: "split", dir: "v", ratio: 0.6, a: W("main"), b: { kind: "bogus" } });
  ok(half === null, "parse: one good side and nothing else is not a layout (single chart)");
  const sal = parseLayout({ kind: "split", dir: "v", ratio: 0.6, a: { kind: "split", dir: "h", ratio: "x", a: W("main"), b: W("w1") }, b: { nope: 1 } });
  ok(!!sal && eq(leafIds(sal), ["main", "w1"]) && sal.kind === "split" && sal.ratio === 0.5, "parse: a broken side is cut away, a broken ratio becomes 0.5", JSON.stringify(sal));
  const dup = parseLayout(S("v", 0.5, W("main"), S("h", 0.5, W("w1"), W("w1"))));
  ok(!!dup && eq(leafIds(dup), ["main", "w1"]), "parse: a repeated id is dropped", JSON.stringify(dup));
  const dupMain = parseLayout(S("v", 0.5, W("main"), S("h", 0.5, W("main"), W("w1"))));
  ok(!!dupMain && eq(leafIds(dupMain), ["main", "w1"]), "parse: a second chart is dropped");
  const ratios = parseLayout(S("v", 7, W("main"), W("w1")));
  ok(!!ratios && ratios.kind === "split" && ratios.ratio === 1 - MIN_RATIO, "parse: huge ratio is clamped");
  const nan = parseLayout({ kind: "split", dir: "h", ratio: NaN, a: W("main"), b: W("w1") });
  ok(!!nan && nan.kind === "split" && nan.ratio === 0.5, "parse: NaN ratio -> 0.5");
  let tall: unknown = W("w1");
  for (let i = 0; i < MAX_DEPTH + 6; i++) tall = { kind: "split", dir: i % 2 ? "h" : "v", ratio: 0.5, a: tall, b: W(`x${i}`) };
  tall = { kind: "split", dir: "v", ratio: 0.5, a: W("main"), b: tall };
  const cut = parseLayout(tall);
  ok(cut === null || leafIds(cut).length <= MAX_WINDOWS + 1, "parse: a tree that is too deep is cut", String(leafIds(cut).length));
  const chain = (n: number) => {
    let t: unknown = W("main");
    for (let i = 1; i <= n; i++) t = { kind: "split", dir: "h", ratio: 0.5, a: t, b: W(`w${i}`) };
    return t;
  };
  const many = parseLayout(chain(MAX_DEPTH));
  ok(!!many && windowIds(many).length === MAX_WINDOWS && hasLeaf(many, MAIN_ID), "parse: more windows than allowed are dropped", String(windowIds(many).length));
  ok(parseLayout(chain(MAX_DEPTH + 4)) === null, "parse: a chain deeper than allowed is refused as a whole");
  let proto: unknown = null;
  try {
    proto = parseLayout(JSON.parse('{"kind":"split","dir":"h","ratio":0.5,"a":{"kind":"win","id":"main"},"b":{"kind":"win","id":"w1"},"__proto__":{"polluted":1}}'));
  } catch {
    proto = "threw";
  }
  ok(proto !== "threw" && ({} as { polluted?: number }).polluted === undefined, "parse: __proto__ in the stored value does nothing");

  /* ───────────── geometry ───────────── */
  const g = computeGeometry(t0, area(1200, 800));
  const tiles = Object.entries(g.tiles);
  ok(tiles.length === 3 && g.dividers.length === 2, "geometry: a tile per leaf, a divider per split");
  const covered = tiles.reduce((s, [, r]) => s + r.w * r.h, 0) + g.dividers.reduce((s, d) => s + d.rect.w * d.rect.h, 0);
  near(covered, 1200 * 800, "geometry: tiles and dividers cover the whole area exactly", 1e-3);
  let overlap = false;
  const all: Rect[] = [...tiles.map(([, r]) => r), ...g.dividers.map((d) => d.rect)];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i];
      const b = all[j];
      if (a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6) overlap = true;
    }
  ok(!overlap, "geometry: nothing overlaps");
  ok(g.tiles.main.x === 0 && g.tiles.main.y === 0 && g.tiles.main.w === 1200 && Math.abs(g.tiles.main.h - (800 - DIVIDER_PX) * 0.7) < 1e-6, "geometry: the chart is on top and as wide as the area");
  ok(g.tiles.w2.y > g.tiles.main.y + g.tiles.main.h && g.tiles.w1.x > g.tiles.w2.x + g.tiles.w2.w, "geometry: windows below, side by side");
  ok(g.dividers[0].path === "" && g.dividers[1].path === "b" && nodeAt(t0, g.dividers[1].path)?.kind === "split", "geometry: divider paths point at their splits");

  // floors: a ratio that would crush a tile is pulled back
  const crush = computeGeometry(S("h", 0.97, W("main"), W("w1")), area(900, 500));
  ok(crush.tiles.w1.w >= MIN_WIN_W - 1e-6 && crush.tiles.main.w >= MIN_MAIN_W, "geometry: a window keeps its minimum width", JSON.stringify(crush.tiles));
  const crush2 = computeGeometry(S("v", 0.02, W("main"), W("w1")), area(900, 600));
  ok(crush2.tiles.main.h >= MIN_MAIN_H - 1e-6, "geometry: the chart keeps its minimum height", JSON.stringify(crush2.tiles));
  const nested = computeGeometry(S("h", 0.5, W("main"), S("h", 0.5, W("w1"), W("w2"))), area(1000, 500));
  ok(nested.tiles.w1.w >= MIN_WIN_W && nested.tiles.w2.w >= MIN_WIN_W, "geometry: nested windows keep their minimums");
  // an area that is too small for the floors: nobody gets a negative or NaN size, everything still adds up
  for (const [w, h] of [
    [0, 0],
    [1, 1],
    [100, 50],
    [300, 200],
    [640, 260],
  ] as const) {
    const gg = computeGeometry(S("v", 0.7, W("main"), S("h", 0.5, W("w1"), W("w2"))), area(w, h));
    const finite = Object.values(gg.tiles).every((r) => [r.x, r.y, r.w, r.h].every(Number.isFinite) && r.w >= 0 && r.h >= 0) && gg.dividers.every((d) => [d.rect.x, d.rect.y, d.minRatio, d.maxRatio].every(Number.isFinite));
    const inside = w < 2 * DIVIDER_PX || h < 2 * DIVIDER_PX || Object.values(gg.tiles).every((r) => r.x + r.w <= w + 1e-6 && r.y + r.h <= h + 1e-6);
    ok(finite && inside, `geometry: area ${w}x${h} gives finite, non-negative tiles`, JSON.stringify(gg.tiles));
  }
  const bad = computeGeometry(S("h", NaN, W("main"), W("w1")), area(800, 400));
  ok(Object.values(bad.tiles).every((r) => Number.isFinite(r.w) && Number.isFinite(r.x)), "geometry: a NaN ratio never reaches the tiles");

  // divider drag
  const d0 = g.dividers[0];
  const mid = d0.parent.y + (d0.parent.h - DIVIDER_PX) * 0.5 + DIVIDER_PX / 2;
  near(ratioAtPointer(d0, mid), 0.5, "drag: the pointer in the middle -> 0.5");
  ok(ratioAtPointer(d0, -500) === d0.minRatio && ratioAtPointer(d0, 99999) === d0.maxRatio, "drag: limited by the floors of the tiles");
  ok(d0.minRatio >= MIN_MAIN_H / (800 - DIVIDER_PX) - 1e-9 && d0.maxRatio <= 1 - MIN_WIN_H / (800 - DIVIDER_PX) + 1e-9, "drag: limits come from the minimum sizes", `${d0.minRatio} ${d0.maxRatio}`);
  const dragged = setRatioAt(t0, d0.path, ratioAtPointer(d0, 600));
  ok((dragged as { ratio: number }).ratio > 0.7, "drag down gives the chart more room");
  const gh = computeGeometry(S("h", 0.5, W("main"), W("w1")), area(1000, 400));
  const dh = gh.dividers[0];
  near(ratioAtPointer(dh, dh.rect.x + DIVIDER_PX / 2), 0.5, "drag (side by side): uses x");

  /* ───────────── controller ───────────── */
  type Mounted = { pane: string };
  class Stub {
    compact = false;
    panes = new Map<string, number>();
    order: string[] = [];
    series = new Map<string, Mounted>();
    redraws = 0;
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
    addSeries(s: { id: string }, pane = "main") {
      this.series.set(s.id, { pane });
    }
    removeSeries(id: string) {
      this.series.delete(id);
    }
    requestRedraw() {
      this.redraws++;
    }
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
  }
  const asEng = (e: Stub) => e as unknown as ChartEngine;
  const saved = (c: IndicatorsController): unknown[] => JSON.parse(c.serialize());
  const entry = (c: IndicatorsController, i: number) => saved(c)[i] as { id?: string; w?: string; lay?: unknown };

  {
    // 1) a plain chart: nothing about windows in the saved list
    const e = new Stub();
    const c = new IndicatorsController();
    c.attach(asEng(e));
    c.add("rsi");
    c.add("macd");
    ok(c.getLayout() === null && !c.windowsOn() && saved(c).length === 2 && !JSON.stringify(saved(c)).includes('"lay"') && !JSON.stringify(saved(c)).includes('"w"'), "controller: no windows -> the saved list is exactly as before");
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-"), "controller: own panes as before");

    // 2) windows are not available yet (narrow / not measured): the indicator stays in the stack even if it is assigned
    const w = c.addWindow("v");
    ok(w === "w1" && eq(c.windowIds(), ["w1"]) && !c.windowsOn(), "controller: addWindow makes a window, but it is not on screen while the chart is narrow");
    c.moveToWindow(c.list()[0].uid, "w1");
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-") && e.series.size === 2 && e.order.length === 2, "controller: unavailable windows -> the indicator stays in the one stack");
    ok(entry(c, 0).w === "w1" && saved(c).length === 3 && !!entry(c, 2).lay, "controller: the assignment and the layout are saved even while folded");

    // 3) windows become available, the tile registers its engine
    const win = new Stub();
    c.attachWindow("w1", asEng(win));
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-"), "controller: a registered tile does not pull the indicator before windows are available");
    c.setWindowsAvailable(true);
    const u0 = c.list()[0].uid;
    ok(c.windowsOn() && c.windowOf(u0) === "w1" && c.paneOf(u0) === "win:w1", "controller: available -> the indicator lives in the window");
    ok(win.series.get(u0)?.pane === WIN_PANE && !e.series.has(u0) && e.order.length === 1, "controller: it is drawn by the window engine, its pane in the stack is gone");
    ok(e.series.size === 1, "controller: the other indicator stays under the chart");

    // 4) save -> restore on a fresh chart (reload)
    const json = c.serialize();
    ok(entry(c, 0).w === "w1" && eq(windowIds(parseLayout(entry(c, 2).lay)), ["w1"]), "controller: saved list has the window and the assignment");
    const e2 = new Stub();
    const c2 = new IndicatorsController();
    c2.restore(json);
    c2.attach(asEng(e2));
    c2.setWindowsAvailable(true);
    const win2 = new Stub();
    c2.attachWindow("w1", asEng(win2));
    const u2 = c2.list()[0].uid;
    ok(c2.list().length === 2 && c2.windowOf(u2) === "w1" && win2.series.has(u2) && !e2.series.has(u2), "controller: reload restores the window and puts the indicator in it");
    ok(c2.serialize() === json, "controller: save -> restore -> save is stable");

    // 5) the chart gets narrow: windows fold into the one stack, the layout and assignment survive
    c2.setWindowsAvailable(false);
    ok(!c2.windowsOn() && c2.paneOf(u2).startsWith("ind-") && e2.series.has(u2) && !win2.series.has(u2), "controller: narrow chart -> the indicator is in the stack again");
    ok(c2.serialize() === json, "controller: folding does not change what is saved");
    c2.setWindowsAvailable(true);
    ok(c2.windowOf(u2) === "w1" && win2.series.has(u2) && !e2.series.has(u2), "controller: wide again -> back in its window");

    // 6) the tile goes away (windows folded away by the page): the indicator waits, no crash, no stray mount
    c2.detachWindow("w1", asEng(win2));
    ok(!win2.series.has(u2) && !e2.series.has(u2), "controller: a removed tile unmounts its indicators");
    const win3 = new Stub();
    c2.attachWindow("w1", asEng(win3));
    ok(win3.series.has(u2), "controller: a new tile for the same window takes them again");

    // 7) move between windows
    const w2 = c2.addWindow("h", "w1");
    ok(w2 === "w2" && eq(c2.windowIds(), ["w1", "w2"]), "controller: split a window -> a second window");
    const win4 = new Stub();
    c2.attachWindow("w2", asEng(win4));
    c2.moveToWindow(u2, "w2");
    ok(c2.windowOf(u2) === "w2" && win4.series.has(u2) && !win3.series.has(u2), "controller: move to another window");
    const u2b = c2.list()[1].uid;
    c2.moveToWindow(u2b, "new");
    ok(c2.windowIds().length === 3 && c2.windowOf(u2b) === "w3", "controller: «move to a new window» creates it and puts the indicator there");
    c2.moveToWindow(u2b, null);
    ok(c2.windowOf(u2b) === undefined && c2.paneOf(u2b).startsWith("ind-") && c2.windowIds().length === 3, "controller: back to the chart (the empty window stays until it is closed)");
    c2.moveToWindow(u2, "nope");
    ok(c2.windowOf(u2) === "w2", "controller: an unknown window changes nothing");

    // 8) close a window: its indicators return to the chart
    c2.closeWindow("w2");
    ok(!c2.windowIds().includes("w2") && c2.windowOf(u2) === undefined && e2.series.has(u2) && !win4.series.has(u2), "controller: closing a window sends its indicators back to the chart");
    c2.closeWindow(MAIN_ID);
    ok(c2.getLayout() !== null, "controller: the chart cannot be closed");
    c2.resetWindows();
    ok(c2.getLayout() === null && !c2.windowsOn() && saved(c2).length === 2 && !JSON.stringify(saved(c2)).includes('"w"'), "controller: close all -> exactly the old saved format");

    // 9) divider drag: only the end of the drag is saved
    const e3 = new Stub();
    const c3 = new IndicatorsController();
    c3.attach(asEng(e3));
    c3.setWindowsAvailable(true);
    c3.addWindow("v");
    let layoutEvents = 0;
    let savedEvents = 0;
    c3.subscribeLayout(() => layoutEvents++);
    c3.subscribeSaved(() => savedEvents++);
    c3.setSplitRatio("", 0.5, false);
    c3.setSplitRatio("", 0.45, false);
    ok(layoutEvents === 2 && savedEvents === 0, "controller: dragging a divider updates the layout without saving", `${layoutEvents} ${savedEvents}`);
    c3.commitLayout();
    ok(savedEvents === 1 && (nodeAt(c3.getLayout(), "") as { ratio: number }).ratio === 0.45, "controller: the end of the drag is saved once");
    savedEvents = 0;
    c3.setWindowsAvailable(false);
    ok(savedEvents === 0, "controller: folding / unfolding is not a saved change");
  }

  {
    // 10) which indicators may leave the price chart
    const e = new Stub();
    const c = new IndicatorsController();
    c.attach(asEng(e));
    c.setWindowsAvailable(true);
    const pat = c.add("candle_patterns");
    const rsi = c.add("rsi");
    const ema = c.add("ema");
    const id = c.addWindow("v");
    const win = new Stub();
    c.attachWindow(id, asEng(win));
    ok(!c.canWindow(pat) && c.canWindow(rsi) && c.canWindow(ema), "controller: pattern markers stay on the chart, an oscillator and a moving average may go");
    c.moveToWindow(pat, id);
    ok(c.windowOf(pat) === undefined && !win.series.has(pat), "controller: a pattern indicator ignores «move to a window»");
    c.moveToWindow(ema, id);
    ok(c.windowOf(ema) === id && win.series.has(ema) && !e.series.has(ema), "controller: a moving average can live in a window (own scale there)");
    c.move(ema, "main");
    ok(c.windowOf(ema) === undefined && e.series.get(ema)?.pane === "main" && !win.series.has(ema), "controller: «to the main pane» takes it out of the window");

    // 11) the catalog adds into a window
    c.setAddTarget(id);
    const added = c.add("cci");
    ok(c.windowOf(added) === id && win.series.has(added), "controller: with a target window the catalog adds there");
    const pat2 = c.add("candle_patterns");
    ok(c.windowOf(pat2) === undefined, "controller: ... except what cannot leave the chart");
    c.setAddTarget(null);
    const added2 = c.add("cci");
    ok(c.windowOf(added2) === undefined, "controller: target cleared -> the chart again");
    const cl = c.clone(added);
    ok(c.windowOf(cl) === id, "controller: a clone stays in the window");
    c.remove(added);
    ok(!win.series.has(added), "controller: removing an indicator unmounts it from the window");
  }

  {
    // 12) damaged / foreign stored data never breaks the chart
    const cases: [string, unknown[]][] = [
      ["lay is a number", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { lay: 5 }]],
      ["lay is a string", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { lay: "w1" }]],
      ["lay without a chart", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { lay: serializeLayout(S("v", 0.5, W("w1"), W("w2"))) }]],
      ["w is an object", [{ id: "rsi", params: {}, visible: true, w: { a: 1 } }, { lay: serializeLayout(S("v", 0.5, W("main"), W("w1"))) }]],
      ["w names a window that is not in the layout", [{ id: "rsi", params: {}, visible: true, w: "w9" }, { lay: serializeLayout(S("v", 0.5, W("main"), W("w1"))) }]],
      ["w is main", [{ id: "rsi", params: {}, visible: true, w: "main" }, { lay: serializeLayout(S("v", 0.5, W("main"), W("w1"))) }]],
      ["w without any layout", [{ id: "rsi", params: {}, visible: true, w: "w1" }]],
      ["lay as an array", [{ id: "rsi", params: {}, visible: true }, [{ lay: 1 }]]],
      ["lay twice", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { lay: serializeLayout(S("v", 0.5, W("main"), W("w1"))) }, { lay: 7 }]],
    ];
    for (const [label, arr] of cases) {
      const e = new Stub();
      const c = new IndicatorsController();
      let threw = false;
      try {
        c.restore(JSON.stringify(arr));
        c.attach(asEng(e));
        c.setWindowsAvailable(true);
        c.windowIds().forEach((id) => c.attachWindow(id, asEng(new Stub())));
        c.serialize();
      } catch {
        threw = true;
      }
      const u = c.list()[0]?.uid;
      const w = u ? c.windowOf(u) : undefined;
      ok(!threw && c.list().length === 1 && (w === undefined || c.windowIds().includes(w)) && (w !== undefined || e.series.has(u as string)), `restore: ${label} -> the chart works`, `threw=${threw} w=${w}`);
    }
    // the sentinel is not an indicator and is skipped by code that knows only indicators
    const c = new IndicatorsController();
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }, { lay: serializeLayout(S("v", 0.5, W("main"), W("w1"))) }]));
    ok(c.list().length === 1 && c.getLayout() !== null, "restore: the layout entry is not an indicator");
    // an older list (no layout) replaces the layout of a live chart
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }]));
    ok(c.getLayout() === null, "restore: a list without a layout clears the windows (a template without windows)");
    c.restore("not json");
    ok(c.list().length === 1, "restore: junk text changes nothing");
    // too many windows in the stored data
    const manyLay = (() => {
      let t: unknown = W("main");
      for (let i = 1; i <= MAX_DEPTH; i++) t = { kind: "split", dir: "h", ratio: 0.5, a: t, b: W(`w${i}`) };
      return t;
    })();
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }, { lay: manyLay }]));
    ok(c.windowIds().length === MAX_WINDOWS, "restore: more windows than allowed are cut", String(c.windowIds().length));
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main();
