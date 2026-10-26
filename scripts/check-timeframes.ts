/* The timeframes of the terminal (src/lib/chart/timeframes.ts, intervals.ts, seconds-feed.ts): the table, labels in three languages against the real dictionaries,
   where every timeframe's bars come from per source (native / merged / live), the merge itself and its session grid, second candles, typed intervals, the axis
   labels of second bars, the pinned timeframes in the settings.
   Run: npx tsx scripts/check-timeframes.ts   (exit code 1 on a failed assertion) */
import {
  MENU_INTERVALS,
  SECOND_INTERVALS,
  TIMEFRAMES,
  DEFAULT_FAVORITE_INTERVALS,
  isNativeInterval,
  isSecondsInterval,
  isValidInterval,
  parseTypedInterval,
  pickerIntervals,
  secondsIntervalMs,
  secondsPending,
  secondsSupported,
  getMoexSeconds,
  setMoexSeconds,
  subscribeMoexSeconds,
  serverIntervals,
  timeframeById,
  timeframeLabel,
  timeframePlan,
  usableInterval,
  intervalOrder,
  tfRowIds,
  type TfLocale,
} from "../src/lib/chart/timeframes";
import { aggregateCandles, formatInterval, intervalPlan, NATIVE_INTERVALS } from "../src/lib/chart/intervals";
import { foldTrades } from "../src/lib/chart/seconds-feed";
import { formatCrosshairTime, formatTickLabel, intervalToMs, tickWeight } from "../src/lib/chart/format";
import { normalizeSettings, DEFAULT_SETTINGS } from "../src/lib/chart/settings";
import { cn, en, ru } from "../src/lib/i18n/dictionaries";
import type { Candle } from "../src/lib/chart/types";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const utc = (s: string) => Date.parse(s + "Z");
const ids = TIMEFRAMES.map((t) => t.id);

// --- the table
eq("the set: seconds 1 5 10 15 30; minutes 1 2 3 5 10 15 20 30 45; hours 1 2 3 4 6 8 12; D W M Y", ids, ["1s", "5s", "10s", "15s", "30s", "1", "2", "3", "5", "10", "15", "20", "30", "45", "60", "120", "180", "240", "360", "480", "720", "D", "W", "M", "Y"]);
eq("ids are unique", new Set(ids).size, ids.length);
eq("shortest first", TIMEFRAMES.every((t, i) => i === 0 || t.seconds > TIMEFRAMES[i - 1].seconds), true);
eq("every id is valid and has a bar length equal to its seconds", ids.every((id) => isValidInterval(id) && intervalToMs(id) === timeframeById(id)!.seconds * 1000), true);
eq("intervalOrder follows the length", ids.every((id, i) => i === 0 || intervalOrder(id) > intervalOrder(ids[i - 1])), true);
eq("groups", TIMEFRAMES.map((t) => t.group).join(""), "sssss" + "mmmmmmmmm" + "hhhhhhh" + "dddd");
eq("the menu is everything but seconds", MENU_INTERVALS, ids.filter((id) => !isSecondsInterval(id)));
eq("the seconds list", SECOND_INTERVALS, ["1s", "5s", "10s", "15s", "30s"]);
eq("custom minutes stay valid (the «Свой интервал» form), junk is not", [isValidInterval("45"), isValidInterval("100"), isValidInterval("4320"), isValidInterval("4321"), isValidInterval("0"), isValidInterval("abc"), isValidInterval("7s"), isValidInterval("")], [true, true, true, false, false, false, false, false]);
eq("default favourites: 1м 5м 15м 1ч 4ч Д", DEFAULT_FAVORITE_INTERVALS, ["1", "5", "15", "60", "240", "D"]);
eq("every default favourite is in the table", DEFAULT_FAVORITE_INTERVALS.every((id) => ids.includes(id)), true);

