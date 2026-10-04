/* Corporate-events layer checks (src/lib/calendar/corporate.ts): dividends, bond coupons and reporting dates of Russian issuers.
   Everything here runs on FIXTURES hand-built from the documented T-Invest API contract (github.com/RussianInvestments/investAPI,
   instruments.proto: GetDividends / GetBondCoupons / GetAssetReports / Shares / Bonds, REST JSON: int64 as strings, Timestamp as ISO
   strings, MoneyValue / Quotation as {units, nano}) and a fake fetch: no network, no database, no token.
   Run: npx tsx scripts/check-corp-events.ts
   To look at REAL responses (needs a read-only T-Invest token), run on the server:
     NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/check-corp-events.ts --env /opt/fomo/.env --live
   (--live reads TINKOFF_READONLY_TOKEN / TINKOFF_TOKEN from the env file, never prints it, probes the four endpoints for SBER and OFZ
   26238 and prints the shape and the first rows; add --refresh to prime the database cache as scripts/refresh-corp-events.ts does.) */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  _resetCorp,
  _setCorpFetch,
  _setCorpStore,
  _setCorpTuning,
  buildCorporateEvents,
  corpHasData,
  createMemStore,
  fmtMoney,
  fmtNum,
  getCorporateEvents,
  lastCorpRefresh,
  moneyOf,
  mskDay,
  parseBonds,
  parseCoupons,
  parseDividends,
  parseIssTurnover,
  parseReports,
  parseShares,
  refreshCorporate,
  STATIC_BLUE,
  type BondInfo,
  type CorpRow,
  type ShareInfo,
} from "../src/lib/calendar/corporate";
import { glossaryBrief, glossaryText, localizeCalEvent, TAGS } from "../src/lib/calendar/glossary";
import { filterEvents } from "../src/lib/calendar/normalize";
import { getCalendarRange, _resetCalendarCache } from "../src/lib/calendar/source";
import { DEFAULT_CAL_PREFS, normalizeCalPrefs } from "../src/lib/calendar/prefs";

let n = 0;
const ok = async (name: string, fn: () => void | Promise<void>) => {
  await fn();
  n++;
  console.log(`  ok  ${name}`);
};
const hasCyr = (s: string) => /[Ѐ-ӿ]/.test(s);

/* ───────────── fixtures (documented shapes) ───────────── */

const sber: ShareInfo = { ticker: "SBER", uid: "uid-sber", figi: "BBG004730N88", name: "Сбер Банк", isin: "RU0009029540", rank: 3 };
const vtbr: ShareInfo = { ticker: "VTBR", uid: "uid-vtbr", figi: "BBG004730ZJ9", name: "Банк ВТБ", isin: "RU000A0JP5V6", rank: 17 };
const kmaz: ShareInfo = { ticker: "KMAZ", uid: "uid-kmaz", figi: "BBG0029SG1C1", name: "КАМАЗ", isin: "RU0009066975", rank: 120 };

const DIV_SBER = {
  dividends: [
    { dividendNet: { currency: "rub", units: "33", nano: 300000000 }, paymentDate: "2026-07-30T00:00:00Z", declaredDate: "2026-04-22T00:00:00Z", lastBuyDate: "2026-07-17T00:00:00Z", dividendType: "Regular Cash", recordDate: "2026-07-20T00:00:00Z", regularity: "Annual", closePrice: { currency: "rub", units: "310", nano: 0 }, yieldValue: { units: "10", nano: 740000000 }, createdAt: "2026-04-22T10:00:00Z" },
    // cancelled payment: dropped
    { dividendNet: { currency: "rub", units: "5", nano: 0 }, lastBuyDate: "2026-10-20T00:00:00Z", dividendType: "Cancelled", recordDate: "2026-10-21T00:00:00Z" },
    // no last-buy date, midnight MSK expressed as 21:00Z of the day before: the record date is the event day (21 Oct)
    { dividendNet: { currency: "rub", units: "0", nano: 45000000 }, dividendType: "Regular Cash", recordDate: "2026-10-20T21:00:00Z", regularity: "Semi-Anl" },
    // zero amount: dropped
    { dividendNet: { currency: "rub", units: "0", nano: 0 }, lastBuyDate: "2026-11-01T00:00:00Z", dividendType: "Regular Cash", recordDate: "2026-11-02T00:00:00Z" },
  ],
};
const DIV_VTBR = { dividends: [{ dividendNet: { currency: "rub", units: "25", nano: 580000000 }, lastBuyDate: "2026-07-17T00:00:00Z", recordDate: "2026-07-20T00:00:00Z", dividendType: "Regular Cash", yieldValue: { units: "0", nano: 0 } }] };
const DIV_KMAZ = { dividends: [{ dividendNet: { currency: "rub", units: "1234", nano: 500000000 }, lastBuyDate: "2026-10-09T00:00:00Z", recordDate: "2026-10-12T00:00:00Z", dividendType: "Regular Cash" }] };

const REPORTS_SBER = {
  events: [
    { instrumentId: "uid-sber", reportDate: "2026-10-30T00:00:00Z", periodYear: 2026, periodNum: 3, periodType: "PERIOD_TYPE_QUARTER", createdAt: "2026-09-01T00:00:00Z" },
    { instrumentId: "uid-sber", reportDate: "2027-02-27T00:00:00Z", periodYear: 2026, periodNum: 0, periodType: "PERIOD_TYPE_ANNUAL" },
    { instrumentId: "uid-sber", reportDate: "bad-date", periodYear: 2026, periodNum: 1, periodType: "PERIOD_TYPE_QUARTER" },
  ],
};
const REPORTS_KMAZ = { events: [{ instrumentId: "uid-kmaz", reportDate: "2026-10-30T00:00:00Z", periodYear: 2026, periodNum: 1, periodType: "PERIOD_TYPE_SEMIANNUAL" }] };

