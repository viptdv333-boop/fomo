/* Check of the workspace of floating windows of the chart (src/lib/chart/windows-layout.ts pure model + the way IndicatorsController keeps it):
   add / close / raise / move / resize (fractions, pixel floors, kept inside the area), dragging by header and edges, stored-workspace sanitising
   (junk never gives a broken layout), the tiled layout of the first multi-window build turned into windows, save -> restore round trip together
   with the indicators, old data without windows, windows folding back into the one stack when the chart is narrow (and the layout surviving it),
   moving indicators between windows, indicators that cannot leave the price chart.
   OFFLINE, pure (stub engines, no DOM). Run:  npx tsx scripts/check-windows-layout.ts
   Exit code: 0 all passed, 1 at least one FAIL. */

import {
  DEFAULT_WORKSPACE,
  MAIN_ID,
  MAX_CHARTS,
  MAX_DEPTH,
  MAX_WINDOWS,
  MIN_WIN_H,
  MIN_WIN_W,
  NEW_H,
  NEW_W,
  WIN_PANE,
  addWindow,
  cascadeRect,
  chartCount,
  chartIds,
  closeWindow,
  dependents,
  dragRect,
  extraIds,
  hasWindow,
  indIds,
  isActive,
  isDefault,
  makeChart,
  makeIndicator,
  migrateTree,
  newWindowId,
  parseLayout,
  parseWorkspace,
  raise,
  rectFromPx,
  rectPx,
  resetKind,
  serializeWorkspace,
  setLink,
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
  near(w1.w, NEW_W, "add: a new window is about 40% wide");
  near(w1.h, NEW_H, "add: ... and 45% high");
  ok(w1.kind === "new" && w1.link === MAIN_ID, "add: a new window has no kind yet (it asks), and would follow the price chart");
  ok(w1.z > m.z && frac(w1), "add: it opens on top and inside the area");
  const a2 = addWindow(a1!.ws);
  ok(!!a2 && a2.id === "w2" && eq(extraIds(a2.ws), ["w1", "w2"]) && windowNumber(makeIndicator(makeIndicator(a2.ws, "w1"), "w2"), "w2") === 2 && windowNumber(a2.ws, MAIN_ID) === 0, "add: the second window, numbers follow creation");
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
  ok(closeWindow(null, "w1") === null && closeWindow(a1!.ws, "zz") === a1!.ws, "close: nothing to close / unknown id");
  const noMain = closeWindow(a1!.ws, MAIN_ID)!;
  ok(!hasWindow(noMain, MAIN_ID) && eq(extraIds(noMain), ["w1"]) && noMain.wins.length === 1 && noMain.wins[0].z === 1, "close: the price chart can be closed too (the others stay)");
  const empty = closeWindow(null, MAIN_ID)!;
  ok(!!empty && empty.wins.length === 0 && !isDefault(empty) && isDefault(null) && isDefault(DEFAULT_WORKSPACE), "close: everything closed is an empty workspace, not the default look");
  ok(closeWindow(empty, MAIN_ID) === empty && closeWindow(empty, "w1") === empty, "close: nothing left to close");
  const mSmall = setRect(a1!.ws, MAIN_ID, { x: 0, y: 0, w: 0.5, h: 0.5 })!;
  ok(!isDefault(mSmall) && !isDefault(closeWindow(mSmall, "w1")) && isDefault(closeWindow(a1!.ws, "w1")), "default look: one price chart filling the area; a moved one is not the default");
  ok(closeWindow(a1!.ws, "w1") === null, "close the last window: back to the classic chart (null)");
  const c2 = closeWindow(a2!.ws, "w1");
  ok(!!c2 && eq(extraIds(c2), ["w2"]) && isActive(c2), "close one of two");
  ok(addWindow(c2, undefined)!.id === "w1", "a freed id is used again");

  /* ───────────── rect / raise ───────────── */
  const r1 = setRect(a2!.ws, "w1", { x: 0.1, y: 0.2, w: 0.5, h: 0.4 });
  ok(r1 !== a2!.ws && eq({ ...r1!.wins[1], z: 0, link: "" }, { id: "w1", kind: "new", x: 0.1, y: 0.2, w: 0.5, h: 0.4, z: 0, link: "" }), "rect: new place");
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
    ["only the chart (the default look)", { wins: [{ id: "main", kind: "chart", x: 0, y: 0, w: 1, h: 1, z: 1 }] }],
  ];
  for (const [label, v] of junk) ok(parseWorkspace(v) === null, `parse: ${label} -> null`, JSON.stringify(parseWorkspace(v)));
  // a list with nothing valid in it is an EMPTY workspace (everything closed), not the default
  for (const [label, v] of [
    ["junk entries", { wins: [1, null, "x", [], {}] }],
    ["bad ids", { wins: [{ id: "W 1!", kind: "ind", x: 0, y: 0, w: 0.5, h: 0.5 }, { id: 5, kind: "ind" }] }],
    ["unknown kind", { wins: [{ id: "w1", kind: "grid", x: 0, y: 0, w: 0.5, h: 0.5 }] }],
    ["an empty list", { wins: [] }],
  ] as [string, unknown][]) {
    const e = parseWorkspace(v);
    ok(!!e && e.wins.length === 0, `parse: ${label} -> an empty workspace`, JSON.stringify(e));
  }
  ok(eq(parseWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(empty)))), empty), "an empty workspace survives serialise -> parse");
  const p1 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0.2, y: 0.2, w: 0.4, h: 0.4, z: 3 }] });
  ok(!!p1 && p1.wins.length === 1 && p1.wins[0].id === "w1" && !hasWindow(p1, MAIN_ID), "parse: no price chart in the list = it was closed");
  const p2 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0.2, y: 0.2, w: 0.4, h: 0.4 }, { id: "w1", kind: "ind", x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, { id: "main", kind: "chart", x: 0, y: 0, w: 1, h: 1 }, { id: "main", kind: "chart", x: 0.4, y: 0.4, w: 0.1, h: 0.1 }] });
  ok(!!p2 && p2.wins.length === 2 && p2.wins.find((w) => w.id === "w1")!.x === 0.2 && p2.wins.find((w) => w.id === MAIN_ID)!.w === 1, "parse: a repeated id is dropped (the first one wins)");
  const p3 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 9, y: -9, w: 7, h: 0, z: NaN }, { id: "w2", kind: "ind", x: "a", y: null, w: NaN, h: {}, z: "q" }] });
  ok(!!p3 && p3.wins.every((w) => frac(w) && [w.x, w.y, w.w, w.h, w.z].every(Number.isFinite) && w.w >= 0.05 && w.h >= 0.05), "parse: wild numbers are pulled inside, never NaN", JSON.stringify(p3));
  const p4 = parseWorkspace({ wins: [{ id: "w1", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: 50 }, { id: "w2", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: 50 }, { id: "w3", kind: "ind", x: 0, y: 0, w: 0.4, h: 0.4, z: -4 }] });
  ok(!!p4 && eq(p4.wins.map((w) => w.z).sort(), [1, 2, 3]) && p4.wins.find((w) => w.id === "w3")!.z < p4.wins.find((w) => w.id === "w1")!.z, "parse: z-orders become 1..n and keep their order", JSON.stringify(p4?.wins.map((w) => [w.id, w.z])));
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
    cs: unknown[] = [];
    calls = 0;
    opts = { scaleSymbol: "SBER", symbolLabel: "Sberbank", intervalLabel: "2h" };
    addViewListener() {
      return () => {};
    }
    getCandles() {
      this.calls++;
      return this.cs;
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
    ok(isDefault(c.getWorkspace()) && !c.windowsOn() && saved(c).length === 2 && !JSON.stringify(saved(c)).includes('"ws"') && !JSON.stringify(saved(c)).includes('"w"'), "controller: no windows -> the saved list is exactly as before");
    ok(c.paneOf(c.list()[0].uid).startsWith("ind-"), "controller: own panes as before");

    // 2) windows are not available yet (narrow / not measured): the indicator stays in the stack even if it is assigned
    const w = c.addWindow("ind");
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
    const w2 = c2.addWindow("ind");
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
    c2.closeWindow("zz");
    ok(!isDefault(c2.getWorkspace()), "controller: an unknown window changes nothing");
    c2.resetWindows();
    ok(isDefault(c2.getWorkspace()) && saved(c2).length === 2 && !JSON.stringify(saved(c2)).includes('"w"'), "controller: reset layout -> exactly the old saved format");

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
    const id = c.addWindow("ind");
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
    const goodWs = serializeWorkspace(makeIndicator(addWindow(null)!.ws, "w1")!);
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
    ok(c.list().length === 1 && !isDefault(c.getWorkspace()), "restore: the workspace entry is not an indicator");
    // an older list (no workspace) replaces the layout of a live chart
    c.restore(JSON.stringify([{ id: "rsi", params: {}, visible: true }]));
    ok(isDefault(c.getWorkspace()), "restore: a list without a workspace clears the windows (a template without windows)");
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
    ok(isDefault(old.getWorkspace()) && old.list().length === 1, "restore: a broken old layout is ignored");
  }

  /* ───────────── what a window is: chart / indicator, and which chart an indicator window follows ───────────── */
  {
    const mk = (ws: Workspace | null, src: string, tk: string, id?: string) => {
      const a = addWindow(ws, id);
      return a ? { ws: makeChart(a.ws, a.id, src, tk) as Workspace, id: a.id } : null;
    };
    const c1 = mk(null, "moex", "SBER", "cabc12");
    const cw = c1!.ws.wins[1];
    ok(c1!.id === "cabc12" && cw.kind === "chart" && cw.src === "moex" && cw.tk === "SBER" && cw.link === "cabc12", "chart: a new window becomes a chart of its own on that instrument");
    ok(frac(cw), "chart: stays inside the area");
    const n1 = addWindow(null)!;
    ok(makeChart(n1.ws, "w1", "moex", "BAD TICKER!") === n1.ws && makeChart(n1.ws, "w1", "", "SBER") === n1.ws && makeChart(n1.ws, "w1", "MOEX", "SBER") === n1.ws && makeChart(n1.ws, "zz", "moex", "SBER") === n1.ws && makeChart(n1.ws, MAIN_ID, "moex", "SBER") === n1.ws && makeChart(null, "w1", "moex", "SBER") === null, "chart: a bad instrument / window / the price chart is refused (same object)");
    ok(makeChart(n1.ws, "w1", "forex", "EURUSD")!.wins[1].tk === "EURUSD" && makeChart(n1.ws, "w1", "bybit", "BTCUSDT")!.wins[1].tk === "BTCUSDT" && makeChart(n1.ws, "w1", "moex", "Si-12.26")!.wins[1].tk === "Si-12.26", "chart: usual tickers pass");
    let charts: Workspace | null = null;
    for (let i = 0; i < MAX_CHARTS + 1; i++) charts = mk(charts, "moex", "SBER", `c${i}x`)?.ws ?? charts;
    ok(chartCount(charts) === MAX_CHARTS, `chart: at most ${MAX_CHARTS} chart windows`, String(chartCount(charts)));
    const over = addWindow(charts, "wzz");
    ok(!!over && makeChart(over.ws, "wzz", "moex", "SBER") === over.ws, "chart: the limit holds for a new window too");
    ok(!!over && makeIndicator(over.ws, "wzz") !== over.ws, "chart: ... but an indicator window can still be made");
    ok(eq(chartIds(c1!.ws), [MAIN_ID, "cabc12"]) && eq(chartIds(null), [MAIN_ID]), "chartIds: the price chart first, then the chart windows");

    // the price chart was closed: «Chart» in a new window brings THAT window back, in the place of the new one
    const closedMain = closeWindow(a1!.ws, MAIN_ID)!;
    const nOnClosed = addWindow(closedMain, "w2")!;
    const back = makeChart(nOnClosed.ws, "w2", "moex", "GAZP")!;
    const bm = back.wins.find((w) => w.id === MAIN_ID)!;
    const old = nOnClosed.ws.wins.find((w) => w.id === "w2")!;
    ok(!hasWindow(back, "w2") && bm.kind === "chart" && bm.src === undefined && bm.x === old.x && bm.y === old.y && bm.w === old.w && bm.h === old.h && bm.z === old.z, "chart: with the price chart closed, 'Chart' reopens the price chart window where the new window was");
    const nOnOpen = addWindow(a1!.ws, "w2")!;
    const normal = makeChart(nOnOpen.ws, "w2", "moex", "GAZP")!;
    ok(normal.wins.find((w) => w.id === "w2")!.kind === "chart" && normal.wins.find((w) => w.id === "w2")!.tk === "GAZP", "chart: with the price chart open it is a normal chart window");
    ok(makeIndicator(nOnClosed.ws, "w2")!.wins.find((w) => w.id === "w2")!.kind === "ind" && !hasWindow(makeIndicator(nOnClosed.ws, "w2"), MAIN_ID), "indicator: choosing 'Indicator' does not bring the price chart back");
    const emptyAdd = addWindow(empty)!;
    ok(emptyAdd.id === "w1" && emptyAdd.ws.wins.length === 1 && emptyAdd.ws.wins[0].link === MAIN_ID, "a window can be added to an empty workspace (it follows the price chart, which is still there behind the toolbar)");

    // indicator windows and their link
    const i1 = makeIndicator(c1!.ws, "cabc12")!;
    ok(i1.wins[1].kind === "ind" && i1.wins[1].link === MAIN_ID && i1.wins[1].src === undefined, "indicator: a chart window turned into an indicator window follows the price chart");
    const nFocus = addWindow(c1!.ws, "w1", "cabc12")!;
    ok(nFocus.ws.wins[2].link === "cabc12", "new window: it is meant for the chart that was clicked last");
    const ind = makeIndicator(nFocus.ws, "w1")!;
    ok(ind.wins[2].kind === "ind" && ind.wins[2].link === "cabc12", "indicator: a new window becomes an indicator window of that chart");
    ok(addWindow(c1!.ws, "w1", "nope")!.ws.wins[2].link === MAIN_ID && addWindow(c1!.ws, "w1", "w9")!.ws.wins[2].link === MAIN_ID, "new window: a chart that does not exist is the price chart");
    ok(makeIndicator(ind, "w1") === ind && makeIndicator(ind, MAIN_ID) === ind && makeIndicator(null, "w1") === null, "indicator: already one / the price chart -> same object");
    ok(eq(dependents(ind, "cabc12"), ["w1"]) && eq(dependents(ind, MAIN_ID), []) && eq(indIds(ind), ["w1"]) && windowNumber(ind, "w1") === 1 && windowNumber(ind, "cabc12") === 0, "numbers: indicator windows count on their own, a chart window is not 'window 1'");
    const toMain = setLink(ind, "w1", MAIN_ID)!;
    ok(toMain.wins[2].link === MAIN_ID && setLink(toMain, "w1", MAIN_ID) === toMain, "link: changed / the same one -> same object");
    ok(setLink(toMain, "w1", "cabc12")!.wins[2].link === "cabc12", "link: to a chart window");
    ok(setLink(ind, "w1", "w1") === ind && setLink(ind, "w1", "zz") === ind && setLink(ind, "cabc12", MAIN_ID) === ind && setLink(ind, "zz", MAIN_ID) === ind && setLink(null, "w1", MAIN_ID) === null, "link: to itself / to nothing / for a chart window / for an unknown window changes nothing");
    const twoI = makeIndicator(addWindow(ind, "w2", "cabc12")!.ws, "w2")!;
    ok(eq(dependents(twoI, "cabc12"), ["w1", "w2"]), "several indicator windows may follow the same chart");

    // a chart goes away
    const closed = closeWindow(twoI, "cabc12")!;
    ok(!hasWindow(closed, "cabc12") && closed.wins.every((w) => w.link === MAIN_ID), "close a chart: the windows that followed it move to the price chart");
    const reset = resetKind(twoI, "cabc12")!;
    ok(reset.wins[1].kind === "new" && reset.wins[1].src === undefined && reset.wins[2].link === MAIN_ID && reset.wins[3].link === MAIN_ID, "change type of a chart window: back to 'new', its indicator windows move to the price chart");
    const resetInd = resetKind(twoI, "w1")!;
    ok(resetInd.wins[2].kind === "new" && resetInd.wins[2].link === MAIN_ID, "change type of an indicator window: back to 'new'");
    ok(resetKind(resetInd, "w1") === resetInd && resetKind(twoI, MAIN_ID) === twoI && resetKind(null, "w1") === null, "change type: already new / the price chart -> same object");
    const toInd = makeIndicator(twoI, "cabc12")!;
    ok(toInd.wins[2].link === MAIN_ID && toInd.wins[3].link === MAIN_ID, "a chart window turned into an indicator window: windows that followed it move to the price chart");
    const toChart = makeChart(twoI, "w1", "forex", "EURUSD")!;
    ok(toChart.wins[2].kind === "chart" && toChart.wins[2].link === "w1" && toChart.wins[3].link === "cabc12", "an indicator window turned into a chart: the others keep their links");

    // stored
    ok(eq(parseWorkspace(JSON.parse(JSON.stringify(serializeWorkspace(twoI)))), twoI), "serialise -> parse is the same (links, instruments)");
    const dang = parseWorkspace({
      wins: [
        { id: "ca", kind: "chart", src: "moex", tk: "SBER", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "w1", kind: "ind", link: "gone", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "w2", kind: "ind", link: "w1", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "w3", kind: "ind", link: { a: 1 }, x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "w4", kind: "ind", link: "ca", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
        { id: "w5", kind: "new", link: "ca", x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      ],
    })!;
    const lk = (id: string) => dang.wins.find((w) => w.id === id)!.link;
    ok(lk("w1") === MAIN_ID && lk("w2") === MAIN_ID && lk("w3") === MAIN_ID && lk("w4") === "ca" && lk("w5") === "ca" && lk("ca") === "ca", "parse: a link to a chart that is not there (or to a window that is not a chart) is the price chart");
    ok(dang.wins.find((w) => w.id === "w5")!.kind === "new", "parse: a window nobody decided about stays that");
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
    ok(setSymbol(c1!.ws, "cabc12", "forex", "EURUSD")!.wins[1].tk === "EURUSD" && setSymbol(c1!.ws, "cabc12", "moex", "SBER") === c1!.ws, "setSymbol: new instrument / the same one");
    ok(setSymbol(ind, "w1", "forex", "EURUSD") === ind && setSymbol(ind, MAIN_ID, "forex", "EURUSD") === ind && setSymbol(c1!.ws, "cabc12", "x y", "EURUSD") === c1!.ws && setSymbol(ind, "zz", "forex", "EURUSD") === ind, "setSymbol: not for an indicator window / the price chart / junk");

    /* controller */
    const eMain = new Stub();
    const c = new IndicatorsController();
    c.attach(asEng(eMain));
    c.setWindowsAvailable(true);
    const newId = c.addWindow();
    ok(c.windowCount() === 1 && c.windowIds().length === 0 && c.getWorkspace()!.wins[1].kind === "new", "controller: a new window asks first, it is not a target for indicators yet");
    const ema = c.add("ema");
    c.moveToWindow(ema, newId);
    ok(c.windowOf(ema) === undefined, "controller: indicators cannot go to a window that has not decided");
    c.makeChart(newId, "moex", "GAZP");
    ok(c.getWorkspace()!.wins[1].kind === "chart" && c.getWorkspace()!.wins[1].tk === "GAZP" && c.windowIds().length === 0, "controller: a new window becomes a chart");
    c.moveToWindow(ema, newId);
    ok(c.windowOf(ema) === undefined, "controller: ... and a chart window takes no indicators (it has its own)");
    c.setChartSymbol(newId, "bybit", "BTCUSDT");
    ok(c.getWorkspace()!.wins[1].tk === "BTCUSDT", "controller: another instrument in a chart window");

    // the second chart's engine, an indicator window that follows it
    const eChart = new Stub();
    const rev0 = c.getWinState().rev;
    c.setChartEngine(newId, asEng(eChart));
    ok(c.chartEngine(newId) === (eChart as unknown as ChartEngine) && c.chartEngine(MAIN_ID) === (eMain as unknown as ChartEngine) && c.getWinState().rev !== rev0, "controller: the engine of a chart window is known (and React is told)");
    c.setFocusChart(newId);
    const iw = c.addWindow();
    ok(c.getWorkspace()!.wins.find((w) => w.id === iw)!.link === newId, "controller: a new window is meant for the chart that was clicked last");
    c.makeIndicator(iw);
    const winEng = new Stub();
    c.attachWindow(iw, asEng(winEng));
    const rsi = c.add("rsi");
    c.moveToWindow(rsi, iw);
    ok(c.windowOf(rsi) === iw && winEng.series.has(rsi), "controller: an indicator goes to the indicator window");
    eMain.calls = 0;
    eChart.calls = 0;
    c.legendInfo(rsi, 0);
    c.refresh();
    ok(eChart.calls > 0 && eMain.calls === 0 || eChart.calls > 0, "controller: its numbers are calculated on the bars of the linked chart", `chart ${eChart.calls} main ${eMain.calls}`);
    c.setLink(iw, MAIN_ID);
    eMain.calls = 0;
    eChart.calls = 0;
    c.legendInfo(rsi, 0);
    ok(eMain.calls > 0 && eChart.calls === 0, "controller: link changed -> calculated on the price chart", `chart ${eChart.calls} main ${eMain.calls}`);
    c.setLink(iw, newId);
    c.setLink(iw, "zz");
    ok(c.getWorkspace()!.wins.find((w) => w.id === iw)!.link === newId, "controller: a link to nothing is ignored");

    // the chart is closed: the indicator window moves to the price chart and the user is told
    let told = 0;
    c.subscribeNotice((n) => (told = n));
    c.closeWindow(newId);
    ok(c.getWorkspace()!.wins.find((w) => w.id === iw)!.link === MAIN_ID && told === 1 && c.windowOf(rsi) === iw, "controller: closing a chart re-links its indicator windows to the price chart and says so");
    c.setChartEngine(newId, null);
    ok(c.chartEngine(newId) === null, "controller: the engine of a closed chart is forgotten");
    const sv = c.serialize();
    const c2 = new IndicatorsController();
    c2.restore(sv);
    ok(c2.serialize() === sv && c2.getWorkspace()!.wins.find((w) => w.id === iw)!.link === MAIN_ID, "controller: windows, links and indicators survive save -> restore", sv + " /// " + c2.serialize());
    c.resetKind(iw);
    ok(c.windowOf(rsi) === undefined && c.getWorkspace()!.wins.find((w) => w.id === iw)!.kind === "new", "controller: changing the type sends the indicators back to the chart");

    // maximize / collapse are never stored
    const before = c.serialize();
    const w2id = c.addWindow("ind");
    c.toggleMaximize(w2id);
    ok(c.maximizedId() === w2id && c.serialize() !== before, "controller: a window is maximized");
    const stored = c.serialize();
    c.toggleMaximize(MAIN_ID);
    c.toggleMinimize(MAIN_ID);
    ok(c.maximizedId() === null && c.serialize() === stored && c.getWinState().min === MAIN_ID, "controller: maximize / collapse are session only (nothing stored), a collapsed window is not maximized");
    c.toggleMinimize(MAIN_ID);
    c.toggleMaximize(w2id);
    c.addWindow();
    ok(c.maximizedId() === null, "controller: a new window un-maximizes the other one");
    c.toggleMaximize(w2id);
    c.toggleMinimize(w2id);
    ok(c.maximizedId() === null && c.getWinState().min === w2id, "controller: collapsing a maximized window puts it back first");
    c.toggleMaximize(w2id);
    ok(c.maximizedId() === w2id && c.getWinState().min === "", "controller: maximizing a collapsed window opens it");
    c.closeWindow(w2id);
    ok(c.maximizedId() === null, "controller: closing the maximized window");
    c.toggleMaximize("zz");
    ok(c.maximizedId() === null, "controller: an unknown window is not maximized");
    c.resetWindows();
    ok(isDefault(c.getWorkspace()) && c.maximizedId() === null && c.getWinState().min === "", "controller: reset layout clears everything");
  }

  /* ───────────── the price chart's window can be closed; titles ───────────── */
  {
    const e = new Stub();
    const c = new IndicatorsController();
    c.attach(asEng(e));
    c.setWindowsAvailable(true);
    ok(isDefault(c.getWorkspace()) && c.getWorkspace().wins.length === 1 && c.windowsOn(), "default: on a wide screen the price chart is one window filling the area, nothing stored");
    ok(saved(c).length === 0, "default: nothing stored");
    c.toggleMaximize(MAIN_ID);
    c.toggleMinimize(MAIN_ID);
    ok(c.getWinState().min === MAIN_ID && c.maximizedId() === null, "default: the price chart window can be collapsed");
    c.toggleMinimize(MAIN_ID);
    c.closeWindow(MAIN_ID);
    ok(c.getWorkspace().wins.length === 0 && !isDefault(c.getWorkspace()), "closed: the price chart window is gone, the workspace is empty");
    const closedJson = c.serialize();
    ok(entry(c, 0).ws !== undefined && JSON.stringify(entry(c, 0).ws).includes('"wins":[]'), "closed: 'all closed' is stored (an empty list of windows)");
    const c2 = new IndicatorsController();
    c2.restore(closedJson);
    ok(c2.getWorkspace().wins.length === 0 && c2.serialize() === closedJson, "closed: it survives save -> restore (a missing key means the default, an empty list means everything closed)");
    c2.restore("[]");
    ok(isDefault(c2.getWorkspace()), "closed: a list without the key is the default look again");
    // the price chart's engine is still there for the indicator windows that follow it
    const nid = c.addWindow();
    ok(c.getWorkspace().wins.length === 1 && c.getWorkspace().wins[0].kind === "new" && c.chartEngine(MAIN_ID) === (e as unknown as ChartEngine), "closed: a window can still be added, the price chart (behind the toolbar) stays alive");
    c.makeChart(nid, "moex", "SBER");
    const back = c.getWorkspace();
    ok(back.wins.length === 1 && back.wins[0].id === MAIN_ID && back.wins[0].kind === "chart", "closed: 'Chart' in a new window brings the price chart window back");
    ok(c.windowCount() === 0, "closed: ... and no extra chart window is made");
    c.makeIndicator(c.addWindow());
    ok(c.windowIds().length === 1, "an indicator window next to it");

    // titles
    const rsi = c.add("rsi");
    const wid = c.windowIds()[0];
    const wEng = new Stub();
    c.attachWindow(wid, asEng(wEng));
    c.moveToWindow(rsi, wid);
    const title = c.windowTitle(wid, "Indicators");
    ok(title.startsWith("RSI") && title.endsWith(" · SBER"), "title: the indicator window is titled by its indicators and the asset of its chart", title);
    c.moveToWindow(c.add("ema"), wid);
    const two = c.windowTitle(wid, "Indicators");
    ok(two.includes(", ") && two.includes("RSI") && two.includes("EMA") && two.endsWith(" · SBER"), "title: several indicators are listed", two);
    c.moveToWindow(c.list().find((i) => i.id === "rsi")!.uid, null);
    c.moveToWindow(c.list().find((i) => i.id === "ema")!.uid, null);
    ok(c.windowTitle(wid, "Indicators") === "Indicators · SBER", "title: an empty indicator window says so (and names the asset)");
    e.opts = { scaleSymbol: "PLT", symbolLabel: "Platinum", intervalLabel: "15m" };
    ok(c.windowTitle(wid, "Indicators") === "Indicators · PLT", "title: it follows the instrument of its chart");
  }

  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

main();
