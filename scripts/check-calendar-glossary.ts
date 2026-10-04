/* Economic-calendar glossary checks: Russian titles, «что это» / «на что влияет», tags, energy importance, API-level localisation
   (eventEn, gk, tags, periods), search by the English name, the «Нефть и газ» filter, surprise colouring with translated names.
   The fixture below is a sample of REAL TradingView event names (fomo.spot/api/economic-calendar, Sep-Dec 2026).
   Run: npx tsx scripts/check-calendar-glossary.ts
   Optional: CAL_NAMES_FILE=names.json (array of {k,imp,cat,c}) prints the coverage of a bigger sample. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { explicitKey, glossaryText, localizeCalEvent, localizeEvent, localizePeriod, splitMods, tagLabel, TAGS } from "../src/lib/calendar/glossary";
import { RULES } from "../src/lib/calendar/glossary-rules";
import { categoryOf, filterEvents } from "../src/lib/calendar/normalize";
import { surprise } from "../src/lib/calendar/surprise";
import { DEFAULT_CAL_PREFS, normalizeCalPrefs } from "../src/lib/calendar/prefs";
import type { CalEvent } from "../src/lib/calendar/types";

let n = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`  ok  ${name}`);
};

/** [name, country, importance]; holidays carry the category explicitly */
type Row = [string, string, number, "holiday"?];
const FIXTURE: Row[] = [
  // energy
  ["EIA Crude Oil Stocks Change", "US", 2], ["EIA Gasoline Stocks Change", "US", 2], ["API Crude Oil Stock Change", "US", 2], ["EIA Natural Gas Stocks Change", "US", 1],
  ["EIA Cushing Crude Oil Stocks Change", "US", 1], ["EIA Distillate Stocks Change", "US", 1], ["EIA Crude Oil Imports Change", "US", 1], ["EIA Heating Oil Stocks Change", "US", 1],
  ["EIA Refinery Crude Runs Change", "US", 1], ["EIA Distillate Fuel Production Change", "US", 1], ["EIA Gasoline Production Change", "US", 1],
  ["Baker Hughes Oil Rig Count", "US", 1], ["Baker Hughes Total Rigs Count", "US", 1], ["IEA Oil Market Report", "FR", 1], ["OPEC Monthly Report", "AT", 1],
  // central banks
  ["Fed Interest Rate Decision", "US", 3], ["FOMC Minutes", "US", 3], ["FOMC Economic Projections", "US", 3], ["Fed Press Conference", "US", 3], ["Fed Beige Book", "US", 1],
  ["ECB Interest Rate Decision", "EU", 3], ["ECB Press Conference", "EU", 3], ["BoE Interest Rate Decision", "GB", 3], ["BoJ Interest Rate Decision", "JP", 3],
  ["BoC Interest Rate Decision", "CA", 3], ["RBA Interest Rate Decision", "AU", 3], ["SNB Interest Rate Decision", "CH", 2], ["Interest Rate Decision", "RU", 1],
  ["CBR Press Conference", "RU", 1], ["Summary of the Key Rate Discussion", "RU", 1], ["Loan Prime Rate 1Y", "CN", 2], ["MPC Meeting Minutes", "GB", 2],
  ["Fed Logan Speech", "US", 2], ["Fed Williams Speech", "US", 2], ["Fed Chair Powell Speech", "US", 3], ["ECB President Lagarde Speech", "EU", 2], ["BoE Gov Bailey Speech", "GB", 2],
  ["BoJ Gov Ueda Speech", "JP", 2], ["ECB Schnabel Speech", "EU", 1], ["Fed Hammack Speech", "US", 2], ["Chancellor John Healey Speech", "GB", 2],
  // inflation
  ["Inflation Rate YoY", "RU", 2], ["Inflation Rate MoM", "US", 3], ["Core Inflation Rate YoY", "TH", 3], ["Inflation Rate YoY Flash", "EU", 3], ["CPI", "US", 2], ["CPI s.a", "US", 2],
  ["Core PCE Price Index MoM", "US", 3], ["PCE Price Index YoY", "US", 2], ["PPI MoM", "US", 3], ["Core PPI MoM", "US", 2], ["Import Prices MoM", "US", 2],
  ["Michigan Inflation Expectations Prel", "US", 1], ["Tokyo CPI YoY", "JP", 1], ["Harmonised Inflation Rate YoY Prel", "DE", 1], ["Bavaria CPI MoM", "DE", 1],
  // labour
  ["Non Farm Payrolls", "US", 3], ["Unemployment Rate", "US", 3], ["Initial Jobless Claims", "US", 2], ["Continuing Jobless Claims", "US", 1], ["ADP Employment Change", "US", 2],
  ["ADP Employment Change Weekly", "US", 2], ["JOLTs Job Openings", "US", 3], ["Average Hourly Earnings YoY", "US", 2], ["Employment Change", "AU", 2], ["Claimant Count Change", "GB", 1],
  ["Average Earnings incl. Bonus (3Mo/Yr)", "GB", 2], ["Participation Rate", "CA", 2], ["Employment Cost Index QoQ", "US", 2], ["Challenger Job Cuts", "US", 1],
  // growth, activity
  ["GDP Growth Rate QoQ Prel", "FR", 3], ["GDP Growth Rate YoY", "BH", 3], ["GDP Growth Annualized Final", "JP", 2], ["GDP MoM", "GB", 3], ["GDP Price Index QoQ Adv", "US", 2],
  ["Industrial Production YoY", "ES", 3], ["Manufacturing Production MoM", "ZA", 2], ["Retail Sales MoM", "SG", 3], ["Retail Sales Ex Autos MoM", "US", 2],
  ["Durable Goods Orders MoM", "US", 3], ["Factory Orders MoM", "DE", 2], ["Capacity Utilization", "US", 1], ["Chicago Fed National Activity Index", "US", 2],
  // PMI and surveys
  ["ISM Manufacturing PMI", "US", 3], ["ISM Services PMI", "US", 3], ["S&P Global Manufacturing PMI Flash", "FR", 3], ["S&P Global Services PMI", "RU", 2], ["S&P Global Composite PMI Flash", "JP", 2],
  ["RatingDog Manufacturing PMI", "CN", 3], ["NBS Manufacturing PMI", "CN", 3], ["HSBC Services PMI Flash", "IN", 2], ["Ivey PMI s.a", "CA", 3], ["NY Empire State Manufacturing Index", "US", 2],
  ["Philadelphia Fed Manufacturing Index", "US", 2], ["Ifo Business Climate", "DE", 3], ["ZEW Economic Sentiment Index", "DE", 3], ["Tankan Large Manufacturers Index", "JP", 3],
  ["Michigan Consumer Sentiment Prel", "US", 3], ["CB Consumer Confidence", "US", 2], ["GfK Consumer Confidence", "DE", 3], ["Consumer Confidence", "JP", 3], ["NAB Business Confidence", "AU", 3],
  ["Economic Sentiment", "EU", 2], ["Eco Watchers Survey Current", "JP", 1],
  // housing
  ["Housing Starts", "US", 3], ["Building Permits Prel", "US", 3], ["Existing Home Sales", "US", 3], ["New Home Sales MoM", "US", 2], ["Pending Home Sales MoM", "US", 2],
  ["NAHB Housing Market Index", "US", 2], ["MBA 30-Year Mortgage Rate", "US", 2], ["MBA Mortgage Applications", "US", 1], ["S&P/Case-Shiller Home Price YoY", "US", 2], ["Nationwide Housing Prices MoM", "GB", 2],
  // trade, fiscal, money
  ["Balance of Trade", "SI", 3], ["Goods Trade Balance Adv", "US", 2], ["Exports YoY", "CN", 3], ["Imports", "US", 2], ["Current Account", "KR", 2], ["Foreign Exchange Reserves", "RU", 1],
  ["Net Long-term TIC Flows", "US", 2], ["Monthly Budget Statement", "US", 2], ["Autumn Budget 2026", "GB", 3], ["M2 Money Supply YoY", "RU", 1], ["New Yuan Loans", "CN", 2],
  ["Fixed Asset Investment (YTD) YoY", "CN", 2], ["Industrial Profits (YTD) YoY", "CN", 1], ["Non-Oil Exports YoY", "SG", 1],
  // auctions
  ["10-Year Note Auction", "US", 1], ["30-Year Bond Auction", "US", 1], ["13-Week Bill Auction", "US", 1], ["10-Year Bund Auction", "DE", 1], ["2-Year JGB Auction", "JP", 1], ["Treasury Gilt 2030 Auction", "GB", 1],
  // politics
  ["Midterm Elections", "US", 3], ["President Trump and President Xi Summit", "US", 3], ["UN General Assembly", "US", 2], ["Parliamentary Election", "RU", 1],
  // holidays
  ["Thanksgiving Day", "US", 1, "holiday"], ["German Unity Day", "DE", 1, "holiday"], ["Mid-Autumn Festival", "CN", 1, "holiday"], ["Some Local Saint Day", "XX", 1, "holiday"],
  // names the glossary does not know: must still get a Russian-ish title and a generic text
  ["Services NZ PSI", "NZ", 1], ["Westpac Consumer Confidence Change", "AU", 3], ["Wholesale Inventories MoM Adv", "US", 2], ["Deposit Facility Rate", "EU", 3],
  ["BoE MPC Vote Hike", "GB", 2], ["NBS Non Manufacturing PMI", "CN", 2], ["Business NZ PMI", "NZ", 2], ["Lloyds House Price Index YoY", "GB", 2], ["Hypothetical Unemployment Benefit Index", "XX", 1],
];

