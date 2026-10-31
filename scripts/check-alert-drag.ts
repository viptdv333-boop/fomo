/* Dragging a fixed-level alert with the mouse (src/lib/chart/alerts-layer.ts): the line is grabbed within a few px, follows the pointer, the new level is
   saved on release (a refused save puts the line back), lines of "line" alerts and touch input are left alone, the cursor and the hover owner are right.
   The engine is a stub: the price axis is y = 1000 - price (1 px per unit), precision 2.
   Run: npx tsx scripts/check-alert-drag.ts   (exit code 1 on a failed assertion) */
import { AlertsLayer, type AlertMark } from "../src/lib/chart/alerts-layer";
import type { PointerInfo } from "../src/lib/chart/types";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

let redraws = 0;
const engine: any = {
  addLayer() {},
  removeLayer() {},
  requestOverlayRedraw() {
    redraws++;
  },
  priceToY: (_pane: string, price: number) => 1000 - price,
  yToPrice: (_pane: string, y: number) => 1000 - y,
  getPrecision: () => 2,
  getPaneRect: () => ({ top: 0, height: 900, width: 800 }),
  getTheme: () => ({ bg: "#fff" }),
  opts: { fontFamily: "sans-serif" },
};

const ptr = (y: number, over: Partial<PointerInfo> = {}): PointerInfo => ({
  x: 100,
  y,
  paneId: "main",
  region: "plot",
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  button: 0,
  pointerType: "mouse",
  ...over,
});

const marks: AlertMark[] = [
  { id: "a", kind: "price", price: 500, line: null },
  { id: "b", kind: "price", price: 300, line: null },
];

function fresh() {
  const l = new AlertsLayer();
  l.attach(engine);
  l.setMarks(marks);
  return l;
}

async function main() {
  {
    const l = fresh();
    eq("far from every line: not grabbed", l.pointerDown(ptr(100)), false);
    eq("far from every line: normal cursor", l.cursor(ptr(100)), null);
    eq("near a line (4 px): ns-resize cursor", l.cursor(ptr(504)), "ns-resize");
    eq("near a line: the hover is owned by the layer", l.pointerMove(ptr(504)), true);
    eq("away again: the hover is released", l.pointerMove(ptr(100)), false);
    eq("right button does not grab", l.pointerDown(ptr(500, { button: 2 })), false);
    eq("a finger does not grab (it pans the chart)", l.pointerDown(ptr(500, { pointerType: "touch" })), false);
    eq("not in the plot (price axis): not grabbed", l.pointerDown(ptr(500, { region: "priceAxis" })), false);
    eq("another pane: not grabbed", l.pointerDown(ptr(500, { paneId: "rsi" })), false);
  }

  {
    const l = fresh();
    const saved: [string, number][] = [];
    l.onMove = async (id, price) => {
      saved.push([id, price]);
      return true;
    };
    eq("grab the line of alert a", l.pointerDown(ptr(503)), true);
    l.pointerMove(ptr(450));
    eq("while dragging the cursor stays ns-resize", l.cursor(ptr(450)), "ns-resize");
    eq("the tag follows: the level is the pointer's price", l.axisTags(engine).map((t) => t.price).sort(), [300, 550]);
    l.pointerUp(ptr(450));
    eq("released: the new level is saved once", saved, [["a", 550]]);
    eq("after the drop the line stays where it was dropped (until the saved level arrives)", l.axisTags(engine).map((t) => t.price).sort(), [300, 550]);
    l.setMarks([{ id: "a", kind: "price", price: 550, line: null }, marks[1]]);
    eq("the saved level arrived: nothing is held back", l.axisTags(engine).map((t) => t.price).sort(), [300, 550]);
  }

  {
    const l = fresh();
    l.onMove = async () => false;
    l.pointerDown(ptr(500));
    l.pointerMove(ptr(420));
    l.pointerUp(ptr(420));
    await new Promise((r) => setTimeout(r, 5));
    eq("a refused save puts the line back", l.axisTags(engine).map((t) => t.price).sort(), [300, 500]);
  }

  {
    const l = fresh();
    let called = 0;
    l.onMove = async () => {
      called++;
      return true;
    };
    l.pointerDown(ptr(500));
    l.pointerUp(ptr(500));
    eq("dropped on the same level: nothing is saved", called, 0);
  }

  {
    const l = new AlertsLayer();
    l.attach(engine);
    l.setMarks([{ id: "L", kind: "line", price: null, line: { tool: "hline", p1: { t: 1, p: 500 }, p2: { t: 2, p: 500 } } }]);
    eq("an alert that follows a drawn line is not draggable", l.pointerDown(ptr(500)), false);
  }


}

main().then(() => {
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
});
