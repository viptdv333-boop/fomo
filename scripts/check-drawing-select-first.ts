/* Drawings select-first rule (TradingView): a press on an UNSELECTED drawing only selects it and leaves the
   gesture to the chart (pan); moving takes a second press on the selected drawing. Mouse and touch alike.
   Run: npx tsx scripts/check-drawing-select-first.ts   (exit code 1 on a failed assertion) */
import assert from "node:assert/strict";
import { DrawingsController } from "../src/lib/chart/drawings/controller";

let passes = 0;
function ok(cond: boolean, label: string) {
  assert.ok(cond, label);
  passes++;
}

// Minimal engine: coordinate math plus a no-op fallback for everything the controller touches.
const base: Record<string, unknown> = {
  opts: { locale: "en", fontFamily: "sans-serif" },
  getPaneRect: () => ({ top: 0, left: 0, width: 800, height: 600 }),
  getPrecision: () => 2,
  getTheme: () => ({}),
  getIntervalMs: () => 60_000,
  timeToX: (t: number) => t / 10,
  xToTime: (x: number) => x * 10,
  priceToY: (_pane: string, p: number) => 500 - p,
  yToPrice: (_pane: string, y: number) => 500 - y,
  getIndexForTime: (t: number) => Math.round(t / 60_000),
};
const engine = new Proxy(base, {
  get: (t, k) => (k in t ? t[k as string] : (..._a: unknown[]) => undefined),
}) as never;

const P = (x: number, y: number, pointerType: string) =>
  ({ x, y, button: 0, pointerType, region: "plot", paneId: "main", ctrlKey: false, shiftKey: false }) as never;

function setup() {
  const c = new DrawingsController();
  c.attach(engine);
  // segment (100,400) → (300,300); its midpoint (200,350) is on the body, (100,400) is an endpoint handle
  const id = c.addDrawing("trend", [{ t: 1000, p: 100 }, { t: 3000, p: 200 }])!;
  assert.ok(id, "drawing added");
  (c as unknown as { sel: string[] }).sel = []; // addDrawing selects the new drawing; start unselected
  return { c, id };
}
const selOf = (c: DrawingsController) => (c as unknown as { sel: string[] }).sel;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
for (const pointerType of ["mouse", "touch"]) {
  // 1. first press on the body: select only, chart keeps the gesture
  {
    const { c, id } = setup();
    const ret = c.pointerDown(P(200, 350, pointerType));
    ok(ret === false, `${pointerType}: first press on unselected body does not capture (pan wins)`);
    ok(selOf(c).includes(id), `${pointerType}: first press selects the drawing`);
    ok((c as unknown as { drag: unknown }).drag === null, `${pointerType}: no drag started on first press`);
  }
  // 2. second press on the now-selected body: drag (after the double-click window)
  {
    const { c } = setup();
    c.pointerDown(P(200, 350, pointerType));
    await sleep(400);
    const ret = c.pointerDown(P(200, 350, pointerType));
    ok(ret === true, `${pointerType}: press on selected body captures (move)`);
    ok((c as unknown as { drag: { kind: string } | null }).drag?.kind === "move", `${pointerType}: move drag started`);
  }
  // 3. first press on an endpoint handle of an unselected drawing: select only
  {
    const { c, id } = setup();
    const ret = c.pointerDown(P(100, 400, pointerType));
    ok(ret === false, `${pointerType}: first press on unselected handle does not capture`);
    ok(selOf(c).includes(id), `${pointerType}: handle press selects`);
  }
  // 4. press on a selected handle: handle drag (after the double-click window)
  {
    const { c } = setup();
    c.pointerDown(P(100, 400, pointerType));
    await sleep(400);
    const ret = c.pointerDown(P(100, 400, pointerType));
    ok(ret === true, `${pointerType}: press on selected handle captures`);
    ok((c as unknown as { drag: { kind: string } | null }).drag?.kind === "handle", `${pointerType}: handle drag started`);
  }
}

// 5. empty space: no capture, selection cleared
{
  const { c } = setup();
  c.pointerDown(P(200, 350, "mouse"));
  const ret = c.pointerDown(P(600, 100, "mouse"));
  ok(ret === false, "empty space does not capture");
  ok(selOf(c).length === 0, "empty press clears selection");
}

// 6. double press still opens properties (first selects, second is the double)
{
  const { c } = setup();
  c.pointerDown(P(200, 350, "mouse"));
  const ret = c.pointerDown(P(200, 350, "mouse"));
  ok(ret === true, "double press opens properties (captures)");
}

// 7. locked drawing: chart keeps the gesture
{
  const { c, id } = setup();
  const d = (c as unknown as { drawings: { id: string; locked: boolean }[] }).drawings.find((x) => x.id === id)!;
  d.locked = true;
  const ret = c.pointerDown(P(200, 350, "touch"));
  ok(ret === false, "locked drawing never captures");
}

console.log(`check-drawing-select-first: ${passes} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