const catOf = (r: Row) => (r[3] === "holiday" ? "holiday" : categoryOf(r[0]));
const loc = (r: Row, lang: "ru" | "en" | "cn" = "ru") => localizeEvent({ event: r[0], category: catOf(r), country: r[1], impact: r[2] }, lang);
const find = (name: string) => FIXTURE.find((r) => r[0] === name)!;
const hasCyr = (s: string) => /[Ѐ-ӿ]/.test(s);

console.log("titles");
ok("fixture size and no empty titles in any language", () => {
  assert.ok(FIXTURE.length >= 150, `fixture ${FIXTURE.length}`);
  for (const r of FIXTURE) for (const lang of ["ru", "en", "cn"] as const) {
    const l = loc(r, lang);
    assert.ok(l.title.trim().length > 0, `${r[0]} ${lang}`);
    assert.ok(l.impact >= 1 && l.impact <= 3, `${r[0]} impact`);
  }
});
ok("lang=ru: Cyrillic in every title except holidays the glossary does not know", () => {
  for (const r of FIXTURE) {
    const l = loc(r);
    if (r[3] === "holiday" && l.fallback) continue;
    assert.ok(hasCyr(l.title), `${r[0]} => ${l.title}`);
  }
});
ok("lang=en / cn keep the original title and carry no texts", () => {
  for (const r of FIXTURE.slice(0, 40)) for (const lang of ["en", "cn"] as const) {
    const l = loc(r, lang);
    assert.equal(l.title, r[0]);
    assert.equal(l.about, undefined);
    assert.equal(l.affects, undefined);
    assert.ok(l.key, `${r[0]} key`);
  }
});
ok("key examples map exactly", () => {
  const T = (name: string) => loc(find(name)).title;
  assert.equal(T("EIA Crude Oil Stocks Change"), "Запасы сырой нефти в США (EIA)");
  assert.equal(T("EIA Gasoline Stocks Change"), "Запасы бензина в США (EIA)");
  assert.equal(T("EIA Natural Gas Stocks Change"), "Запасы природного газа в США (EIA)");
  assert.equal(T("API Crude Oil Stock Change"), "Запасы сырой нефти в США (API)");
  assert.equal(T("Fed Interest Rate Decision"), "Решение ФРС по ставке");
  assert.equal(T("Fed Logan Speech"), "Выступление Логана (ФРС)");
  assert.equal(T("ECB President Lagarde Speech"), "Выступление главы ЕЦБ Лагард");
  assert.equal(T("Fed Chair Powell Speech"), "Выступление главы ФРС Пауэлла");
  assert.equal(T("Non Farm Payrolls"), "Число новых рабочих мест вне сельского хозяйства (Non-Farm Payrolls)");
  assert.equal(T("Core PCE Price Index MoM"), "Базовый индекс цен расходов на личное потребление (Core PCE), м/м");
  assert.equal(T("Initial Jobless Claims"), "Первичные заявки на пособие по безработице");
  assert.equal(T("MBA 30-Year Mortgage Rate"), "Ставка по 30-летней ипотеке (MBA)");
  assert.equal(T("ADP Employment Change Weekly"), "Занятость в частном секторе США по данным ADP (недельная)");
  assert.equal(T("Inflation Rate YoY Flash"), "Инфляция (индекс потребительских цен, CPI), г/г, экспресс-оценка");
  assert.equal(T("GDP Growth Rate QoQ Prel"), "Рост ВВП, кв/кв, предварительная оценка");
  assert.equal(T("10-Year Note Auction"), "Аукцион 10-летних нот Казначейства США");
  assert.equal(T("Baker Hughes Oil Rig Count"), "Число буровых установок в США (Baker Hughes): нефтяные");
  assert.equal(T("Thanksgiving Day"), "День благодарения");
});
ok("country of the event picks the central bank (MPC / plain «Interest Rate Decision»)", () => {
  assert.equal(loc(find("MPC Meeting Minutes")).title, "Протокол заседания Банка Англии");
  assert.equal(loc(find("Interest Rate Decision")).title, "Решение Банка России по ставке");
  assert.equal(localizeEvent({ event: "Interest Rate Decision", category: "centralbank", country: "PL", impact: 1 }).title, "Решение ЦБ Польши по ставке");
});
ok("modifiers: MoM / YoY / QoQ and the estimate stages are split off and rendered in Russian", () => {
  assert.deepEqual(splitMods("GDP Growth Rate QoQ 2nd Est"), { base: "GDP Growth Rate", mods: ["est2", "qoq"] });
  assert.deepEqual(splitMods("Retail Sales MoM Prel"), { base: "Retail Sales", mods: ["prel", "mom"] });
  assert.deepEqual(splitMods("CPI s.a"), { base: "CPI", mods: ["sa"] });
  assert.equal(splitMods("Final").base, "Final");
  assert.equal(localizeEvent({ event: "Retail Sales MoM Final", country: "CA", impact: 2 }).title, "Розничные продажи, м/м, финальная оценка");
});

