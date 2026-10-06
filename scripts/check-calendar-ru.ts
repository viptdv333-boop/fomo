/* Russia layer checks (src/lib/calendar/russia.ts): the scheduled releases of the Bank of Russia, Rosstat and the Ministry of Finance.
   Dates parse and fall on the right weekdays, times are right instants (MSK = UTC+3), no duplicates, every event has a source URL,
   approximate items are flagged and capped, glossary keys / briefs / tags work, the filters and the preference switch behave, the layer
   is de-duplicated against the TradingView feed, the feed's Russian rows get their importance raised, and it never repeats the "corp" layer
   (dividends / coupons / reports).
   Run: npx tsx scripts/check-calendar-ru.ts */
import assert from "node:assert/strict";
import { explicitKey, glossaryBrief, glossaryText, localizeCalEvent, ruFeedImpact, TAGS } from "../src/lib/calendar/glossary";
import { eventCategory } from "../src/lib/calendar/categories";
import { filterEvents } from "../src/lib/calendar/normalize";
import { DEFAULT_CAL_PREFS, normalizeCalPrefs } from "../src/lib/calendar/prefs";
import {
  buildRussiaScheduled, CBR_MEETINGS, CBR_SUMMARIES, dropCoveredByFeed, inflExpRule, periodLabel, russiaSchedule, SERIES, toTs, weeklyCpiRule,
} from "../src/lib/calendar/russia";
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
const wdOf = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
const addD = (d: string, k: number) => new Date(Date.parse(`${d}T00:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const iso = (ts: number) => new Date(ts).toISOString();
const feedEvent = (event: string, isoTs: string, country = "RU"): CalEvent => ({ id: event + isoTs, ts: Date.parse(isoTs), allDay: false, country, currency: "RUB", event, category: "other", impact: 1, actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null });

async function main() {
  const sched = russiaSchedule();
  const ru = buildRussiaScheduled(FROM, TO, "ru");
  const en = buildRussiaScheduled(FROM, TO, "en");
  const of = (id: string) => sched.filter((s) => s.series === id);

  console.log("table");
  await ok("every date is a real calendar date inside the span, series have a source URL and a glossary key", () => {
    assert.ok(sched.length > 300, `items ${sched.length}`);
    for (const s of SERIES) {
      assert.match(s.src, /^https:\/\/[^\s]+$/, `${s.id}: source URL`);
      assert.ok(s.gk.length > 3, s.id);
      assert.ok(s.items.length > 0, `${s.id}: no items`);
    }
    for (const it of sched) {
      assert.match(it.date, /^\d{4}-\d{2}-\d{2}$/, it.series);
      assert.equal(new Date(`${it.date}T00:00:00Z`).toISOString().slice(0, 10), it.date, `${it.series}: ${it.date} is not a calendar date`);
      assert.ok(it.date >= FROM && it.date <= TO, `${it.series} ${it.date} outside the table span`);
      assert.ok(Number.isFinite(it.ts));
    }
  });
  await ok("no duplicates: series+date, event ids, and the ru / en layers have the same size", () => {
    const k = new Set<string>();
    for (const it of sched) {
      const key = `${it.series}|${it.date}`;
      assert.ok(!k.has(key), `duplicate ${key}`);
      k.add(key);
    }
    assert.equal(ru.length, sched.length);
    assert.equal(en.length, sched.length);
    assert.equal(new Set(ru.map((e) => e.id)).size, ru.length, "ids (ru)");
    assert.equal(new Set(en.map((e) => e.id)).size, en.length, "ids (en)");
  });
  await ok("every event: category ru, country RU, source URL in the description, importance 1..3, tags + gk, small payload, Russian / English titles", () => {
    for (const lang of [ru, en]) {
      for (const e of lang) {
        assert.equal(e.category, "ru");
        assert.equal(e.country, "RU");
        assert.equal(e.currency, "RUB");
        assert.ok([1, 2, 3].includes(e.impact), e.event);
        assert.ok(e.hasDesc && e.description && /https:\/\/\S+/.test(e.description), `${e.event}: no source URL`);
        assert.ok(e.gk && e.tags && e.tags.length > 0, `${e.event}: gk / tags`);
        assert.ok(e.event.length < 150, `${e.event}: title too long`);
      }
    }
    ru.forEach((e) => assert.ok(hasCyr(e.event), e.event));
    en.forEach((e) => assert.ok(!hasCyr(e.event), e.event));
    const avg = ru.reduce((a, e) => a + JSON.stringify({ ...e, description: undefined }).length, 0) / ru.length;
    assert.ok(avg < 520, `average event JSON ${avg.toFixed(0)} bytes`);
    for (const e of ru) assert.ok(SERIES.some((s) => e.description!.includes(s.src)), `${e.event}: description does not carry its series source`);
  });
  await ok("approx: flagged in the title and description (ru / en), importance <= 2; official series are exact", () => {
    const approx = sched.filter((s) => s.approx);
    assert.ok(approx.length > 60, "approx items");
    for (const it of approx) assert.ok(it.impact <= 2, `${it.series} ${it.date}`);
    ru.forEach((e) => assert.equal(e.event.includes("(ориентировочно)"), /ориентировочн/.test(e.description!), `${e.event}: description flag`));
    assert.equal(ru.filter((e) => e.event.includes("(ориентировочно)")).length, approx.length);
    assert.equal(en.filter((e) => e.event.includes("(approx.)")).length, approx.length);
    assert.ok(en.filter((e) => e.event.includes("(approx.)")).every((e) => /Approximate date/.test(e.description!)));
    const exact = ["cbr-rate", "cbr-summary", "cbr-ondkp", "cbr-macro", "cbr-monitor", "cbr-reserves", "cbr-bop", "cbr-trade", "cbr-m2", "rs-cpi", "rs-ppi", "rs-ip", "rs-labor", "rs-gdpf", "rs-gdp", "rs-gdpu", "ofz-auction"];
    for (const id of exact) assert.ok(of(id).every((s) => !s.approx), `${id} must be exact`);
    assert.ok(of("rs-cpiw").filter((s) => s.date < "2027-01-01").every((s) => !s.approx), "weekly CPI 2026 is the official list");
    assert.ok(of("rs-cpiw").filter((s) => s.date > "2027-01-01").every((s) => s.approx), "weekly CPI 2027 is a rule");
    assert.ok(of("cbr-inflexp").filter((s) => s.date <= "2026-10-31").every((s) => !s.approx));
    assert.ok(of("cbr-inflexp").filter((s) => s.date > "2026-10-31").every((s) => s.approx));
  });

  console.log("Bank of Russia");
  await ok("key rate meetings: the 16 dates of cbr.ru/dkp/cal_mp for 2026-2027, 13:30 MSK = 10:30 UTC, importance 3, weekdays", () => {
    const m = of("cbr-rate");
    assert.deepEqual(m.map((x) => x.date), CBR_MEETINGS.split(" ").map((s) => s.split(":")[0]));
    assert.deepEqual(m.map((x) => x.date).filter((d) => d.startsWith("2026")), ["2026-02-13", "2026-03-20", "2026-04-24", "2026-06-19", "2026-07-24", "2026-09-11", "2026-10-23", "2026-12-18"]);
    assert.deepEqual(m.map((x) => x.date).filter((d) => d.startsWith("2027")), ["2027-02-12", "2027-03-19", "2027-04-30", "2027-06-11", "2027-07-30", "2027-09-10", "2027-10-22", "2027-12-17"]);
    for (const x of m) {
      assert.equal(iso(x.ts).slice(10), "T10:30:00.000Z", x.date);
      assert.equal(x.impact, 3);
      assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, `${x.date} on a weekend`);
    }
    const e = ru.find((x) => x.gk === "ru.cbr.rate" && x.event.startsWith("Россия: решение") && new Date(x.ts).toISOString().startsWith("2026-10-23"))!;
    assert.ok(e && e.allDay === false && /13:30/.test(e.description!) && /15:00/.test(e.description!) && /прогноз/.test(e.description!) && e.description!.includes("https://www.cbr.ru/dkp/cal_mp/"));
    const noForecast = ru.find((x) => x.gk === "ru.cbr.rate" && new Date(x.ts).toISOString().startsWith("2026-09-11"))!;
    assert.ok(!/среднесрочный прогноз Банка России\.$/.test(noForecast.description!.split("Источник")[0].trim()), "no forecast on a non-forecast meeting");
  });
  await ok("forecast meetings are every other one (Feb, Apr, Jul, Oct); summaries come 11-14 days after a decision, forecast comment on the same days", () => {
    const meet = CBR_MEETINGS.split(" ");
    const forecast = meet.filter((s) => s.endsWith(":F")).map((s) => s.slice(5, 7));
    assert.deepEqual([...new Set(forecast)], ["02", "04", "07", "10"]);
    const sum = of("cbr-summary");
    assert.equal(sum.length, 16);
    const dates = meet.map((s) => s.split(":")[0]);
    sum.forEach((s, i) => {
      const gap = (Date.parse(s.date) - Date.parse(dates[i])) / 86_400_000;
      assert.ok(gap >= 11 && gap <= 14, `${dates[i]} -> ${s.date}: ${gap} days`);
      assert.ok(wdOf(s.date) >= 1 && wdOf(s.date) <= 5);
    });
    assert.equal(CBR_SUMMARIES.split(" ").filter((s) => s.endsWith(":F")).length, 8);
    assert.equal(sum[0].gk, "cbr.keyrate", "reuses the existing glossary entry");
  });
  await ok("Основные направления (2 drafts), inflation expectations (4 exact + last-Wednesday rule), macro survey, monitoring, reserves 16:00, BoP, trade, M2", () => {
    assert.deepEqual(of("cbr-ondkp").map((x) => x.date), ["2026-08-31", "2026-09-30"]);
    assert.deepEqual(of("cbr-inflexp").filter((x) => !x.approx).map((x) => x.date), ["2026-07-28", "2026-08-26", "2026-09-29", "2026-10-28"]);
    const rule = of("cbr-inflexp").filter((x) => x.approx);
    assert.equal(rule.length, 14, "Nov 2026 .. Dec 2027");
    for (const x of rule) {
      assert.equal(wdOf(x.date), 3, x.date);
      assert.ok(addD(x.date, 7).slice(0, 7) !== x.date.slice(0, 7), `${x.date} is not the last Wednesday`);
    }
    assert.deepEqual(inflExpRule("2026-11-01", "2026-12-31").map((i) => i.d), ["2026-11-25", "2026-12-30"]);
    assert.deepEqual(of("cbr-macro").map((x) => x.date), ["2026-07-15", "2026-09-02", "2026-10-14"]);
    assert.equal(of("cbr-monitor").length, 4);
    const res = of("cbr-reserves");
    assert.equal(res.length, 10);
    for (const x of res) {
      assert.equal(iso(x.ts).slice(11, 16), "13:00", "16:00 MSK");
      assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, x.date);
    }
    assert.equal(of("cbr-bop").length, 15);
    assert.equal(of("cbr-trade").length, 9);
    assert.equal(of("cbr-m2").length, 9);
    for (const id of ["cbr-bop", "cbr-trade", "cbr-m2", "cbr-macro", "cbr-monitor"]) for (const x of of(id)) assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, `${id} ${x.date}`);
    assert.ok(ru.find((e) => e.gk === "ru.cbr.reserves")!.event.includes("на 1 октября 2026"));
  });

  console.log("Rosstat");
  await ok("weekly CPI: 50 dates of the official 2026 schedule (46 Wednesdays + 4 shifted Fridays), 19:00 MSK = 16:00 UTC, period in the title", () => {
    const w = of("rs-cpiw").filter((x) => x.date < "2027-01-01");
    assert.equal(w.length, 50);
    assert.equal(w.filter((x) => wdOf(x.date) === 3).length, 46);
    assert.deepEqual(w.filter((x) => wdOf(x.date) === 5).map((x) => x.date), ["2026-02-27", "2026-03-13", "2026-05-15", "2026-11-06"]);
    for (const x of w) assert.equal(iso(x.ts).slice(11, 16), "16:00");
    assert.equal(w[0].date, "2026-01-14");
    const t = ru.filter((e) => e.gk === "ru.rosstat.cpiw").map((e) => e.event);
    assert.ok(t.includes("Россия: недельная инфляция (Росстат), 1–12 января"), t.slice(0, 3).join("|"));
    assert.ok(t.includes("Россия: недельная инфляция (Росстат), 29 сентября – 5 октября"));
    assert.ok(en.some((e) => e.event === "Russia: weekly inflation (Rosstat), Oct 6–12"));
  });
  await ok("weekly CPI 2027 rule: every Wednesday from Jan 13, 51 items, approx", () => {
    const r = weeklyCpiRule("2027-01-13", "2027-12-31");
    assert.equal(r.length, 51);
    assert.ok(r.every((i) => wdOf(i.d) === 3 && i.a));
    assert.equal(r[0].d, "2027-01-13");
    assert.equal(r[r.length - 1].d, "2027-12-29");
  });
  await ok("monthly CPI (12, importance 3), PPI (12), industrial production (12), labour report (12), GDP (3 kinds): dates, weekdays, covered periods", () => {
    const cpi = of("rs-cpi");
    assert.equal(cpi.length, 12);
    assert.deepEqual(cpi.map((x) => x.date).slice(8, 11), ["2026-09-11", "2026-10-09", "2026-11-13"]);
    for (const x of cpi) {
      assert.equal(x.impact, 3);
      assert.ok([3, 5].includes(wdOf(x.date)), `${x.date} must be Wednesday or Friday`);
    }
    assert.equal(cpi[9].period, "M2026-09");
    assert.ok(ru.some((e) => e.event === "Россия: инфляция за месяц, ИПЦ (Росстат), сентябрь 2026"));
    assert.equal(of("rs-ppi").length, 12);
    for (const x of of("rs-ppi")) assert.equal(wdOf(x.date), 3);
    const ip = of("rs-ip");
    assert.equal(ip.length, 12);
    assert.equal(ip[9].date, "2026-10-28");
    assert.ok(ru.some((e) => e.event === "Россия: промышленное производство (Росстат), январь–сентябрь 2026"));
    const lab = of("rs-labor");
    assert.equal(lab.length, 12);
    assert.deepEqual(lab.map((x) => x.date).slice(7, 10), ["2026-09-02", "2026-09-30", "2026-10-28"], "the dates the feed shows for the unemployment rate (Jul, Aug, Sep)");
    assert.deepEqual(of("rs-gdp").map((x) => x.date), ["2026-02-06", "2026-04-10", "2026-06-17", "2026-09-11", "2026-12-11"]);
    assert.deepEqual(of("rs-gdpf").map((x) => x.date), ["2026-05-15", "2026-08-12", "2026-11-13"]);
    assert.deepEqual(of("rs-gdpu").map((x) => x.date), ["2026-07-01", "2026-10-02", "2026-12-30"]);
    for (const x of [...of("rs-gdp"), ...of("rs-gdpf"), ...of("rs-gdpu"), ...ip, ...lab]) assert.ok(wdOf(x.date) >= 1 && wdOf(x.date) <= 5, `${x.series} ${x.date}`);
    assert.ok(ru.some((e) => e.gk === "ru.rosstat.gdp" && e.event.endsWith("2025 год, уточнённая оценка")));
    for (const e of ru.filter((x) => x.gk?.startsWith("ru.rosstat"))) assert.ok(/19:00/.test(e.description!), `${e.event}: time note`);
  });

  console.log("Ministry of Finance");
  await ok("OFZ auctions: 2026 Q1-Q4 schedules of minfin.gov.ru (11 + 13 + 14 + 11 = 49 Wednesdays), all-day, quarter plan in the description", () => {
    const a = of("ofz-auction");
    assert.equal(a.length, 49);
    for (const x of a) {
      assert.equal(wdOf(x.date), 3, x.date);
      assert.ok(x.allDay);
      assert.equal(x.impact, 2);
    }
    assert.deepEqual(a.filter((x) => x.date >= "2026-10-01").map((x) => x.date), ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28", "2026-11-11", "2026-11-18", "2026-11-25", "2026-12-02", "2026-12-09", "2026-12-16", "2026-12-23"]);
    assert.equal(a.filter((x) => x.date.startsWith("2026-07")).length, 5);
    const e = ru.find((x) => x.gk === "ru.ofz.auction" && new Date(x.ts).toISOString().startsWith("2026-10-07"))!;
    assert.ok(/1200 \/ 1250/.test(e.description!) && e.description!.includes("minfin.gov.ru"));
    assert.deepEqual(a.map((x) => x.date).filter((d, i, arr) => arr.indexOf(d) !== i), []);
  });

  console.log("time, periods");
  await ok("toTs: MSK is UTC+3 all year; date-only items are UTC midnight; periodLabel formats", () => {
    assert.equal(iso(toTs("2026-07-24", "13:30").ts), "2026-07-24T10:30:00.000Z");
    assert.equal(iso(toTs("2027-01-13", "19:00").ts), "2027-01-13T16:00:00.000Z");
    assert.deepEqual(toTs("2026-10-07", ""), { ts: Date.UTC(2026, 9, 7), allDay: true });
    assert.equal(periodLabel("M2026-09", "ru"), "сентябрь 2026");
    assert.equal(periodLabel("C2026-01..09", "en"), "Jan–Sep 2026");
    assert.equal(periodLabel("Q2026-2", "ru"), "2 кв. 2026");
    assert.equal(periodLabel("H2026-1", "en"), "H1 2026");
    assert.equal(periodLabel("Y2025r", "en"), "2025, revised");
    assert.equal(periodLabel("D2026-11-01", "ru"), "на 1 ноября 2026");
    assert.equal(periodLabel("W2025-12-29~2026-01-05", "ru"), "29 декабря – 5 января");
    assert.equal(periodLabel("nonsense", "ru"), "");
  });
  await ok("range edges are inclusive and a UTC day split is respected; far future is empty", () => {
    const one = buildRussiaScheduled("2026-10-23", "2026-10-23", "ru");
    assert.ok(one.some((e) => e.gk === "ru.cbr.rate"));
    assert.ok(one.every((e) => new Date(e.ts).toISOString().startsWith("2026-10-23")));
    assert.deepEqual(buildRussiaScheduled("2030-01-01", "2030-01-31", "ru"), []);
    assert.equal(buildRussiaScheduled("2026-10-05", "2026-10-11", "cn")[0].event, buildRussiaScheduled("2026-10-05", "2026-10-11", "en")[0].event, "cn falls back to English titles");
  });

  console.log("glossary, filters, preferences");
  await ok("every key has about / affects / brief (<= 90, Cyrillic) and known tags; ofz tag has all three languages", () => {
    const keys = new Set(ru.map((e) => e.gk!));
    assert.ok(keys.size >= 17, `keys ${keys.size}`);
    for (const k of keys) {
      const g = glossaryText(k, "ru");
      assert.ok(g && g.about.length > 20 && g.affects.length > 20, k);
      assert.ok(g!.brief.length >= 10 && g!.brief.length <= 90 && hasCyr(g!.brief), `${k}: ${g!.brief}`);
      assert.equal(glossaryBrief(k, "ru"), g!.brief);
    }
    for (const e of ru) for (const t of e.tags!) assert.ok(t in TAGS, `${e.event}: tag ${t}`);
    assert.ok(TAGS.ofz.ru && TAGS.ofz.en && TAGS.ofz.cn);
    assert.ok(/13:30/.test(glossaryText("ru.cbr.rate", "ru")!.about));
    assert.equal(explicitKey("Russia Layer: Monthly CPI", "inflation", "RU"), "ru.rosstat.cpi");
  });
  await ok("localizeCalEvent leaves Russia-layer events untouched (already titled)", () => {
    assert.equal(localizeCalEvent(ru[0], "ru"), ru[0]);
    assert.equal(localizeCalEvent(en[0], "en"), en[0]);
  });
  await ok("the feed's Russian rows get a higher importance (decision / CPI / GDP 3; PPI, industry, labour, press conference, summary 2); other countries and rows stay", () => {
    const loc = (name: string, c = "RU") => localizeCalEvent({ ...feedEvent(name, "2026-10-09T16:00:00Z", c), impact: 1 }, "ru").impact;
    assert.equal(loc("Interest Rate Decision"), 3);
    assert.equal(loc("Inflation Rate YoY"), 3);
    assert.equal(loc("Inflation Rate MoM"), 3);
    assert.equal(loc("GDP Growth Rate YoY Final"), 3);
    for (const nme of ["PPI YoY", "Industrial Production YoY", "Unemployment Rate", "Retail Sales YoY", "Real Wage Growth YoY", "CBR Press Conference", "Summary of the Key Rate Discussion", "Balance of Trade", "GDP YoY"]) assert.equal(loc(nme), 2, nme);
    assert.equal(loc("Vehicle Sales YoY"), 1);
    assert.equal(loc("Corporate Profits"), 1);
    assert.equal(loc("Inflation Rate YoY", "US"), 1, "only Russian rows are raised");
    assert.equal(loc("Interest Rate Decision", "US"), 1);
    assert.equal(ruFeedImpact("Foreign Exchange Reserves"), 0);
    assert.equal(ruFeedImpact("  Interest Rate Decision "), 3);
    const defaults = new Set([2, 3]); // impact=medium,high of the API / the instrument widget
    const shown = ["Interest Rate Decision", "Inflation Rate YoY", "Unemployment Rate"].map((nme) => localizeCalEvent({ ...feedEvent(nme, "2026-10-09T16:00:00Z"), impact: 1 }, "ru")).filter((e) => defaults.has(e.impact));
    assert.equal(shown.length, 3, "with impact=medium,high the Russian rows are visible");
  });
  await ok("filterEvents: the country filter applies to the layer (country RU), the category filter splits it, the oil-and-gas filter excludes it, impacts apply, search finds the Russian title", () => {
    const sample = buildRussiaScheduled("2026-10-01", "2026-10-31", "ru");
    assert.ok(sample.length > 10);
    const stock: CalEvent = { ...sample[0], id: "x", category: "growth", country: "US", gk: undefined, tags: undefined };
    const mixed = [...sample, stock];
    assert.equal(filterEvents(mixed, { countries: new Set(["CN"]) }).length, 0, "CN: the Russian layer goes (the country filter applies to everything)");
    const cats = new Set(filterEvents(sample, {}).map((e) => eventCategory(e)));
    assert.ok(cats.has("cb") && cats.has("economy"), "Bank of Russia / OFZ rows are rates, Rosstat rows are economy");
    assert.equal(filterEvents(sample, { categories: new Set(["cb", "economy"]) }).length, sample.length, "the layer is only cb and economy");
    assert.equal(filterEvents(mixed, { countries: new Set(["RU"]) }).length, sample.length, "RU: the layer stays, the US row goes");
    assert.equal(filterEvents(mixed, { energy: true }).length, 0);
    assert.ok(filterEvents(mixed, { impacts: new Set([3]) }).every((e) => e.impact === 3));
    assert.equal(filterEvents(sample, { q: "ключевой ставке" }).length, 1);
    assert.ok(filterEvents(sample, { q: "аукцион" }).length >= 3);
  });
  await ok("preferences: the layer switch is gone from the UI: russia is always true, an old stored false is ignored", () => {
    assert.equal(DEFAULT_CAL_PREFS.russia, true);
    assert.equal(normalizeCalPrefs({}).russia, true);
    assert.equal(normalizeCalPrefs({ russia: false }).russia, true);
    assert.equal(normalizeCalPrefs({ russia: "no" }).russia, true);
    assert.equal(normalizeCalPrefs({ russia: false, commodities: false }).commodities, true);
  });

  console.log("merge into the source, no overlap with the corp layer");
  await ok("dropCoveredByFeed: the feed's release on the same UTC day replaces ours (the feed has the figures); other days and other countries do not", () => {
    const layer = buildRussiaScheduled("2026-10-01", "2026-11-30", "ru");
    const feed = [
      feedEvent("Interest Rate Decision", "2026-10-23T10:30:00Z"),
      feedEvent("Inflation Rate YoY", "2026-10-09T16:00:00Z"),
      feedEvent("Inflation Rate MoM", "2026-10-09T16:00:00Z"),
      feedEvent("Unemployment Rate", "2026-10-28T16:00:00Z"),
      feedEvent("Interest Rate Decision", "2026-12-18T10:30:00Z"),
      feedEvent("Inflation Rate YoY", "2026-11-13T16:00:00Z", "US"),
      feedEvent("Summary of the Key Rate Discussion", "2026-11-05T10:30:00Z"),
      feedEvent("Foreign Exchange Reserves", "2026-10-07T13:00:00Z"),
    ];
    const kept = dropCoveredByFeed(layer, feed);
    const has = (gk: string, day: string) => kept.some((e) => e.gk === gk && iso(e.ts).startsWith(day));
    assert.ok(!has("ru.cbr.rate", "2026-10-23"));
    assert.ok(!has("ru.rosstat.cpi", "2026-10-09"));
    assert.ok(!has("ru.rosstat.labor", "2026-10-28"));
    assert.ok(!has("cbr.keyrate", "2026-11-05"));
    assert.ok(!has("ru.cbr.reserves", "2026-10-07"));
    assert.ok(has("ru.rosstat.cpi", "2026-11-13"), "a US row does not cover the Russian one");
    assert.ok(has("ru.rosstat.ppi", "2026-10-21"), "unrelated items stay");
    assert.ok(has("ru.ofz.auction", "2026-10-07"), "the feed has no OFZ auctions");
    assert.equal(dropCoveredByFeed(layer, []).length, layer.length, "no feed, no dropping");
    assert.equal(kept.length, layer.length - 5);
  });
  await ok("getCalendarRange: ru is opt-in for callers (the route passes it), on gives the layer, the feed's decision is not doubled, a failing chain still returns the layer as partial", async () => {
    const feed: Provider = {
      id: "tradingview",
      async range(from, to) {
        const e = feedEvent("Interest Rate Decision", "2026-10-23T10:30:00Z");
        const inside = e.ts >= Date.parse(`${from}T00:00:00Z`) && e.ts < Date.parse(`${to}T23:59:59Z`);
        return { events: inside ? [e] : [], reason: "ok", stale: false, coverage: null };
      },
    };
    delete process.env.ECON_CALENDAR_MOCK;
    _resetCalendarCache();
    _setProviders([feed]);
    const now = Date.UTC(2026, 9, 5, 12);
    const opts = { moex: false, agro: false, corp: false } as const;
    const off = await getCalendarRange("2026-10-23", "2026-10-23", now, opts);
    assert.equal(off.russia, false);
    assert.equal(off.events.length, 1, "without ru the answer is the feed only");
    const on = await getCalendarRange("2026-10-23", "2026-10-23", now, { ...opts, ru: true });
    assert.equal(on.russia, true);
    const dec = on.events.filter((e) => /Interest Rate Decision|ключевой ставке/.test(e.event));
    assert.equal(dec.length, 1, "one decision");
    assert.equal(dec[0].category, "other", "the feed's event (with the figures) wins");
    const wk = await getCalendarRange("2026-10-14", "2026-10-14", now, { ...opts, ru: true });
    assert.ok(wk.events.some((e) => e.gk === "ru.rosstat.cpiw"), "weekly CPI of Oct 14");
    assert.ok(wk.events.some((e) => e.gk === "ru.cbr.macro"));
    const down: Provider = { id: "tradingview", async range() { return { events: [], reason: "upstream-error", stale: false, coverage: null }; } };
    _setProviders([down]);
    const partial = await getCalendarRange("2026-10-14", "2026-10-14", now, { ...opts, ru: true });
    assert.equal(partial.reason, "partial");
    assert.ok(partial.events.length > 0 && partial.events.every((e) => e.category === "ru"));
    const none = await getCalendarRange("2026-10-14", "2026-10-14", now, opts);
    assert.equal(none.reason, "upstream-error");
    assert.deepEqual(none.events, []);
    _setProviders(null);
    process.env.ECON_CALENDAR_MOCK = "1";
    _resetCalendarCache();
    const mock = await getCalendarRange("2026-10-06", "2026-10-13", now, { ru: true });
    assert.equal(mock.russia, false, "mock mode keeps the fixture clean");
    delete process.env.ECON_CALENDAR_MOCK;
  });
  await ok("no overlap with the corp layer: nothing about dividends, coupons or company reports here, no corp keys, no T-Invest", () => {
    for (const e of [...ru, ...en]) {
      assert.ok(!/дивиденд|купон|отчётность эмитент|dividend|coupon|earnings/i.test(e.event), e.event);
      assert.ok(!e.gk!.startsWith("corp.") || e.gk === "cbr.keyrate", e.gk);
      assert.notEqual(e.category, "corp");
    }
    assert.ok(!SERIES.some((s) => /tinkoff|t-invest|invest-public/i.test(s.src + s.noteRu + s.noteEn)));
  });

  console.log(`\nall ${n} checks passed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
