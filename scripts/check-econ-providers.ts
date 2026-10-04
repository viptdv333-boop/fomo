/* Calendar provider chain checks: TradingView / FMP / Forex Factory normalisation from recorded fixtures, the MOEX layer, the
   fallback chain with caches and back-off, and the month grid helpers. Run: npx tsx scripts/check-econ-providers.ts
   Fixtures (scripts/fixtures): tv_events.json (real TradingView answer, comments trimmed), ff_thisweek.json (real Forex Factory
   feed), forts_securities.json (real ISS FORTS list), isdayoff_2026.txt (real production calendar). */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeFmpRows } from "../src/lib/calendar/normalize";
import { mockFmpRows } from "../src/lib/calendar/fixture";
import { normalizeTradingView } from "../src/lib/calendar/tradingview";
import { ffCoverage, normalizeForexFactory, parseFfValue } from "../src/lib/calendar/forexfactory";
import { buildMoexExpirations, buildMoexHolidays, parseForts } from "../src/lib/calendar/moex";
import { _resetCalendarCache, _setFetch, _setProviders, getCalendarRange, getMoexEvents } from "../src/lib/calendar/source";
import { buildMonthCells, dayCounts, monthWindowStart, outsideCoverage, pickForCell } from "../src/lib/calendar/grid";

const FX = (f: string) => readFileSync(join(__dirname, "fixtures", f), "utf8");
let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
};

const route = (calls: string[], opts: { tv?: number } = {}): typeof fetch =>
  (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const res = (body: string, status = 200) => new Response(body, { status });
    if (url.includes("economic-calendar.tradingview.com")) return opts.tv ? res("err", opts.tv) : res(FX("tv_events.json"));
    if (url.includes("financialmodelingprep")) return res("Restricted Endpoint", 402);
    if (url.includes("ff_calendar_thisweek")) return res(FX("ff_thisweek.json"));
    if (url.includes("ff_calendar_nextweek")) return res("<html>404</html>", 404);
    if (url.includes("iss.moex.com")) return res(FX("forts_securities.json"));
    if (url.includes("isdayoff.ru")) return res(FX("isdayoff_2026.txt"));
    return res("", 500);
  }) as typeof fetch;