console.log("texts and tags");
ok("every rule has about / affects / unique key; tags are known", () => {
  const keys = new Set<string>();
  for (const r of RULES) {
    assert.ok(!keys.has(r.key), `duplicate key ${r.key}`);
    keys.add(r.key);
    assert.ok(r.about.length > 20 && r.affects.length > 20, r.key);
    for (const t of r.tags) assert.ok(t === "ccy" || t in TAGS, `${r.key}: tag ${t}`);
    assert.ok(!/\u0008/.test(r.re.source), `${r.key}: backspace char in a regex`);
  }
  for (const r of FIXTURE) {
    const l = loc(r);
    const g = glossaryText(l.key, "ru");
    assert.ok(g && g.about && g.affects, `${r[0]} (${l.key}) has no texts`);
    assert.equal(l.about, g!.about);
    for (const t of l.tags ?? []) assert.ok(t in TAGS, `${r[0]}: tag ${t}`);
  }
  assert.equal(glossaryText(loc(find("Fed Logan Speech")).key, "en"), null);
});
ok("EIA crude example: the wording asked for, tags oil + ruble + stocks + CAD", () => {
  const l = loc(find("EIA Crude Oil Stocks Change"));
  assert.ok(l.about!.includes("Недельное изменение коммерческих запасов нефти в США"));
  assert.ok(l.about!.includes("Рост запасов — давление на цену нефти, падение — поддержка"));
  for (const t of ["oil", "rub", "stocks", "cad"]) assert.ok(l.tags!.includes(t), t);
  assert.equal(tagLabel("oil", "ru"), "Нефть");
  assert.equal(tagLabel("rub", "ru"), "Рубль");
});
ok("country currency tag is resolved from the event country", () => {
  assert.ok(loc(find("Inflation Rate YoY")).tags!.includes("rub"));
  assert.ok(loc(find("Inflation Rate MoM")).tags!.includes("usd"));
  assert.ok(loc(find("Inflation Rate YoY Flash")).tags!.includes("eur"));
  assert.ok(!loc(find("Consumer Confidence")).tags!.includes("ccy"));
  assert.ok(!(loc(find("Balance of Trade")).tags ?? []).includes("ccy"), "SI has no currency tag");
});

