/* Risk calculator (/calculator): the shared position-size math (src/lib/futures-calc.ts), number parsing, direction, the remembered inputs, the links
   from the terminal, the copy text, and that the site page and the app screen both use the one function.
   Run: npx tsx scripts/check-futures-calc.ts   (exit code 1 on a failed assertion) */
import { readFileSync } from "node:fs";
import {
  CALC_SAVE_KEY,
  calcPosition,
  calcTickerFor,
  calculatorHref,
  fmtRub,
  manualParams,
  mergeStart,
  normNum,
  parseCalcQuery,
  parseManual,
  parseNum,
  parseSaved,
  parseSpecCache,
  resultText,
  takeOnWrongSide,
  tradeSide,
  type CalcInputs,
  type SpecParams,
} from "../src/lib/futures-calc";
import { ru, en, cn } from "../src/lib/i18n/dictionaries";
import appcalc from "../src/lib/i18n/dict/appcalc";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

// --- the reference: the site page's original useMemo body, copied verbatim from before the extraction -----------------------
function reference(spec: SpecParams, deposit: string, entry: string, stop: string, take: string, riskPercent: number) {
  const blank = (error: string) => ({ error, contracts: 0, actualRisk: 0, riskBudget: 0, riskPerContract: 0, requiredMargin: 0, marginShort: false, potentialProfit: null, rr: null });
  const dep = parseFloat(deposit);
  const en = parseFloat(entry);
  const st = parseFloat(stop);
  const tk = parseFloat(take);
  if (!dep || dep <= 0) return blank("calc.err.deposit");
  if (!en || !st) return blank("calc.err.entryStop");
  const priceRisk = Math.abs(en - st);
  if (priceRisk === 0) return blank("calc.err.stopEqEntry");
  if (!spec.minStep || !spec.stepPrice) return blank("calc.err.noStep");
  const tickValue = spec.stepPrice / spec.minStep;
  const riskBudget = dep * (riskPercent / 100);
  const riskPerContract = priceRisk * tickValue;
  const contracts = Math.floor(riskBudget / riskPerContract);
  const actualRisk = contracts * riskPerContract;
  const requiredMargin = contracts * spec.initialMargin;
  const marginShort = contracts > 0 && requiredMargin > dep;
  let potentialProfit: number | null = null;
  let rr: number | null = null;
  if (tk && !isNaN(tk)) {
    const priceReward = Math.abs(tk - en);
    potentialProfit = contracts * priceReward * tickValue;
    rr = priceReward / priceRisk;
  }
  return { error: null, contracts, actualRisk, riskBudget, riskPerContract, requiredMargin, marginShort, potentialProfit, rr };
}

// MOEX-like numbers: Si (USD/RUB) step 1, step price 1 RUB, GO 14 000; BR step 0.01, step price 7.78, GO 22 000; RTS step 10, 13.2, GO 55 000
const SI: SpecParams = { minStep: 1, stepPrice: 1, initialMargin: 14000 };
const BR: SpecParams = { minStep: 0.01, stepPrice: 7.78, initialMargin: 22000 };
const RTS: SpecParams = { minStep: 10, stepPrice: 13.2, initialMargin: 55000 };
const CASES: { name: string; spec: SpecParams; deposit: string; entry: string; stop: string; take: string; risk: number }[] = [
  { name: "Si long, 1%", spec: SI, deposit: "1000000", entry: "94200", stop: "93900", take: "95100", risk: 1 },
  { name: "Si short, 2%, no take", spec: SI, deposit: "500000", entry: "94200", stop: "94650", take: "", risk: 2 },
  { name: "BR long, 0.5%", spec: BR, deposit: "300000", entry: "78.40", stop: "77.95", take: "79.85", risk: 0.5 },
  { name: "RTS tight deposit: margin short", spec: RTS, deposit: "100000", entry: "112000", stop: "111500", take: "113500", risk: 2 },
  { name: "BR: risk too big for one contract", spec: BR, deposit: "20000", entry: "78.40", stop: "75.00", take: "", risk: 1 },
  { name: "BR: take on the other side (the site uses |take - entry|)", spec: BR, deposit: "1000000", entry: "78.40", stop: "77.95", take: "77.00", risk: 1 },
];
console.log("case: contracts | actual risk | margin | profit | R:R");
for (const c of CASES) {
  const inp: CalcInputs = { deposit: c.deposit, entry: c.entry, stop: c.stop, take: c.take, riskPercent: c.risk };
  const want = reference(c.spec, c.deposit, c.entry, c.stop, c.take, c.risk);
  const got = calcPosition(c.spec, inp);
  eq(`same as the site page's original formula: ${c.name}`, got, want);
  console.log(`     ${got.contracts} | ${Math.round(got.actualRisk)} | ${Math.round(got.requiredMargin)} | ${got.potentialProfit == null ? "-" : Math.round(got.potentialProfit)} | ${got.rr == null ? "-" : got.rr.toFixed(2)}${got.marginShort ? " | margin short" : ""}`);
}
// by hand: Si, 1 000 000 x 1% = 10 000 risk, 300 points x 1 RUB = 300 per contract -> 33 contracts, 9 900 actual, GO 462 000, profit 33 x 900 = 29 700, R:R 3
const hand = calcPosition(SI, { deposit: "1000000", entry: "94200", stop: "93900", take: "95100", riskPercent: 1 });
eq("Si long by hand", { contracts: hand.contracts, actualRisk: hand.actualRisk, requiredMargin: hand.requiredMargin, potentialProfit: hand.potentialProfit, rr: hand.rr }, { contracts: 33, actualRisk: 9900, requiredMargin: 462000, potentialProfit: 29700, rr: 3 });

