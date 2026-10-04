/* Economic calendar checks: FMP row normalisation (fixture + edge cases), surprise colouring, time zones, range presets,
   server cache blocks, chart overlay time basis and clustering. Run: npx tsx scripts/check-econ-calendar.ts */
import assert from "node:assert/strict";
import { categoryOf, eventId, filterEvents, inferUnit, normalizeFmpRows, parseCalDate, parseImpact, parseNum } from "../src/lib/calendar/normalize";
import { mockFmpRows } from "../src/lib/calendar/fixture";
import { formatChange, formatValue, isInverse, surprise } from "../src/lib/calendar/surprise";
import { addDays, daySpan, dayKey, formatClock, formatCountdown, rangeBounds, rangeFor, tzOffsetMs, utcWeekBlocks, weekday, zonedDayStart } from "../src/lib/calendar/time";
import { clusterByX, fromChartTime, overlayChunks, snapToBar, spanToDates, toChartTime, utcSpan } from "../src/lib/calendar/overlay";
import { _resetCalendarCache, getCalendarRange } from "../src/lib/calendar/source";

let n = 0;
const ok = (name: string, fn: () => void | Promise<void>) => {
  const r = fn();
  const done = () => console.log(`  ok  ${name}`);
  n++;
  if (r instanceof Promise) return r.then(done);
  done();
};

const MSK = 3 * 3_600_000;