async function main() {
  console.log("normalisers");
  await ok("TradingView rows: importance, raw values, description, holidays, edge rows", () => {
    const ev = normalizeTradingView(JSON.parse(FX("tv_events.json")));
    assert.ok(ev.length > 100, `events ${ev.length}`);
    assert.equal(ev.filter((e) => e.event.startsWith("Edge: bad date")).length, 0, "bad date dropped");
    const edge = ev.find((e) => e.event.startsWith("Edge: no comment"));
    assert.ok(edge && edge.impact === 1 && edge.actual === null && !edge.hasDesc);
    assert.ok(ev.some((e) => e.impact === 3) && ev.some((e) => e.impact === 2) && ev.some((e) => e.impact === 1));
    const withDesc = ev.find((e) => e.hasDesc);
    assert.ok(withDesc && withDesc.description && withDesc.description.length > 20);
    assert.ok(ev.some((e) => e.actual !== null && e.forecast !== null && e.country === "US"), "actuals present for past releases");
    assert.ok(ev.some((e) => e.category === "holiday" && e.allDay));
    assert.equal(new Set(ev.map((e) => e.id)).size, ev.length);
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i - 1].ts <= ev[i].ts);
    const jolts = ev.find((e) => /JOLTs/.test(e.event) && e.actual !== null);
    if (jolts) assert.ok((jolts.actual ?? 0) >= 1e6, "raw (unscaled) value");
    assert.deepEqual(normalizeTradingView({ status: "ok" }), []);
    assert.deepEqual(normalizeTradingView(null), []);
  });
  await ok("Forex Factory values: units, scales, '|' parts", () => {
    assert.deepEqual(parseFfValue("0.3%"), { value: 0.3, percent: true });
    assert.deepEqual(parseFfValue("215K"), { value: 215000, percent: false });
    assert.deepEqual(parseFfValue("-1.2B"), { value: -1.2e9, percent: false });
    assert.deepEqual(parseFfValue("2.10T"), { value: 2.1e12, percent: false });
    assert.deepEqual(parseFfValue("4.83|2.7"), { value: 4.83, percent: false });
    assert.equal(parseFfValue(""), null);
    assert.equal(parseFfValue("n/a"), null);
  });
  await ok("Forex Factory fixture: countries from currencies, holidays, no actual, week coverage", () => {
    const rows = JSON.parse(FX("ff_thisweek.json"));
    const ev = normalizeForexFactory(rows);
    assert.ok(ev.length > 60);
    assert.ok(ev.every((e) => e.actual === null), "the feed has no actual");
    assert.ok(ev.some((e) => e.country === "EU") && ev.some((e) => e.country === "US") && ev.some((e) => e.country === ""), "'All' is global");
    assert.ok(ev.some((e) => e.category === "holiday" && e.impact === 1));
    const unemp = ev.find((e) => e.event === "Unemployment Rate" && e.country === "CA");
    assert.ok(unemp && unemp.unit === "%" && unemp.forecast === 6.5 && unemp.impact === 3);
    const claims = ev.find((e) => e.event === "Unemployment Claims");
    assert.ok(claims && claims.forecast === 200000);
    const cov = ffCoverage(rows);
    assert.ok(cov);
    assert.equal(new Date(cov!.from).getUTCDay(), 0, "Sunday start");
    assert.equal(cov!.to - cov!.from, 7 * 86_400_000);
    assert.equal(normalizeForexFactory("x").length, 0);
  });
  await ok("MOEX layer: holidays / shortened days, expirations grouped, 18:50 MSK = 15:50 UTC", () => {
    const hol = buildMoexHolidays(2026, FX("isdayoff_2026.txt").trim(), "2026-10-01", "2026-12-31", "ru");
    const days = hol.map((e) => new Date(e.ts).toISOString().slice(0, 10) + (e.impact === 1 ? "s" : "h"));
    assert.deepEqual(days, ["2026-11-03s", "2026-11-04h", "2026-12-31h"]);
    assert.ok(hol.every((e) => e.country === "RU" && e.category === "moex" && e.allDay && e.hasDesc));
    const rows = parseForts(JSON.parse(FX("forts_securities.json")));
    assert.ok(rows.length > 50);
    const exp = buildMoexExpirations(rows, "2026-10-01", "2026-12-31", "ru");
    assert.ok(exp.length > 3 && exp.every((e) => e.category === "moex" && e.country === "RU" && !e.allDay));
    assert.equal(new Date(exp[0].ts).getUTCHours(), 15);
    assert.equal(new Date(exp[0].ts).getUTCMinutes(), 50);
    assert.equal(new Set(exp.map((e) => e.id)).size, exp.length);
    assert.equal(buildMoexExpirations(rows, "2020-01-01", "2020-01-02", "en").length, 0);
    assert.ok(/^(Futures expiry|Other futures)/.test(buildMoexExpirations(rows, "2026-10-01", "2026-12-31", "en")[0].event));
    assert.deepEqual(parseForts({ securities: { columns: ["X"], data: [] } }), []);
  });

  console.log("provider chain");
  await ok("TradingView first, MOEX merged, fallbacks untouched, cache serves the 2nd call", async () => {
    _resetCalendarCache();
    const calls: string[] = [];
    _setFetch(route(calls));
    process.env.FMP_API_KEY = "test-key-not-real";
    const now = Date.UTC(2026, 9, 6, 12);
    const r = await getCalendarRange("2026-10-26", "2026-11-08", now);
    assert.equal(r.source, "tradingview");
    assert.equal(r.reason, "ok");
    assert.ok(r.moex && r.events.some((e) => e.category === "moex"));
    assert.ok(!calls.some((u) => u.includes("financialmodelingprep") || u.includes("nfs.faireconomy")));
    assert.ok(r.events.some((e) => e.hasDesc && e.description));
    const count = calls.length;
    await getCalendarRange("2026-10-26", "2026-11-08", now + 1000);
    assert.equal(calls.length, count, "second call is served from the cache");
    delete process.env.FMP_API_KEY;
  });
  await ok("TradingView horizon: empty future weeks ({status:ok} only) become 'no data' coverage, not an error", async () => {
    _resetCalendarCache();
    const empty: typeof fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes("economic-calendar.tradingview.com")) {
        const from = /from=(\d{4}-\d{2}-\d{2})/.exec(u)![1];
        return new Response(from <= "2026-10-26" ? FX("tv_events.json") : JSON.stringify({ status: "ok" }), { status: 200 });
      }
      return new Response("x", { status: 500 });
    }) as typeof fetch;
    _setFetch(empty);
    const now = Date.UTC(2026, 9, 6, 12);
    const r = await getCalendarRange("2026-10-19", "2026-11-15", now, { moex: false });
    assert.equal(r.source, "tradingview");
    assert.equal(r.reason, "ok");
    assert.ok(r.coverage && r.coverage.to === Date.parse("2026-11-02T00:00:00Z") || r.coverage!.to > Date.parse("2026-10-26T00:00:00Z"), JSON.stringify(r.coverage));
    assert.ok(r.coverage!.to <= Date.parse("2026-11-16T00:00:00Z"));
    const far = await getCalendarRange("2026-12-07", "2026-12-13", now, { moex: false });
    assert.equal(far.source, "tradingview");
    assert.deepEqual(far.events, []);
    assert.ok(far.coverage && far.coverage.to <= Date.parse("2026-12-07T00:00:00Z"), "whole week unknown");
    _setFetch(null);
  });
  await ok("TradingView down -> FMP restricted -> Forex Factory; negative cache; 5 minute rule; stale-if-error", async () => {
    _resetCalendarCache();
    const calls: string[] = [];
    _setFetch(route(calls, { tv: 503 }));
    process.env.FMP_API_KEY = "test-key-not-real";
    const t0 = Date.UTC(2026, 9, 6, 12);
    const r = await getCalendarRange("2026-10-05", "2026-10-09", t0, { moex: false });
    assert.equal(r.source, "forexfactory");
    assert.ok(r.tried[0].startsWith("tradingview:") && r.tried[1] === "fmp:restricted", r.tried.join());
    assert.ok(r.events.length > 30 && r.events.every((e) => e.actual === null));
    assert.ok(r.coverage && r.coverage.to - r.coverage.from === 7 * 86_400_000);
    const count = (s: string) => calls.filter((u) => u.includes(s)).length;
    assert.equal(count("nfs.faireconomy"), 2, "this week + next week once each (next week answers 404)");
    const tvFirst = count("economic-calendar.tradingview.com");
    await getCalendarRange("2026-10-05", "2026-10-09", t0 + 30_000, { moex: false });
    await getCalendarRange("2026-10-06", "2026-10-08", t0 + 40_000, { moex: false });
    assert.equal(count("nfs.faireconomy"), 2, "no refetch inside 5 minutes");
    assert.equal(count("financialmodelingprep"), 1, "FMP asked once, then the negative cache (restricted: 10 min)");
    assert.equal(count("economic-calendar.tradingview.com"), tvFirst, "TradingView back-off");
    const out = await getCalendarRange("2026-11-02", "2026-11-08", t0 + 180_000, { moex: false });
    assert.equal(out.reason, "range-unsupported");
    assert.deepEqual(out.events, []);
    assert.equal(out.source, "forexfactory");
    const failing: typeof fetch = (async (input: RequestInfo | URL) => {
      const u = String(input);
      calls.push(u);
      return u.includes("nfs.faireconomy") ? new Response("busy", { status: 429, headers: { "Retry-After": "900" } }) : new Response("busy", { status: 503 });
    }) as typeof fetch;
    _setFetch(failing);
    const st = await getCalendarRange("2026-10-05", "2026-10-09", t0 + 25 * 60_000, { moex: false });
    assert.equal(st.source, "forexfactory");
    assert.ok(st.stale && st.events.length > 30, "stale-if-error");
    const before = count("nfs.faireconomy");
    await getCalendarRange("2026-10-05", "2026-10-09", t0 + 26 * 60_000, { moex: false });
    assert.equal(count("nfs.faireconomy"), before, "a failed attempt is not retried within 5 minutes");
    await getCalendarRange("2026-10-05", "2026-10-09", t0 + 36 * 60_000, { moex: false });
    assert.equal(count("nfs.faireconomy"), before, "Retry-After (15 min) is honoured, longer than the 5 minute minimum");
    await getCalendarRange("2026-10-05", "2026-10-09", t0 + 42 * 60_000, { moex: false });
    assert.ok(count("nfs.faireconomy") > before, "and the feed is tried again afterwards");
    delete process.env.FMP_API_KEY;
  });
  await ok("the MOEX layer alone survives when every provider fails", async () => {
    _resetCalendarCache();
    _setFetch(route([], { tv: 500 }));
    process.env.ECON_CALENDAR_PROVIDERS = "tradingview";
    const r = await getCalendarRange("2026-11-02", "2026-11-08", Date.UTC(2026, 9, 6, 12));
    assert.equal(r.source, "none");
    assert.equal(r.reason, "partial");
    assert.ok(r.events.length > 0 && r.events.every((e) => e.category === "moex"));
    const direct = await getMoexEvents("2026-11-03", "2026-11-04", "en", Date.UTC(2026, 9, 6, 12));
    assert.ok(direct.some((e) => e.event.startsWith("Shortened")));
    delete process.env.ECON_CALENDAR_PROVIDERS;
  });
  await ok("providers can be replaced", async () => {
    _resetCalendarCache();
    _setProviders([{ id: "none", range: async () => ({ events: [], reason: "restricted", stale: false, coverage: null }) }]);
    const r = await getCalendarRange("2026-10-05", "2026-10-06", Date.now(), { moex: false });
    assert.equal(r.reason, "restricted");
    _setProviders(null);
    _setFetch(null);
  });

  console.log("month grid");
  await ok("cells: Monday aligned 5 weeks, today, weekend; busiest kept; coverage", () => {
    const now = Date.UTC(2026, 9, 7, 12);
    assert.equal(monthWindowStart("2026-10-07"), "2026-10-05");
    const cells = buildMonthCells("2026-10-05", "2026-10-07", 35);
    assert.equal(cells.length, 35);
    assert.equal(cells[0].date, "2026-10-05");
    assert.equal(cells[34].date, "2026-11-08");
    assert.ok(cells[2].today && !cells[1].today);
    assert.ok(cells[5].weekend && cells[6].weekend && !cells[4].weekend);
    assert.ok(cells[0].past && !cells[3].past);
    assert.ok(cells.find((c) => c.date === "2026-11-01")!.first);
    const ev = normalizeFmpRows(mockFmpRows("2026-10-05", "2026-10-11", now));
    const by = dayCounts(ev, "UTC");
    const mon = by.get("2026-10-05");
    assert.ok(mon && mon.total > 0 && mon.byImpact[0] + mon.byImpact[1] + mon.byImpact[2] === mon.total);
    const dayEv = ev.filter((e) => e.ts >= Date.UTC(2026, 9, 7) && e.ts < Date.UTC(2026, 9, 8));
    const picked = pickForCell(dayEv, 3);
    assert.equal(picked.shown.length, 3);
    assert.equal(picked.more, dayEv.length - 3);
    for (let i = 1; i < picked.shown.length; i++) assert.ok(picked.shown[i - 1].ts <= picked.shown[i].ts, "shown sorted by time");
    assert.ok(picked.shown.some((e) => e.impact === Math.max(...dayEv.map((e) => e.impact))), "the most important are kept");
    assert.deepEqual(pickForCell(dayEv.slice(0, 2), 3).more, 0);
    const cov = { from: Date.UTC(2026, 9, 4), to: Date.UTC(2026, 9, 11) };
    assert.equal(outsideCoverage("2026-10-08", cov, "UTC"), false);
    assert.equal(outsideCoverage("2026-10-12", cov, "UTC"), true);
    assert.equal(outsideCoverage("2026-10-12", null, "UTC"), false);
  });

  console.log(`\nall ${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
