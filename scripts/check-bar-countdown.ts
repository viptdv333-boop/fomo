/* The countdown to the bar close under the last-price tag (src/lib/chart/bar-clock.ts) and the stacking / captions of the price-scale tags
   (src/lib/chart/axis-tags.ts): bar close time on native grids, seconds, the MOEX session grid (aggregated bars anchored to the first bar of the day, cut at the
   day end), months / years on the exchange wall clock, the roll-over of a quiet instrument, the text format; no two tags on top of each other.
   Run: npx tsx scripts/check-bar-countdown.ts   (exit code 1 on a failed assertion) */
import { barCloseTime, barCountdownMs, countdownUnits, formatCountdown, rollGraceMs } from "../src/lib/chart/bar-clock";
import { indicatorCaption, stackTags, tagCaption, type TagBlock } from "../src/lib/chart/axis-tags";
import { aggregateCandles } from "../src/lib/chart/intervals";
import { DEFAULT_SETTINGS, normalizeSettings, sanitizeVolumeMa, settingsToEngine } from "../src/lib/chart/settings";
import { maByType } from "../src/lib/chart/indicators/math";
import type { Candle } from "../src/lib/chart/types";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const utc = (s: string) => Date.parse(s + "Z");
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const left = (start: string, ms: number, now: string, wall = 0) => barCountdownMs(utc(start), ms, utc(now), wall);

/* ── native grids ── */
eq("M1: 14:32:10 -> 50 s", left("2026-10-13T14:32:00", MIN, "2026-10-13T14:32:10"), 50_000);
eq("M5 bar 14:30, now 14:32:10 -> 2:50", left("2026-10-13T14:30:00", 5 * MIN, "2026-10-13T14:32:10"), 170_000);
eq("H1 bar 14:00, now 14:32:10", left("2026-10-13T14:00:00", HOUR, "2026-10-13T14:32:10"), 27 * MIN + 50_000);
eq("H4 bar 12:00, now 14:32:10", left("2026-10-13T12:00:00", 4 * HOUR, "2026-10-13T14:32:10"), 1 * HOUR + 27 * MIN + 50_000);
eq("D bar of the 13th, now 14:32:10", left("2026-10-13T00:00:00", DAY, "2026-10-13T14:32:10"), 9 * HOUR + 27 * MIN + 50_000);
eq("W bar (Monday 12th), now Tue 14:32:10 -> 5 d 9:27:50", left("2026-10-12T00:00:00", 7 * DAY, "2026-10-13T14:32:10"), 5 * DAY + 9 * HOUR + 27 * MIN + 50_000);

/* ── seconds ── */
eq("S1: 0.5 s left", left("2026-10-13T14:32:07", 1000, "2026-10-13T14:32:07") , 1000);
eq("S15 bar :30, now :41 -> 4 s", barCountdownMs(utc("2026-10-13T14:32:30"), 15_000, utc("2026-10-13T14:32:41")), 4000);
eq("S30 bar :30, now :59.5", barCountdownMs(utc("2026-10-13T14:32:30"), 30_000, utc("2026-10-13T14:32:59") + 500), 500);

/* ── months and years follow the wall calendar ── */
eq("M: October bar ends at 1 Nov", barCloseTime(utc("2026-10-01T00:00:00"), 30 * DAY), utc("2026-11-01T00:00:00"));
eq("M: February (28 days)", barCloseTime(utc("2027-02-01T00:00:00"), 30 * DAY), utc("2027-03-01T00:00:00"));
eq("M: December -> January of the next year", barCloseTime(utc("2026-12-01T00:00:00"), 30 * DAY), utc("2027-01-01T00:00:00"));
eq("Y: ends at 1 Jan of the next year", barCloseTime(utc("2026-01-01T00:00:00"), 365 * DAY), utc("2027-01-01T00:00:00"));
// a MOEX month bar parsed by a server in UTC-5 (tzMs = -5 h): candle time = wall - tzMs; the wall month boundary, not the UTC one
const tz = -5 * HOUR;
eq("M with a server zone shift: wall 1 Nov 00:00 = chart time + 5 h", barCloseTime(utc("2026-10-01T00:00:00") - tz, 30 * DAY, tz), utc("2026-11-01T00:00:00") - tz);

