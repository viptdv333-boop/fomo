/* Calendar category filter checks (src/lib/calendar/categories.ts): every event belongs to exactly one of nine categories, the mapping
   of real TradingView names, the layers (Moscow Exchange, commodities, Russia, corporate), the independence from the UI language, the
   category + country filters of filterEvents (the country filter applies to everything, the Moscow Exchange only with RU), counts,
   preferences (old stored layer switches and the oil and gas chip migrate), the «30 дней» range and the UI wiring (no layer chips left).
   Run: npx tsx scripts/check-calendar-categories.ts
   Optional: CAL_FEED_FILE=ru.json (the answer of /api/economic-calendar?lang=ru&moex=1&limit=5000) prints the distribution and asserts
   that «Прочее» stays a minority and every event gets exactly one known category. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { categoryCounts, EVENT_CATEGORIES, eventCategory, eventCategoryKey, isEventCategory, type EventCategory } from "../src/lib/calendar/categories";
import { localizeCalEvent } from "../src/lib/calendar/glossary";
import { categoryOf, filterEvents } from "../src/lib/calendar/normalize";
import { DEFAULT_CAL_PREFS, normalizeCalPrefs } from "../src/lib/calendar/prefs";
import { MAX_RANGE_DAYS, daySpan, rangeBounds, rangeFor } from "../src/lib/calendar/time";
import { buildCommodityEvents } from "../src/lib/calendar/commodities";
import { buildRussiaScheduled } from "../src/lib/calendar/russia";
import { apiRange } from "../src/lib/calendar/useCalendar";
import dict from "../src/lib/i18n/dict/econcal";
import type { CalEvent } from "../src/lib/calendar/types";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ok  ${name}`);
};

let seq = 0;
/** A raw (not yet localised) feed event as TradingView gives it. */
const raw = (event: string, country = "US", impact: 1 | 2 | 3 = 2, patch: Partial<CalEvent> = {}): CalEvent => ({
  id: `e${seq++}`, ts: Date.UTC(2026, 9, 7, 12, 30) + seq * 60_000, allDay: false, country, currency: "USD", event, category: categoryOf(event), impact,
  actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null, ...patch,
});
const cat = (event: string, country = "US", lang: "ru" | "en" | "cn" = "ru", patch: Partial<CalEvent> = {}): EventCategory => eventCategory(localizeCalEvent(raw(event, country, 2, patch), lang));