console.log("energy");
ok("every energy event has importance >= 2, EIA crude and natural gas storage 3", () => {
  const energy = FIXTURE.filter((r) => /EIA|API Crude|Baker Hughes|IEA|OPEC/.test(r[0]));
  assert.ok(energy.length >= 14);
  for (const r of energy) {
    const l = loc(r);
    assert.ok(l.impact >= 2, `${r[0]} impact ${l.impact}`);
    assert.equal(l.category ?? catOf(r), "energy", `${r[0]} category`);
    assert.ok(l.tags!.includes("oil") || l.tags!.includes("gas"), `${r[0]} tags`);
  }
  assert.equal(loc(find("EIA Crude Oil Stocks Change")).impact, 3);
  assert.equal(loc(find("EIA Natural Gas Stocks Change")).impact, 3);
  assert.equal(loc(find("EIA Gasoline Stocks Change")).impact, 2);
  assert.equal(loc(find("API Crude Oil Stock Change")).impact, 2);
  assert.equal(loc(find("Baker Hughes Oil Rig Count")).impact, 2);
  assert.equal(loc(find("OPEC Monthly Report")).impact, 3);
});
ok("the default filter [2,3] shows every energy event after localisation", () => {
  const evs = FIXTURE.filter((r) => /EIA|API Crude|Baker Hughes|IEA|OPEC/.test(r[0])).map((r, i) => mk(r[0], r[1], r[2], i));
  const shown = filterEvents(evs.map((e) => localizeCalEvent(e, "ru")), { impacts: new Set(DEFAULT_CAL_PREFS.impacts) });
  assert.equal(shown.length, evs.length);
  assert.ok(filterEvents(evs, { impacts: new Set(DEFAULT_CAL_PREFS.impacts) }).length < evs.length, "before the glossary most of them were hidden");
});
ok("non-energy events are not promoted; periodic variants keep their importance; \"Non-Oil Exports\" is trade", () => {
  assert.equal(loc(find("Fed Beige Book")).impact, 1);
  assert.equal(loc(find("Non-Oil Exports YoY")).category, "trade");
  assert.equal(localizeEvent({ event: "Non Farm Payrolls QoQ", country: "US", impact: 1 }).impact, 1);
});

