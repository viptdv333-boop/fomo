/* Stored chart preferences never break the chart (src/lib/chart/prefs.ts, tfRowIds in timeframes.ts, normalizeSettings, the pane heights).
   Regression for «пропал выбор ТФ / пустой график»: every broken stored state below used to reach the chart (an object as the interval crashed the page,
   a seconds timeframe saved for a symbol without seconds left no current chip, an empty pinned list left the row without chips ...). OFFLINE, pure.
   Run: npx tsx scripts/check-prefs-sanitize.ts   (exit code 1 on a failed assertion) */
import { CHART_RESET_KEYS, DEFAULT_PREFS, PANEL_TABS, chartResetKeys, parsePrefs, sanitizePrefs, shownInterval } from "../src/lib/chart/prefs";
import { DEFAULT_FAVORITE_INTERVALS, isValidInterval, setMoexSeconds, tfRowIds } from "../src/lib/chart/timeframes";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/lib/chart/settings";
import { layoutHeights, parseRatio } from "../src/lib/chart/pane-layout";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
function yes(name: string, cond: boolean, note = "") {
  if (!cond) fails++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : note ? "  -> " + note : ""}`);
}
const show = (v: unknown) => (v === undefined ? "undefined" : Number.isNaN(v) ? "NaN" : JSON.stringify(v));

// --- sanitizePrefs: whatever JSON was stored
{
  eq("fresh install: nothing stored -> defaults", parsePrefs(null), DEFAULT_PREFS);
  eq("empty string -> defaults", parsePrefs(""), DEFAULT_PREFS);
  eq("not JSON -> defaults", parsePrefs("{oops"), DEFAULT_PREFS);
  for (const raw of ["null", "[]", "42", '"x"', "true", "[1,2]"]) eq(`stored ${raw} -> defaults`, parsePrefs(raw), DEFAULT_PREFS);
  eq("a good copy is kept as it is", sanitizePrefs({ interval: "15", chartType: "line", showVolume: false, showGrid: false, showWatermark: false, logScale: true, panelOpen: false, panelTab: "news" }), {
    interval: "15",
    chartType: "line",
    showVolume: false,
    showGrid: false,
    showWatermark: false,
    logScale: true,
    panelOpen: false,
    panelTab: "news",
  });
  eq("only the interval stored (an old build): the rest are defaults", parsePrefs(JSON.stringify({ interval: "1" })), { ...DEFAULT_PREFS, interval: "1" });

  // the interval field with every kind of junk (an object crashed the whole page)
  for (const v of [{ a: 1 }, [], [1], 123, 0, -1, NaN, null, true, "2h", "45 min", "", " ", "x", "999999", "0", "-5", "1.5", "1e3", "15S", "Dd"]) {
    const got = sanitizePrefs({ interval: v }).interval;
    yes(`interval ${show(v)} -> a valid id (${got})`, typeof got === "string" && isValidInterval(got));
  }
  eq("interval missing -> default", sanitizePrefs({}).interval, DEFAULT_PREFS.interval);
  for (const v of ["1", "5", "15", "60", "240", "D", "W", "M", "Y", "45", "120", "10s", "30s"]) eq(`real interval ${v} is kept`, sanitizePrefs({ interval: v }).interval, v);

  // other fields
  for (const v of [1, "yes", null, {}, []]) {
    const s = sanitizePrefs({ showVolume: v, showGrid: v, showWatermark: v, logScale: v, panelOpen: v });
    eq(`non-boolean flags ${show(v)} -> defaults`, [s.showVolume, s.showGrid, s.showWatermark, s.logScale, s.panelOpen], [true, true, true, false, true]);
  }
  for (const v of ["nope", 5, null, {}, "__proto__", "constructor", "toString", "hasOwnProperty"]) {
    const s = sanitizePrefs({ chartType: v, panelTab: v });
    eq(`unknown chart type / panel tab ${show(v)} -> defaults`, [s.chartType, s.panelTab], [DEFAULT_PREFS.chartType, DEFAULT_PREFS.panelTab]);
  }
  eq("every panel tab is accepted", PANEL_TABS.map((p) => sanitizePrefs({ panelTab: p }).panelTab), PANEL_TABS);
  eq("a prototype-pollution looking copy is only data", sanitizePrefs(JSON.parse('{"__proto__":{"interval":"1"},"interval":"5"}')).interval, "5");
}

// --- the interval the chart can show for a source
{
  setMoexSeconds(false); // the server said: no seconds for MOEX
  eq("MOEX without seconds: 15s reads as 1м", shownInterval("15s", "moex"), "1");
  eq("MOEX without seconds: a normal one stays", shownInterval("15", "moex"), "15");
  eq("junk reads as the default", shownInterval({ a: 1 }, "moex"), DEFAULT_PREFS.interval);
  eq("Bybit keeps seconds", shownInterval("15s", "bybit"), "15s");
  setMoexSeconds(true);
  eq("MOEX with seconds: 15s stays", shownInterval("15s", "moex"), "15s");
  setMoexSeconds(null);
  eq("MOEX not asked yet: a saved seconds timeframe survives that moment", shownInterval("15s", "moex"), "15s");
  setMoexSeconds(false);
}

// --- the timeframe row: always the current timeframe + the «▾», whatever was stored
{
  const isSec = (id: string) => /^\d+s$/.test(id);
  // junk lists
  for (const favs of [undefined, null, "abc", 5, {}, [], [null], ["x", 7, {}], ["999999"], [[]]]) {
    const r = tfRowIds("1", favs, "moex");
    yes(`pinned ${show(favs)}: row has chips (${r.shown.join(",")}) and the current one`, r.shown.length >= 2 && r.shown.includes("1") && r.chips.length > 0);
    eq(`pinned ${show(favs)} -> the defaults`, r.pinned, DEFAULT_FAVORITE_INTERVALS);
  }
  // only seconds pinned on a source without seconds: the default chips + the current one
  const onlySec = tfRowIds("1", ["15s", "30s"], "moex");
  eq("only seconds pinned, no seconds here: default chips", onlySec.chips, DEFAULT_FAVORITE_INTERVALS);
  eq("... and the pins themselves are kept (they apply on another symbol)", onlySec.pinned, ["15s", "30s"]);
  yes("no seconds chip on a source without seconds", !tfRowIds("1", ["15s", "1", "5"], "moex").shown.some(isSec));
  // the current timeframe is always on the row
  eq("current 2h (120) not pinned -> appended in order", tfRowIds("120", ["1", "5", "D"], "moex").shown, ["1", "5", "120", "D"]);
  eq("current invalid -> the fallback", tfRowIds({ a: 1 }, ["1", "5"], "moex").current, "D");
  eq("current invalid, fallback 1", tfRowIds("2h", ["1", "5"], "moex", "1").shown, ["1", "5"]);
  eq("current is 15s on a source without seconds: still on the row (the chart resets it a moment later)", tfRowIds("15s", ["1", "5"], "moex").shown, ["15s", "1", "5"]);
  eq("pinned are sorted short to long, each once", tfRowIds("1", ["D", "5", "5", "1", "60"], "moex").pinned, ["1", "5", "60", "D"]);
}

// --- chart settings (pinned timeframes live there)
{
  const raws: unknown[] = [null, undefined, 5, "x", [], { ui: null }, { ui: [] }, { ui: { favIntervals: "abc" } }, { ui: { favIntervals: { a: 1 } } }, { ui: { favIntervals: [null, 3, {}] } }];
  for (const raw of raws) {
    let s;
    try {
      s = normalizeSettings(raw);
    } catch (e) {
      yes(`normalizeSettings(${show(raw)}) does not throw`, false, String(e));
      continue;
    }
    yes(`normalizeSettings(${show(raw)}): pinned list is an array of valid ids`, Array.isArray(s.ui.favIntervals) && s.ui.favIntervals.every((x) => isValidInterval(x)));
  }
  eq("settings without ui: the default pins", normalizeSettings({}).ui.favIntervals, DEFAULT_SETTINGS.ui.favIntervals);
}

// --- pane heights: a broken stored share never gives the price pane zero height
{
  for (const v of [0, -1, NaN, Infinity, 5, "0.3", null, {}]) {
    const r = parseRatio(v);
    const lay = layoutHeights(400, [r ?? 0.2]);
    yes(`stored share ${show(v)}: price pane > 0 (${lay.main.toFixed(0)}px)`, lay.main > 100 && Number.isFinite(lay.main));
  }
}

// --- the reset: which keys go
{
  eq(
    "reset keys: prefs and settings, also with a pane suffix; nothing else",
    chartResetKeys(["fomo-chart-prefs-v1", "fomo-chart-prefs-v1:pane2", "fomo-chart-settings-v1", "fomo-chart-indicators", "fomo-chart-drawings:moex:GAZP", "fomo-theme", "fomo-terminal-watchlist-v1", "fomo-chart-prefs-v10"]),
    ["fomo-chart-prefs-v1", "fomo-chart-prefs-v1:pane2", "fomo-chart-settings-v1"],
  );
  yes("the reset never touches indicators / drawings", CHART_RESET_KEYS.every((k) => !/indicators|drawings/.test(k)));
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