/* ───────────── the mapping ───────────── */
console.log("mapping of real names");
const EXPECT: Record<EventCategory, [string, string][]> = {
  cb: [
    ["Fed Interest Rate Decision", "US"], ["FOMC Minutes", "US"], ["Fed Press Conference", "US"], ["Fed Beige Book", "US"], ["Fed Balance Sheet", "US"],
    ["ECB Interest Rate Decision", "EU"], ["ECB Press Conference", "EU"], ["ECB Monetary Policy Meeting Accounts", "EU"], ["BoE Interest Rate Decision", "GB"], ["BoE MPC Vote Cut", "GB"],
    ["BoJ Interest Rate Decision", "JP"], ["BoJ Gov Ueda Speech", "JP"], ["BoJ JGB Purchase", "JP"], ["Interest Rate Decision", "RU"], ["CBR Press Conference", "RU"],
    ["Loan Prime Rate 1Y", "CN"], ["RBA Meeting Minutes", "AU"], ["BoC Business Outlook Survey", "CA"], ["BCB Focus Market Readout", "BR"], ["Deposit Facility Rate", "EU"],
    ["M2 Money Supply YoY", "CN"], ["New Yuan Loans", "CN"], ["Bank Lending YoY", "JP"],
    ["10-Year Note Auction", "US"], ["3-Month Bill Auction", "US"], ["Treasury Refunding Announcement", "US"], ["NY Fed Bill Purchases 1 to 4 months", "US"],
  ],
  economy: [
    ["Non Farm Payrolls", "US"], ["Unemployment Rate", "US"], ["Initial Jobless Claims", "US"], ["Average Hourly Earnings MoM", "US"], ["JOLTs Job Openings", "US"], ["Employment Cost Index QoQ", "US"],
    ["Inflation Rate YoY", "EU"], ["Core Inflation Rate MoM", "US"], ["PPI YoY", "US"], ["Core PCE Price Index MoM", "US"], ["Import Prices YoY", "US"], ["Michigan Inflation Expectations Prel", "US"], ["RBA Trimmed Mean CPI YoY", "AU"],
    ["GDP Growth Rate QoQ", "US"], ["Balance of Trade", "DE"], ["Current Account", "JP"], ["Exports", "CN"], ["Foreign Exchange Reserves", "CN"], ["Budget Balance", "GB"], ["Foreign Bond Investment", "JP"],
    ["ISM Manufacturing PMI", "US"], ["S&P Global PMI", "GB"], ["Industrial Production YoY", "DE"], ["Factory Orders MoM", "US"], ["Ifo Business Climate", "DE"], ["ZEW Economic Sentiment Index", "DE"], ["NY Empire State Manufacturing Index", "US"],
    ["Fixed Asset Investment (YTD) YoY", "CN"], ["LMI Logistics Managers Index", "US"], ["Business Confidence", "AU"],
  ],
  energy: [
    ["EIA Crude Oil Stocks Change", "US"], ["API Crude Oil Stock Change", "US"], ["EIA Natural Gas Stocks Change", "US"], ["EIA Gasoline Stocks Change", "US"], ["EIA Cushing Crude Oil Stocks Change", "US"],
    ["EIA Distillate Stocks Change", "US"], ["EIA Heating Oil Stocks Change", "US"], ["EIA Crude Oil Imports Change", "US"], ["EIA Refinery Crude Runs Change", "US"],
    ["Baker Hughes Oil Rig Count", "US"], ["Baker Hughes Total Rigs Count", "US"], ["IEA Oil Market Report", "FR"], ["OPEC Monthly Report", "AT"],
  ],
  metals: [["Gold Production YoY", "ZA"], ["Copper Production YoY", "CL"], ["Mining Production MoM", "ZA"], ["Steel Production YoY", "CN"], ["Iron Ore Imports", "CN"], ["Platinum Group Metals Output", "ZA"]],
  agro: [["Global Dairy Trade Price Index", "NZ"], ["NOPA Crush Report", "US"]],
  consumer: [
    ["Retail Sales MoM", "US"], ["Retail Sales Ex Autos MoM", "US"], ["BRC Retail Sales Monitor YoY", "GB"], ["Consumer Confidence", "US"], ["Michigan Consumer Sentiment Prel", "US"], ["Personal Spending MoM", "US"],
    ["Household Spending MoM", "JP"], ["Eco Watchers Survey Current", "JP"], ["Tourist Arrivals YoY", "NZ"], ["Building Permits MoM Final", "US"], ["Housing Starts", "US"], ["Existing Home Sales", "US"],
    ["NAHB Housing Market Index", "US"], ["MBA 30-Year Mortgage Rate", "US"], ["Lloyds House Price Index MoM", "GB"], ["Mortgage Approvals", "GB"], ["Redbook YoY", "US"], ["New Car Registrations YoY", "DE"], ["Total Vehicle Sales", "US"],
  ],
  corp: [],
  moex: [],
  other: [["Eurogroup Meeting", "EU"], ["Midterm Elections", "US"], ["Snap Parliamentary Elections", "RS"]],
};
for (const c of EVENT_CATEGORIES) {
  if (EXPECT[c].length === 0) continue;
  ok(`${c}: ${EXPECT[c].length} real names, in ru, en and cn`, () => {
    for (const [name, country] of EXPECT[c]) for (const lang of ["ru", "en", "cn"] as const) assert.equal(cat(name, country, lang), c, `${name} (${country}, ${lang})`);
  });
}
ok("a holiday is «other», also with a metal or an oil word in its name (National Day Golden Week)", () => {
  for (const name of ["National Day Golden Week", "Earthquake Remembrance Day", "Bank of Laos Establishment Day", "Gold Day"]) assert.equal(cat(name, "CN", "ru", { category: "holiday" }), "other", name);
  assert.equal(eventCategory({ category: "holiday", event: "Праздник" }), "other");
});
ok("the market tag «gold» (CPI, NFP, Fed carry it) does NOT make a metals event", () => {
  const cpi = localizeCalEvent(raw("Inflation Rate YoY", "US", 3), "ru");
  assert.ok(cpi.tags?.includes("gold"));
  assert.equal(eventCategory(cpi), "economy");
  assert.equal(cat("Foreign Exchange Reserves", "CN"), "economy");
  assert.equal(cat("Core Inflation Rate YoY", "US"), "economy");
});
ok("a metals word in a Russian title of an un-translated event still works (no eventEn)", () => {
  assert.equal(eventCategory({ category: "other", event: "Выпуск золота, т" }), "metals");
  assert.equal(eventCategory({ category: "other", event: "Что-то неизвестное" }), "other");
});
ok("a tag oil / gas on an uncategorised release means energy; on a macro release it does not", () => {
  assert.equal(eventCategory({ category: "other", event: "Odd Gas Report", tags: ["gas"] }), "energy");
  assert.equal(eventCategory({ category: "trade", event: "Trade Balance", tags: ["oil"] }), "economy");
});

