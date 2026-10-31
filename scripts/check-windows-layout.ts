/* Check of the workspace of floating windows of the chart (src/lib/chart/windows-layout.ts pure model + the way IndicatorsController keeps it):
   add / close / raise / move / resize (fractions, pixel floors, kept inside the area), dragging by header and edges, stored-workspace sanitising
   (junk never gives a broken layout), the tiled layout of the first multi-window build turned into windows, save -> restore round trip together
   with the indicators, old data without windows, windows folding back into the one stack when the chart is narrow (and the layout surviving it),
   moving indicators between windows, indicators that cannot leave the price chart.
   OFFLINE, pure (stub engines, no DOM). Run:  npx tsx scripts/check-windows-layout.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import {
  MAIN_ID,
  MAX_CHARTS,
  MAX_DEPTH,
  MAX_WINDOWS,
  MIN_WIN_H,
  MIN_WIN_W,
  NEW_H,
  NEW_W,
  WIN_PANE,
  addChartWindow,
  addWindow,
  cascadeRect,
  chartCount,
  closeWindow,
  dragRect,
  extraIds,
  hasWindow,
  indIds,
  isActive,
  migrateTree,
  newWindowId,
  parseLayout,
  parseWorkspace,
  raise,
  rectFromPx,
  rectPx,
  serializeWorkspace,
  setRect,
  setSymbol,
  windowNumber,
} from "../src/lib/chart/windows-layout";
import type { Rect, WinNode, Workspace } from "../src/lib/chart/windows-layout";
import { IndicatorsController } from "../src/lib/chart/indicators/controller";
import type { ChartEngine } from "../src/lib/chart/engine";

let fails = 0;
let passes = 0;
function ok(cond: boolean, name: string, note = "") {
  if (cond) passes++;
  else fails++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
// same value whatever the order of the keys
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
const eq = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const near = (a: number, b: number, name: string, eps = 1e-6) => ok(Math.abs(a - b) <= eps, name, `${a} != ${b}`);

const W = (id: string): WinNode => ({ kind: "win", id });
const S = (dir: "h" | "v", ratio: number, a: WinNode, b: WinNode): WinNode => ({ kind: "split", dir, ratio, a, b });
const inside = (r: Rect, w: number, h: number) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= w + 1e-9 && r.y + r.h <= h + 1e-9 && r.w >= 0 && r.h >= 0;
const frac = (r: Rect) => r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= 1 + 1e-9 && r.y + r.h <= 1 + 1e-9;

function many(n: number): Workspace {
  let ws: Workspace | null = null;
  for (let i = 0; i < n; i++) ws = addWindow(ws)?.ws ?? ws;
  return ws as Workspace;
}

function main() {
  /* ───────────── queries / add ───────────── */
  ok(!isActive(null) && eq(extraIds(null), []) && !hasWindow(null, "w1"), "classic chart: no workspace, no windows");
  ok(newWindowId(null) === "w1", "first window id");
  const a1 = addWindow(null);
  ok(!!a1 && a1.id === "w1" && isActive(a1.ws) && a1.ws.wins.length === 2 && a1.ws.wins[0].id === MAIN_ID, "add: the first window switches the workspace on, the chart is window 0");
  const m = a1!.ws.wins[0];
  ok(m.kind === "chart" && m.x === 0 && m.y === 0 && m.w === 1 && m.h === 1, "add: the price chart starts filling the whole area");
  const w1 = a1!.ws.wins[1];
  near(w1.w, NEW_W, "add: a new window is 40% wide");
  near(w1.h, NEW_H, "add: ... and 35% high");
  ok(w1.z > m.z && frac(w1), "add: it opens on top and inside the area");
  const a2 = addWindow(a1!.ws);
  ok(!!a2 && a2.id === "w2" && eq(extraIds(a2.ws), ["w1", "w2"]) && windowNumber(a2.ws, "w2") === 2 && windowNumber(a2.ws, MAIN_ID) === 0, "add: the second window, numbers follow creation");
  const w2 = a2!.ws.wins[2];
  ok(Math.abs(w2.x - w1.x) > 0.01 || Math.abs(w2.y - w1.y) > 0.01, "add: a cascade - never exactly over the previous window");
  for (let n = 0; n < 20; n++) ok(frac(cascadeRect(n)), `cascade ${n} stays inside the area`);
  const keep = JSON.stringify(a1!.ws);
  addWindow(a1!.ws);
  ok(JSON.stringify(a1!.ws) === keep, "add never changes the workspace it was given");
  const full = many(MAX_WINDOWS + 3);
  ok(extraIds(full).length === MAX_WINDOWS && addWindow(full) === null, `add: at most ${MAX_WINDOWS} windows`);
  ok(addWindow(a1!.ws, "w1")!.id === "w2" && addWindow(a1!.ws, "w5")!.id === "w5", "add: a free wanted id is used, a taken one is not");

  /* ───────────── close ───────────── */
  ok(closeWindow(null, "w1") === null && closeWindow(a1!.ws, MAIN_ID) === a1!.ws && closeWindow(a1!.ws, "zz") === a1!.ws, "close: nothing to close / the chart cannot be closed / unknown id");
  ok(closeWindow(a1!.ws, "w1") === null, "close the last window: back to the classic chart (null)");
  const c2 = closeWindow(a2!.ws, "w1");
  ok(!!c2 && eq(extraIds(c2), ["w2"]) && isActive(c2), "close one of two");
  ok(addWindow(c2, undefined)!.id === "w1", "a freed id is used again");

  /* ───────────── rect / raise ───────────── */
  const r1 = setRect(a2!.ws, "w1", { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  ok(r1 !== a2!.ws && eq({ ...r1!.wins[1], z: 0, link: "" }, { id: "w1", kind: "ind", x: 0.1, y: 0.2, w: 0.5, h: 0.4, z: 0, link: "" }), "rect: new place");
  ok(setRect(r1, "w1", { x: 0.1, y: 0.2, w: 0.5, h: 0.4 }) === r1, "rect: the same value gives the same object (nothing to save)");
  const out = setRect(r1, "w1", { x: 5, y: -3, w: 9, h: 0 })!.wins[1];
  ok(frac(out) && out.w === 1 && out.h >= 0.05 && out.x === 0, "rect: huge / negative values are pulled inside", JSON.stringify(out));
  ok(setRect(r1, "w1", { x: NaN, y: Infinity, w: NaN, h: NaN })!.wins[1].w === NEW_W, "rect: NaN never reaches the window");
  ok(setRect(r1, "zz", { x: 0, y: 0, w: 1, h: 1 }) === r1 && setRect(null, "w1", { x: 0, y: 0, w: 1, h: 1 }) === null, "rect: unknown window / no workspace change nothing");
  const mv = setRect(a2!.ws, MAIN_ID, { x: 0.02, y: 0.02, w: 0.3, h: 0.3 })!;
  ok(mv.wins[0].id === MAIN_ID && mv.wins[0].w === 0.3, "the price chart can be made small");
  const top = raise(a2!.ws, "w1")!;
  ok(top.wins[1].z > top.wins[2].z && top.wins[1].z > top.wins[0].z, "raise: the clicked window goes to the front");
  ok(raise(top, "w1") === top && raise(a2!.ws, "w2") === a2!.ws && raise(a2!.ws, "zz") === a2!.ws, "raise: already in front / unknown -> same object");
  const rm = raise(a2!.ws, MAIN_ID)!;
  ok(rm.wins[0].z > rm.wins[1].z && rm.wins[0].z > rm.wins[2].z, "raise: the price chart can come to the front too");

  /* ───────────── pixels, dragging ───────────── */
  const px = rectPx({ x: 0.5, y: 0.5, w: 0.4, h: 0.35 }, 1000, 600);
  ok(eq(px, { x: 500, y: 300, w: 400, h: 210 }), "px: fractions of the area");
  ok(rectPx({ x: 0, y: 0, w: 0.05, h: 0.05 }, 1000, 600).w === MIN_WIN_W && rectPx({ x: 0, y: 0, w: 0.05, h: 0.05 }, 1000, 600).h === MIN_WIN_H, "px: never under the floors");
  ok(inside(rectPx({ x: 0.95, y: 0.95, w: 0.4, h: 0.4 }, 1000, 600), 1000, 600), "px: a window that sticks out is pulled in");
  for (const [aw, ah] of [[0, 0], [100, 50], [300, 200], [640, 260], [1920, 1080]] as const) ok(inside(rectPx({ x: 0.9, y: 0.9, w: 1, h: 1 }, aw, ah), aw, ah), `px: area ${aw}x${ah} always holds the window`);
  const back = rectFromPx({ x: 500, y: 300, w: 400, h: 210 }, 1000, 600);
  near(back.x, 0.5, "px -> fractions x");
  near(back.h, 0.35, "px -> fractions h");
  ok(eq(rectFromPx({ x: 1, y: 1, w: 1, h: 1 }, 0, 0), { x: 0, y: 0, w: 1, h: 1 }), "px -> fractions: an empty area is the whole area, never NaN");
  // a window saved on a big screen is the same share on a small one
  const share = rectFromPx(rectPx({ x: 0.3, y: 0.2, w: 0.5, h: 0.5 }, 1920, 1000), 1920, 1000);
  const small = rectPx(share, 960, 500);
  near(small.x / 960, 0.3, "resize of the area keeps the place (share)");

  const st: Rect = { x: 100, y: 100, w: 400, h: 300 };
  ok(eq(dragRect(st, "move", 50, -20, 1000, 600), { x: 150, y: 80, w: 400, h: 300 }), "drag: move");
  ok(eq(dragRect(st, "move", -999, -999, 1000, 600), { x: 0, y: 0, w: 400, h: 300 }) && eq(dragRect(st, "move", 9999, 9999, 1000, 600), { x: 600, y: 300, w: 400, h: 300 }), "drag: a move stops at the edges of the area");
  ok(eq(dragRect(st, "e", 100, 0, 1000, 600), { x: 100, y: 100, w: 500, h: 300 }) && eq(dragRect(st, "s", 0, 100, 1000, 600), { x: 100, y: 100, w: 400, h: 400 }), "drag: right / bottom edge");
  ok(eq(dragRect(st, "w", 60, 0, 1000, 600), { x: 160, y: 100, w: 340, h: 300 }) && eq(dragRect(st, "n", 0, 40, 1000, 600), { x: 100, y: 140, w: 400, h: 260 }), "drag: left / top edge move the other side's opposite");
  const se = dragRect(st, "se", 30, 40, 1000, 600);
  ok(se.x === 100 && se.y === 100 && se.w === 430 && se.h === 340, "drag: a corner changes both sizes");
  const nw = dragRect(st, "nw", 20, 20, 1000, 600);
  ok(nw.x === 120 && nw.y === 120 && nw.w === 380 && nw.h === 280, "drag: the opposite corner stays where it was");
  const tiny = dragRect(st, "e", -9999, 0, 1000, 600);
  ok(tiny.w === MIN_WIN_W && tiny.x === 100, "drag: not narrower than the floor");
  const tiny2 = dragRect(st, "nw", 9999, 9999, 1000, 600);
  ok(tiny2.w === MIN_WIN_W && tiny2.h === MIN_WIN_H && tiny2.x + tiny2.w === 500 && tiny2.y + tiny2.h === 400, "drag: shrinking from the top-left stops at the floors, the bottom-right corner stays");
  ok(inside(dragRect(st, "se", 9999, 9999, 1000, 600), 1000, 600) && inside(dragRect(st, "nw", -9999, -9999, 1000, 600), 1000, 600), "drag: a resize never leaves the area");
  for (const mode of ["move", "n", "s", "e", "w", "ne", "nw", "se", "sw"] as const)
    for (const [dx, dy] of [[0, 0], [37, -81], [-5000, 5000], [1e9, -1e9]] as const) {
      const r = dragRect(st, mode, dx, dy, 1000, 600);
      ok(inside(r, 1000, 600) && r.w >= MIN_WIN_W - 1e-9 && r.h >= MIN_WIN_H - 1e-9 && [r.x, r.y, r.w, r.h].every(Number.isFinite), `drag ${mode} (${dx},${dy}): inside, above the floors, finite`);
    }

  /* ───────────── stored form ───────────── */
  ok(eq(parseWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(a2!.ws)))), a2!.ws), "serialise -> parse gives the same workspace");
  ok((serializeWorkspace(a1!.ws) as { wins: { x: number }[] }).wins.every((w) => String(w.x).length <= 8), "serialise rounds the fractions");
  const junk: [string, unknown][] = [
    ["undefined", undefined],
    ["null", null],
    ["number", 7],
    ["string", "main"],
    ["array", [1, 2]],
    ["no wins", {}],
    ["wins not an array", { wins: {} }],
    ["wins of junk", { wins: [1, null, "x", [], {}] }],
    ["only the chart", { wins: [{ id: "main", kind: "chart", x: 0, y: 0, w: 1, h: 1, z: 1 }] }],
    ["bad ids", { wins: [{ id: "W 1!", kind: "ind", x: 0, y: 0, w: 0.5, h: 0.5 }, { id: 5, kind: "ind" }] }],
    ["unknown kind", { wins: [{ id: "w1", kind: "grid", x: 0, y: 0, w: 0.5, h: 0.5 }] }],
  ];
  for (const [label, v] of junk) ok(parseWorkspace(v) === null, `parse: ${label} -> null`, JSON.stringify(parseWorkspace(v)));
  const p1 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0.2, y: 0.2, w: 0.4, h: 0.4, z: 3 }] });
  ok(!!p1 && p1.wins[0].id === MAIN_ID && p1.wins[0].w === 1 && p1.wins.length === 2, "parse: a missing price chart is put back, filling the area");
  const p2 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, { id: "w1", kind: "ind", x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, { id: "main", kind: "chart", x: 0, y: 0, w: 1, h: 1 }, { id: "main", kind: "chart", x: 0.4, y: 0.4, w: 0.1, h: 0.1 }] });
  ok(!!p2 && p2.wins.length === 2 && p2.wins[1].x === 0.2 && p2.wins[0].w === 1, "parse: a repeated id is dropped (the first one wins)");
  const p3 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 9, y: -9, w: 7, h: 0, z: NaN }, { id: "w2", kind: "ind", x: "a", y: null, w: NaN, h: {}, z: "q" }] });
  ok(!!p3 && p3.wins.every((w) => frac(w) && [w.x, w.y, w.w, w.h, w.z].every(Number.isFinite) && w.w >= 0.05 && w.h >= 0.05), "parse: wild numbers are pulled inside, never NaN", JSON.stringify(p3));
  const p4 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: 50 }, { id: "w2", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: 50 }, { id: "w3", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: -4 }] });
  ok(!!p4 && eq(p4.wins.map((w) => w.z).sort(), [1, 2, 3, 4]) && p4.wins.find((w) => w.id === "w3")!.z < p4.wins.find((w) => w.id === "w1")!.z, "parse: z-orders become 1..n and keep their order", JSON.stringify(p4?.wins.map((w) => [w.id, w.z])));
  const hugeList = { wins: Array.from({ length: 40 }, (_, i) => ({ id: `w${i + 1}`, kind: "ind", x: 0.1, y: 0.1, w: 0.3, h: 0.3, z: i })) };
  ok(extraIds(parseWorkspace(hugeList)).length === MAX_WINDOWS, "parse: more windows than allowed are cut");
  let proto: unknown = null;
  try {
    proto = parseWorkspace(JSON.parse('{"wins":[{"id":"w1","kind":"ind","x":0,"y":0,"w":0.5,"h":0.5,"__proto__":{"polluted":1}}],"__proto__":{"polluted":1}}'));
  } catch {
    proto = "threw";
  }
  ok(proto !== "threw" && ({} as { polluted?: number }).polluted === undefined, "parse: __proto__ in the stored value does nothing");

  /* ───────────── the tiled layout of the first multi-window build ───────────── */
  const t0 = S("v", 0.7, W("main"), S("h", 0.5, W("w2"), W("w1")));
  const junkTree: [string, unknown][] = [
    ["undefined", undefined],
    ["number", 7],
    ["unknown kind", { kind: "grid" }],
    ["only the chart", { kind: "win", id: "main" }],
    ["no chart", S("v", 0.5, W("w1"), W("w2"))],
    ["bad dir", { kind: "split", dir: "x", ratio: 0.5, a: W("main"), b: W("w1") }],
  ];
  for (const [label, v] of junkTree) ok(parseLayout(v) === null, `old tree: ${label} -> null`);
  const mig = migrateTree(parseLayout(t0));
  ok(!!mig && eq(mig.wins.map((w) => w.id), ["main", "w2", "w1"]), "old tree: becomes windows", JSON.stringify(mig?.wins.map((w) => w.id)));
  const mm = mig!.wins.find((w) => w.id === "main")!;
  const m2 = mig!.wins.find((w) => w.id === "w2")!;
  const m1 = mig!.wins.find((w) => w.id === "w1")!;
  near(mm.h, 0.7, "old tree: the chart keeps its 70% height");
  near(m2.w + m1.w, 1, "old tree: the two windows below share the width");
  near(m1.x, 0.5, "old tree: ... side by side as they were");
  ok(mig!.wins.every(frac), "old tree: everything inside the area");
  ok(migrateTree(null) === null && migrateTree(parseLayout({ kind: "win", id: "main" })) === null, "old tree: nothing to migrate for a single chart");
  const deepOk = (n: number) => {
    let t: unknown = W("main");
    for (let i = 1; i <= n; i++) t = { kind: "split", dir: "h", ratio: 0.5, a: t, b: W(`w${i}`) };
    return t;
  };
  ok(extraIds(migrateTree(parseLayout(deepOk(MAX_DEPTH)))).length === MAX_WINDOWS, "old tree: more windows than allowed are cut");
  ok(parseLayout(deepOk(MAX_DEPTH + 4)) === null, "old tree: a chain deeper than allowed is refused");

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
  const entry = (c: IndicatorsController, i: number) => saved(c)[i] as { id?: string; w?: string; ws?: unknown };

  {
    // 1) a plain chart: nothing about windows in the saved list
    const e = new Stub();
    const c = new IndicatorsController();
    c.attach(asEng(e));
    c.add("rsi");
    c.add("macd");
    ok(c.getWorkspace() === null && !c.windowsOn() && saved(c).length === 2 && !JSON.stringify(saved(c)).includes('"ws"') && !JSON.stringify(saved(c)).includes('"w"'), "controller: no windows -> the saved list is exactly as before");
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-"), "controller: own panes as before");

    // 2) windows are not available yet (narrow / not measured): the indicator stays in the stack even if it is assigned
    const w = c.addWindow();
    ok(w === "w1" && eq(c.windowIds(), ["w1"]) && !c.windowsOn(), "controller: addWindow makes a window, but it is not on screen while the chart is narrow");
    c.moveToWindow(c.list()[0].uid, "w1");
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-") && e.series.size === 2 && e.order.length === 2, "controller: unavailable windows -> the indicator stays in the one stack");
    ok(entry(c, 0).w === "w1" && saved(c).length === 3 && !!entry(c, 2).ws, "controller: the assignment and the workspace are saved even while folded");

    // 3) windows become available, the window registers its engine
    const win = new Stub();
    c.attachWindow("w1", asEng(win));
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-"), "controller: a registered window does not pull the indicator before windows are available");
    c.setWindowsAvailable(true);
    const u0 = c.list()[0].uid;
    ok(c.windowsOn() && c.windowOf(u0) === "w1" && c.paneOf(u0) === "win:w1", "controller: available -> the indicator lives in the window");
    ok(win.series.get(u0)?.pane === WIN_PANE && !e.series.has(u0) && e.order.length === 1, "controller: it is drawn by the window engine, its pane in the stack is gone");
    ok(e.series.size === 1, "controller: the other indicator stays under the chart");

    // 4) save -> restore on a fresh chart (reload)
    const json = c.serialize();
    ok(entry(c, 0).w === "w1" && extraIds(parseWorkspace(entry(c, 2).ws)).join() === "w1", "controller: saved list has the window and the assignment");
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

    // 6) the window goes away: the indicator waits, no crash, no stray mount
    c2.detachWindow("w1", asEng(win2));
    ok(!win2.series.has(u2) && !e2.series.has(u2), "controller: a removed window unmounts its indicators");
    const win3 = new Stub();
    c2.attachWindow("w1", asEng(win3));
    ok(win3.series.has(u2), "controller: a new engine for the same window takes them again");

    // 7) move between windows
    const w2 = c2.addWindow();
    ok(w2 === "w2" && eq(c2.windowIds(), ["w1", "w2"]) && c2.windowNumber("w2") === 2, "controller: a second window");
    const win4 = new Stub();
    c2.attachWindow("w2", asEng(win4));
    c2.moveToWindow(u2, "w2");
    ok(c2.windowOf(u2) === "w2" && win4.series.has(u2) && !win3.series.has(u2), "controller: move to another window");
    const u2b = c2.list()[1].uid;
    c2.moveToWindow(u2b, "new");
    ok(c2.windowIds().length === 3 && c2.windowOf(u2b) === "w3", "controller: «move to a new window» creates a floating one and puts the indicator there");
    c2.moveToWindow(u2b, null);
    ok(c2.windowOf(u2b) === undefined && c2.paneOf(u2b).startsWith("ind-") && c2.windowIds().length === 3, "controller: back to the chart (the empty window stays until it is closed)");
    c2.moveToWindow(u2, "nope");
    ok(c2.windowOf(u2) === "w2", "controller: an unknown window changes nothing");

    // 8) close a window: its indicators return to the chart
    c2.closeWindow("w2");
    ok(!c2.windowIds().includes("w2") && c2.windowOf(u2) === undefined && e2.series.has(u2) && !win4.series.has(u2), "controller: closing a window sends its indicators back to the chart");
    c2.closeWindow(MAIN_ID);
    ok(c2.getWorkspace() !== null, "controller: the chart cannot be closed");
    c2.resetWindows();
    ok(c2.getWorkspace() === null && !c2.windowsOn() && saved(c2).length === 2 && !JSON.stringify(saved(c2)).includes('"w"'), "controller: reset layout -> exactly the old saved format");

    // 9) moving / resizing / raising: only the end of a drag is saved
    const e3 = new Stub();
    const c3 = new IndicatorsController();
    c3.attach(asEng(e3));
    c3.setWindowsAvailable(true);
    c3.addWindow();
    c3.addWindow();
    let layoutEvents = 0;
    let savedEvents = 0;
    c3.subscribeLayout(() => layoutEvents++);
    c3.subscribeSaved(() => savedEvents++);
    c3.setRect("w1", { x: 0.1, y: 0.1, w: 0.3, h: 0.3 }, false);
    c3.setRect("w1", { x: 0.2, y: 0.1, w: 0.3, h: 0.3 }, false);
    ok(layoutEvents === 2 && savedEvents === 0, "controller: dragging a window updates the layout without saving", `${layoutEvents} ${savedEvents}`);
    c3.commitLayout();
    ok(savedEvents === 1 && c3.getWorkspace()!.wins[1].x === 0.2, "controller: the end of the drag is saved once");
    c3.setRect("w1", { x: 0.2, y: 0.1, w: 0.3, h: 0.3 }, true);
    ok(savedEvents === 1, "controller: the same place again is not a change");
    c3.raise("w1");
    ok(savedEvents === 2 && c3.getWorkspace()!.wins[1].z > c3.getWorkspace()!.wins[2].z, "controller: a click brings the window to the front (saved)");
    c3.raise("w1");
    ok(savedEvents === 2, "controller: ... once");
    c3.setRect(MAIN_ID, { x: 0, y: 0, w: 0.5, h: 0.5 });
    ok(c3.getWorkspace()!.wins[0].w === 0.5, "controller: the price chart window is resized");
    const json3 = c3.serialize();
    const c3b = new IndicatorsController();
    c3b.restore(json3);
    ok(c3b.serialize() === json3 && c3b.getWorkspace()!.wins[0].w === 0.5, "controller: positions, sizes and z-order survive save -> restore");
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
    const id = c.addWindow();
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
    // the stack for the screenshot is back to front
    c.raise(MAIN_ID);
    const stack = c.windowStack();
    ok(stack.length === 2 && stack[0].z < stack[1].z && stack[1].engine === (e as unknown as ChartEngine), "controller: the picture is put together back to front (the chart on top after a click)");
  }

  {
    // 12) damaged / foreign stored data never breaks the chart
    const goodWs = serializeWorkspace(addWindow(null)!.ws);
    const cases: [string, unknown[]][] = [
      ["ws is a number", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { ws: 5 }]],
      ["ws is a string", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { ws: "w1" }]],
      ["ws without windows", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { ws: { wins: [] } }]],
      ["w is an object", [{ id: "rsi", params: {}, visible: true, w: { a: 1 } }, { ws: goodWs }]],
      ["w names a window that is not there", [{ id: "rsi", params: {}, visible: true, w: "w9" }, { ws: goodWs }]],
      ["w is main", [{ id: "rsi", params: {}, visible: true, w: "main" }, { ws: goodWs }]],
      ["w without any layout", [{ id: "rsi", params: {}, visible: true, w: "w1" }]],
      ["ws as an array", [{ id: "rsi", params: {}, visible: true }, [{ ws: 1 }]]],
      ["ws twice", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { ws: goodWs }, { ws: 7 }]],
      ["a good window", [{ id: "rsi", params: {}, visible: true, w: "w1" }, { ws: goodWs }]],
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
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }, { ws: goodWs }]));
    ok(c.list().length === 1 && c.getWorkspace() !== null, "restore: the workspace entry is not an indicator");
    // an older list (no workspace) replaces the layout of a live chart
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }]));
    ok(c.getWorkspace() === null, "restore: a list without a workspace clears the windows (a template without windows)");
    c.restore("not json");
    ok(c.list().length === 1, "restore: junk text changes nothing");
    // too many windows in the stored data
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }, { ws: hugeList }]));
    ok(c.windowIds().length === MAX_WINDOWS, "restore: more windows than allowed are cut", String(c.windowIds().length));
    // what the first multi-window build saved (the tiled tree) becomes floating windows in the same places, indicators stay in theirs
    const e = new Stub();
    const old = new IndicatorsController();
    old.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true, w: "w1" }, { lay: t0 }]));
    old.attach(asEng(e));
    old.setWindowsAvailable(true);
    const ow = new Stub();
    old.attachWindow("w1", asEng(ow));
    const ou = old.list()[0].uid;
    ok(eq(old.windowIds(), ["w2", "w1"]) && old.windowOf(ou) === "w1" && ow.series.has(ou), "restore: a layout saved by the tiled build keeps its windows and indicators");
    const migrated = JSON.parse(old.serialize()).find((x: { ws?: unknown }) => x.ws);
    ok(!!migrated && !JSON.stringify(JSON.parse(old.serialize())).includes('"lay"'), "restore: ... and is saved in the new form from now on");
    old.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }, { lay: "junk" }]));
    ok(old.getWorkspace() === null && old.list().length === 1, "restore: a broken old layout is ignored");
  }

  /* ───────────── windows with a chart of their own ───────────── */
  {
    const c1 = addChartWindow(null, "moex", "SBER", "cabc12");
    ok(!!c1 && c1.id === "cabc12" && isActive(c1.ws) && c1.ws.wins[1].kind === "chart" && c1.ws.wins[1].src === "moex" && c1.ws.wins[1].tk === "SBER", "chart window: added with its instrument, the workspace is on");
    ok(frac(c1!.ws.wins[1]) && c1!.ws.wins[1].w > NEW_W, "chart window: inside the area, bigger than an indicator window");
    for (let n = 0; n < 12; n++) ok(frac(cascadeRect(n, "chart")), `chart cascade ${n} stays inside the area`);
    ok(addChartWindow(null, "moex", "BAD TICKER!") === null && addChartWindow(null, "", "SBER") === null && addChartWindow(null, "MOEX", "SBER") === null && addChartWindow(null, "moex", "") === null, "chart window: a bad instrument is refused");
    ok(addChartWindow(null, "forex", "EURUSD")!.id === "w1" && addChartWindow(null, "bybit", "BTCUSDT")!.ws.wins[1].tk === "BTCUSDT" && addChartWindow(null, "moex", "Si-12.26")!.ws.wins[1].tk === "Si-12.26", "chart window: usual tickers pass");
    let both: Workspace | null = c1!.ws;
    both = addWindow(both)!.ws;
    ok(eq(indIds(both), ["w1"]) && windowNumber(both, "w1") === 1 && windowNumber(both, "cabc12") === 0 && chartCount(both) === 1 && extraIds(both).length === 2, "numbers and ids: indicator windows count on their own, a chart window is not 'window 1'");
    ok(setSymbol(both, "cabc12", "forex", "EURUSD")!.wins[1].tk === "EURUSD" && setSymbol(both, "cabc12", "moex", "SBER") === both, "setSymbol: new instrument / the same one");
    ok(setSymbol(both, "w1", "forex", "EURUSD") === both && setSymbol(both, MAIN_ID, "forex", "EURUSD") === both && setSymbol(both, "cabc12", "x y", "EURUSD") === both && setSymbol(both, "zz", "forex", "EURUSD") === both, "setSymbol: not for an indicator window / the price chart / junk");
    let charts: Workspace | null = null;
    for (let i = 0; i < MAX_CHARTS + 3; i++) charts = addChartWindow(charts, "moex", "SBER", `c${i}x`)?.ws ?? charts;
    ok(chartCount(charts) === MAX_CHARTS && addChartWindow(charts, "moex", "SBER") === null, `chart windows: at most ${MAX_CHARTS}`);
    ok(addWindow(charts) !== null, "chart windows: indicator windows can still be added");
    ok(eq(parseWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(both)))), both), "chart window: serialise -> parse is the same");
    const bad = parseWorkspace({
      wins: [
        { id: "ca", kind: "chart", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "cb", kind: "chart", src: "moex", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "cc", kind: "chart", src: "MOEX!", tk: "SBER", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "cd", kind: "chart", src: "moex", tk: { x: 1 }, x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "ce", kind: "chart", src: "moex", tk: "SBER", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      ],
    });
    ok(!!bad && eq(extraIds(bad), ["ce"]), "parse: a chart window without a valid instrument is dropped", JSON.stringify(bad && extraIds(bad)));
    const mainC = parseWorkspace({ wins: [{ id: "main", kind: "chart", src: "forex", tk: "X", x: 0, y: 0, w: 1, h: 1 }, { id: "w1", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4 }] });
    ok(!!mainC && mainC.wins[0].src === undefined, "parse: the price chart takes its instrument from the page, not from storage");
    const eng = new IndicatorsController();
    ok(eng.addChartWindow("moex", "SBER") !== "" && eng.windowCount() === 1 && eng.windowIds().length === 0, "controller: a chart window is a window, but not one an indicator can go to");
    const cid = extraIds(eng.getWorkspace())[0];
    eng.setChartSymbol(cid, "bybit", "BTCUSDT");
    ok(eng.getWorkspace()!.wins[1].tk === "BTCUSDT", "controller: another instrument in a chart window");
    const rsiC = eng.add("rsi");
    eng.moveToWindow(rsiC, cid);
    ok(eng.windowOf(rsiC) === undefined, "controller: indicators cannot be moved into a chart window");
    eng.setAddTarget(cid);
    const rsiD = eng.add("rsi");
    ok(eng.windowOf(rsiD) === undefined, "controller: ... nor added there from the catalog");
    const j = eng.serialize();
    const eng2 = new IndicatorsController();
    eng2.restore(j);
    ok(eng2.serialize() === j && eng2.getWorkspace()!.wins[1].src === "bybit" && eng2.windowCount() === 1, "controller: chart windows survive save -> restore (instrument included)");
    ok(eng2.canAddChart() && eng2.addChartWindow("moex", "GAZP") !== "" && eng2.windowCount() === 2, "controller: several charts, each with its own instrument");
    eng2.closeWindow(cid);
    ok(eng2.windowCount() === 1 && !hasWindow(eng2.getWorkspace(), cid), "controller: a chart window is closed like any other");
    // a window saved by an older build with the same ids still reads
    const e3 = new IndicatorsController();
    e3.restore(JSON.stringify([{ ws: { v: 2, wins: [{ id: "main", kind: "chart", x: 0, y: 0, w: 1, h: 1, z: 1 }, { id: "w1", kind: "ind", x: 0.5, y: 0.5, w: 0.4, h: 0.4, z: 2, link: "main" }] } }]));
    ok(eq(e3.windowIds(), ["w1"]), "restore: the previous build's workspace still reads");
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main();