// --- labels in three languages, the same text the dictionaries give through formatInterval
{
  const dicts: Record<TfLocale, Record<string, string>> = { ru, en, cn };
  for (const loc of ["ru", "en", "cn"] as const) {
    const t = (k: string) => dicts[loc][k] ?? `<<${k}>>`;
    const bad = ids.filter((id) => formatInterval(id, t) !== timeframeLabel(id, loc));
    eq(`labels (${loc}) equal formatInterval with the ${loc} dictionary`, bad, []);
  }
  eq("labels ru", ["1s", "15s", "3", "45", "120", "D", "W", "M", "Y"].map((id) => timeframeLabel(id, "ru")), ["1с", "15с", "3м", "45м", "2ч", "Д", "Н", "М", "1Г"]);
  eq("labels en", ["1s", "15s", "3", "45", "120", "D", "W", "M", "Y"].map((id) => timeframeLabel(id, "en")), ["1s", "15s", "3m", "45m", "2h", "D", "W", "M", "1Y"]);
  eq("labels cn", ["30s", "3", "60", "720", "D", "W", "M", "Y"].map((id) => timeframeLabel(id, "cn")), ["30秒", "3分", "1时", "12时", "日", "周", "月", "1年"]);
  eq("custom ids get unit labels", ["100", "1440", "2880", "9"].map((id) => timeframeLabel(id, "ru")), ["100м", "1д", "2д", "9м"]);
  const needKeys = ["cs.unit.s", "cs.unit.m", "cs.unit.h", "cs.unit.d", "cs.iv.seconds", "cs.iv.minutes", "cs.iv.hours", "cs.iv.days", "cs.iv.fav", "cs.iv.unfav", "chart.sec.note", "chart.sec.connecting", "chart.sec.offline", "chart.sec.wait", "appui.tf.more", "appui.tf.title", "appui.tf.hint", "appui.tf.secNote", "appui.chat.done"];
  eq("every picker / seconds string exists in ru, en and cn", (["ru", "en", "cn"] as const).map((l) => needKeys.filter((k) => !dicts[l][k])), [[], [], []]);
}

// --- where the bars come from
{
  const P = (id: string, source: string) => {
    const p = timeframePlan(id, source);
    return `${p.base}x${p.ratio}`;
  };
  eq("MOEX native: 1 10 60 D W M (+5 15 240 resampled by the server, Y from M)", ["1", "10", "60", "D", "W", "M", "5", "15", "240", "Y"].map((id) => P(id, "moex")), ["1x1", "10x1", "60x1", "Dx1", "Wx1", "Mx1", "5x1", "15x1", "240x1", "Yx1"]);
  eq("MOEX merged: 2m 3m from 1m; 20m from 10m; 30m 45m from 15m; 2h 3h 6h from 1h; 8h 12h from 4h", ["2", "3", "20", "30", "45", "120", "180", "360", "480", "720"].map((id) => P(id, "moex")), ["1x2", "1x3", "10x2", "15x2", "15x3", "60x2", "60x3", "60x6", "240x2", "240x3"]);
  eq("Bybit native: 1 3 5 15 30 60 120 240 360 720 D W M", ["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M"].map((id) => P(id, "bybit")), ["1x1", "3x1", "5x1", "15x1", "30x1", "60x1", "120x1", "240x1", "360x1", "720x1", "Dx1", "Wx1", "Mx1"]);
  eq("Bybit merged: 2m from 1m; 10m 20m from 5m; 45m from 15m; 3h from 1h; 8h from 4h", ["2", "10", "20", "45", "180", "480"].map((id) => P(id, "bybit")), ["1x2", "5x2", "5x4", "15x3", "60x3", "240x2"]);
  eq("FMP / FX / unknown sources: the common set, the rest merged (30m from 15m, like before)", ["30", "3", "10", "120"].map((id) => P(id, "fmp")), ["15x2", "1x3", "5x2", "60x2"]);
  eq("the same for forex and an unknown source", [P("30", "forex"), P("30", "xyz"), P("10", "forex")], ["15x2", "15x2", "5x2"]);
  eq("intervalPlan is timeframePlan", intervalPlan("45", "moex"), timeframePlan("45", "moex"));
  eq("a merged plan carries the bar length; a native one 0", [intervalPlan("45", "moex").ms, intervalPlan("5", "moex").ms], [45 * MIN, 0]);
  // for every source and every minute-or-longer timeframe: the base is a native interval of the source, base x ratio = the timeframe
  for (const source of ["moex", "bybit", "fmp", "forex", "none"]) {
    const bad: string[] = [];
    for (const id of MENU_INTERVALS) {
      const p = timeframePlan(id, source);
      const mins = /^\d+$/.test(id) ? Number(id) : 0;
      if (!serverIntervals(source).includes(p.base)) bad.push(`${id}: base ${p.base} not served`);
      if (p.ratio === 1 && p.base !== id) bad.push(`${id}: native but base ${p.base}`);
      if (p.ratio > 1 && (!Number.isInteger(p.ratio) || Number(p.base) * p.ratio !== mins)) bad.push(`${id}: ${p.base} x ${p.ratio}`);
      if ((p.ratio === 1) !== isNativeInterval(id, source)) bad.push(`${id}: isNativeInterval disagrees`);
      if (p.live) bad.push(`${id}: live`);
    }
    eq(`${source}: every timeframe resolves to a served base`, bad, []);
  }
  eq("the server's interval sets", [serverIntervals("moex"), serverIntervals("bybit"), serverIntervals("fmp"), serverIntervals("forex")], [
    ["1", "5", "15", "60", "240", "D", "W", "M", "Y", "10"],
    ["1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M", "Y"],
    ["1", "5", "15", "60", "240", "D", "W", "M", "Y", "30"],
    ["1", "5", "15", "60", "240", "D", "W", "M", "Y", "30"],
  ]);
  eq("seconds are not in any server set", ["moex", "bybit", "fmp", "forex"].some((s) => serverIntervals(s).some(isSecondsInterval)), false);
  eq("NATIVE_INTERVALS is the common set", NATIVE_INTERVALS, ["1", "5", "15", "60", "240", "D", "W", "M", "Y"]);
}