/* ── the MOEX session grid: aggregated bars anchored to the first bar of each day ── */
{
  // futures day 09:00 MSK (wall clock read as UTC): 1h bars 09:00..23:00, merged by 4 -> 09:00, 13:00, 17:00, 21:00 (the last one is cut at midnight)
  const src: Candle[] = [];
  for (let h = 9; h < 24; h++) src.push({ t: utc(`2026-10-13T${String(h).padStart(2, "0")}:00:00`), o: 1, h: 1, l: 1, c: 1, v: 1 });
  const agg = aggregateCandles(src, 4 * HOUR);
  eq("MOEX 4h grid starts", agg.map((b) => new Date(b.t).getUTCHours()), [9, 13, 17, 21]);
  const last = agg[agg.length - 1];
  eq("the day's last 4h bar (21:00) closes at midnight, not 01:00", barCloseTime(last.t, 4 * HOUR), utc("2026-10-14T00:00:00"));
  eq("17:00 bar, now 18:45 -> 2h15m", barCountdownMs(agg[2].t, 4 * HOUR, utc("2026-10-13T18:45:00")), 2 * HOUR + 15 * MIN);
  // shares: first bar 09:50, 45m aggregation -> 09:50, 10:35, 11:20 ...
  const sh: Candle[] = [];
  for (let m = 0; m < 600; m += 10) sh.push({ t: utc("2026-10-13T09:50:00") + m * MIN, o: 1, h: 1, l: 1, c: 1, v: 1 });
  const a45 = aggregateCandles(sh, 45 * MIN);
  eq("shares 45m grid", [a45[1].t - a45[0].t, new Date(a45[1].t).toISOString().slice(11, 16)], [45 * MIN, "10:35"]);
  eq("45m bar 10:35, now 11:00 -> 20 min", barCountdownMs(a45[1].t, 45 * MIN, utc("2026-10-13T11:00:00")), 20 * MIN);
  // a custom 50 m grid: 28 bars from 00:00 fill 23:20, the last bar is cut at midnight (10 min)
  eq("50m bar 23:20 is cut at midnight", barCloseTime(utc("2026-10-13T23:20:00"), 50 * MIN), utc("2026-10-14T00:00:00"));
}

/* ── a quiet instrument: no bar yet in the slot that has begun ── */
eq("M1: slot over by 20 s, no successor -> rolls to the next minute", left("2026-10-13T14:32:00", MIN, "2026-10-13T14:33:20"), 40_000);
eq("S5: quiet seconds keep counting on the grid", barCountdownMs(utc("2026-10-13T14:32:00"), 5000, utc("2026-10-13T14:32:47")), 3000);
eq("M1: stale by more than the grace -> nothing", left("2026-10-13T14:32:00", MIN, "2026-10-13T14:40:00"), null);
eq("grace of M1 is 2 min, of M15 is 30 min, of H4 is capped at 30 min", [rollGraceMs(MIN), rollGraceMs(15 * MIN), rollGraceMs(4 * HOUR)], [120_000, 30 * MIN, 30 * MIN]);
eq("D: the bar is over (weekend) -> nothing", left("2026-10-09T00:00:00", DAY, "2026-10-10T08:00:00"), null);
eq("M1 at the end of the day does not roll into the next day", left("2026-10-13T23:59:00", MIN, "2026-10-14T00:00:30"), null);
eq("garbage in -> null", [barCountdownMs(NaN, MIN, 5), barCountdownMs(0, 0, 5)], [null, null]);

/* ── text ── */
const ru = countdownUnits("ru-RU");
eq("14:32", formatCountdown(14 * MIN + 32_000 + 900, ru), "14:32");
eq("00:07", formatCountdown(7_400, ru), "00:07");
eq("under an hour keeps minutes:seconds", formatCountdown(59 * MIN + 59_000, ru), "59:59");
eq("02:15:07", formatCountdown(2 * HOUR + 15 * MIN + 7_000, ru), "02:15:07");
eq("a day and more: days + h:m (ru)", formatCountdown(3 * DAY + 5 * HOUR + 12 * MIN + 40_000, ru), "3д 05:12");
eq("a day and more (en / zh)", [formatCountdown(DAY + HOUR, countdownUnits("en-US")), formatCountdown(DAY + HOUR, countdownUnits("zh-CN"))], ["1d 01:00", "1天 01:00"]);
eq("negative -> 00:00", formatCountdown(-5, ru), "00:00");

/* ── captions ── */
eq("captions ru / en / cn", [tagCaption("price", "ru-RU"), tagCaption("prevClose", "en-US"), tagCaption("alert", "zh-CN"), tagCaption("alert", "cn")], ["Цена", "Prev close", "预警", "预警"]);
eq("indicator caption: name + length", [indicatorCaption("ALMA 9 0.85 6 close"), indicatorCaption("RSI 14 close"), indicatorCaption("Supertrend 10 3")], ["ALMA 9", "RSI 14", "Supertrend 10"]);
eq("indicator caption: several flags -> the line's name", [indicatorCaption("BB 20 2 SMA close", "Upper"), indicatorCaption("MACD 12 26 9 close", "Signal")], ["BB Upper", "MACD Signal"]);
eq("indicator caption: multi-word name, ratios", [indicatorCaption("Stoch RSI 14 14 3 3"), indicatorCaption("ALMA 9/20/50 close")], ["Stoch RSI 14", "ALMA 9/20/50"]);
eq("indicator caption: no numbers", indicatorCaption("OBV"), "OBV");