// errors, in the site's order
const base: CalcInputs = { deposit: "100000", entry: "100", stop: "99", take: "", riskPercent: 1 };
eq(
  "errors: deposit / entry-stop / stop = entry / no step",
  [
    calcPosition(SI, { ...base, deposit: "" }).error,
    calcPosition(SI, { ...base, stop: "" }).error,
    calcPosition(SI, { ...base, stop: "100" }).error,
    calcPosition({ minStep: 0, stepPrice: 1, initialMargin: 1 }, base).error,
  ],
  ["calc.err.deposit", "calc.err.entryStop", "calc.err.stopEqEntry", "calc.err.noStep"],
);

// --- typing ------------------------------------------------------------------------------------------------------------------------
eq("a decimal comma and spaces are read", [parseNum("94,25"), parseNum("1 000 000"), parseNum("78.4"), normNum("1 234,5")], [94.25, 1000000, 78.4, "1234.5"]);
eq("typed comma gives the same result as a point", calcPosition(BR, { ...base, entry: "78,40", stop: "77,95" }), calcPosition(BR, { ...base, entry: "78.40", stop: "77.95" }));
eq("junk is NaN, not a crash", [Number.isNaN(parseNum("")), Number.isNaN(parseNum("abc"))], [true, true]);

// --- direction -------------------------------------------------------------------------------------------------------------------
eq("direction: stop below = long, above = short, equal / empty = none", [tradeSide("100", "99"), tradeSide("100", "101"), tradeSide("100", "100"), tradeSide("", "99")], ["long", "short", null, null]);
eq(
  "take on the wrong side",
  [takeOnWrongSide("long", "100", "99"), takeOnWrongSide("long", "100", "103"), takeOnWrongSide("short", "100", "103"), takeOnWrongSide("short", "100", "97"), takeOnWrongSide(null, "100", "97"), takeOnWrongSide("long", "100", "")],
  [true, false, true, false, false, false],
);

// --- terminal link ------------------------------------------------------------------------------------------------------------
eq("calcTickerFor: MOEX futures only", [calcTickerFor("moex", "Si"), calcTickerFor("moex", "SBER"), calcTickerFor("bybit", "Si"), calcTickerFor("fmp", "GOLD"), calcTickerFor("moex", "RTS")], ["Si", null, null, null, "RTS"]);
eq(
  "calculatorHref",
  [calculatorHref("ru", { ticker: "Si", entry: 94.2, from: "terminal" }), calculatorHref("en", {}), calculatorHref("cn", { ticker: "BR", entry: NaN })],
  ["/calculator?ticker=Si&entry=94.2&from=terminal", "/en/calculator", "/zh/calculator?ticker=BR"],
);
eq("parseCalcQuery", [parseCalcQuery("?ticker=Si&entry=94.2&from=terminal"), parseCalcQuery("?ticker=ZZ&entry=-3&from=x"), parseCalcQuery(""), parseCalcQuery("?entry=94,2")], [
  { ticker: "Si", entry: "94.2", from: "terminal" },
  { ticker: null, entry: null, from: null },
  { ticker: null, entry: null, from: null },
  { ticker: null, entry: "94.2", from: null },
]);

