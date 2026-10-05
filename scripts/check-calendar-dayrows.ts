/* Phone calendar (one row per day) checks: src/lib/calendar/dayrow.ts. The most important titles come first and bond coupons last,
   the red badge counts high-importance events, layer dots keep a fixed order, quiet stretches fold into one slim row that never
   crosses a month start, today is always its own row, days without source data are not mixed with empty ones.
   Run: npx tsx scripts/check-calendar-dayrows.ts */
import assert from "node:assert/strict";
import { buildDayRows, pickTopEvents, summarizeDay } from "../src/lib/calendar/dayrow";
import { buildMonthCells } from "../src/lib/calendar/grid";
import { zonedDayStart } from "../src/lib/calendar/time";
import type { CalEvent } from "../src/lib/calendar/types";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ok  ${name}`);
};

const Z = "UTC";
const ev = (id: string, date: string, hhmm: string, impact: 1 | 2 | 3, category: CalEvent["category"] = "other", gk?: string): CalEvent => ({
  id, ts: Date.parse(`${date}T${hhmm}:00Z`), allDay: false, country: "US", currency: "USD", event: id, category, impact,
  actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null, gk,
});

ok("pickTopEvents: importance first, then time; coupons last; n clamps", () => {
  const list = [ev("low-early", "2026-10-05", "06:00", 1), ev("coupon", "2026-10-05", "07:00", 3, "corp", "corp.coupon"), ev("high-late", "2026-10-05", "18:00", 3), ev("mid", "2026-10-05", "09:00", 2), ev("high-early", "2026-10-05", "08:00", 3)];
  assert.deepEqual(pickTopEvents(list, 2).map((e) => e.id), ["high-early", "high-late"]);
  assert.deepEqual(pickTopEvents(list, 5).map((e) => e.id), ["high-early", "high-late", "mid", "low-early", "coupon"]);
  assert.deepEqual(pickTopEvents(list, 0), []);
  assert.deepEqual(pickTopEvents([], 2), []);
  assert.equal(list[0].id, "low-early", "the input is not reordered");
});

ok("summarizeDay: total, high count, layers in a fixed order", () => {
  const s = summarizeDay([ev("a", "2026-10-05", "08:00", 3, "corp"), ev("b", "2026-10-05", "09:00", 3, "moex"), ev("c", "2026-10-05", "10:00", 1, "ru"), ev("d", "2026-10-05", "11:00", 2), ev("e", "2026-10-05", "12:00", 2, "commodity")]);
  assert.equal(s.total, 5);
  assert.equal(s.high, 2);
  assert.deepEqual(s.layers, ["moex", "commodity", "ru", "corp"]);
  assert.equal(s.top.length, 2);
  const none = summarizeDay([]);
  assert.deepEqual([none.total, none.high, none.layers, none.top], [0, 0, [], []]);
});

// Monday 2026-09-28 .. (35 days) with 2026-10-01 a Thursday
const START = "2026-09-28";
const TODAY = "2026-10-05";
const cells = buildMonthCells(START, TODAY, 35);
const events = [ev("e1", "2026-09-29", "10:00", 2), ev("e2", "2026-10-05", "12:30", 3), ev("e3", "2026-10-05", "14:00", 1), ev("e4", "2026-10-12", "09:00", 1)];

ok("buildDayRows: month rows, event days, folded gaps cover every day exactly once", () => {
  const rows = buildDayRows(cells, events, Z, null);
  assert.equal(rows[0].kind, "month");
  assert.deepEqual(rows.filter((r) => r.kind === "month").map((r) => (r.kind === "month" ? r.date : "")), ["2026-09-28", "2026-10-01", "2026-11-01"]);
  const dayRows = rows.filter((r) => r.kind === "day").map((r) => (r.kind === "day" ? r.cell.date : ""));
  assert.deepEqual(dayRows, ["2026-09-29", "2026-10-05", "2026-10-12"]);
  let covered = 0;
  for (const r of rows) {
    if (r.kind === "day") covered++;
    if (r.kind === "gap") covered += r.days;
  }
  assert.equal(covered, 35);
});

ok("buildDayRows: gaps are consecutive, fold weekends, and never cross a month start", () => {
  const rows = buildDayRows(cells, events, Z, null);
  const gaps = rows.flatMap((r) => (r.kind === "gap" ? [r] : []));
  for (const g of gaps) {
    assert.ok(g.from <= g.to);
    assert.equal(g.from.slice(0, 7), g.to.slice(0, 7), `gap ${g.from}..${g.to} stays inside one month`);
  }
  const g1 = gaps.find((g) => g.from === "2026-09-30");
  assert.ok(g1 && g1.to === "2026-09-30" && g1.days === 1, "Sep 30 is a one-day gap (Oct 1 starts a month)");
  const g2 = gaps.find((g) => g.from === "2026-10-01");
  assert.ok(g2 && g2.to === "2026-10-04" && g2.days === 4, "Oct 1-4 fold into one row");
});

ok("buildDayRows: today is a row of its own even when empty", () => {
  const rows = buildDayRows(cells, events.filter((e) => !e.id.startsWith("e2") && !e.id.startsWith("e3")), Z, null);
  const t = rows.find((r) => r.kind === "day" && r.cell.today);
  assert.ok(t && t.kind === "day");
  assert.equal(t.summary.total, 0);
  assert.deepEqual(t.events, []);
});

ok("buildDayRows: no events at all -> only today stands out", () => {
  const rows = buildDayRows(cells, [], Z, null);
  assert.deepEqual(rows.filter((r) => r.kind === "day").length, 1);
});

ok("buildDayRows: days outside the provider's coverage fold apart from empty days and have no day row", () => {
  const coverage = { from: zonedDayStart("2026-10-02", Z), to: zonedDayStart("2026-10-09", Z) };
  const rows = buildDayRows(cells, events, Z, coverage);
  const gaps = rows.flatMap((r) => (r.kind === "gap" ? [r] : []));
  const nd = gaps.filter((g) => g.noData);
  assert.ok(nd.length > 0);
  assert.ok(nd.some((g) => g.from === "2026-09-28" && g.to === "2026-09-30"), "Sep 28-30 (before the span) are one no-data stretch, e1 on Sep 29 is hidden");
  assert.ok(!rows.some((r) => r.kind === "day" && r.cell.date === "2026-09-29"));
  assert.ok(!rows.some((r) => r.kind === "day" && r.cell.date === "2026-10-12"), "after the span: no data");
  const empty = gaps.filter((g) => !g.noData);
  for (const g of empty) assert.ok(g.from >= "2026-10-02" && g.to <= "2026-10-08");
});

console.log(`\n${n} checks passed`);
