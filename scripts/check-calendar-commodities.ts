/* Commodities / agriculture layer checks (src/lib/calendar/commodities.ts): the static, verified report schedule.
   Dates parse, weekly rules fall on the right weekdays and skip US holidays where USDA does, no duplicates, every event has a source URL,
   importance 1..3, approx dates are flagged and capped, WASDE of the feed is replaced by the official one, glossary keys / briefs / tags work,
   the filters and the preference switch behave.
   Run: npx tsx scripts/check-calendar-commodities.ts */
import assert from "node:assert/strict";
import {
  buildCommodityEvents, commoditySchedule, cropProgressRule, dropOfficialDuplicates, exportSalesRule, NASS_CROP_PROGRESS_2026, SERIES, usFederalHolidays, wallToUtc, WASDE_2026,
} from "../src/lib/calendar/commodities";
import { explicitKey, glossaryBrief, glossaryText, localizeCalEvent, TAGS } from "../src/lib/calendar/glossary";
import { filterEvents } from "../src/lib/calendar/normalize";
import { DEFAULT_CAL_PREFS, normalizeCalPrefs } from "../src/lib/calendar/prefs";
import { _resetCalendarCache, _setProviders, getCalendarRange, type Provider } from "../src/lib/calendar/source";
import type { CalEvent } from "../src/lib/calendar/types";

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
};

const FROM = "2026-01-01";
const TO = "2027-12-31";
const hasCyr = (s: string) => /[Ѐ-ӿ]/.test(s);

/** Local wall clock of an instant in a zone, independent of the code under test (plain Intl). */
function wall(ts: number, zone: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ts));
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, wd: g("weekday"), hm: `${g("hour")}:${g("minute")}` };
}
const wdOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const addD = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);