// --- seconds: only where a trade stream exists, never from the API
eq("seconds plan is live", timeframePlan("15s", "bybit"), { base: "15s", ratio: 1, ms: 0, live: true });
// MOEX seconds depend on the server's answer (/api/moex-seconds): null = not asked yet, false = off / no token / guest, true = served
eq("MOEX flag starts unknown", getMoexSeconds(), null);
eq("seconds are offered for Bybit only until the server says MOEX has them", [secondsSupported("bybit"), secondsSupported("moex"), secondsSupported("fmp"), secondsSupported("forex")], [true, false, false, false]);
eq("picker list: Bybit starts with seconds, MOEX does not have them (yet)", [pickerIntervals("bybit").slice(0, 6), pickerIntervals("moex").some(isSecondsInterval), pickerIntervals("moex").length], [["1s", "5s", "10s", "15s", "30s", "1"], false, MENU_INTERVALS.length]);
eq("a saved seconds timeframe survives the moment the MOEX answer is unknown, and goes back to 1m once the server says no", [usableInterval("15s", "moex"), secondsPending("moex"), secondsPending("bybit")], ["15s", true, false]);
{
  let ticks = 0;
  const off = subscribeMoexSeconds(() => ticks++);
  setMoexSeconds(false);
  eq("server says no: seconds fall back to 1m on MOEX, Bybit unchanged", [usableInterval("15s", "moex"), usableInterval("15s", "bybit"), usableInterval("45", "moex"), secondsSupported("moex"), secondsPending("moex")], ["1", "15s", "45", false, false]);
  setMoexSeconds(true);
  eq("server says yes: MOEX (and only MOEX besides Bybit) has the seconds group", [secondsSupported("moex"), secondsSupported("fmp"), secondsSupported("forex"), usableInterval("15s", "moex")], [true, false, false, "15s"]);
  eq("picker list for MOEX starts with the seconds, like Bybit", [pickerIntervals("moex").slice(0, 6), pickerIntervals("moex").length], [["1s", "5s", "10s", "15s", "30s", "1"], MENU_INTERVALS.length + SECOND_INTERVALS.length]);
  eq("typed 30s / 15с are accepted on MOEX, not on FMP", [parseTypedInterval("30s", "moex"), parseTypedInterval("15с", "moex"), parseTypedInterval("30s", "fmp")], ["30s", "15s", null]);
  eq("subscribers were told about each change", ticks, 2);
  setMoexSeconds(true);
  eq("the same answer again does not notify", ticks, 2);
  off();
  setMoexSeconds(null);
}
eq("seconds helpers", [isSecondsInterval("15s"), isSecondsInterval("15"), secondsIntervalMs("30s"), secondsIntervalMs("30"), intervalToMs("15s")], [true, false, 30_000, 0, 15_000]);