console.log("layers");
ok("Moscow Exchange rows are «moex», dividends / coupons / reports «corp», commodity reports «agro»", () => {
  assert.equal(eventCategory({ category: "moex", event: "Экспирация фьючерсов", gk: undefined }), "moex");
  assert.equal(eventCategory({ category: "corp", event: "Дивиденды: Сбербанк (SBER)", gk: "corp.div" }), "corp");
  assert.equal(eventCategory({ category: "corp", event: "Купоны ОФЗ: 4 выпуска", gk: "corp.coupon" }), "corp");
  assert.equal(eventCategory({ category: "corp", event: "Отчётность: Озон (OZON)", gk: "corp.report" }), "corp");
  const agro = buildCommodityEvents("2026-10-01", "2026-12-31", "ru");
  assert.ok(agro.length > 10);
  for (const e of agro) assert.equal(eventCategory(e), "agro", e.event);
});
ok("the Russia layer: the key rate, Bank of Russia documents and OFZ auctions are «cb», Rosstat and the balance of payments «economy»", () => {
  const ru = buildRussiaScheduled("2026-10-01", "2027-03-31", "ru");
  assert.ok(ru.length > 20);
  const by = new Map<string, Set<EventCategory>>();
  for (const e of ru) (by.get(e.gk ?? "") ?? by.set(e.gk ?? "", new Set()).get(e.gk ?? ""))!.add(eventCategory(e));
  for (const [gk, set] of by) {
    assert.equal(set.size, 1, gk);
    const c = [...set][0];
    if (gk.startsWith("ru.rosstat.") || gk === "ru.cbr.bop" || gk === "ru.cbr.trade" || gk === "ru.cbr.reserves") assert.equal(c, "economy", gk);
    else assert.equal(c, "cb", gk);
  }
  assert.ok(by.has("ru.ofz.auction") && by.has("ru.cbr.rate"));
});
ok("every category id is known, labelled in ru / en / cn, has a description, and the list has no duplicates", () => {
  assert.equal(new Set(EVENT_CATEGORIES).size, EVENT_CATEGORIES.length);
  assert.equal(EVENT_CATEGORIES.length, 9);
  for (const c of EVENT_CATEGORIES) {
    assert.ok(isEventCategory(c));
    for (const lang of ["ru", "en", "cn"] as const) {
      assert.ok(dict[lang][eventCategoryKey(c)], `${lang} ${c}`);
      assert.ok(dict[lang][`${eventCategoryKey(c)}.d`], `${lang} ${c} description`);
    }
  }
  assert.equal(isEventCategory("inflation"), false);
});
ok("the function is total and pure: junk input still gives exactly one category, the same each time", () => {
  const e = { category: "something-new" as never, event: "", gk: undefined, tags: undefined, eventEn: undefined };
  assert.equal(eventCategory(e), "other");
  assert.equal(eventCategory(e), "other");
  for (const c of ["centralbank", "inflation", "employment", "growth", "manufacturing", "consumer", "housing", "trade", "energy", "auction", "holiday", "moex", "commodity", "ru", "corp", "other"] as const) {
    assert.ok(isEventCategory(eventCategory({ category: c, event: "x" })), c);
  }
});

