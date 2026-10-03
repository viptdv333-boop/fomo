/* ALGOPACK client side: the AlgoStore time basis, the bar joins and the Promo indicators, from fixtures in the documented
   response shapes (scripts/fixtures/algopack) run through the SAME server normalisers /api/algopack uses.
   No network, no key. Run (the result must not depend on the zone of the machine, nor on the server zone the chart's
   candles were parsed in, so try several):
     TZ=UTC npx tsx src/lib/chart/analysis/__checks__/algopack-client.check.ts
     TZ=Europe/Moscow npx tsx ...   TZ=America/New_York npx tsx ... */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normAlerts, normFutoi, normHi2, normObstats, normOrderstats, normTradestats, attachAlertPrices, wallMs } from "../../../algopack-parse";
import { AlgoStore } from "../../algopack/store";
import { asOfCol, barIndexAt, barRanges, lastCol, sumCol } from "../../algopack/join";
import { computeIndicator, defaultParams, getIndicatorDef } from "../../indicators/registry";
import type { IndEnv } from "../../indicators/registry";
import { alertGlyph, alertGroup, alertMarks, ALGOPACK_DEFS } from "../../indicators/algopack-defs";
import type { Candle } from "../../types";
import { delayedNow } from "../../algopack/delayed";

let failures = 0;
let checks = 0;
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
}
function near(a: number, b: number, msg: string) {
  ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, expected ${b}`);
}
function section(name: string) {
  console.log(`\n== ${name}`);
}
const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, "../../../../../scripts/fixtures/algopack", n), "utf8"));
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const ts = normTradestats(fx("tradestats-eq.json")).tbl;
const os = normOrderstats(fx("orderstats-eq.json")).tbl;
const ob = normObstats(fx("obstats-eq.json")).tbl;
const fu = normFutoi(fx("futoi.json"));
const h2 = normHi2(fx("hi2.json"));
const alertsRaw = normAlerts(fx("alerts.json"));
attachAlertPrices(alertsRaw, ts);

const W0 = wallMs("2026-10-02", "10:00:00");

/** Candles the way /api/klines delivers them: t = wall-as-UTC - tzMs (the wall clock parsed in a server zone tzMs east of UTC). */
function candles(tzMs: number, stepMs: number, n: number, startW = W0): Candle[] {
  return Array.from({ length: n }, (_, i) => ({ t: startW + i * stepMs - tzMs, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 }));
}

function loadStore(tzMs: number): AlgoStore {
  const s = new AlgoStore();
  s.setTz(tzMs);
  s.reset("SBER");
  s.setAccess("yes");
  s.setTable("ts", ts.cols, ts.rows);
  s.setTable("os", os.cols, os.rows);
  s.setTable("ob", ob.cols, ob.rows);
  s.setTable("futoi", fu.cols, fu.rows);
  s.setHi2(h2.metrics, h2.rows);
  s.setAlerts(alertsRaw);
  return s;
}

const SOLAR = [0, 3 * HOUR, -5 * HOUR, 5.5 * HOUR]; // a server in UTC, Moscow, New York, India

for (const tz of SOLAR) {
  section(`store time basis, server zone ${tz / HOUR} h`);
  const s = loadStore(tz);
  // chart time of the first 5-min row equals the first candle's time whatever the zone
  const c = candles(tz, 5 * MIN, 12);
  eq(s.ts!.t[0], c[0].t, "first SuperCandles row lands on the first candle");
  eq(s.ts!.t[11], c[11].t, "last row on the last candle");
  const r = barRanges(c, 5 * MIN, s.ts!.t);
  eq(Array.from(r.lo), Array.from({ length: 12 }, (_, i) => i), "5-min bars map one to one (lo)");
  eq(Array.from(r.hi), Array.from({ length: 12 }, (_, i) => i + 1), "5-min bars map one to one (hi)");
  // the zone can be learned after the data: setTz re-bases
  const late = new AlgoStore();
  late.reset("SBER");
  late.setTable("ts", ts.cols, ts.rows);
  late.setTz(tz);
  eq(late.ts!.t[0], c[0].t, "setTz after the data re-bases the rows");
  eq(late.alerts.length, 0, "no alerts yet");
  late.setAlerts(alertsRaw);
  late.setTz(tz + HOUR);
  eq(late.alerts[0].t, alertsRaw[0].w - tz - HOUR, "alerts re-based as well");
}

section("joins: bar sizes");
{
  const s = loadStore(0);
  const t = s.ts!;
  const vol = t.col.vol;
  // 10 minute bars: two rows each
  const c10 = candles(0, 10 * MIN, 6);
  const r10 = barRanges(c10, 10 * MIN, t.t);
  const sum10 = sumCol(r10, vol);
  for (let i = 0; i < 6; i++) near(sum10[i], vol[2 * i] + vol[2 * i + 1], `10m bar ${i} = two rows`);
  // 1 hour bar from 10:00 covers all 12 rows
  const c60 = candles(0, HOUR, 1);
  let all = 0;
  for (let i = 0; i < 12; i++) all += vol[i];
  near(sumCol(barRanges(c60, HOUR, t.t), vol)[0], all, "1h bar = 12 rows");
  // 1 minute bars repeat the covering 5-min row
  const c1 = candles(0, MIN, 10);
  const v1 = sumCol(barRanges(c1, MIN, t.t), vol);
  eq([v1[0] === vol[0], v1[4] === vol[0], v1[5] === vol[1], v1[9] === vol[1]], [true, true, true, true], "1m bars take the covering 5-min row");
  // a daily bar sums the day
  const cd = candles(0, DAY, 1, wallMs("2026-10-02", "00:00:00"));
  near(sumCol(barRanges(cd, DAY, t.t), vol)[0], all, "daily bar = the day");
  // outside the data: NaN
  const cOut = candles(0, 5 * MIN, 2, wallMs("2026-10-02", "18:00:00"));
  ok(Number.isNaN(sumCol(barRanges(cOut, 5 * MIN, t.t), vol)[0]), "no rows -> NaN");
  const last = lastCol(r10, t.col.pr_close);
  eq(last[0], t.col.pr_close[1], "lastCol takes the last row of the bar");
}

section("joins: as-of (point in time) — no look-ahead");
{
  const s = loadStore(0);
  const f = s.futoi!;
  const c = candles(0, 5 * MIN, 8);
  // snapshot stamps are the 5-min marks 10:00..10:35; the 10:00-10:05 bar closes at 10:05, so it sees snapshots stamped <= 10:05
  const a = asOfCol(c, 5 * MIN, f.t, f.col.yur_pos);
  eq(a[0], f.col.yur_pos[1], "bar 10:00-10:05 sees the 10:05 snapshot (published by the close)");
  eq(a[7], f.col.yur_pos[7], "last bar sees the newest snapshot");
  // intraday bars before the day's HI2 is published do not see it; the daily bar does
  const hi = s.hi2!;
  const vals = hi.vals.hhi_volume;
  const day1 = wallMs("2026-10-02", "00:00:00");
  const intraday = candles(0, HOUR, 4, day1 + 10 * HOUR);
  const aHi = asOfCol(intraday, HOUR, hi.t, vals, DAY, 10 * DAY);
  eq(aHi[0], vals[1], "intraday bars of 10-02 see the HI2 of 10-01 only");
  const daily = candles(0, DAY, 3, wallMs("2026-09-30", "00:00:00"));
  const aD = asOfCol(daily, DAY, hi.t, vals, DAY, 10 * DAY);
  eq([aD[0], aD[1], aD[2]], [vals[0], vals[1], vals[2]], "a daily bar sees its own day's HI2 (published by the close)");
  // stale rows are not carried forever
  const far = candles(0, DAY, 1, wallMs("2026-12-01", "00:00:00"));
  ok(Number.isNaN(asOfCol(far, DAY, hi.t, vals, DAY, 10 * DAY)[0]), "older than maxStale -> NaN");
}

section("alert marks");
{
  const s = loadStore(5.5 * HOUR);
  const c = candles(5.5 * HOUR, 5 * MIN, 12);
  const idx = (w: number) => barIndexAt(c, 5 * MIN, w - 5.5 * HOUR);
  eq(idx(wallMs("2026-10-02", "10:07:00")), 1, "10:07 -> the 10:05 bar");
  eq(idx(wallMs("2026-10-02", "09:00:00")), -1, "before the first bar -> none");
  eq(idx(wallMs("2026-10-02", "11:30:00")), -1, "after the last bar -> none");
  const marks = alertMarks(c, 5 * MIN, s.alerts, "all");
  eq(marks.map((m) => m.i), [1, 4, 6, 8, 10], "alerts mapped onto bars");
  eq(marks.map((m) => m.dir), [1, -1, 0, 1, -1], "directions kept");
  eq(marks.map((m) => m.glyph), ["V", "%", "V", "Δ", "L"], "glyphs");
  eq(alertMarks(c, 5 * MIN, s.alerts, "price").length, 1, "kind filter: price");
  eq(alertMarks(c, 5 * MIN, s.alerts, "netvol").length, 1, "kind filter: net volume");
  eq(alertMarks(c, 5 * MIN, s.alerts, "levels").length, 1, "kind filter: levels");
  eq(alertGroup("vol_b_max"), "volume", "group volume");
  eq(alertGlyph("pr_high_max"), "H", "glyph H");
  ok(marks[0].price != null, "price attached by the server is kept");
}

section("indicators (registered, computed against fixtures)");
{
  eq(ALGOPACK_DEFS.map((d) => d.id), ["ap_futoi", "ap_aggr", "ap_trades", "ap_obimb", "ap_spread", "ap_cancel", "ap_alerts", "ap_hi2"], "definitions");
  for (const d of ALGOPACK_DEFS) ok(getIndicatorDef(d.id) === d, `${d.id} registered in the catalog`);
  for (const d of ALGOPACK_DEFS) ok((d.algo ?? []).length > 0, `${d.id} declares its datasets`);

  const tz = 3 * HOUR;
  const s = loadStore(tz);
  const c = candles(tz, 5 * MIN, 12);
  const env: IndEnv = { flow: null, intervalMs: 5 * MIN, algo: s };
  const run = (id: string, params: Record<string, unknown> = {}, e: IndEnv = env, cs: Candle[] = c) => {
    const def = getIndicatorDef(id)!;
    return computeIndicator(def, cs, { ...defaultParams(def), ...(params as any) }, e);
  };
  const noData = run("ap_aggr", {}, { flow: null, intervalMs: 5 * MIN, algo: null });
  eq(noData.plots.length, 0, "no store -> nothing to draw (and no crash)");
  eq(run("ap_aggr", {}, { flow: null, intervalMs: 5 * MIN, algo: new AlgoStore() }).plots.length, 0, "empty store -> nothing to draw");

  // aggressive volume
  const sp = run("ap_aggr", { apMode: "split" });
  eq(sp.plots.map((p) => p.key), ["Buy", "Sell"], "split plots");
  near(sp.plots[0].data[0], s.ts!.col.vol_b[0], "buy volume of bar 0");
  near(sp.plots[1].data[0], -s.ts!.col.vol_s[0], "sell volume of bar 0 is drawn below zero");
  const dl = run("ap_aggr", { apMode: "delta" });
  near(dl.plots[0].data[3], s.ts!.col.vol_b[3] - s.ts!.col.vol_s[3], "delta");
  eq(dl.plots[0].colors![3], s.ts!.col.vol_b[3] >= s.ts!.col.vol_s[3] ? "#26a69a" : "#ef5350", "delta colour by sign");
  const cu = run("ap_aggr", { apMode: "cum" });
  let acc = 0;
  for (let i = 0; i < 12; i++) acc += s.ts!.col.vol_b[i] - s.ts!.col.vol_s[i];
  near(cu.plots[0].data[11], acc, "cumulative delta over the session");
  // cumulative delta restarts on a new exchange day: two days of candles
  const c2 = [...candles(tz, 5 * MIN, 2, wallMs("2026-10-01", "23:50:00")), ...candles(tz, 5 * MIN, 2, wallMs("2026-10-02", "10:00:00"))];
  const cu2 = run("ap_aggr", { apMode: "cum" }, env, c2);
  near(cu2.plots[0].data[2], s.ts!.col.vol_b[0] - s.ts!.col.vol_s[0], "the cumulative sum restarted on the new wall-clock day");

  // trades
  const tc = run("ap_trades", { apMetric: "count" });
  near(tc.plots[0].data[0], s.ts!.col.trades[0], "trade count");
  const ta = run("ap_trades", { apMetric: "avg" });
  near(ta.plots[0].data[0], s.ts!.col.vol[0] / s.ts!.col.trades[0], "average trade size = volume / trades");
  eq(run("ap_trades", { apMetric: "avgSides" }).plots.length, 2, "buy / sell average size");

  // order book imbalance: percent, fixed range
  const oi = run("ap_obimb", { apMetric: "fullVol" });
  near(oi.plots[0].data[0], s.ob!.col.imb_vol[0] * 100, "imbalance in percent");
  eq(oi.range, [-100, 100], "fixed -100..100 scale");
  const oiB = run("ap_obimb", { apMetric: "bboVol" });
  near(oiB.plots[0].data[2], s.ob!.col.imb_vol_bbo[2] * 100, "best-level imbalance");

  // spread
  near(run("ap_spread", { apMetric: "deep" }).plots[0].data[1], s.ob!.col.spread_deep[1], "10-level spread");

  // cancellation ratio
  const cr = run("ap_cancel", { apMetric: "vol" });
  near(cr.plots[0].data[0], (s.os!.col.cancel_vol[0] / s.os!.col.put_vol[0]) * 100, "cancel ratio by volume, %");
  eq(run("ap_cancel", { apMetric: "vol", apSides: true }).plots.length, 3, "side lines on request");
  eq(run("ap_cancel", { apMetric: "val", apSides: true }).plots.length, 1, "no side split for value");

  // futoi
  const fn = run("ap_futoi", { apMetric: "net" });
  eq(fn.plots.map((p) => p.key), ["YUR net", "FIZ net"], "net plots");
  near(fn.plots[0].data[1], s.futoi!.col.yur_pos[2], "YUR net position (as-of the bar close)");
  eq(run("ap_futoi", { apMetric: "gross" }).plots.length, 4, "gross: long + short for both groups");
  const sh = run("ap_futoi", { apMetric: "share", apFiz: false });
  eq(sh.plots.length, 1, "FIZ switched off");
  near(sh.plots[0].data[0], (s.futoi!.col.yur_long[1] / (s.futoi!.col.yur_long[1] + s.futoi!.col.yur_short[1])) * 100, "long share, %");
  eq(run("ap_futoi", { apMetric: "people" }).plots.length, 4, "participant counts");

  // hi2
  const daily = candles(tz, DAY, 3, wallMs("2026-09-30", "00:00:00"));
  const hi = run("ap_hi2", { apMetric: "hhi_volume" }, { flow: null, intervalMs: DAY, algo: s }, daily);
  eq(hi.plots[0].key, "hhi_volume", "metric");
  near(hi.plots[0].data[2], s.hi2!.vals.hhi_volume[2], "the day's value on its daily bar");
  eq(hi.levels!.map((l) => l.value), [1500, 2500], "interpretation bands");
  eq(run("ap_hi2", { apMetric: "hhi_active" }, { flow: null, intervalMs: DAY, algo: s }, daily).plots[0].key, "hhi_aggressive", "hhi_active falls back to the name the feed has");

  // alerts overlay result
  const al = run("ap_alerts", { apKinds: "all" });
  eq(al.plots.length, 0, "alerts draw no plots");
  eq((al.extra as any).marks.length, 5, "marks in extra");
  const lg = getIndicatorDef("ap_alerts")!.legendItems!(al, defaultParams(getIndicatorDef("ap_alerts")!), "ru");
  ok(lg.length === 1 && lg[0].text.startsWith("5"), "legend shows the count");
}

section("data state (what the panes say when there is nothing to draw)");
{
  const s = new AlgoStore();
  eq(s.state("ts"), "loading", "fresh store: loading");
  s.setAccess("no", "forbidden");
  eq(s.state("ts"), "denied", "denied wins");
  s.setAccess("na");
  eq(s.state("ts"), "unsupported", "not a MOEX instrument");
  s.setAccess("yes");
  s.fail("futoi", "futures-only");
  eq(s.state("futoi"), "unsupported", "futures-only reason -> unsupported");
  s.fail("ts", "http-403");
  eq(s.state("ts"), "denied", "403 -> denied");
  s.fail("os", "empty");
  eq(s.state("os"), "none", "empty -> none");
  s.fail("ob", "timeout");
  eq(s.state("ob"), "error", "timeout -> error");
  s.setTable("ob", ob.cols, ob.rows);
  eq(s.state("ob"), "ok", "data wins over an older failure");
  const v = s.version;
  s.setAccess("yes");
  eq(s.version, v, "no change, no event");
}

section("delayed badge rule");
{
  const now = Date.UTC(2026, 9, 2, 12, 0); // 15:00 Moscow
  const off = 3 * HOUR; // chart time = real + 3h (server in UTC)
  const nowChart = now + off;
  eq(delayedNow("moex", true, nowChart - 16 * MIN, off, "1", now), true, "live session, delayed ISS -> badge");
  eq(delayedNow("moex", false, nowChart - 16 * MIN, off, "1", now), false, "server says not delayed -> no badge");
  eq(delayedNow("moex", undefined, nowChart - 16 * MIN, off, "1", now), false, "unknown (scroll-back page) -> no badge");
  eq(delayedNow("moex", true, nowChart - 5 * HOUR, off, "1", now), false, "closed market (newest bar hours old) -> no badge");
  eq(delayedNow("moex", true, nowChart - 16 * MIN, off, "D", now), false, "daily chart -> no badge");
  eq(delayedNow("bybit", true, nowChart - 16 * MIN, off, "1", now), false, "other sources -> no badge");
  eq(delayedNow("moex", true, nowChart - 100 * MIN, off, "60", now), true, "hourly bar a bit older than 45 min is still live");
  eq(delayedNow("moex", true, undefined, off, "1", now), false, "no bars");
}

console.log(`\n${checks} checks, ${failures} failed`);
if (failures) process.exit(1);