async function main() {
  console.log("normalisation");
  ok("date parsing: no zone = UTC, date only = all day, offsets, Z", () => {
    assert.equal(parseCalDate("2024-03-01 03:35:00")?.ts, Date.UTC(2024, 2, 1, 3, 35));
    assert.equal(parseCalDate("2024-03-01T03:35:00Z")?.ts, Date.UTC(2024, 2, 1, 3, 35));
    assert.equal(parseCalDate("2024-03-01T06:35:00+03:00")?.ts, Date.UTC(2024, 2, 1, 3, 35));
    assert.equal(parseCalDate("2024-03-01T03:35:00-0500")?.ts, Date.UTC(2024, 2, 1, 8, 35));
    assert.deepEqual(parseCalDate("2024-03-01"), { ts: Date.UTC(2024, 2, 1), allDay: true });
    assert.equal(parseCalDate("2024-03-01 03:35:00")?.allDay, false);
    assert.equal(parseCalDate("garbage"), null);
    assert.equal(parseCalDate(null), null);
    assert.equal(parseCalDate(""), null);
  });
  ok("impact strings", () => {
    assert.equal(parseImpact("High"), 3);
    assert.equal(parseImpact("high"), 3);
    assert.equal(parseImpact("Medium"), 2);
    assert.equal(parseImpact("Low"), 1);
    assert.equal(parseImpact("None"), 1);
    assert.equal(parseImpact(""), 1);
    assert.equal(parseImpact(null), 1);
    assert.equal(parseImpact(3), 3);
  });
  ok("numbers: null, strings, garbage", () => {
    assert.equal(parseNum(null), null);
    assert.equal(parseNum(undefined), null);
    assert.equal(parseNum("1,5%"), 15); // thousands separators are stripped: documented, FMP sends plain numbers
    assert.equal(parseNum("n/a"), null);
    assert.equal(parseNum(""), null);
    assert.equal(parseNum(NaN), null);
    assert.equal(parseNum(0), 0);
    assert.equal(parseNum("-0.3"), -0.3);
  });
  ok("fixture rows: quirks survive, duplicates merged, sorted, ids stable", () => {
    const now = Date.UTC(2026, 9, 6, 12);
    const raw = mockFmpRows("2026-10-05", "2026-10-11", now);
    const ev = normalizeFmpRows(raw);
    assert.ok(ev.length > 40, `events ${ev.length}`);
    assert.ok(raw.length > ev.length, "dropped/merged some rows");
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].ts <= ev[i].ts, "sorted");
    assert.equal(new Set(ev.map((e) => e.id)).size, ev.length, "unique ids");
    assert.equal(ev.filter((e) => e.event === "Broken").length, 0);
    const again = normalizeFmpRows(mockFmpRows("2026-10-05", "2026-10-11", now));
    assert.deepEqual(again.map((e) => e.id), ev.map((e) => e.id), "ids stable across runs");
    const garbage = ev.find((e) => e.event === "Garbage Row");
    assert.ok(garbage && garbage.country === "US" && garbage.previous === null && garbage.actual === null && garbage.impact === 2 && garbage.forecast === 15);
    const dateOnly = ev.find((e) => e.event.startsWith("Fed Chair Speech"));
    assert.ok(dateOnly && dateOnly.allDay && dateOnly.impact === 3);
    assert.ok(ev.some((e) => e.actual !== null) && ev.some((e) => e.actual === null && e.ts > now), "past have actuals, future do not");
  });
  ok("duplicates keep the row with the actual", () => {
    const ev = normalizeFmpRows([
      { date: "2026-10-05 12:30:00", country: "US", event: "CPI YoY", currency: "USD", impact: "High", estimate: 2.9, previous: 2.8, actual: null },
      { date: "2026-10-05 12:30:00", country: "US", event: "cpi yoy ", currency: "USD", impact: "High", estimate: 2.9, previous: 2.8, actual: 3.0 },
    ]);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].actual, 3);
  });
  ok("country from currency / name when missing", () => {
    const ev = normalizeFmpRows([
      { date: "2026-10-05 12:30:00", country: "", event: "A", currency: "EUR" },
      { date: "2026-10-05 12:30:00", country: "Japan", event: "B", currency: "JPY" },
      { date: "2026-10-05 12:30:00", country: "gb", event: "C" },
    ]);
    assert.deepEqual(ev.map((e) => e.country).sort(), ["EU", "GB", "JP"]);
  });
  ok("non-array / empty input never throws", () => {
    assert.deepEqual(normalizeFmpRows(null), []);
    assert.deepEqual(normalizeFmpRows({ "Error Message": "x" }), []);
    assert.deepEqual(normalizeFmpRows([]), []);
  });
  ok("ids differ by time/country/name", () => {
    assert.notEqual(eventId(1, "US", "A"), eventId(2, "US", "A"));
    assert.notEqual(eventId(1, "US", "A"), eventId(1, "GB", "A"));
    assert.equal(eventId(1, "US", "A"), eventId(1, "US", " a "));
  });
  ok("category and unit inference", () => {
    assert.equal(categoryOf("Core CPI MoM"), "inflation");
    assert.equal(categoryOf("Non Farm Payrolls"), "employment");
    assert.equal(categoryOf("Fed Interest Rate Decision"), "centralbank");
    assert.equal(categoryOf("GDP Growth Rate QoQ"), "growth");
    assert.equal(categoryOf("10-Year Note Auction"), "auction");
    assert.equal(categoryOf("EIA Crude Oil Stocks Change"), "energy");
    assert.equal(categoryOf("ISM Manufacturing PMI"), "manufacturing");
    assert.equal(categoryOf("Something odd"), "other");
    assert.equal(inferUnit("Unemployment Rate", null), "%");
    assert.equal(inferUnit("Core CPI MoM", null), "%");
    assert.equal(inferUnit("Initial Jobless Claims", null), null);
    assert.equal(inferUnit("Non Farm Payrolls", null), null);
    assert.equal(inferUnit("ISM Manufacturing PMI", null), null);
    assert.equal(inferUnit("Trade Balance", null), null);
    assert.equal(inferUnit("Interest Rate Decision", null), "%");
    assert.equal(inferUnit("Whatever", "K"), "K");
  });
  ok("filter: countries, impact, search", () => {
    const ev = normalizeFmpRows(mockFmpRows("2026-10-05", "2026-10-11", Date.UTC(2026, 9, 6)));
    const us = filterEvents(ev, { countries: new Set(["US"]) });
    assert.ok(us.length > 0 && us.every((e) => e.country === "US"));
    const hi = filterEvents(ev, { impacts: new Set([3]) });
    assert.ok(hi.length > 0 && hi.every((e) => e.impact === 3));
    const q = filterEvents(ev, { q: "payroll" });
    assert.ok(q.length > 0 && q.every((e) => /payroll/i.test(e.event)));
    assert.equal(filterEvents(ev, { q: "usd" }).length, ev.filter((e) => e.currency === "USD").length);
    assert.equal(filterEvents(ev, {}).length, ev.length);
    assert.equal(filterEvents(ev, { countries: new Set() }).length, ev.length, "empty set = no restriction");
  });

  console.log("surprise colouring");
  ok("normal indicator: above forecast = better", () => {
    assert.equal(surprise({ event: "Non Farm Payrolls", actual: 250, forecast: 200, previous: 180 }), "better");
    assert.equal(surprise({ event: "Non Farm Payrolls", actual: 150, forecast: 200, previous: 180 }), "worse");
    assert.equal(surprise({ event: "Non Farm Payrolls", actual: 200, forecast: 200, previous: 180 }), "inline");
  });
  ok("inverse indicators flip (unemployment, claims, deficit)", () => {
    assert.equal(surprise({ event: "Unemployment Rate", actual: 4.3, forecast: 4.1, previous: 4.1 }), "worse");
    assert.equal(surprise({ event: "Unemployment Rate", actual: 3.9, forecast: 4.1, previous: 4.1 }), "better");
    assert.equal(surprise({ event: "Initial Jobless Claims", actual: 230000, forecast: 220000, previous: 219000 }), "worse");
    assert.equal(surprise({ event: "Budget Deficit", actual: 100, forecast: 120, previous: 90 }), "better");
    assert.equal(isInverse("Employment Change"), false);
    assert.equal(isInverse("Continuing Jobless Claims"), true);
  });
  ok("falls back to previous, null when nothing to compare", () => {
    assert.equal(surprise({ event: "X", actual: 5, forecast: null, previous: 4 }), "better");
    assert.equal(surprise({ event: "X", actual: 5, forecast: null, previous: null }), null);
    assert.equal(surprise({ event: "X", actual: null, forecast: 1, previous: 1 }), null);
    assert.equal(surprise({ event: "X", actual: 0, forecast: 0, previous: null }), "inline");
    assert.equal(surprise({ event: "X", actual: -0.1, forecast: -0.3, previous: null }), "better");
  });
  ok("value formatting", () => {
    assert.equal(formatValue(null, null), "");
    assert.equal(formatValue(0.35, "%"), "0.35%");
    assert.equal(formatValue(227000, null), "227K");
    assert.equal(formatValue(1_234_567, null), "1.23M");
    assert.equal(formatValue(-2_500_000_000, null), "-2.5B");
    assert.equal(formatValue(50.3, null), "50.3");
    assert.equal(formatValue(4.18, "%"), "4.18%");
    assert.equal(formatChange(0.3, "%"), "+0.3%");
    assert.equal(formatChange(-12000, null), "-12K");
  });

  console.log("time zones");
  ok("offsets incl. DST", () => {
    assert.equal(tzOffsetMs(Date.UTC(2026, 9, 5, 12), "Europe/Moscow"), MSK);
    assert.equal(tzOffsetMs(Date.UTC(2026, 6, 1, 12), "America/New_York"), -4 * 3_600_000);
    assert.equal(tzOffsetMs(Date.UTC(2026, 11, 1, 12), "America/New_York"), -5 * 3_600_000);
    assert.equal(tzOffsetMs(Date.UTC(2026, 9, 5), "UTC"), 0);
    assert.equal(tzOffsetMs(Date.UTC(2026, 9, 5), "Asia/Kolkata"), 5.5 * 3_600_000);
  });
  ok("grouping by day in the chosen zone", () => {
    const ts = Date.UTC(2026, 9, 5, 22, 30); // 5 Oct 22:30 UTC
    assert.equal(dayKey(ts, "UTC"), "2026-10-05");
    assert.equal(dayKey(ts, "Europe/Moscow"), "2026-10-06"); // 01:30 next day in Moscow
    assert.equal(dayKey(ts, "America/New_York"), "2026-10-05");
    assert.equal(formatClock(ts, "Europe/Moscow"), "01:30");
    assert.equal(formatClock(ts, "UTC"), "22:30");
    assert.equal(formatClock(Date.UTC(2026, 9, 5, 0, 5), "UTC"), "00:05");
  });
  ok("zonedDayStart across DST change (NY 1 Nov 2026 has 25 hours)", () => {
    const a = zonedDayStart("2026-11-01", "America/New_York");
    const b = zonedDayStart("2026-11-02", "America/New_York");
    assert.equal(a, Date.UTC(2026, 10, 1, 4));
    assert.equal(b, Date.UTC(2026, 10, 2, 5));
    assert.equal((b - a) / 3_600_000, 25);
    assert.equal(zonedDayStart("2026-10-05", "Europe/Moscow"), Date.UTC(2026, 9, 4, 21));
  });
  ok("date arithmetic and weekday", () => {
    assert.equal(addDays("2026-10-31", 1), "2026-11-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(weekday("2026-10-05"), 0); // Monday
    assert.equal(weekday("2026-10-11"), 6);
    assert.equal(daySpan({ from: "2026-10-01", to: "2026-10-31" }), 31);
  });
  ok("range presets in the display zone", () => {
    const now = Date.UTC(2026, 9, 7, 22, 0); // Wed 7 Oct 22:00 UTC = Thu 8 Oct 01:00 Moscow
    assert.deepEqual(rangeFor("today", "UTC", now), { from: "2026-10-07", to: "2026-10-07" });
    assert.deepEqual(rangeFor("today", "Europe/Moscow", now), { from: "2026-10-08", to: "2026-10-08" });
    assert.deepEqual(rangeFor("yesterday", "UTC", now), { from: "2026-10-06", to: "2026-10-06" });
    assert.deepEqual(rangeFor("tomorrow", "UTC", now), { from: "2026-10-08", to: "2026-10-08" });
    assert.deepEqual(rangeFor("week", "UTC", now), { from: "2026-10-05", to: "2026-10-11" });
    assert.deepEqual(rangeFor("nextweek", "UTC", now), { from: "2026-10-12", to: "2026-10-18" });
    assert.deepEqual(rangeFor("custom", "UTC", now, { from: "2026-10-20", to: "2026-10-10" }), { from: "2026-10-10", to: "2026-10-20" });
    assert.deepEqual(rangeFor("custom", "UTC", now, { from: "bad", to: "x" }), { from: "2026-10-07", to: "2026-10-07" });
    const b = rangeBounds({ from: "2026-10-08", to: "2026-10-08" }, "Europe/Moscow");
    assert.equal(b.end - b.start, 86_400_000);
    assert.ok(now >= b.start && now < b.end);
  });
  ok("week blocks are Monday aligned and cover the range", () => {
    const bl = utcWeekBlocks("2026-10-07", "2026-10-13");
    assert.deepEqual(bl, [{ from: "2026-10-05", to: "2026-10-11" }, { from: "2026-10-12", to: "2026-10-18" }]);
    assert.equal(utcWeekBlocks("2026-10-05", "2026-10-11").length, 1);
  });
  ok("countdown text", () => {
    assert.equal(formatCountdown(3_661_000), "01:01:01");
    assert.equal(formatCountdown(59_000), "00:00:59");
    assert.equal(formatCountdown(-5), "00:00:00");
    assert.equal(formatCountdown(90_000_000), "1d 01:00:00");
  });

  console.log("chart overlay");
  ok("MOEX time basis: chart time = UTC + offset, and back", () => {
    // TradingChart: offsetMs = MSK - serverTz (server parsed MSK wall clock in its own zone). Here server zone = UTC -> offset = +3h
    const ts = Date.UTC(2026, 9, 5, 12, 30); // 15:30 Moscow
    assert.equal(toChartTime(ts, MSK), Date.UTC(2026, 9, 5, 15, 30));
    assert.equal(fromChartTime(toChartTime(ts, MSK), MSK), ts);
    // a server in Moscow zone (tz +3): offset = MSK - 3h = 0
    assert.equal(toChartTime(ts, MSK - 3 * 3_600_000), ts);
    // crypto: offset 0
    assert.equal(toChartTime(ts, 0), ts);
    const sp = utcSpan(Date.UTC(2026, 9, 5, 10), Date.UTC(2026, 9, 5, 18), MSK);
    assert.equal(sp.from, Date.UTC(2026, 9, 5, 7));
    assert.equal(sp.to, Date.UTC(2026, 9, 5, 15));
  });
  ok("visible span -> padded date range, capped to 31 days", () => {
    assert.deepEqual(spanToDates(Date.UTC(2026, 9, 5, 12), Date.UTC(2026, 9, 5, 18)), { from: "2026-10-04", to: "2026-10-06" });
    const wide = spanToDates(Date.UTC(2026, 0, 1), Date.UTC(2026, 9, 1));
    assert.equal(daySpan(wide), 31);
  });
  ok("clustering by pixels", () => {
    const ev = normalizeFmpRows([
      { date: "2026-10-05 12:30:00", country: "US", event: "A", impact: "High" },
      { date: "2026-10-05 12:31:00", country: "US", event: "B", impact: "Low" },
      { date: "2026-10-05 13:00:00", country: "GB", event: "C", impact: "Medium" },
      { date: "2026-10-09 13:00:00", country: "JP", event: "D", impact: "Medium" },
    ]);
    // 1 px per minute, markers 14px apart merge
    const base = Date.UTC(2026, 9, 5, 12, 0);
    const xOf = (t: number) => (t - base) / 60_000;
    const c = clusterByX(ev, xOf, 14, 10000);
    assert.equal(c.length, 3);
    assert.equal(c[0].events.length, 2);
    assert.equal(c[0].impact, 3);
    assert.equal(c[0].events[0].event, "A", "highest impact first");
    assert.equal(clusterByX(ev, xOf, 14, 100).length, 2, "events right of the plot are skipped");
  });

  ok("snap to the containing bar on any interval", () => {
    const H = 3_600_000;
    const bars = [0, 1, 2, 3].map((i) => ({ t: Date.UTC(2026, 9, 5, 10 + i) + MSK }));
    const ev = Date.UTC(2026, 9, 5, 12, 30) + MSK; // inside the 12:00 bar
    assert.equal(snapToBar(bars, ev, H), Date.UTC(2026, 9, 5, 12) + MSK);
    assert.equal(snapToBar(bars, bars[0].t - 1, H), bars[0].t - 1, "before the data: exact");
    assert.equal(snapToBar(bars, bars[3].t + H, H), bars[3].t + H, "future after the last bar: exact");
    assert.equal(snapToBar(bars, bars[3].t + H - 1, H), bars[3].t, "inside the last bar");
    assert.equal(snapToBar([], 5, H), 5);
    const gap = [{ t: 0 }, { t: H }, { t: 10 * H }];
    assert.equal(snapToBar(gap, 5 * H, H), 5 * H, "inside a gap: exact time");
    const days = [0, 1, 2].map((i) => ({ t: Date.UTC(2026, 9, 5 + i) }));
    assert.equal(snapToBar(days, Date.UTC(2026, 9, 6, 12, 30), 86_400_000), Date.UTC(2026, 9, 6));
  });
  ok("overlay chunks are 28-day aligned and capped", () => {
    const c = overlayChunks(Date.UTC(2026, 9, 5), Date.UTC(2026, 9, 20));
    assert.ok(c.length >= 1 && c.length <= 2);
    assert.equal(daySpan(c[0]), 28);
    assert.equal(weekday(c[0].from), 0, "Monday aligned");
    assert.ok(c[0].from <= "2026-10-05" && c[c.length - 1].to >= "2026-10-20");
    assert.ok(overlayChunks(0, Date.UTC(2030, 0, 1)).length <= 4);
  });

  console.log("server source (mock mode)");
  await ok("blocks cached, range trimmed, filters, restricted degrades to empty + reason", async () => {
    process.env.ECON_CALENDAR_MOCK = "1";
    _resetCalendarCache();
    const now = Date.UTC(2026, 9, 6, 12);
    const r = await getCalendarRange("2026-10-06", "2026-10-07", now);
    assert.equal(r.reason, "mock");
    assert.ok(r.events.length > 0);
    assert.ok(r.events.every((e) => e.ts >= Date.UTC(2026, 9, 6) && e.ts < Date.UTC(2026, 9, 8)));
    const again = await getCalendarRange("2026-10-06", "2026-10-07", now);
    assert.deepEqual(again.events, r.events);
    process.env.ECON_CALENDAR_MOCK = "restricted";
    _resetCalendarCache();
    const bad = await getCalendarRange("2026-10-06", "2026-10-07", now);
    assert.deepEqual(bad.events, []);
    assert.equal(bad.reason, "restricted");
    process.env.ECON_CALENDAR_MOCK = "1";
    _resetCalendarCache();
    delete process.env.ECON_CALENDAR_MOCK;
    delete process.env.FMP_API_KEY;
    const nokey = await getCalendarRange("2026-10-06", "2026-10-07", now);
    assert.equal(nokey.reason, "no-key");
    assert.deepEqual(nokey.events, []);
  });

  console.log(`\nall ${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