/* ───────────── filtering ───────────── */
console.log("filtering");
const sample: CalEvent[] = [
  ["EIA Crude Oil Stocks Change", "US"], ["Baker Hughes Oil Rig Count", "US"], ["Fed Interest Rate Decision", "US"], ["Non Farm Payrolls", "US"], ["Retail Sales MoM", "US"],
  ["Inflation Rate YoY", "DE"], ["Interest Rate Decision", "RU"], ["Gold Production YoY", "ZA"], ["OPEC Monthly Report", "AT"],
].map(([e, c]) => localizeCalEvent(raw(e, c), "ru"));
const moex = raw("Moscow Exchange: non-trading day", "RU", 2, { category: "moex" });
const corp = raw("Dividends: SBER", "RU", 2, { category: "corp", gk: "corp.div" });
const usda = raw("US: USDA WASDE report", "US", 3, { category: "commodity", gk: "agro.wasde" });
const all = [...sample, moex, corp, usda];
ok("categories: one, several, none (= all), unknown ids match nothing", () => {
  assert.deepEqual(filterEvents(all, { categories: new Set(["energy"]) }).map((e) => e.eventEn), ["EIA Crude Oil Stocks Change", "Baker Hughes Oil Rig Count", "OPEC Monthly Report"]);
  assert.equal(filterEvents(all, { categories: new Set(["energy", "metals"]) }).length, 4);
  assert.equal(filterEvents(all, { categories: new Set() }).length, all.length);
  assert.equal(filterEvents(all, { categories: null }).length, all.length);
  assert.equal(filterEvents(all, { categories: new Set(["nope"]) }).length, 0);
  assert.equal(filterEvents(all, { categories: new Set(["moex"]) }).length, 1);
  assert.equal(filterEvents(all, { categories: new Set(["corp"]) }).length, 1);
  assert.equal(filterEvents(all, { categories: new Set(["agro"]) }).length, 1);
});
ok("country + category combine: «Энергетика» in US is the EIA / API / Baker Hughes rows, OPEC (AT) goes", () => {
  const r = filterEvents(all, { categories: new Set(["energy"]), countries: new Set(["US"]) });
  assert.deepEqual(r.map((e) => e.eventEn), ["EIA Crude Oil Stocks Change", "Baker Hughes Oil Rig Count"]);
  assert.equal(filterEvents(all, { categories: new Set(["energy"]), countries: new Set(["RU"]) }).length, 0);
});
ok("the country filter applies to the former layers; the Moscow Exchange shows only with RU selected (or no country)", () => {
  assert.ok(filterEvents(all, {}).includes(moex));
  assert.ok(filterEvents(all, { countries: new Set(["RU"]) }).includes(moex));
  assert.ok(filterEvents(all, { countries: new Set(["RU", "US"]) }).includes(moex));
  assert.ok(!filterEvents(all, { countries: new Set(["US"]) }).includes(moex));
  assert.ok(!filterEvents(all, { countries: new Set(["DE", "CN"]) }).includes(moex));
  assert.ok(!filterEvents(all, { countries: new Set(["US"]) }).includes(corp), "RU dividends hide when only the US is selected");
  assert.ok(filterEvents(all, { countries: new Set(["US"]) }).includes(usda), "USDA is a US issuer");
  assert.ok(!filterEvents(all, { countries: new Set(["RU"]) }).includes(usda));
  assert.ok(filterEvents(all, { countries: new Set(["RU"]), categories: new Set(["moex"]) }).includes(moex));
  assert.equal(filterEvents(all, { countries: new Set(["US"]), categories: new Set(["moex"]) }).length, 0);
});
ok("search and category combine", () => {
  assert.equal(filterEvents(all, { q: "crude", categories: new Set(["energy"]) }).length, 1);
  assert.equal(filterEvents(all, { q: "crude", categories: new Set(["cb"]) }).length, 0);
});
ok("counts: every category present, zeros included, sum = total", () => {
  const c = categoryCounts(all);
  assert.deepEqual(Object.keys(c).sort(), [...EVENT_CATEGORIES].sort());
  assert.equal(Object.values(c).reduce((a, b) => a + b, 0), all.length);
  assert.equal(c.energy, 3);
  assert.equal(c.metals, 1);
  assert.equal(categoryCounts([]).metals, 0);
});