const ofzA: BondInfo = { ticker: "SU26238RMFS4", uid: "b-26238", figi: "f1", name: "ОФЗ 26238", isin: "RU000A1038V6", classCode: "TQOB", ofz: true, nominal: 1000, perQuarterYear: 2, floating: false, maturity: "2041-05-15" };
const ofzB: BondInfo = { ticker: "SU26243RMFS4", uid: "b-26243", figi: "f2", name: "ОФЗ 26243", isin: "RU000A10A117", classCode: "TQOB", ofz: true, nominal: 1000, perQuarterYear: 2, floating: false, maturity: "2038-05-19" };
const ofzFloat: BondInfo = { ticker: "SU29006RMFS2", uid: "b-29006", figi: "f3", name: "ОФЗ 29006", isin: "RU000A0JXFM1", classCode: "TQOB", ofz: true, nominal: 1000, perQuarterYear: 4, floating: true, maturity: "2025-11-26" };
const corpA: BondInfo = { ticker: "RU000A10BAA1", uid: "b-rzd", figi: "f4", name: "РЖД 001Р-35R", isin: "RU000A10BAA1", classCode: "TQCB", ofz: false, nominal: 1000, perQuarterYear: 4, floating: false, maturity: "2029-03-01" };

const CPN_A = { events: [{ figi: "f1", couponDate: "2026-10-14T00:00:00Z", couponNumber: "36", fixDate: "2026-10-13T00:00:00Z", payOneBond: { currency: "rub", units: "36", nano: 900000000 }, couponType: "COUPON_TYPE_CONSTANT", couponStartDate: "2026-04-15T00:00:00Z", couponEndDate: "2026-10-14T00:00:00Z", couponPeriod: 182 }] };
const CPN_B = { events: [{ figi: "f2", couponDate: "2026-10-14T00:00:00Z", couponNumber: "20", payOneBond: { currency: "rub", units: "34", nano: 90000000 }, couponType: "COUPON_TYPE_CONSTANT", couponPeriod: 182 }, { figi: "f2", couponDate: "2027-04-14T00:00:00Z", couponNumber: "21", payOneBond: { currency: "rub", units: "34", nano: 90000000 }, couponPeriod: 182 }] };
const CPN_FLOAT = { events: [{ figi: "f3", couponDate: "2026-10-14T00:00:00Z", couponNumber: "30", payOneBond: { currency: "rub", units: "0", nano: 0 }, couponType: "COUPON_TYPE_FLOATING", couponPeriod: 91 }] };
const CPN_CORP = { events: [{ figi: "f4", couponDate: "2026-10-14T00:00:00Z", couponNumber: "7", payOneBond: { currency: "rub", units: "27", nano: 910000000 }, couponType: "COUPON_TYPE_CONSTANT", couponPeriod: 91 }, { figi: "f4", couponDate: "2026-10-20T00:00:00Z", couponNumber: "8", payOneBond: { currency: "rub", units: "27", nano: 910000000 }, couponPeriod: 91 }] };

const allRows = (): CorpRow[] => [
  ...parseDividends(DIV_SBER, sber),
  ...parseDividends(DIV_VTBR, vtbr),
  ...parseDividends(DIV_KMAZ, kmaz),
  ...parseReports(REPORTS_SBER, sber),
  ...parseReports(REPORTS_KMAZ, kmaz),
  ...parseCoupons(CPN_A, ofzA),
  ...parseCoupons(CPN_B, ofzB),
  ...parseCoupons(CPN_FLOAT, ofzFloat),
  ...parseCoupons(CPN_CORP, corpA),
];