// --- the merge: bars start with the session (the first candle of each day), volume and extremes are kept
{
  // MOEX-like: wall-clock times, day 1 starts 09:50 (shares: opening auction), day 2 starts 10:00; one-minute candles
  const mk = (from: string, to: string, base: number): Candle[] => {
    const out: Candle[] = [];
    let i = 0;
    for (let t = utc(from); t < utc(to); t += MIN, i++) out.push({ t, o: base + i, h: base + i + 2, l: base + i - 1, c: base + i + 1, v: 10 });
    return out;
  };
  const d1 = mk("2026-10-12T09:50:00", "2026-10-12T10:20:00", 100);
  const d2 = mk("2026-10-13T10:00:00", "2026-10-13T10:12:00", 200);
  const src = [...d1, ...d2];
  const a3 = aggregateCandles(src, 3 * MIN);
  eq("3m: day 1 starts at 09:50, day 2 at 10:00 (the grid restarts with the session)", [a3[0].t === utc("2026-10-12T09:50:00"), a3[1].t === utc("2026-10-12T09:53:00"), a3.find((b) => b.t === utc("2026-10-13T10:00:00")) !== undefined, a3.every((b) => ((b.t - (b.t < utc("2026-10-13T00:00:00") ? utc("2026-10-12T09:50:00") : utc("2026-10-13T10:00:00"))) % (3 * MIN)) === 0)], [true, true, true, true]);
  eq("3m: 30 + 12 candles make 10 + 4 bars", a3.length, 14);
  eq("3m: OHLCV of the first bar (open of the first, high / low extremes, close of the last, volume summed)", a3[0], { t: utc("2026-10-12T09:50:00"), o: 100, h: 104, l: 99, c: 103, v: 30 });
  eq("volume is conserved", [src.reduce((s, c) => s + c.v, 0), a3.reduce((s, c) => s + c.v, 0)], [420, 420]);
  eq("the extremes are conserved", [Math.max(...src.map((c) => c.h)), Math.max(...a3.map((c) => c.h)), Math.min(...src.map((c) => c.l)), Math.min(...a3.map((c) => c.l))], [Math.max(...src.map((c) => c.h)), Math.max(...src.map((c) => c.h)), Math.min(...src.map((c) => c.l)), Math.min(...src.map((c) => c.l))]);
  eq("bars never overlap and ascend", a3.every((b, i) => i === 0 || b.t > a3[i - 1].t), true);

  // hourly futures-like candles: 09:00 .. 23:00 then the next day, 2h bars from the first one
  const hourly: Candle[] = [];
  for (let h = 9; h < 24; h++) hourly.push({ t: utc("2026-10-12T00:00:00") + h * HOUR, o: h, h: h + 1, l: h - 1, c: h, v: 5 });
  for (let h = 9; h < 12; h++) hourly.push({ t: utc("2026-10-13T00:00:00") + h * HOUR, o: h, h: h + 1, l: h - 1, c: h, v: 5 });
  const a2h = aggregateCandles(hourly, 2 * HOUR);
  eq("2h: 09 11 13 15 17 19 21 23 on day 1 (the last one holds one hour), 09 11 on day 2", a2h.map((b) => new Date(b.t).getUTCHours() + (b.t >= utc("2026-10-13T00:00:00") ? 100 : 0)), [9, 11, 13, 15, 17, 19, 21, 23, 109, 111]);
  eq("2h: a 2h bar holds two hours of volume", [a2h[0].v, a2h[7].v, a2h[9].v], [10, 5, 5]);

  // Bybit-like: a 24h market on the UTC day, 4h base bars -> 8h bars on 00 / 08 / 16
  const h4: Candle[] = [];
  for (let k = 0; k < 12; k++) h4.push({ t: utc("2026-10-12T00:00:00") + k * 4 * HOUR, o: k, h: k + 1, l: k, c: k, v: 1 });
  const a8 = aggregateCandles(h4, 8 * HOUR);
  eq("8h on the UTC day: 00 08 16 (twice)", a8.map((b) => new Date(b.t).getUTCHours()), [0, 8, 16, 0, 8, 16]);
  const a12 = aggregateCandles(h4, 12 * HOUR);
  eq("12h from 4h: 00 and 12", a12.map((b) => new Date(b.t).getUTCHours()), [0, 12, 0, 12]);
  const m1: Candle[] = [];
  for (let k = 0; k < 120; k++) m1.push({ t: utc("2026-10-12T00:00:00") + k * MIN, o: 1, h: 1, l: 1, c: 1, v: 1 });
  eq("45m from 15m is built from whole 15m bars; 20m from 5m: 00:00, 00:20 ...", [aggregateCandles(m1.filter((_, i) => i % 15 === 0), 45 * MIN).map((b) => b.t - utc("2026-10-12T00:00:00")), aggregateCandles(m1.filter((_, i) => i % 5 === 0), 20 * MIN).slice(0, 3).map((b) => b.t - utc("2026-10-12T00:00:00"))], [[0, 45 * MIN, 90 * MIN], [0, 20 * MIN, 40 * MIN]]);
  eq("a gap in the middle of the day does not shift the grid", aggregateCandles([{ t: utc("2026-10-12T10:00:00"), o: 1, h: 1, l: 1, c: 1, v: 1 }, { t: utc("2026-10-12T10:07:00"), o: 2, h: 2, l: 2, c: 2, v: 1 }], 3 * MIN).map((b) => b.t - utc("2026-10-12T10:00:00")), [0, 6 * MIN]);
}