/* ───────────── preferences ───────────── */
console.log("preferences");
ok("categories default to «all», keep the picker order, drop unknown ids and duplicates", () => {
  assert.deepEqual(DEFAULT_CAL_PREFS.categories, []);
  assert.deepEqual(normalizeCalPrefs(undefined).categories, []);
  assert.deepEqual(normalizeCalPrefs({ categories: ["metals", "energy", "energy", "bogus", 7] }).categories, ["energy", "metals"]);
  assert.deepEqual(normalizeCalPrefs({ categories: "energy" }).categories, []);
  assert.deepEqual(normalizeCalPrefs(normalizeCalPrefs({ categories: ["agro"] })).categories, ["agro"]);
});
ok("old stored copies: switched-off layers come back on, the oil and gas chip becomes the «Энергетика» category", () => {
  const old = normalizeCalPrefs({ v: 1, at: 5, countries: ["us"], moex: false, commodities: false, corp: false, russia: false, energy: true, preset: "week", view: "list" });
  assert.deepEqual([old.moex, old.commodities, old.corp, old.russia, old.energy], [true, true, true, true, false]);
  assert.deepEqual(old.categories, ["energy"]);
  assert.deepEqual(old.countries, ["US"]);
  assert.equal(old.preset, "week");
  assert.equal(old.view, "list");
  assert.equal(old.at, 5);
  const none = normalizeCalPrefs({ moex: false, russia: false });
  assert.deepEqual(none.categories, []);
  assert.equal(none.moex, true);
});
ok("the «30 дней» preset survives normalisation; an unknown preset falls back to today", () => {
  assert.equal(normalizeCalPrefs({ preset: "d30" }).preset, "d30");
  assert.equal(normalizeCalPrefs({ preset: "d31" }).preset, "today");
});