console.log("API-level localisation");
function mk(event: string, country: string, impact: number, i = 0, extra: Partial<CalEvent> = {}): CalEvent {
  return { id: `t${i}`, ts: Date.UTC(2026, 9, 7, 14, 30) + i, allDay: false, country, currency: "", event, category: categoryOf(event), impact: impact as 1 | 2 | 3, actual: null, forecast: null, previous: null, unit: null, change: null, changePercentage: null, ...extra };
}
ok("localizeCalEvent: Russian title, eventEn, gk, tags; no about / affects in the payload; the input is untouched", () => {
  const src = mk("EIA Crude Oil Stocks Change", "US", 2, 0, { period: "Sep", description: "TV text", hasDesc: true });
  const copy = JSON.stringify(src);
  const out = localizeCalEvent(src, "ru");
  assert.equal(JSON.stringify(src), copy, "mutated the source event");
  assert.equal(out.event, "Запасы сырой нефти в США (EIA)");
  assert.equal(out.eventEn, "EIA Crude Oil Stocks Change");
  assert.equal(out.gk, "oil.eia.crude");
  assert.equal(out.impact, 3);
  assert.equal(out.period, "сен");
  assert.deepEqual(out.tags, ["oil", "rub", "stocks", "cad", "usd"]);
  assert.equal((out as unknown as Record<string, unknown>).about, undefined);
  assert.equal((out as unknown as Record<string, unknown>).affects, undefined);
  assert.equal(localizeCalEvent(src, "ru"), out, "memoised per event and language");
  const en = localizeCalEvent(src, "en");
  assert.equal(en.event, "EIA Crude Oil Stocks Change");
  assert.equal(en.eventEn, undefined);
  assert.equal(en.impact, 3);
  assert.equal(en.period, "Sep");
});
ok("generic fallback gets no gk (the client derives ~category) but still a Russian title", () => {
  const out = localizeCalEvent(mk("Hypothetical Unemployment Benefit Index", "XX", 1), "ru");
  assert.equal(out.gk, undefined);
  assert.ok(hasCyr(out.event), out.event);
  assert.equal(out.eventEn, "Hypothetical Unemployment Benefit Index");
  assert.ok(glossaryText("~employment", "ru"));
});
ok("MOEX events are returned as they are", () => {
  const m = mk("Other futures expiry (2)", "RU", 1, 0, { category: "moex" });
  assert.equal(localizeCalEvent(m, "ru"), m);
});
ok("periods: months, quarters, week-ending dates, Portuguese abbreviations", () => {
  assert.equal(localizePeriod("Sep", "ru"), "сен");
  assert.equal(localizePeriod("Q3", "ru"), "3 кв.");
  assert.equal(localizePeriod("Oct/03", "ru"), "3 окт");
  assert.equal(localizePeriod("Set", "ru"), "сен");
  assert.equal(localizePeriod("Out", "ru"), "окт");
  assert.equal(localizePeriod("Sept", "ru"), "сен");
  assert.equal(localizePeriod("May", "ru"), "май");
  assert.equal(localizePeriod("Q4", "en"), "Q4");
  assert.equal(localizePeriod(undefined, "ru"), undefined);
});