// --- remembered inputs -------------------------------------------------------------------------------------------------------
const saved = parseSaved(JSON.stringify({ ticker: "BR", deposit: "300000", entry: "78.4", stop: "77.95", take: "79.85", riskPercent: 0.5 }));
eq("parseSaved keeps what was saved", saved, { ticker: "BR", deposit: "300000", entry: "78.4", stop: "77.95", take: "79.85", riskPercent: 0.5 });
eq(
  "parseSaved is junk-safe",
  [parseSaved(null), parseSaved("{"), parseSaved('{"ticker":"ZZ","deposit":"<b>","riskPercent":-5}'), parseSaved("[1]")].map((s) => [s.ticker, s.deposit, s.riskPercent]),
  [[null, "", 1], [null, "", 1], [null, "", 1], [null, "", 1]],
);
eq("from the terminal: the symbol and price win, the old stop / take of another symbol go", mergeStart(saved, { ticker: "Si", entry: "94200", from: "terminal" }), { ...saved, ticker: "Si", entry: "94200", stop: "", take: "" });
eq("from the terminal, same symbol, new price: stop / take belong to the old price", mergeStart(saved, { ticker: "BR", entry: "80", from: "terminal" }), { ...saved, entry: "80", stop: "", take: "" });
eq("a visit without a symbol keeps the remembered inputs", mergeStart(saved, { ticker: null, entry: null, from: null }), saved);
eq(
  "spec cache: valid kept, junk and unknown tickers dropped",
  Object.keys(
    parseSpecCache(
      JSON.stringify({
        Si: { ticker: "Si", secid: "SiZ6", shortname: "Si-12.26", expiry: "2026-12-17", minStep: 1, stepPrice: 1, initialMargin: 14000, last: 94200, bid: null, offer: null, fetchedAt: 1 },
        BR: { ticker: "BR", secid: "BRZ6", minStep: "x" },
        ZZ: { ticker: "ZZ" },
      }),
    ),
  ),
  ["Si"],
);
eq(
  "manual spec",
  [parseManual('{"on":true,"minStep":"0,01","stepPrice":"7.78","margin":"22 000"}'), manualParams(parseManual('{"on":true,"minStep":"0,01","stepPrice":"7.78","margin":"22000"}')), manualParams(parseManual(null))],
  [
    { on: true, minStep: "0,01", stepPrice: "7.78", margin: "22 000" },
    { minStep: 0.01, stepPrice: 7.78, initialMargin: 22000 },
    { minStep: 0, stepPrice: 0, initialMargin: 0 },
  ],
);
eq(
  "manual math equals the live math for the same numbers",
  calcPosition(manualParams(parseManual('{"on":true,"minStep":"0.01","stepPrice":"7.78","margin":"22000"}')), { ...base, entry: "78.4", stop: "77.95" }),
  calcPosition(BR, { ...base, entry: "78.4", stop: "77.95" }),
);

// --- copy text ------------------------------------------------------------------------------------------------------------------
const tr = (k: string, v?: Record<string, string | number>) => (ru[k] ?? k).replace(/\{(\w+)\}/g, (_m, n) => String(v?.[n] ?? ""));
const inp: CalcInputs = { deposit: "1000000", entry: "94200", stop: "93900", take: "95100", riskPercent: 1 };
const txt = resultText({ t: tr, locale: "ru", name: "Доллар/Рубль", contract: "SiZ6", inputs: inp, calc: calcPosition(SI, inp), side: "long", sideLabel: "Лонг" });
eq("copy text names the contract, the inputs and the result", [txt.split("\n").length, txt.includes("SiZ6"), txt.includes("33"), txt.includes("1 : 3.00"), txt.includes("Лонг")], [8, true, true, true, true]);
eq("copy text is empty until the numbers are usable", resultText({ t: tr, locale: "ru", name: "", contract: "", inputs: { ...inp, deposit: "" }, calc: calcPosition(SI, { ...inp, deposit: "" }), side: null }), "");
eq("rubles", fmtRub(462000, "ru").replace(/\s/g, " "), "462 000 ₽");

// --- i18n and wiring -----------------------------------------------------------------------------------------------------------
eq("appcalc: the same keys in ru / en / cn", [Object.keys(appcalc.en).filter((k) => !(k in appcalc.ru)), Object.keys(appcalc.cn).filter((k) => !(k in appcalc.ru)), Object.keys(appcalc.ru).filter((k) => !(k in appcalc.en) || !(k in appcalc.cn))], [[], [], []]);
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const used = [...src("src/components/app/calculator/AppCalculator.tsx").matchAll(/\bt\(\s*"([a-z0-9.]+)"/gi), ...src("src/lib/futures-calc.ts").matchAll(/\bt\(\s*"([a-z0-9.]+)"/gi)].map((m) => m[1]);
const all = { ru: { ...ru }, en: { ...en }, cn: { ...cn } };
for (const d of [appcalc]) for (const l of ["ru", "en", "cn"] as const) Object.assign(all[l], d[l]);
eq("every key the app screen uses is known (the bundled dictionaries or appcalc) in all three languages", [...new Set(used)].filter((k) => !(k in all.ru) || !(k in all.en) || !(k in all.cn)), []);
eq("the site page and the app screen call the one calcPosition", [
  /calcPosition\(spec,/.test(src("src/app/(main)/calculator/page.tsx")),
  /calcPosition\(params,/.test(src("src/components/app/calculator/AppCalculator.tsx")),
  /priceRisk|tickValue/.test(src("src/app/(main)/calculator/page.tsx")),
  /priceRisk|tickValue/.test(src("src/components/app/calculator/AppCalculator.tsx")),
], [true, true, false, false]);
eq("/calculator mounts the app screen only through the app-UI switch", /useAppUi\(\)[\s\S]*AppCalculator/.test(src("src/app/(main)/calculator/page.tsx")), true);
eq("localStorage key", CALC_SAVE_KEY, "fomo-calc-v1");

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