async function main() {
  console.log("parsing the API shapes");
  await ok("MoneyValue / Quotation, Moscow day of a timestamp, number formats", () => {
    assert.deepEqual(moneyOf({ currency: "rub", units: "33", nano: 300000000 }), { value: 33.3, currency: "RUB" });
    assert.equal(moneyOf({ units: "-2", nano: -500000000 })!.value, -2.5);
    assert.equal(moneyOf(null), null);
    assert.equal(moneyOf({ units: "x" }), null);
    assert.equal(mskDay("2026-07-17T00:00:00Z"), "2026-07-17");
    assert.equal(mskDay("2026-10-20T21:00:00Z"), "2026-10-21"); // midnight Moscow of the 21st
    assert.equal(mskDay("nope"), null);
    assert.equal(mskDay("1970-01-01T00:00:00Z"), null);
    assert.equal(fmtNum(33.3), "33,3");
    assert.equal(fmtNum(1234.5), "1 234,5");
    assert.equal(fmtNum(0.045), "0,045");
    assert.equal(fmtNum(10), "10");
    assert.equal(fmtNum(33.3, "en"), "33.3");
    assert.equal(fmtMoney(36.9, "RUB"), "36,9 ₽");
    assert.equal(fmtMoney(12, "CNY"), "12 ¥");
    assert.equal(fmtMoney(2, "KZT"), "2 KZT");
  });
  await ok("GetDividends: cancelled and zero payments dropped, event day = last buy day (else record day), yield, blue flag", () => {
    const rows = parseDividends(DIV_SBER, sber);
    assert.equal(rows.length, 2);
    const a = rows[0];
    assert.equal(a.date, "2026-07-17");
    assert.equal(a.amount, 33.3);
    assert.equal(a.currency, "RUB");
    assert.equal(a.extra.record, "2026-07-20");
    assert.equal(a.extra.pay, "2026-07-30");
    assert.equal(a.extra.yield, 10.74);
    assert.equal(a.extra.blue, true);
    assert.equal(a.extra.basis, "lastBuy");
    const b = rows[1];
    assert.equal(b.date, "2026-10-21");
    assert.equal(b.extra.basis, "record");
    assert.notEqual(a.id, b.id);
    assert.equal(parseDividends(DIV_KMAZ, kmaz)[0].extra.blue, false);
    assert.equal(parseDividends(DIV_VTBR, vtbr)[0].extra.yield, null, "a zero yield is not shown");
    assert.deepEqual(parseDividends(null, sber), []);
    assert.deepEqual(parseDividends({ dividends: "x" }, sber), []);
  });
  await ok("GetAssetReports: quarter / half-year / year, bad dates skipped", () => {
    const rows = parseReports(REPORTS_SBER, sber);
    assert.equal(rows.length, 2);
    assert.deepEqual([rows[0].extra.type, rows[0].extra.num, rows[0].extra.year, rows[0].date], ["q", 3, 2026, "2026-10-30"]);
    assert.equal(rows[1].extra.type, "y");
    assert.equal(parseReports(REPORTS_KMAZ, kmaz)[0].extra.type, "h");
  });
  await ok("GetBondCoupons: amount, annual rate from payment / nominal / period, floating coupon without amount", () => {
    const a = parseCoupons(CPN_A, ofzA)[0];
    assert.equal(a.amount, 36.9);
    assert.equal(a.date, "2026-10-14");
    assert.equal(a.extra.rate, 7.4); // 36.9 / 1000 * 365 / 182 * 100
    assert.equal(a.extra.ofz, true);
    const f = parseCoupons(CPN_FLOAT, ofzFloat)[0];
    assert.equal(f.amount, null);
    assert.equal(f.extra.floating, true);
    assert.equal(f.extra.rate, null);
  });
  await ok("Shares / Bonds lists: only TQBR shares, TQOB / TQCB bonds, by ticker / ISIN", () => {
    const shares = parseShares({ instruments: [{ ticker: "SBER", classCode: "TQBR", uid: "u1", figi: "f", name: "Сбер Банк", isin: "RU0009029540" }, { ticker: "SBER", classCode: "SPBXM", uid: "u2" }, { ticker: "AAPL", classCode: "SPBXM", uid: "u3" }, { ticker: "NOUID", classCode: "TQBR" }] });
    assert.deepEqual([...shares.keys()], ["SBER"]);
    assert.equal(shares.get("SBER")!.uid, "u1");
    const bonds = parseBonds({ instruments: [{ ticker: "SU26238RMFS4", classCode: "TQOB", uid: "b1", isin: "RU000A1038V6", name: "ОФЗ 26238", nominal: { currency: "rub", units: "1000", nano: 0 }, couponQuantityPerYear: 2, maturityDate: "2041-05-14T21:00:00Z" }, { ticker: "X", classCode: "TQBR", uid: "b2", isin: "I" }, { ticker: "RZD", classCode: "TQCB", uid: "b3", isin: "RU000A10BAA1", floatingCouponFlag: true }] });
    assert.deepEqual([...bonds.keys()], ["RU000A1038V6", "RU000A10BAA1"]);
    assert.equal(bonds.get("RU000A1038V6")!.ofz, true);
    assert.equal(bonds.get("RU000A1038V6")!.maturity, "2041-05-15");
    assert.equal(bonds.get("RU000A10BAA1")!.floating, true);
  });
  await ok("ISS TQBR ranking: sorted by turnover, joined by SECID", () => {
    const r = parseIssTurnover({ securities: { columns: ["SECID", "ISIN"], data: [["AAA", "I1"], ["BBB", "I2"], ["CCC", "I3"]] }, marketdata: { columns: ["SECID", "VALTODAY_RUR", "VALTODAY"], data: [["AAA", 5, 5], ["BBB", 50, 50], ["CCC", null, null]] } });
    assert.deepEqual(r.map((x) => x.secid), ["BBB", "AAA", "CCC"]);
    assert.equal(r[0].isin, "I2");
    assert.deepEqual(parseIssTurnover({}), []);
  });

  console.log("events");
  const rows = allRows();
  const evs = buildCorporateEvents(rows, "2026-07-01", "2027-12-31", "ru");
  const by = (re: RegExp) => evs.filter((e) => re.test(e.event));
  await ok("dividend titles: Russian, ticker, amount with comma, yield; importance 3 for blue chips, 2 for the rest", () => {
    const s = by(/^Дивиденды: Сбер Банк \(SBER\) — 33,3 ₽ на акцию/)[0];
    assert.ok(s, evs.map((e) => e.event).join("\n"));
    assert.equal(s.event, "Дивиденды: Сбер Банк (SBER) — 33,3 ₽ на акцию (10,74%)");
    assert.equal(s.impact, 3);
    assert.equal(s.period, "последний день покупки");
    assert.equal(s.country, "RU");
    assert.equal(s.category, "corp");
    assert.equal(s.allDay, true);
    assert.equal(s.ts, Date.UTC(2026, 6, 17));
    assert.ok(s.description!.includes("Дата закрытия реестра: 20.07.2026"));
    assert.ok(s.description!.includes("Последний день покупки"));
    assert.equal(s.gk, "corp.div");
    assert.deepEqual(s.tags, ["div", "stocks", "rub"]);
    assert.equal(by(/^Дивиденды: Банк ВТБ \(VTBR\)/)[0].impact, 3);
    const k = by(/^Дивиденды: КАМАЗ \(KMAZ\)/)[0];
    assert.equal(k.impact, 2);
    assert.ok(k.event.includes("1 234,5 ₽"));
    const sem = by(/^Дивиденды: Сбер Банк \(SBER\) — 0,045 ₽/)[0];
    assert.equal(sem.period, "закрытие реестра", "no last-buy day: the record day is named as such");
  });
  await ok("coupons are aggregated per day and group: two OFZ on 14 Oct -> one line with a list, the corporate bond and the floating OFZ separate", () => {
    const day = evs.filter((e) => e.category === "corp" && e.gk === "corp.coupon" && e.ts === Date.UTC(2026, 9, 14));
    assert.equal(day.length, 2, day.map((e) => e.event).join(" | "));
    const ofz = day.find((e) => e.event.startsWith("Купоны ОФЗ"))!;
    assert.equal(ofz.event, "Купоны ОФЗ: 3 выпуска");
    assert.ok(ofz.description!.includes("ОФЗ 26238 — 36,9 ₽, около 7,4% годовых"));
    assert.ok(ofz.description!.includes("ОФЗ 26243 — 34,09 ₽"));
    assert.ok(ofz.description!.includes("ОФЗ 29006 — размер определяется позже"));
    assert.equal(ofz.impact, 1);
    assert.ok(ofz.search!.includes("su26238rmfs4") && ofz.search!.includes("офз 29006"));
    const corp = day.find((e) => e.event.startsWith("Купон:"))!;
    assert.equal(corp.event, "Купон: РЖД 001Р-35R — 27,91 ₽");
    // a single OFZ on its own day keeps the plain title
    const single = by(/^Купон: ОФЗ 26243/)[0];
    assert.equal(single.event, "Купон: ОФЗ 26243 — 34,09 ₽");
    assert.equal(single.ts, Date.UTC(2027, 3, 14));
  });
  await ok("many coupons of one day -> one event, list capped, plural forms", () => {
    const many: CorpRow[] = [];
    for (let i = 0; i < 52; i++) many.push({ id: `c${i}`, kind: "coupon", ticker: `T${i}`, name: `Облигация ${i}`, date: "2026-11-05", amount: 10 + i, currency: "RUB", extra: { ofz: false, n: 1 } });
    const e = buildCorporateEvents(many, "2026-11-01", "2026-11-30", "ru");
    assert.equal(e.length, 1);
    assert.equal(e[0].event, "Купоны корпоративных облигаций: 52 выпуска");
    assert.ok(e[0].description!.includes("…и ещё 12"));
    const two = buildCorporateEvents(many.slice(0, 2), "2026-11-01", "2026-11-30");
    assert.equal(two[0].event, "Купоны корпоративных облигаций: 2 выпуска");
    assert.equal(buildCorporateEvents(many.slice(0, 5), "2026-11-01", "2026-11-30")[0].event, "Купоны корпоративных облигаций: 5 выпусков");
    assert.equal(buildCorporateEvents(many.slice(0, 21), "2026-11-01", "2026-11-30")[0].event, "Купоны корпоративных облигаций: 21 выпуск");
  });
  await ok("reports: «Отчётность: <company> (<ticker>), <period>»; importance 2 for the top shares, 1 for the rest", () => {
    const s = by(/^Отчётность: Сбер Банк/);
    assert.deepEqual(s.map((e) => e.event), ["Отчётность: Сбер Банк (SBER), 3 кв. 2026", "Отчётность: Сбер Банк (SBER), 2026 год"]);
    assert.ok(s.every((e) => e.impact === 2 && e.gk === "corp.report" && e.tags!.includes("earnings")));
    const k = by(/^Отчётность: КАМАЗ/)[0];
    assert.equal(k.event, "Отчётность: КАМАЗ (KMAZ), 1 пол. 2026");
    assert.equal(k.impact, 1);
    assert.ok(k.description!.includes("МСФО или РСБУ"), "the source does not name the standard: the text says so");
  });
  await ok("range filter, dedupe, sorting, stable ids; all titles Russian", () => {
    const some = buildCorporateEvents(rows, "2026-10-14", "2026-10-21", "ru");
    assert.ok(some.every((e) => e.ts >= Date.UTC(2026, 9, 14) && e.ts <= Date.UTC(2026, 9, 21)));
    assert.ok(some.length >= 4);
    for (let i = 1; i < some.length; i++) assert.ok(some[i - 1].ts <= some[i].ts);
    const twice = buildCorporateEvents([...rows, ...rows], "2026-07-01", "2027-12-31", "ru");
    assert.equal(twice.length, evs.length, "duplicated rows do not duplicate events");
    assert.equal(new Set(evs.map((e) => e.id)).size, evs.length, "ids are unique");
    assert.deepEqual(buildCorporateEvents(rows, "2026-07-01", "2027-12-31", "ru").map((e) => e.id), evs.map((e) => e.id), "ids are stable");
    for (const e of evs) assert.ok(hasCyr(e.event), e.event);
    assert.deepEqual(buildCorporateEvents([], "2026-01-01", "2026-12-31"), []);
    assert.deepEqual(buildCorporateEvents(rows, "2030-01-01", "2030-01-31"), []);
  });
  await ok("lang=en gives English titles; cn falls back to English", () => {
    const en = buildCorporateEvents(rows, "2026-07-01", "2027-12-31", "en");
    assert.ok(en.some((e) => e.event === "Dividends: Сбер Банк (SBER) — RUB 33.3 per share (10.74%)"), en.map((e) => e.event).join("\n"));
    assert.ok(en.some((e) => e.event === "Earnings report: Сбер Банк (SBER), Q3 2026"));
    assert.ok(en.some((e) => e.event === "OFZ coupons: 3 issues"));
    assert.equal(buildCorporateEvents(rows, "2026-07-01", "2026-07-31", "cn").length, buildCorporateEvents(rows, "2026-07-01", "2026-07-31", "en").length);
  });

  console.log("glossary, filter, prefs");
  await ok("every corp event carries a known gk with about / affects / a brief of at most 90 characters; the tags exist", () => {
    for (const e of evs) {
      const g = glossaryText(e.gk, "ru");
      assert.ok(g && g.about.length > 40 && g.affects.length > 40, `${e.gk}`);
      assert.ok(g.brief.length >= 10 && g.brief.length <= 90 && hasCyr(g.brief), `${e.gk} brief ${g.brief.length}`);
      assert.equal(glossaryBrief(e.gk, "ru"), g.brief);
      for (const t of e.tags!) assert.ok(t in TAGS, t);
    }
    assert.equal(TAGS.div.ru, "Дивиденды");
    assert.equal(TAGS.coupon.ru, "Купоны");
    assert.equal(TAGS.earnings.ru, "Отчётность");
    assert.equal(glossaryBrief("corp.div", "ru"), "Гэп вниз на размер дивиденда после отсечки; купить до даты — право на выплату");
    assert.equal(glossaryBrief("corp.div", "en"), null);
  });
  await ok("localizeCalEvent leaves corp events as they are (no glossary re-title)", () => {
    const e = evs[0];
    assert.equal(localizeCalEvent(e, "ru"), e);
    assert.equal(localizeCalEvent(e, "en"), e);
  });
  await ok("filterEvents: noCorp hides the layer, the country filter does not, the search finds tickers, names and aggregated issues", () => {
    assert.equal(filterEvents(evs, { noCorp: true }).length, 0);
    assert.equal(filterEvents(evs, {}).length, evs.length);
    assert.equal(filterEvents(evs, { countries: new Set(["US"]) }).length, evs.length, "own switch, not the country filter");
    assert.equal(filterEvents(evs, { energy: true }).length, 0, "the oil and gas quick filter never shows corp events");
    assert.ok(filterEvents(evs, { q: "sber" }).length >= 3);
    assert.ok(filterEvents(evs, { q: "сбер" }).length >= 3);
    assert.ok(filterEvents(evs, { q: "офз 29006" }).some((e) => e.event.startsWith("Купоны ОФЗ")), "ticker / name inside an aggregated coupon event");
    assert.ok(filterEvents(evs, { q: "su26238rmfs4" }).length >= 1);
    assert.equal(filterEvents(evs, { q: "gazp" }).length, 0);
    assert.equal(filterEvents(evs, { impacts: new Set([3]) }).every((e) => e.gk === "corp.div"), true);
  });
  await ok("pref «corp» defaults to on and survives normalisation", () => {
    assert.equal(DEFAULT_CAL_PREFS.corp, true);
    assert.equal(normalizeCalPrefs({}).corp, true);
    assert.equal(normalizeCalPrefs({ corp: false }).corp, false);
    assert.equal(normalizeCalPrefs({ corp: "x" }).corp, true);
  });

  console.log("refresh against a fake API");
  const TOKEN = "t.SECRET-TOKEN-VALUE";
  const now = Date.UTC(2026, 9, 4, 12);
  function fakeApi(opts: { issDown?: boolean; failShare?: string; status429Once?: boolean; unauthorized?: boolean; manyShares?: number } = {}) {
    const calls: { method: string; body: Record<string, unknown>; auth: string }[] = [];
    let issCalls = 0;
    let rate = !!opts.status429Once;
    const manyShares = opts.manyShares ?? 0;
    const tickers = ["SBER", "VTBR", "KMAZ", ...Array.from({ length: manyShares }, (_, i) => `ZZ${i}`)];
    const f = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.startsWith("https://iss.moex.com/iss/engines/stock/markets/")) {
        issCalls++;
        if (opts.issDown) return new Response("down", { status: 503 });
        if (u.includes("/TQBR/")) {
          const order = ["SBER", "VTBR", "KMAZ", ...tickers.slice(3)];
          return Response.json({ securities: { columns: ["SECID", "ISIN"], data: order.map((t) => [t, `I-${t}`]) }, marketdata: { columns: ["SECID", "VALTODAY_RUR", "VALTODAY"], data: order.map((t, i) => [t, 1e9 - i * 1e6, 1e9 - i * 1e6]) } });
        }
        return Response.json({ securities: { columns: ["SECID", "ISIN"], data: [["RU000A10BAA1", "RU000A10BAA1"]] }, marketdata: { columns: ["SECID", "VALTODAY_RUR", "VALTODAY"], data: [["RU000A10BAA1", 5e8, 5e8]] } });
      }
      assert.ok(u.startsWith("https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.InstrumentsService/"), u);
      const method = u.split("/").pop()!;
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ method, body, auth: headers.Authorization });
      if (opts.unauthorized) return new Response("{}", { status: 401 });
      if (rate && method === "GetDividends") {
        rate = false;
        return new Response("{}", { status: 429, headers: { "x-ratelimit-reset": "7" } });
      }
      switch (method) {
        case "Shares":
          return Response.json({ instruments: tickers.map((t) => ({ ticker: t, classCode: "TQBR", uid: `uid-${t.toLowerCase()}`, figi: `F${t}`, name: t === "SBER" ? "Сбер Банк" : t === "VTBR" ? "Банк ВТБ" : t === "KMAZ" ? "КАМАЗ" : `Компания ${t}`, isin: `I-${t}` })) });
        case "Bonds":
          return Response.json({ instruments: [{ ticker: ofzA.ticker, classCode: "TQOB", uid: ofzA.uid, isin: ofzA.isin, name: ofzA.name, nominal: { currency: "rub", units: "1000", nano: 0 }, couponQuantityPerYear: 2, maturityDate: "2041-05-15T00:00:00Z" }, { ticker: ofzB.ticker, classCode: "TQOB", uid: ofzB.uid, isin: ofzB.isin, name: ofzB.name, nominal: { currency: "rub", units: "1000", nano: 0 }, couponQuantityPerYear: 2, maturityDate: "2038-05-19T00:00:00Z" }, { ticker: corpA.ticker, classCode: "TQCB", uid: corpA.uid, isin: corpA.isin, name: corpA.name, nominal: { currency: "rub", units: "1000", nano: 0 }, couponQuantityPerYear: 4, maturityDate: "2029-03-01T00:00:00Z" }, { ticker: "OLD", classCode: "TQOB", uid: "b-old", isin: "RU-OLD", name: "ОФЗ погашена", maturityDate: "2020-01-01T00:00:00Z" }, { ticker: "UNRANKED", classCode: "TQCB", uid: "b-un", isin: "RU-UN", name: "Неликвидная", maturityDate: "2030-01-01T00:00:00Z" }] });
        case "GetDividends":
          if (opts.failShare && body.instrumentId === `uid-${opts.failShare.toLowerCase()}`) return new Response("{}", { status: 400 });
          return Response.json(body.instrumentId === "uid-sber" ? DIV_SBER : body.instrumentId === "uid-vtbr" ? DIV_VTBR : body.instrumentId === "uid-kmaz" ? DIV_KMAZ : { dividends: [] });
        case "GetAssetReports":
          return Response.json(body.instrumentId === "uid-sber" ? REPORTS_SBER : body.instrumentId === "uid-kmaz" ? REPORTS_KMAZ : { events: [] });
        case "GetBondCoupons":
          return Response.json(body.instrumentId === "b-26238" ? CPN_A : body.instrumentId === "b-26243" ? CPN_B : body.instrumentId === "b-rzd" ? CPN_CORP : { events: [] });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
    return { f, calls, iss: () => issCalls };
  }

  await ok("full refresh: calls, request shapes, auth header, pacing, rows in the store, prune, no token in the log", async () => {
    const api = fakeApi();
    const store = createMemStore();
    const slept: number[] = [];
    const log: string[] = [];
    const rep = await refreshCorporate({ token: TOKEN, fetchImpl: api.f, store, now, sleep: async (ms) => void slept.push(ms), gapMs: 700, log: (l) => log.push(l) });
    assert.equal(rep.ok, true, JSON.stringify(rep));
    assert.equal(rep.universe, "iss");
    assert.equal(rep.shares, 3);
    assert.equal(rep.bonds, 3, "2 OFZ (the matured one is dropped) + 1 ranked corporate bond");
    const m = (x: string) => api.calls.filter((c) => c.method === x);
    assert.equal(m("Shares").length, 1);
    assert.equal(m("Bonds").length, 1);
    assert.equal(m("GetDividends").length, 3);
    assert.equal(m("GetAssetReports").length, 3);
    assert.equal(m("GetBondCoupons").length, 3);
    assert.equal(rep.calls, 2 + 3 + 3 + 3);
    assert.ok(api.calls.every((c) => c.auth === `Bearer ${TOKEN}`));
    const d = m("GetDividends")[0].body as { instrumentId: string; from: string; to: string };
    assert.equal(d.instrumentId, "uid-sber");
    assert.ok(Date.parse(d.from) < now && Date.parse(d.to) > now + 300 * 86_400_000, "window: 45 days back, a year ahead");
    assert.deepEqual(m("Shares")[0].body, { instrumentStatus: "INSTRUMENT_STATUS_BASE" });
    assert.ok(slept.length >= rep.calls - 1 && slept.every((ms) => ms <= 700), "calls are paced");
    const kinds = [...store.rows.values()].reduce<Record<string, number>>((a, r) => ((a[r.kind] = (a[r.kind] ?? 0) + 1), a), {});
    assert.deepEqual(kinds, { div: 2, report: 3, coupon: 5 }); // the July dividends of the fixture are older than 60 days: pruned
    assert.ok(store.at > 0, "the refresh is marked complete");
    assert.equal([...store.rows.values()].find((r) => r.id.startsWith("div:SBER") && r.extra.blue)?.extra.rank, 1, "SBER is rank 1 of the ISS turnover ranking");
    assert.ok(!log.join("\n").includes("SECRET"), "the token is never logged");
    assert.ok(!JSON.stringify(rep).includes("SECRET"));
    assert.ok(buildCorporateEvents([...store.rows.values()], "2026-07-01", "2027-12-31").length >= 6);
  });
  await ok("429 waits for x-ratelimit-reset and retries; one failed instrument keeps its old rows; others are refreshed", async () => {
    const store = createMemStore();
    await store.replace("div", ["KMAZ"], [{ id: "div:KMAZ:old", kind: "div", ticker: "KMAZ", name: "КАМАЗ", date: "2026-12-01", amount: 9, currency: "RUB", extra: {} }]);
    const api = fakeApi({ status429Once: true, failShare: "KMAZ" });
    const slept: number[] = [];
    const rep = await refreshCorporate({ token: TOKEN, fetchImpl: api.f, store, now, sleep: async (ms) => void slept.push(ms), gapMs: 0 });
    assert.equal(rep.ok, true);
    assert.ok(slept.includes(8000), `waited the reset (7 s + 1): ${slept}`);
    assert.equal(api.calls.filter((c) => c.method === "GetDividends").length, 4, "3 shares + the retried one");
    assert.ok(store.rows.has("div:KMAZ:old"), "KMAZ failed with 400: its previous rows stay");
    assert.ok([...store.rows.values()].some((r) => r.ticker === "SBER" && r.kind === "div"));
    assert.equal(rep.failedCalls, 1);
  });
  await ok("401 aborts the refresh with reason unauthorized and writes nothing", async () => {
    const store = createMemStore();
    const api = fakeApi({ unauthorized: true });
    const rep = await refreshCorporate({ token: TOKEN, fetchImpl: api.f, store, now, sleep: async () => {}, gapMs: 0 });
    assert.equal(rep.ok, false);
    assert.equal(rep.reason, "unauthorized");
    assert.equal(store.rows.size, 0);
    assert.equal(store.at, 0);
    assert.equal(api.calls.length, 1, "stops at the first call");
  });
  await ok("no token: no call at all", async () => {
    const api = fakeApi();
    const rep = await refreshCorporate({ token: "", fetchImpl: api.f, store: createMemStore(), now, sleep: async () => {} });
    assert.equal(rep.reason, "no-token");
    assert.equal(api.calls.length + api.iss(), 0);
  });
  await ok("ISS down: the static blue-chip list stands in, corporate bonds are skipped, OFZ still work", async () => {
    const store = createMemStore();
    const api = fakeApi({ issDown: true });
    const rep = await refreshCorporate({ token: TOKEN, fetchImpl: api.f, store, now, sleep: async () => {}, gapMs: 0 });
    assert.equal(rep.universe, "static");
    assert.equal(rep.shares, 2, "SBER and VTBR of the fixture are in the static list, KMAZ is not");
    assert.ok(STATIC_BLUE.includes("SBER"));
    assert.equal(rep.bonds, 2, "OFZ only");
  });
  await ok("scope limits are respected (call budget): 40 shares + limit 25 -> 2 + 2*25 + bonds", async () => {
    const api = fakeApi({ manyShares: 40 });
    const rep = await refreshCorporate({ token: TOKEN, fetchImpl: api.f, store: createMemStore(), now, sleep: async () => {}, gapMs: 0, sharesLimit: 25, corpBondsLimit: 1 });
    assert.equal(rep.shares, 25);
    assert.equal(rep.calls, 2 + 2 * 25 + 3);
  });

  console.log("lazy layer (stale-while-revalidate)");
  await ok("a calendar request never waits for the refresh: first answer is empty and instant, the cache fills in the background, then the events appear", async () => {
    _resetCorp();
    const store = createMemStore();
    const api = fakeApi();
    _setCorpStore(store);
    _setCorpFetch(api.f);
    _setCorpTuning({ gapMs: 0, sleep: async () => {} });
    process.env.TINKOFF_TOKEN = TOKEN;
    const t0 = Date.now();
    const first = await getCorporateEvents("2026-07-01", "2027-12-31", "ru", now);
    assert.deepEqual(first, [], "nothing cached yet");
    assert.ok(Date.now() - t0 < 1500);
    // concurrent calls start no second refresh
    await Promise.all([getCorporateEvents("2026-07-01", "2026-07-31", "ru", now), getCorporateEvents("2026-07-01", "2026-07-31", "ru", now)]);
    for (let i = 0; i < 200 && !lastCorpRefresh(); i++) await new Promise((r) => setTimeout(r, 5));
    assert.ok(lastCorpRefresh()?.ok, JSON.stringify(lastCorpRefresh()));
    assert.equal(api.calls.filter((c) => c.method === "Shares").length, 1, "one in-flight refresh");
    const later = await getCorporateEvents("2026-07-01", "2027-12-31", "ru", now);
    assert.ok(later.length >= 6, `${later.length}`);
    assert.equal(corpHasData(), true);
    // fresh cache: no new refresh
    const calls = api.calls.length;
    await getCorporateEvents("2026-07-01", "2026-07-31", "ru", now + 3_600_000);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(api.calls.length, calls);
    // stale (> 6 h): a new background refresh starts, the old rows keep being served meanwhile
    const stale = await getCorporateEvents("2026-07-01", "2027-12-31", "ru", Date.now() + 7 * 3_600_000);
    assert.ok(stale.length >= 6);
    delete process.env.TINKOFF_TOKEN;
    _resetCorp();
  });
  await ok("without a token the layer serves what the table holds and calls nothing; a broken store degrades to memory", async () => {
    _resetCorp();
    delete process.env.TINKOFF_TOKEN;
    delete process.env.TINKOFF_READONLY_TOKEN;
    const store = createMemStore();
    await store.replace("div", ["SBER"], parseDividends(DIV_SBER, sber));
    const api = fakeApi();
    _setCorpStore(store);
    _setCorpFetch(api.f);
    const evs2 = await getCorporateEvents("2026-07-01", "2026-12-31", "ru", now);
    assert.equal(evs2.filter((e) => e.gk === "corp.div").length, 2);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(api.calls.length + api.iss(), 0);
    _resetCorp();
    _setCorpStore({ load: async () => Promise.reject(new Error("relation does not exist")), replace: async () => {}, prune: async () => {}, touch: async () => {} });
    assert.deepEqual(await getCorporateEvents("2026-07-01", "2026-12-31", "ru", now), []);
    _resetCorp();
  });
  await ok("getCalendarRange merges the layer, honours corp:false and reports it", async () => {
    _resetCorp();
    _resetCalendarCache();
    delete process.env.TINKOFF_TOKEN;
    delete process.env.ECON_CALENDAR_MOCK;
    process.env.ECON_CALENDAR_PROVIDERS = "forexfactory";
    const store = createMemStore();
    await store.replace("div", ["SBER"], parseDividends(DIV_SBER, sber));
    _setCorpStore(store);
    const asOf = Date.UTC(2026, 6, 10, 12);
    const withCorp = await getCalendarRange("2026-07-15", "2026-07-20", asOf, { moex: false, agro: false });
    assert.equal(withCorp.corp, true);
    assert.ok(withCorp.events.some((e) => e.category === "corp" && e.event.startsWith("Дивиденды: Сбер Банк (SBER)")));
    const without = await getCalendarRange("2026-07-15", "2026-07-20", asOf, { moex: false, agro: false, corp: false });
    assert.equal(without.corp, false);
    assert.ok(!without.events.some((e) => e.category === "corp"));
    delete process.env.ECON_CALENDAR_PROVIDERS;
    _resetCorp();
    _resetCalendarCache();
  });

  console.log(`\nall ${n} checks passed`);
}