/* ───────────── the «30 дней» range ───────────── */
console.log("30 days");
ok("d30 = today .. today + 29 in the display zone, 30 days, within the API limit, one request", () => {
  const now = Date.UTC(2026, 9, 7, 22, 0); // Wed 7 Oct 22:00 UTC = Thu 8 Oct 01:00 Moscow
  assert.deepEqual(rangeFor("d30", "UTC", now), { from: "2026-10-07", to: "2026-11-05" });
  assert.deepEqual(rangeFor("d30", "Europe/Moscow", now), { from: "2026-10-08", to: "2026-11-06" });
  assert.deepEqual(rangeFor("d30", "Pacific/Kiritimati", now), { from: "2026-10-08", to: "2026-11-06" });
  for (const zone of ["UTC", "Europe/Moscow", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"]) {
    const r = rangeFor("d30", zone, now);
    assert.equal(daySpan(r), 30, zone);
    const b = rangeBounds(r, zone);
    assert.ok(now >= b.start && now < b.end, `${zone}: now is inside the first day`);
    const api = apiRange(r, zone);
    assert.ok(daySpan(api) <= MAX_RANGE_DAYS, `${zone}: the API range ${api.from}..${api.to} fits ${MAX_RANGE_DAYS} days`);
    assert.ok(api.from <= r.from && api.to >= r.to, `${zone}: the API range covers the display range`);
  }
});

/* ───────────── the UI wiring ───────────── */
console.log("UI");
ok("no layer chip is left in the filter bars; the order is countries, categories, search", () => {
  const dir = "src/components/chart/calendar/";
  const read = (f: string) => readFileSync(dir + f, "utf8");
  for (const f of ["CalendarView.tsx", "WorldCalendar.tsx", "DayModal.tsx", "MobileCalendarBar.tsx"]) {
    const s = read(f);
    for (const gone of ["QuickChips", "MoexChip", "CommodityChip", "RussiaChip", "CorpChip", "EnergyChip"]) assert.ok(!s.includes(gone), `${f} still mentions ${gone}`);
    assert.ok(s.includes("<CountryFilter") && s.includes("<CategoryFilter"), f);
    const order = [s.indexOf("<CountryFilter"), s.indexOf("<CategoryFilter"), s.indexOf("<SearchBox")];
    if (order[2] >= 0) assert.ok(order[0] < order[1] && order[1] < order[2], `${f}: countries, categories, search`);
  }
  const ds = read("DayModal.tsx");
  assert.ok(ds.includes("<SearchBox"), "the day modal has the search too");
  const tabs = read("CalendarView.tsx");
  const iw = tabs.indexOf('id: "week"');
  assert.ok(iw > 0 && tabs.indexOf('id: "d30"') > iw && tabs.indexOf('id: "d30"') < tabs.indexOf('id: "nextweek"'), "«30 дней» sits right after «Неделя»");
});
ok("the 30-day pill is labelled in ru / en / cn", () => {
  assert.equal(dict.ru["ec.tab.d30"], "30 дней");
  assert.equal(dict.en["ec.tab.d30"], "30 days");
  assert.equal(dict.cn["ec.tab.d30"], "30天");
});

/* ───────────── the real feed (optional) ───────────── */
if (process.env.CAL_FEED_FILE) {
  console.log("real feed");
  const feed = JSON.parse(readFileSync(process.env.CAL_FEED_FILE, "utf8")) as CalEvent[];
  ok(`distribution of ${feed.length} events: one known category each, «Прочее» a minority, «Энергетика» holds the EIA / API / Baker Hughes / OPEC rows`, () => {
    const hi = feed.filter((e) => e.impact >= 2);
    const c = categoryCounts(feed);
    const ch = categoryCounts(hi);
    for (const k of EVENT_CATEGORIES) console.log(`      ${k.padEnd(9)} ${String(c[k]).padStart(5)}   impact>=2: ${String(ch[k]).padStart(4)}  (${((ch[k] / Math.max(1, hi.length)) * 100).toFixed(1)}%)`);
    assert.equal(Object.values(c).reduce((a, b) => a + b, 0), feed.length);
    assert.ok(ch.other / Math.max(1, hi.length) < 0.15, "«Прочее» < 15 % of the impact >= 2 events");
    for (const e of feed) {
      if (/^(EIA|API|Baker Hughes|IEA|OPEC)\b/.test(e.eventEn ?? e.event)) assert.equal(eventCategory(e), "energy", e.eventEn ?? e.event);
      if (e.category === "moex") assert.equal(eventCategory(e), "moex");
    }
    for (const e of feed.filter((x) => eventCategory(x) === "metals")) assert.ok(/gold|copper|silver|steel|iron|platinum|palladium|alumin|nickel|zinc|metal|mining|mineral|золот|медь|меди/i.test(`${e.eventEn ?? ""} ${e.event}`), `metals row: ${e.event}`);
  });
}

console.log(`\nall ${n} checks passed`);