// --- live second candles
{
  const P = 15_000;
  const t0 = utc("2026-10-13T14:10:30");
  const tr = (dt: number, p: number, v = 1) => ({ t: t0 + dt, p, v });
  eq("the first trade opens the first bar of an empty chart", foldTrades(undefined, [tr(2000, 100, 3)], P), [{ t: t0, o: 100, h: 100, l: 100, c: 100, v: 3 }]);
  eq("trades in one bucket: open of the first, extremes, close of the last, volume summed", foldTrades(undefined, [tr(1000, 100, 1), tr(4000, 103, 2), tr(9000, 99, 1), tr(14_000, 101, 1)], P), [{ t: t0, o: 100, h: 103, l: 99, c: 101, v: 5 }]);
  eq("a trade in the next bucket opens a new bar; both come back", foldTrades(undefined, [tr(1000, 100), tr(16_000, 102)], P), [{ t: t0, o: 100, h: 100, l: 100, c: 100, v: 1 }, { t: t0 + P, o: 102, h: 102, l: 102, c: 102, v: 1 }]);
  const last: Candle = { t: t0, o: 100, h: 101, l: 99, c: 100.5, v: 4 };
  eq("the newest bar of the chart is updated, not duplicated", foldTrades(last, [tr(3000, 102, 2)], P), [{ t: t0, o: 100, h: 102, l: 99, c: 102, v: 6 }]);
  eq("no trades or nothing usable: nothing changes", [foldTrades(last, [], P), foldTrades(last, [{ t: t0, p: 0, v: 1 }, { t: NaN, p: 5, v: 1 }], P)], [[], []]);
  eq("a late trade of a closed bar is dropped", foldTrades({ t: t0 + P, o: 1, h: 1, l: 1, c: 1, v: 1 }, [tr(2000, 50)], P), []);
  eq("a quiet stretch leaves no bars (no fake flat bars)", foldTrades(last, [tr(5 * P + 1000, 110)], P).map((b) => b.t), [t0 + 5 * P]);
  eq("5s and 1s grids", [foldTrades(undefined, [tr(7000, 1)], 5000)[0].t - t0, foldTrades(undefined, [tr(7400, 1)], 1000)[0].t - t0], [5000, 7000]);
  const input = [tr(1000, 100)];
  foldTrades(last, input, P);
  eq("the chart's own bar is not mutated", last, { t: t0, o: 100, h: 101, l: 99, c: 100.5, v: 4 });
}

