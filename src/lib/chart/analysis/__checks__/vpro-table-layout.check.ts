/* Checks of the volume profile statistics table layout (pure rules, no canvas): the full table on a wide plot, the compact chip
   on a phone-width plot, table always inside the plot, rows cut to the room left, corner opposite the histogram.
   Run: npx tsx src/lib/chart/analysis/__checks__/vpro-table-layout.check.ts */
import {
  availableHeight,
  fitRows,
  isNarrowPlot,
  narrowCorner,
  placeTable,
  tableMetrics,
  TABLE_MARGIN,
  VP_TABLE_MIN_WIDTH,
  type TablePos,
} from "../../orderflow/vpro-layout";

let failed = 0;
function expect(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!cond) failed++;
}

/* 1. the bug: a phone (375 px screen minus the price axis ~ 300 px plot) must not be treated as "too narrow for a table" */
expect("phone portrait plot (300) is narrow", isNarrowPlot(300));
expect("phone portrait plot (330) is narrow", isNarrowPlot(330));
expect("tablet / desktop plot (400, 1200) is not narrow", !isNarrowPlot(400) && !isNarrowPlot(1200));
expect("threshold itself is wide", !isNarrowPlot(VP_TABLE_MIN_WIDTH) && isNarrowPlot(VP_TABLE_MIN_WIDTH - 1));

/* 2. metrics: desktop keeps the configured look, phone gets small tight rows */
const dFull = tableMetrics(12, false, false);
expect("desktop normal: 12 px, row 25, pad 8, gap 14", dFull.fontPx === 12 && dFull.rowH === 25 && dFull.padX === 8 && dFull.gap === 14, JSON.stringify(dFull));
const dComp = tableMetrics(10.5, true, false);
expect("desktop compact: row 16, pad 5", dComp.rowH === 16 && dComp.padX === 5 && dComp.gap === 8, JSON.stringify(dComp));
const pBig = tableMetrics(14, false, true);
expect("phone: font capped at 10 and compact spacing", pBig.fontPx === 10 && pBig.rowH === 16 && pBig.padX === 5, JSON.stringify(pBig));
const pTiny = tableMetrics(9, false, true);
expect("phone: a smaller configured font is kept", pTiny.fontPx === 9, JSON.stringify(pTiny));

/* 3. fitRows */
expect("fitRows: all fit", fitRows(12, 16, 400) === 12);
expect("fitRows: cut to the room (header takes one row)", fitRows(12, 16, 100) === 5, String(fitRows(12, 16, 100)));
expect("fitRows: no room at all -> 0, never negative", fitRows(12, 16, 10) === 0 && fitRows(12, 16, 0) === 0 && fitRows(12, 16, -50) === 0);
expect("fitRows: zero row height is safe", fitRows(5, 0, 100) === 0);

/* 4. placement stays inside the plot on a phone (300 x 380 plot, legend takes 120 px) for every corner and table size */
const P = { W: 300, H: 380, insetTop: 120, stack: 0 };
const corners: TablePos[] = ["tr", "tl", "br", "bl"];
let inside = true;
let note = "";
for (const pos of corners) {
  for (const [w, h] of [[56, 16], [120, 16], [130, 192]] as const) {
    const { x, y } = placeTable(pos, w, h, P);
    if (x < 0 || y < 0 || x + w > P.W || y + h > P.H) {
      inside = false;
      note += ` ${pos}:${w}x${h}@${x},${y}`;
    }
  }
}
expect("phone: every corner / size stays inside the plot", inside, note);

/* top corners on a phone sit under the legend (it spans the whole width there), bottom corners hug the bottom */
expect("phone: tl is below the legend", placeTable("tl", 120, 16, P).y === P.insetTop);
expect("phone: tr is below the legend (not enough room on its left)", placeTable("tr", 120, 16, P).y === P.insetTop);
expect("phone: bl hugs the bottom", placeTable("bl", 120, 100, P).y === P.H - 100 - TABLE_MARGIN);
expect("phone: right corners touch the right margin", placeTable("tr", 120, 16, P).x === P.W - 120 - TABLE_MARGIN);

/* wide plot: the old rule is kept - top-right goes to the very top when the legend fits on its left, else below it */
const WIDE = { W: 1200, H: 700, insetTop: 120, stack: 0 };
expect("desktop: tr in the very top corner", placeTable("tr", 200, 100, WIDE).y === TABLE_MARGIN);
expect("desktop: tl below the legend", placeTable("tl", 200, 100, WIDE).y === 120);
expect("desktop: tr goes below the legend when it would reach over it", placeTable("tr", 200, 100, { ...WIDE, W: 600 }).y === 120);
expect("desktop: stacked tables go one under another", placeTable("tr", 200, 100, { ...WIDE, stack: 106 }).y === TABLE_MARGIN + 106);
expect("desktop: stacked bottom tables go up", placeTable("br", 200, 100, { ...WIDE, stack: 106 }).y === 700 - 100 - TABLE_MARGIN - 106);

/* 5. room for rows */
expect("availableHeight: top corner below the legend", availableHeight("tl", 120, P) === 380 - 120 - TABLE_MARGIN);
expect("availableHeight: bottom corner", availableHeight("bl", 120, P) === 380 - 2 * TABLE_MARGIN);
const room = availableHeight("tl", 120, { ...P, H: 200 });
expect("availableHeight: short plot leaves few rows", fitRows(12, 16, room) < 12 && fitRows(12, 16, room) >= 0, String(fitRows(12, 16, room)));
expect("availableHeight: never negative", availableHeight("tl", 120, { ...P, H: 100 }) === 0);

/* 6. the table goes to the side away from the histogram */
expect("hist right (default): table left, vertical choice kept", narrowCorner("tr", "right") === "tl" && narrowCorner("br", "right") === "bl" && narrowCorner("tl", "right") === "tl" && narrowCorner("bl", "right") === "bl");
expect("hist left: table right", narrowCorner("tl", "left") === "tr" && narrowCorner("bl", "left") === "br");
expect("range-bound placements: start -> right, end -> left", narrowCorner("tr", "start") === "tr" && narrowCorner("tr", "end") === "tl");

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