console.log("filters and surprise");
ok("search matches the Russian and the original English name", () => {
  const evs = ["EIA Crude Oil Stocks Change", "Fed Logan Speech", "Initial Jobless Claims"].map((e, i) => localizeCalEvent(mk(e, "US", 2, i), "ru"));
  assert.equal(filterEvents(evs, { q: "crude" }).length, 1);
  assert.equal(filterEvents(evs, { q: "Запасы сырой" }).length, 1);
  assert.equal(filterEvents(evs, { q: "логана" }).length, 1);
  assert.equal(filterEvents(evs, { q: "jobless" }).length, 1);
  assert.equal(filterEvents(evs, { q: "nothing" }).length, 0);
});
ok("«Нефть и газ» filter: only oil / gas events, any country, regardless of the country filter and the MOEX layer", () => {
  const raw = [mk("EIA Crude Oil Stocks Change", "US", 2, 1), mk("EIA Natural Gas Stocks Change", "US", 1, 2), mk("OPEC Monthly Report", "AT", 1, 3), mk("Non Farm Payrolls", "US", 3, 4), mk("ISM Manufacturing PMI", "US", 3, 5), mk("Fed Interest Rate Decision", "US", 3, 6), mk("Moex thing", "RU", 1, 7, { category: "moex" })];
  const evs = raw.map((e) => localizeCalEvent(e, "ru"));
  const only = filterEvents(evs, { energy: true, countries: new Set(["RU"]), impacts: new Set([2, 3]) });
  assert.deepEqual(only.map((e) => e.eventEn), ["EIA Crude Oil Stocks Change", "EIA Natural Gas Stocks Change", "OPEC Monthly Report"]);
  assert.equal(filterEvents(evs, { countries: new Set(["RU"]) }).length, 1, "without the chip the country filter works as before (only the MOEX layer stays)");
});
ok("the default is off and normalisation keeps the flag", () => {
  assert.equal(DEFAULT_CAL_PREFS.energy, false);
  assert.equal(normalizeCalPrefs(undefined).energy, false);
  assert.equal(normalizeCalPrefs({ energy: true }).energy, true);
  assert.equal(normalizeCalPrefs({ energy: "yes" }).energy, false);
});
ok("surprise colouring still knows inverse indicators after the title was translated", () => {
  const e = localizeCalEvent(mk("Initial Jobless Claims", "US", 2, 0, { actual: 250, forecast: 230 }), "ru");
  assert.ok(hasCyr(e.event));
  assert.equal(surprise(e), "worse");
  assert.equal(surprise({ event: "Initial Jobless Claims", actual: 250, forecast: 230, previous: null }), "worse");
  assert.equal(surprise(localizeCalEvent(mk("Non Farm Payrolls", "US", 3, 0, { actual: 250, forecast: 230 }), "ru")), "better");
});