// --- the axis of second bars
{
  const t = (s: string) => utc("2026-10-13T" + s);
  const w = (cur: string, prev: string) => tickWeight(t(cur), t(prev), 0);
  eq("seconds weigh less than a minute change and order by roundness", [w("14:10:30", "14:10:15"), w("14:10:15", "14:10:10"), w("14:10:10", "14:10:05"), w("14:10:05", "14:10:04"), w("14:10:04", "14:10:03"), w("14:30:00", "14:29:45")], [9, 8, 7, 6, 5, 25]);
  eq("a second bar label shows seconds, a minute bar does not", [formatTickLabel(t("14:10:30"), 9, 0, "ru"), formatTickLabel(t("14:11:00"), 25, 0, "ru"), formatTickLabel(t("14:00:00"), 35, 0, "ru")], ["14:10:30", "14:11", "14:00"]);
  eq("the crosshair time has seconds on second bars only", [/14:10:30/.test(formatCrosshairTime(t("14:10:30"), 0, "ru-RU", true, true)), /14:10:30/.test(formatCrosshairTime(t("14:10:30"), 0, "ru-RU", true, false)), /14:10/.test(formatCrosshairTime(t("14:10:30"), 0, "ru-RU", true, false))], [true, false, true]);
  eq("minute-and-up bars keep their weights (1m bars never share a minute)", [w("14:11:00", "14:10:00"), w("14:30:00", "14:29:00"), w("15:00:00", "14:59:00")], [10, 25, 35]);
}

// --- typed intervals (the «go to timeframe» field)
{
  const T = (s: string, src = "bybit") => parseTypedInterval(s, src);
  eq("numbers are minutes", [T("15"), T("3"), T("1440"), T("0"), T("5000")], ["15", "3", "D", null, null]);
  eq("units: m h s d w y (latin and cyrillic)", [T("45m"), T("2h"), T("2ч"), T("30s"), T("30с"), T("d"), T("1д"), T("w"), T("н"), T("y"), T("3d")], ["45", "120", "120", "30s", "30s", "D", "D", "W", "W", "Y", "4320"]);
  eq("capital M is the month, small m is minutes", [T("M"), T("1M"), T("5m"), T("2M")], ["M", "M", "5", null]);
  eq("seconds only where they exist, and only the table ones", [T("15s", "moex"), T("15s", "bybit"), T("7s", "bybit"), T("30s", "")], [null, "15s", null, null]);
  eq("junk", [T(""), T("abc"), T("h"), T("1x"), T("-5")], [null, null, null, null, null]);
}

// --- pinned timeframes in the settings
{
  eq("defaults come from the table", DEFAULT_SETTINGS.ui.favIntervals, DEFAULT_FAVORITE_INTERVALS);
  eq("junk and duplicates are dropped, real ones (also seconds) stay", normalizeSettings({ ui: { favIntervals: ["15", "15", "x", 7, "2", "15s", "999999", "D"] } }).ui.favIntervals, ["15", "2", "15s", "D"]);
  eq("a copy without the field gets the defaults", normalizeSettings({}).ui.favIntervals, DEFAULT_FAVORITE_INTERVALS);
  eq("an empty list stays empty (the user unpinned everything)", normalizeSettings({ ui: { favIntervals: [] } }).ui.favIntervals, []);
}

// the timeframe row (chips + «▾») is never empty and always has the current timeframe, whatever was stored (scripts/check-prefs-sanitize.ts goes deeper)
{
  setMoexSeconds(false);
  eq("row: nothing pinned -> the default chips", tfRowIds("1", [], "moex").shown, DEFAULT_FAVORITE_INTERVALS);
  eq("row: junk pinned -> the default chips", tfRowIds("1", ["x", 7, null], "moex").shown, DEFAULT_FAVORITE_INTERVALS);
  eq("row: the current timeframe is added in its place", tfRowIds("120", ["1", "D"], "moex").shown, ["1", "120", "D"]);
  eq("row: seconds are not chips where there are none, the pins stay", [tfRowIds("1", ["15s", "1"], "moex").chips, tfRowIds("1", ["15s", "1"], "moex").pinned], [["1"], ["15s", "1"]]);
  eq("row: seconds are chips on Bybit", tfRowIds("1", ["15s", "1"], "bybit").chips, ["15s", "1"]);
}

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall timeframe checks passed");