/* ── stacking: no two tags overlap, a tag keeps its price height when it can ── */
const blk = (id: string, y: number, prio: number, capH = 14, extraH = 0, lo = 0, hi = 400): TagBlock => ({ id, prio, y, bodyH: 20, capH, extraH, lo, hi });
function overlaps(b: TagBlock[], r: Map<string, ReturnType<typeof stackTags> extends Map<string, infer V> ? V : never>) {
  const rects = b.map((x) => {
    const p = r.get(x.id)!;
    return { top: p.top, bottom: p.top + (p.caption ? x.capH : 0) + x.bodyH + x.extraH };
  });
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (rects[i].top < rects[j].bottom && rects[j].top < rects[i].bottom) return true;
  return false;
}
{
  const one = [blk("last", 200, 0, 14, 16)];
  const r1 = stackTags(one);
  eq("alone: body centred on its price, caption above, countdown below", [r1.get("last")!.bodyTop, r1.get("last")!.top, r1.get("last")!.caption, r1.get("last")!.shift], [190, 176, true, 0]);

  const near = [blk("last", 200, 0, 14, 16), blk("ind", 205, 4), blk("alert", 195, 2)];
  const r2 = stackTags(near);
  eq("three tags on one price do not overlap", overlaps(near, r2), false);
  eq("the last price keeps its place", r2.get("last")!.shift, 0);

  const crowd = Array.from({ length: 8 }, (_, i) => blk(`i${i}`, 200 + i, 4 + i * 0.001));
  const r3 = stackTags(crowd);
  eq("eight indicator flags on one price: none overlaps", overlaps(crowd, r3), false);
  eq("... and every one stays inside the pane", crowd.every((x) => { const p = r3.get(x.id)!; return p.top >= 0 && p.top + (p.caption ? x.capH : 0) + x.bodyH <= 400; }), true);
  eq("... with room every tag keeps its caption", crowd.every((x) => r3.get(x.id)!.caption), true);
  const tight = Array.from({ length: 8 }, (_, i) => blk(`t${i}`, 100 + i, 4 + i * 0.001, 14, 0, 0, 200));
  const r3b = stackTags(tight);
  eq("a short pane (8 flags in 200 px): none overlaps, captions give way (some dropped), all inside", [overlaps(tight, r3b), tight.some((x) => !r3b.get(x.id)!.caption), tight.every((x) => { const p = r3b.get(x.id)!; return p.top >= 0 && p.top + (p.caption ? x.capH : 0) + x.bodyH <= 200; })], [false, true, true]);

  const edge = [blk("last", 4, 0, 14, 16)];
  const r4 = stackTags(edge);
  eq("at the top edge the block stays in the pane", r4.get("last")!.top >= 0, true);

  const flat = [blk("a", 100, 1, 0), blk("b", 100, 2, 0)];
  const r5 = stackTags(flat);
  eq("two plain tags on one price: the second goes right below / above", overlaps(flat, r5), false);

  const other = [blk("p", 300, 4, 14, 0, 250, 400), blk("q", 80, 4, 14, 0, 0, 200)];
  eq("tags of different panes do not push each other", [stackTags(other).get("p")!.shift, stackTags(other).get("q")!.shift], [0, 0]);

  const noRoom = [blk("a", 10, 0, 14, 0, 0, 40), blk("b", 12, 1, 14, 0, 0, 40), blk("c", 14, 2, 14, 0, 0, 40)];
  eq("no room: every tag is still placed (overlap instead of vanishing)", stackTags(noRoom).size, 3);
}

/* ── volume MA ── */
{
  const v = [10, 20, 30, 40, 50];
  const sma3 = Array.from(maByType("sma", v, 3));
  eq("volume SMA(3)", sma3.map((x) => (Number.isNaN(x) ? null : x)), [null, null, 20, 30, 40]);
  eq("volume EMA is defined and between min and max", (() => { const e = Array.from(maByType("ema", v, 3)); return e.filter((x) => Number.isFinite(x)).every((x) => x >= 10 && x <= 50); })(), true);
  eq("default volume MA: on, SMA 20, orange", DEFAULT_SETTINGS.volumeMa, { on: true, length: 20, type: "sma", color: "#ff9800", width: 1.4 });
  eq("sanitize: period clamped, unknown type -> sma, junk width -> default", sanitizeVolumeMa({ on: true, length: 9999, type: "xx" as never, color: "", width: NaN }), { on: true, length: 500, type: "sma", color: "#ff9800", width: 1.4 });
  eq("an old saved copy (no volumeMa) gets the defaults", normalizeSettings({ v: 1, scale: { countdown: false } }).volumeMa, DEFAULT_SETTINGS.volumeMa);
  eq("a saved choice survives", normalizeSettings({ volumeMa: { on: false, length: 50, type: "ema", color: "#112233", width: 2 } }).volumeMa, { on: false, length: 50, type: "ema", color: "#112233", width: 2 });
  eq("settings reach the engine", [settingsToEngine(DEFAULT_SETTINGS, false).volumeMa?.length, settingsToEngine(DEFAULT_SETTINGS, false).showTagCaptions, settingsToEngine(DEFAULT_SETTINGS, false).showCountdown], [20, true, true]);
  eq("an old saved copy keeps its own countdown choice, gets captions on", [normalizeSettings({ scale: { countdown: false } }).scale.countdown, normalizeSettings({ scale: { countdown: false } }).scale.tagCaptions], [false, true]);
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