console.log("coverage");
ok("explicit entries cover > 90% of the fixture (holidays excluded) and all energy events", () => {
  const rows = FIXTURE.filter((r) => r[3] !== "holiday");
  const explicit = rows.filter((r) => explicitKey(r[0], catOf(r), r[1]));
  const pct = (explicit.length / rows.length) * 100;
  const fb = rows.filter((r) => !explicitKey(r[0], catOf(r), r[1])).map((r) => r[0]);
  console.log(`      fixture: ${explicit.length}/${rows.length} explicit = ${pct.toFixed(1)}%, fallback: ${fb.join(" | ") || "-"}`);
  assert.ok(pct >= 90, `coverage ${pct.toFixed(1)}%`);
  for (const r of rows.filter((x) => /EIA|API Crude|Baker Hughes|IEA|OPEC/.test(x[0]))) assert.ok(explicitKey(r[0], catOf(r), r[1]), r[0]);
});
if (process.env.CAL_NAMES_FILE) {
  ok(`bigger sample ${process.env.CAL_NAMES_FILE}`, () => {
    const names = JSON.parse(readFileSync(process.env.CAL_NAMES_FILE!, "utf8")) as { k: string; imp: number; cat: string; c: string }[];
    const real = names.filter((x) => x.cat !== "holiday" && x.cat !== "moex");
    const hi = real.filter((x) => x.imp >= 2);
    const cov = (xs: typeof real) => xs.filter((x) => explicitKey(x.k, x.cat, x.c.split(",")[0])).length;
    console.log(`      all non-holiday names: ${cov(real)}/${real.length} = ${((cov(real) / real.length) * 100).toFixed(1)}%`);
    console.log(`      importance >= 2:       ${cov(hi)}/${hi.length} = ${((cov(hi) / hi.length) * 100).toFixed(1)}%`);
    console.log(`      not explicit:          ${real.filter((x) => !explicitKey(x.k, x.cat, x.c.split(",")[0])).map((x) => x.k).join(" | ") || "-"}`);
    assert.ok(cov(hi) / hi.length >= 0.9);
  });
}

console.log(`\n${n} checks passed`);