async function main() {
  const sched = commoditySchedule();
  const ru = buildCommodityEvents(FROM, TO, "ru");
  const en = buildCommodityEvents(FROM, TO, "en");

  console.log("table");
  await ok("every date parses, times are real instants, series have a source URL and a glossary key", () => {
    assert.ok(sched.length > 300, `items ${sched.length}`);
    for (const s of SERIES) {
      assert.match(s.src, /^https:\/\/[^\s]+$/, `${s.id}: source URL`);
      assert.ok(s.gk.startsWith("agro."), `${s.id}: key`);
      assert.ok(s.items.length > 0, `${s.id}: no items`);
    }
    for (const it of sched) {
      assert.match(it.date, /^\d{4}-\d{2}-\d{2}$/, it.series);
      assert.ok(Number.isFinite(it.ts), `${it.series} ${it.date}`);
      assert.equal(new Date(`${it.date}T00:00:00Z`).toISOString().slice(0, 10), it.date, `${it.series}: ${it.date} is not a calendar date`);
      assert.ok(it.date >= FROM && it.date <= TO, `${it.series} ${it.date} outside the table span`);
    }
  });
  await ok("no duplicates: series+date, event ids, titles+instants", () => {
    const k = new Set<string>();
    for (const it of sched) {
      const key = `${it.series}|${it.date}`;
      assert.ok(!k.has(key), `duplicate ${key}`);
      k.add(key);
    }
    assert.equal(ru.length, sched.length);
    assert.equal(new Set(ru.map((e) => e.id)).size, ru.length, "ids (ru)");
    assert.equal(new Set(en.map((e) => e.id)).size, en.length, "ids (en)");
  });
  await ok("every event: category commodity, source URL in the description, importance 1..3, tags + gk, small payload", () => {
    for (const lang of [ru, en]) {
      for (const e of lang) {
        assert.equal(e.category, "commodity");
        assert.ok([1, 2, 3].includes(e.impact), e.event);
        assert.ok(e.hasDesc && e.description && /https:\/\/\S+/.test(e.description), `${e.event}: no source URL`);
        assert.ok(e.gk && e.tags && e.tags.length > 0, `${e.event}: gk / tags`);
        assert.ok(e.event.length < 140, `${e.event}: title too long`);
        assert.ok(e.country && e.currency, e.event);
      }
    }
    // the list payload (the description is stripped by the API): keep it small
    const avg = ru.reduce((a, e) => a + JSON.stringify({ ...e, description: undefined }).length, 0) / ru.length;
    assert.ok(avg < 520, `average event JSON ${avg.toFixed(0)} bytes`);
    for (const e of ru) {
      const s = SERIES.find((x) => e.description!.includes(x.src))!;
      assert.ok(s, `${e.event}: description does not carry its series source`);
    }
  });
  await ok("approx: flagged in the title and description (ru / en), importance <= 2; exact items are not flagged", () => {
    const approx = sched.filter((s) => s.approx);
    assert.ok(approx.length > 50, "approx items");
    for (const it of sched) assert.ok(it.impact >= 1 && it.impact <= 3);
    for (const it of approx) assert.ok(it.impact <= 2, `${it.series} ${it.date} approx importance ${it.impact}`);
    ru.forEach((e, i) => {
      const a = sched[i].approx;
      assert.equal(e.event.includes("(ориентировочно)"), a, e.event);
      assert.equal(/ориентировочн/.test(e.description!), a, `${e.event}: description flag`);
    });
    en.forEach((e, i) => assert.equal(e.event.includes("(approx.)"), sched[i].approx, e.event));
    for (const id of ["wasde", "grainstocks", "plantings", "acreage", "hogs", "cof", "coldstorage", "cocoa-eca", "cocoa-nca", "cocoa-caa", "conab-grains", "conab-coffee", "conab-cane", "statcan-areas", "statcan-stocks", "statcan-prod", "mars", "usdacoffee"]) {
      assert.ok(sched.filter((s) => s.series === id).every((s) => !s.approx), `${id} must be exact`);
    }
    assert.ok(sched.filter((s) => s.series === "mpob" || s.series === "palmcargo").every((s) => s.approx), "MPOB / cargo are approx");
    assert.ok(sched.filter((s) => s.series === "cropprogress" && s.date < "2027-01-01").every((s) => !s.approx), "Crop Progress 2026 is the official list");
    assert.ok(sched.filter((s) => s.series === "cropprogress" && s.date > "2027-01-01").every((s) => s.approx), "Crop Progress 2027 is a rule");
  });

  console.log("weekly and monthly rules");
  await ok("WASDE: the 12 official 2026 dates, 12:00 ET (16:00 UTC in EDT, 17:00 UTC in EST), Monday-Friday", () => {
    const w = sched.filter((s) => s.series === "wasde");
    assert.deepEqual(w.map((x) => x.date), WASDE_2026.split(" "));
    assert.equal(w.length, 12);
    for (const x of w) {
      const l = wall(x.ts, "America/New_York");
      assert.equal(l.date, x.date);
      assert.equal(l.hm, "12:00");
      assert.ok(!["Sat", "Sun"].includes(l.wd), x.date);
    }
    assert.equal(new Date(w.find((x) => x.date === "2026-10-09")!.ts).toISOString(), "2026-10-09T16:00:00.000Z");
    assert.equal(new Date(w.find((x) => x.date === "2026-12-10")!.ts).toISOString(), "2026-12-10T17:00:00.000Z");
    assert.deepEqual(ru.filter((e) => e.gk === "agro.wasde").map((e) => e.event).filter((t, i, a) => a.indexOf(t) === i), ["США: Отчёт USDA WASDE (мировой баланс зерна и масличных)"]);
  });
  await ok("Crop Progress: Monday 16:00 ET, Tuesday after a federal-holiday Monday, April..November; the rule reproduces the official 2026 list", () => {
    const cp = sched.filter((s) => s.series === "cropprogress");
    assert.deepEqual(cropProgressRule(2026).map((i) => i.d), NASS_CROP_PROGRESS_2026.split(" "), "rule vs the NASS 2026 calendar");
    const hol = new Set([...usFederalHolidays(2026), ...usFederalHolidays(2027)]);
    assert.equal(cp.length, 35 + cropProgressRule(2027).length);
    for (const x of cp) {
      const l = wall(x.ts, "America/New_York");
      assert.equal(l.date, x.date);
      assert.equal(l.hm, "16:00");
      const tue = l.wd === "Tue";
      assert.ok(l.wd === "Mon" || (tue && hol.has(addD(x.date, -1))), `${x.date} ${l.wd}`);
      assert.ok(!hol.has(x.date), `${x.date} is a holiday`);
      assert.ok(x.date.slice(5) >= "04-01" && x.date.slice(5) <= "11-30", x.date);
    }
    for (const d of ["2026-05-26", "2026-09-08", "2026-10-13", "2027-06-01", "2027-09-07", "2027-10-12"]) assert.ok(cp.some((x) => x.date === d), `holiday week ${d}`);
    const first27 = cp.filter((x) => x.date.startsWith("2027"))[0].date;
    assert.equal(first27, "2027-04-05");
  });
  await ok("Export Sales: Thursday 08:30 ET; Friday in holiday weeks (flagged approx); never on a holiday", () => {
    const es = sched.filter((s) => s.series === "exportsales");
    const hol = new Set([...usFederalHolidays(2026), ...usFederalHolidays(2027)]);
    for (const x of es) {
      const l = wall(x.ts, "America/New_York");
      assert.equal(l.date, x.date);
      assert.equal(l.hm, "08:30");
      assert.ok(!hol.has(x.date), `${x.date} is a holiday`);
      if (x.approx) assert.ok(l.wd === "Fri" || (l.wd === "Thu" && hol.has(addD(x.date, 1))), `${x.date} shifted must be Friday (or Thursday before a holiday Friday)`);
      else assert.equal(l.wd, "Thu", `${x.date} regular must be Thursday`);
    }
    const oct = es.filter((x) => x.date >= "2026-10-02" && x.date <= "2026-12-31").map((x) => x.date);
    assert.deepEqual(oct, ["2026-10-08", "2026-10-16", "2026-10-22", "2026-10-29", "2026-11-05", "2026-11-13", "2026-11-19", "2026-11-27", "2026-12-03", "2026-12-10", "2026-12-17", "2026-12-24", "2026-12-31"]);
    assert.equal(es.find((x) => x.date === "2026-12-31")!.approx, true, "Dec 31, 2026: guessed (Friday is a holiday)");
    assert.equal(es.length, exportSalesRule(FROM, TO).length);
    assert.ok(es.some((x) => x.date === "2027-01-08"), "Friday holiday (Jan 1, 2027) moves the next release to Friday Jan 8");
  });
  await ok("US federal holidays (observed): spot checks", () => {
    const h26 = usFederalHolidays(2026);
    for (const d of ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]) assert.ok(h26.has(d), d);
    assert.ok(usFederalHolidays(2027).has("2027-06-18"), "Juneteenth 2027 is a Saturday -> Friday");
    assert.ok(!h26.has("2026-07-04"), "Jul 4, 2026 is a Saturday: observed on Friday");
  });
  await ok("NASS livestock / grain reports: weekdays, 15:00 or 12:00 ET, none on a holiday", () => {
    const hol = usFederalHolidays(2026);
    for (const [id, hm] of [["grainstocks", "12:00"], ["plantings", "12:00"], ["acreage", "12:00"], ["hogs", "15:00"], ["cof", "15:00"], ["coldstorage", "15:00"]] as const) {
      const list = sched.filter((s) => s.series === id);
      assert.ok(list.length >= 1, id);
      for (const x of list) {
        const l = wall(x.ts, "America/New_York");
        assert.equal(l.hm, hm, `${id} ${x.date}`);
        assert.ok(!["Sat", "Sun"].includes(l.wd) && !hol.has(x.date), `${id} ${x.date}`);
      }
    }
    assert.equal(sched.filter((s) => s.series === "cof").length, 12);
    assert.equal(sched.filter((s) => s.series === "coldstorage").length, 12);
    assert.equal(sched.filter((s) => s.series === "hogs").length, 4);
    assert.equal(sched.filter((s) => s.series === "grainstocks").length, 4);
  });
  await ok("cocoa grindings: ECA 08:00 Brussels, NCA 16:00 ET, CAA 16:00 Singapore; titles as asked; ECA Q3/Q4 tentative", () => {
    const eca = sched.filter((s) => s.series === "cocoa-eca");
    assert.deepEqual(eca.map((x) => x.date), ["2026-04-16", "2026-07-16", "2026-10-15", "2027-01-21"]);
    assert.equal(new Date(eca.find((x) => x.date === "2026-10-15")!.ts).toISOString(), "2026-10-15T06:00:00.000Z");
    assert.equal(new Date(eca.find((x) => x.date === "2027-01-21")!.ts).toISOString(), "2027-01-21T07:00:00.000Z");
    assert.deepEqual(eca.filter((x) => x.tentative).map((x) => x.date), ["2026-10-15", "2027-01-21"]);
    assert.equal(new Date(sched.find((x) => x.series === "cocoa-caa" && x.date === "2026-10-15")!.ts).toISOString(), "2026-10-15T08:00:00.000Z");
    assert.equal(new Date(sched.find((x) => x.series === "cocoa-nca" && x.date === "2026-10-15")!.ts).toISOString(), "2026-10-15T20:00:00.000Z");
    const t = ru.filter((e) => e.gk === "agro.cocoa.grind").map((e) => e.event);
    assert.ok(t.includes("Какао: перемалывание в Европе (ECA), 3 кв. 2026"), t.join("; "));
    assert.ok(t.includes("Какао: перемалывание в Северной Америке (NCA), 3 кв. 2026"));
    assert.ok(t.includes("Какао: перемалывание в Азии (CAA), 3 кв. 2026"));
    const tent = ru.find((e) => e.event === "Какао: перемалывание в Европе (ECA), 3 кв. 2026")!;
    assert.ok(/предварительн/.test(tent.description!));
    assert.ok(en.some((e) => e.event === "Cocoa: Europe grindings (ECA), Q3 2026"));
  });
  await ok("CONAB / StatCan / MARS / FAS coffee: official dates present, weekdays", () => {
    const g = sched.filter((s) => s.series === "conab-grains").map((x) => x.date);
    assert.deepEqual(g, ["2026-01-15", "2026-02-12", "2026-03-13", "2026-04-14", "2026-05-14", "2026-06-11", "2026-07-14", "2026-08-13", "2026-09-15", "2026-10-15", "2026-11-13", "2026-12-15", "2027-01-14"]);
    assert.deepEqual(sched.filter((s) => s.series === "conab-coffee").map((x) => x.date), ["2026-02-05", "2026-05-21", "2026-09-24", "2027-01-07"]);
    assert.deepEqual(sched.filter((s) => s.series === "conab-cane").map((x) => x.date), ["2026-04-16", "2026-04-28", "2026-08-20", "2026-12-22"]);
    assert.deepEqual(sched.filter((s) => s.series === "mars").map((x) => x.date), ["2026-10-26", "2026-11-23"]);
    assert.deepEqual(sched.filter((s) => s.series === "usdacoffee").map((x) => x.date), ["2026-12-16"]);
    const sc = sched.filter((s) => s.series.startsWith("statcan"));
    assert.equal(sc.length, 9);
    for (const x of sc) assert.equal(wall(x.ts, "America/New_York").hm, "08:30");
    for (const x of sched.filter((s) => !s.approx)) assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, `${x.series} ${x.date} on a weekend`);
    for (const x of sched.filter((s) => s.allDay)) assert.equal(new Date(x.ts).toISOString().slice(11), "00:00:00.000Z");
  });
  await ok("MPOB (~10th, weekend -> Monday, 12:30 MYT = 04:30 UTC) and cargo surveyors (10/15/20/25th) are weekday approx rules", () => {
    const m = sched.filter((s) => s.series === "mpob");
    assert.equal(m[0].date, "2026-10-12", "Oct 10, 2026 is a Saturday");
    assert.equal(new Date(m[0].ts).toISOString(), "2026-10-12T04:30:00.000Z");
    assert.equal(m.length, 15);
    for (const x of m) assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, x.date);
    const c = sched.filter((s) => s.series === "palmcargo");
    assert.equal(c.length, 60);
    for (const x of c) assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, x.date);
    assert.ok(ru.find((e) => e.gk === "agro.mpob")!.event.endsWith("(ориентировочно)"));
  });
  await ok("wallToUtc follows DST (New York, Brussels)", () => {
    assert.equal(new Date(wallToUtc("2026-03-06", "12:00", "America/New_York")).toISOString(), "2026-03-06T17:00:00.000Z");
    assert.equal(new Date(wallToUtc("2026-03-09", "12:00", "America/New_York")).toISOString(), "2026-03-09T16:00:00.000Z");
    assert.equal(new Date(wallToUtc("2026-10-15", "08:00", "Europe/Brussels")).toISOString(), "2026-10-15T06:00:00.000Z");
    assert.equal(new Date(wallToUtc("2026-11-02", "08:00", "Europe/Brussels")).toISOString(), "2026-11-02T07:00:00.000Z");
  });

  console.log("glossary, filters, preferences");
  await ok("every event key has about / affects / brief (<= 90, Cyrillic) and known tags; TradingView's WASDE maps to the same key", () => {
    const keys = new Set(ru.map((e) => e.gk!));
    assert.ok(keys.size >= 15, `keys ${keys.size}`);
    for (const k of keys) {
      const g = glossaryText(k, "ru");
      assert.ok(g && g.about.length > 20 && g.affects.length > 20, k);
      assert.ok(g!.brief.length >= 10 && g!.brief.length <= 90 && hasCyr(g!.brief), `${k}: ${g!.brief}`);
      assert.equal(glossaryBrief(k, "ru"), g!.brief);
    }
    for (const e of ru) for (const t of e.tags!) assert.ok(t in TAGS, `${e.event}: tag ${t}`);
    for (const t of ["cocoa", "coffee", "sugar", "wheat", "corn", "soy", "palm", "cotton", "cattle"]) {
      assert.ok(TAGS[t as keyof typeof TAGS].ru && TAGS[t as keyof typeof TAGS].en && TAGS[t as keyof typeof TAGS].cn, t);
    }
    assert.equal(explicitKey("WASDE Report", "other", "US"), "agro.wasde");
    assert.equal(glossaryText("agro.wasde", "ru")!.about.includes("12:00"), true);
    for (const e of ru) assert.ok(hasCyr(e.event), e.event);
  });
  await ok("localizeCalEvent leaves commodity events untouched (already titled); en layer has English titles", () => {
    const e = ru[0];
    assert.equal(localizeCalEvent(e, "ru"), e);
    assert.equal(localizeCalEvent(en[0], "en"), en[0]);
    assert.ok(en.every((x) => !hasCyr(x.event)), "english titles");
  });
  await ok("filterEvents: noCommodity hides the layer, the country filter does not, the oil-and-gas filter excludes it, impacts apply", () => {
    const sample = buildCommodityEvents("2026-10-01", "2026-10-31", "ru");
    assert.ok(sample.length > 10);
    const stock: CalEvent = { ...sample[0], id: "x", category: "growth", country: "US", gk: undefined, tags: undefined };
    const mixed = [...sample, stock];
    assert.equal(filterEvents(mixed, { noCommodity: true }).length, 1);
    assert.equal(filterEvents(mixed, { countries: new Set(["RU"]) }).length, sample.length, "country filter keeps the layer, drops other countries");
    assert.equal(filterEvents(mixed, { energy: true }).length, 0);
    assert.ok(filterEvents(mixed, { impacts: new Set([3]) }).every((e) => e.impact === 3));
    assert.equal(filterEvents(sample, { q: "WASDE" }).length, 1, "search finds the Russian title by the report name");
  });
  await ok("preferences: commodities defaults to true, false is kept, junk falls back to true", () => {
    assert.equal(DEFAULT_CAL_PREFS.commodities, true);
    assert.equal(normalizeCalPrefs({}).commodities, true);
    assert.equal(normalizeCalPrefs({ commodities: false }).commodities, false);
    assert.equal(normalizeCalPrefs({ commodities: "no" }).commodities, true);
    assert.equal(normalizeCalPrefs(normalizeCalPrefs({ commodities: false })).commodities, false);
  });

  console.log("merge into the source");
  await ok("de-duplication: the feed's WASDE / Quarterly Grain Stocks on a day the official layer covers are dropped; other days stay", () => {
    const tv = (event: string, iso: string): CalEvent => ({ id: event + iso, ts: Date.parse(iso), allDay: false, country: "US", currency: "USD", event, category: "other", impact: 1, actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null });
    const feed = [tv("WASDE Report", "2026-10-09T16:00:00Z"), tv("WASDE Report", "2026-10-15T16:00:00Z"), tv("Quarterly Grain Stocks - Corn", "2026-09-30T16:00:00Z"), tv("Quarterly Grain Stocks - Soy", "2026-12-30T16:00:00Z"), tv("Global Dairy Trade Price Index", "2026-10-09T16:00:00Z")];
    const layer = buildCommodityEvents("2026-09-01", "2026-12-31", "ru");
    const kept = dropOfficialDuplicates(feed, layer).map((e) => e.event + e.ts);
    assert.deepEqual(kept, [feed[1], feed[3], feed[4]].map((e) => e.event + e.ts));
    assert.equal(dropOfficialDuplicates(feed, []).length, feed.length, "no layer, no dropping");
  });
  await ok("getCalendarRange: layer on by default, agro:false switches it off, WASDE not doubled, a failing chain still returns the layer as partial", async () => {
    const wasdeFeed: Provider = {
      id: "tradingview",
      async range(from, to) {
        const e: CalEvent = { id: "tvw", ts: Date.parse("2026-10-09T16:00:00Z"), allDay: false, country: "US", currency: "USD", event: "WASDE Report", category: "other", impact: 1, actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null };
        return { events: e.ts >= Date.parse(`${from}T00:00:00Z`) && e.ts < Date.parse(`${to}T23:59:59Z`) ? [e] : [], reason: "ok", stale: false, coverage: null };
      },
    };
    delete process.env.ECON_CALENDAR_MOCK;
    _resetCalendarCache();
    _setProviders([wasdeFeed]);
    const now = Date.UTC(2026, 9, 5, 12);
    const on = await getCalendarRange("2026-10-09", "2026-10-09", now, { moex: false });
    assert.equal(on.commodity, true);
    assert.equal(on.events.filter((e) => /WASDE/.test(e.event)).length, 1, "one WASDE");
    assert.equal(on.events.find((e) => /WASDE/.test(e.event))!.category, "commodity", "the official one wins");
    const off = await getCalendarRange("2026-10-09", "2026-10-09", now, { moex: false, agro: false });
    assert.equal(off.commodity, false);
    assert.equal(off.events.length, 1);
    assert.equal(off.events[0].category, "other", "feed WASDE stays when the layer is off");
    const down: Provider = { id: "tradingview", async range() { return { events: [], reason: "upstream-error", stale: false, coverage: null }; } };
    _setProviders([down]);
    const partial = await getCalendarRange("2026-10-09", "2026-10-09", now, { moex: false });
    assert.equal(partial.reason, "partial");
    assert.ok(partial.events.length > 0 && partial.events.every((e) => e.category === "commodity"));
    const none = await getCalendarRange("2026-10-09", "2026-10-09", now, { moex: false, agro: false });
    assert.equal(none.reason, "upstream-error");
    assert.deepEqual(none.events, []);
    _setProviders(null);
    process.env.ECON_CALENDAR_MOCK = "1";
    _resetCalendarCache();
    const mock = await getCalendarRange("2026-10-06", "2026-10-13", now);
    assert.equal(mock.commodity, false, "mock mode keeps the fixture clean");
    delete process.env.ECON_CALENDAR_MOCK;
  });
  await ok("range edges are inclusive and a UTC day split is respected", () => {
    const one = buildCommodityEvents("2026-10-09", "2026-10-09", "ru");
    assert.ok(one.some((e) => e.gk === "agro.wasde"));
    assert.ok(one.every((e) => new Date(e.ts).toISOString().startsWith("2026-10-09")));
    assert.deepEqual(buildCommodityEvents("2030-01-01", "2030-01-31", "ru"), []);
  });

  console.log(`\nall ${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