/* ───────────── optional: live probe of the real API (server) ───────────── */

async function live() {
  const args = process.argv.slice(2);
  const envFile = args.includes("--env") ? args[args.indexOf("--env") + 1] : "";
  if (envFile) {
    try {
      for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*(TINKOFF_READONLY_TOKEN|TINKOFF_TOKEN|DATABASE_URL)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      console.log(`cannot read ${envFile}`);
    }
  }
  const token = (process.env.TINKOFF_READONLY_TOKEN || process.env.TINKOFF_TOKEN || "").trim();
  if (!token) {
    console.log("no TINKOFF_READONLY_TOKEN / TINKOFF_TOKEN: nothing to probe");
    process.exit(2);
  }
  const base = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.InstrumentsService";
  const post = async (m: string, b: object) => {
    const r = await fetch(`${base}/${m}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(b) });
    const t = await r.text();
    let j: unknown = null;
    try {
      j = JSON.parse(t);
    } catch {}
    return { status: r.status, rl: r.headers.get("x-ratelimit-remaining"), j, size: t.length };
  };
  const show = (x: unknown, k: string) => JSON.stringify((((x as Record<string, unknown[]>) ?? {})[k] ?? []).slice?.(0, 2) ?? x).slice(0, 700);
  console.log("LIVE probe (token not shown)");
  const sh = await post("Shares", { instrumentStatus: "INSTRUMENT_STATUS_BASE" });
  const shares = parseShares(sh.j);
  console.log(`Shares: HTTP ${sh.status}, ${sh.size} bytes, ${shares.size} TQBR shares, rate-limit remaining ${sh.rl}`);
  const sb = shares.get("SBER");
  const nowMs = Date.now();
  const win = { from: new Date(nowMs - 400 * 86_400_000).toISOString(), to: new Date(nowMs + 400 * 86_400_000).toISOString() };
  if (sb) {
    const d = await post("GetDividends", { instrumentId: sb.uid, ...win });
    console.log(`GetDividends SBER: HTTP ${d.status}`, show(d.j, "dividends"));
    const r = await post("GetAssetReports", { instrumentId: sb.uid, ...win });
    console.log(`GetAssetReports SBER: HTTP ${r.status}`, show(r.j, "events"));
  }
  const bd = await post("Bonds", { instrumentStatus: "INSTRUMENT_STATUS_BASE" });
  const bonds = parseBonds(bd.j);
  console.log(`Bonds: HTTP ${bd.status}, ${bd.size} bytes, ${[...bonds.values()].filter((b) => b.ofz).length} OFZ (TQOB), ${[...bonds.values()].filter((b) => !b.ofz).length} corporate (TQCB)`);
  const o = [...bonds.values()].find((b) => b.ofz && /26238/.test(b.name)) ?? [...bonds.values()].find((b) => b.ofz);
  if (o) {
    const c = await post("GetBondCoupons", { instrumentId: o.uid, ...win });
    console.log(`GetBondCoupons ${o.name}: HTTP ${c.status}`, show(c.j, "events"));
  }
  if (args.includes("--refresh")) {
    const { createPrismaStore } = await import("../src/lib/calendar/corporate");
    const rep = await refreshCorporate({ token, fetchImpl: fetch, store: createPrismaStore(), log: (l) => console.log(l) });
    console.log("refresh:", JSON.stringify(rep));
    process.exit(rep.ok ? 0 : 1);
  }
}

(process.argv.includes("--live") ? live() : main()).catch((e) => {
  console.log(`FAIL ${e instanceof Error ? e.stack : e}`);
  process.exit(1);
});
