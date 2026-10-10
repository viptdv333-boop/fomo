// Pure logic of the futures risk calculator (/calculator): the position-size math, number parsing, the remembered inputs, the
// copy-result text and the links into the calculator. No React, no DOM, no fetch: the site page (src/app/(main)/calculator/page.tsx) and the
// app screen (src/components/app/calculator/AppCalculator.tsx) both call calcPosition(), so their results can never differ.
// Check: npx tsx scripts/check-futures-calc.ts
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { FUTURES_LIST, type FuturesSpec } from "@/lib/moex-futures-spec";

export const RISK_PRESETS = [0.5, 1, 1.5, 2];

/** The three numbers of a contract the math needs (a FuturesSpec has them; the app screen can also take them by hand when MOEX is out of reach). */
export interface SpecParams {
  minStep: number;
  stepPrice: number;
  initialMargin: number;
}

export interface CalcInputs {
  deposit: string;
  entry: string;
  stop: string;
  take: string;
  riskPercent: number;
}

export interface CalcResult {
  /** dictionary key of the problem (calc.err.*), null when the numbers are usable */
  error: string | null;
  contracts: number;
  actualRisk: number;
  riskBudget: number;
  riskPerContract: number;
  requiredMargin: number;
  marginShort: boolean;
  potentialProfit: number | null;
  rr: number | null;
}

const LOCALES: Record<string, string> = { ru: "ru-RU", en: "en-US", cn: "zh-CN" };

/** BCP-47 tag of an app language ("ru" / "en" / "cn"). */
export function intlLocale(locale: string): string {
  return LOCALES[locale] || "ru-RU";
}

export function fmtRub(n: number, locale: string = "ru"): string {
  const fmt = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 });
  return `${fmt.format(Math.round(n))} ₽`;
}

/** "1 234,5" / "1,234.5"-less typing -> "1234.5": spaces dropped, a decimal comma becomes a point. The site's <input type=number> never needs it. */
export function normNum(s: string): string {
  return String(s ?? "").replace(/[\s ]/g, "").replace(",", ".");
}

/** parseFloat of a typed number (NaN when it is not one). */
export function parseNum(s: string): number {
  return parseFloat(normNum(s));
}

/**
 * How many contracts fit the risk, and what that means: the site's formula, unchanged.
 *   tick value = step price / min step; risk per contract = |entry - stop| * tick value;
 *   contracts = floor(deposit * risk% / risk per contract); margin = contracts * initial margin; reward = |take - entry|.
 */
export function calcPosition(spec: SpecParams, inp: CalcInputs): CalcResult {
  const blank = (error: string): CalcResult => ({
    error,
    contracts: 0,
    actualRisk: 0,
    riskBudget: 0,
    riskPerContract: 0,
    requiredMargin: 0,
    marginShort: false,
    potentialProfit: null,
    rr: null,
  });

  const dep = parseNum(inp.deposit);
  const en = parseNum(inp.entry);
  const st = parseNum(inp.stop);
  const tk = parseNum(inp.take);

  if (!dep || dep <= 0) return blank("calc.err.deposit");
  if (!en || !st) return blank("calc.err.entryStop");
  const priceRisk = Math.abs(en - st);
  if (priceRisk === 0) return blank("calc.err.stopEqEntry");
  if (!spec.minStep || !spec.stepPrice) return blank("calc.err.noStep");

  const tickValue = spec.stepPrice / spec.minStep;
  const riskBudget = dep * (inp.riskPercent / 100);
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

// ---------------------------------------------------------------------------------------------------------------------
// Direction (the app screen shows it; the math above does not need it: it works with |entry - stop|)
// ---------------------------------------------------------------------------------------------------------------------

export type TradeSide = "long" | "short";

/** The stop below the entry is a long, above it a short; equal or not a number -> null. */
export function tradeSide(entry: string, stop: string): TradeSide | null {
  const en = parseNum(entry);
  const st = parseNum(stop);
  if (!en || !st || en === st) return null;
  return st < en ? "long" : "short";
}

/** The take-profit lies on the losing side of the entry for this direction (a typo worth a warning). false when there is no take or no direction. */
export function takeOnWrongSide(side: TradeSide | null, entry: string, take: string): boolean {
  const en = parseNum(entry);
  const tk = parseNum(take);
  if (!side || !en || !tk || tk === en) return false;
  return side === "long" ? tk < en : tk > en;
}

// ---------------------------------------------------------------------------------------------------------------------
// Instruments
// ---------------------------------------------------------------------------------------------------------------------

/** The calculator's ticker (a key of FUTURES_LIST) for a terminal symbol, or null when the calculator has no such future (stocks, crypto, forex ...). */
export function calcTickerFor(source: string, dataTicker: string): string | null {
  if (source !== "moex") return null;
  return FUTURES_LIST.some((i) => i.ticker === dataTicker) ? dataTicker : null;
}

/** Link into the calculator with the symbol (and the entry price) filled in; `from` names the screen the Back chevron leads to. */
export function calculatorHref(locale: Locale, opts: { ticker?: string | null; entry?: number | null; from?: "terminal" } = {}): string {
  const q = new URLSearchParams();
  if (opts.ticker) q.set("ticker", opts.ticker);
  if (opts.entry != null && Number.isFinite(opts.entry) && opts.entry > 0) q.set("entry", String(opts.entry));
  if (opts.from) q.set("from", opts.from);
  const s = q.toString();
  return localizedPath(locale, "/calculator") + (s ? `?${s}` : "");
}

export interface CalcQuery {
  ticker: string | null;
  entry: string | null;
  from: "terminal" | null;
}

/** ?ticker=Si&entry=94.2&from=terminal (anything unknown is dropped). */
export function parseCalcQuery(search: string): CalcQuery {
  let q: URLSearchParams;
  try {
    q = new URLSearchParams(search || "");
  } catch {
    q = new URLSearchParams();
  }
  const ticker = q.get("ticker");
  const entry = q.get("entry");
  const n = entry == null ? NaN : parseNum(entry);
  return {
    ticker: ticker && FUTURES_LIST.some((i) => i.ticker === ticker) ? ticker : null,
    entry: Number.isFinite(n) && n > 0 ? String(n) : null,
    from: q.get("from") === "terminal" ? "terminal" : null,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Remembered inputs and the last contract specs (localStorage; every reader is junk-safe)
// ---------------------------------------------------------------------------------------------------------------------

export const CALC_SAVE_KEY = "fomo-calc-v1";
export const CALC_SPEC_KEY = "fomo-calc-spec-v1";

export interface SavedCalc {
  ticker: string | null;
  deposit: string;
  entry: string;
  stop: string;
  take: string;
  riskPercent: number;
}

export const EMPTY_SAVED: SavedCalc = { ticker: null, deposit: "", entry: "", stop: "", take: "", riskPercent: 1 };

const numStr = (v: unknown): string => (typeof v === "string" && v.length <= 24 && /^[0-9.,\s-]*$/.test(v) ? v : "");

export function parseSaved(raw: string | null | undefined): SavedCalc {
  try {
    const o = JSON.parse(raw || "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object") return { ...EMPTY_SAVED };
    const risk = typeof o.riskPercent === "number" && Number.isFinite(o.riskPercent) && o.riskPercent > 0 && o.riskPercent <= 100 ? o.riskPercent : 1;
    return {
      ticker: typeof o.ticker === "string" && FUTURES_LIST.some((i) => i.ticker === o.ticker) ? o.ticker : null,
      deposit: numStr(o.deposit),
      entry: numStr(o.entry),
      stop: numStr(o.stop),
      take: numStr(o.take),
      riskPercent: risk,
    };
  } catch {
    return { ...EMPTY_SAVED };
  }
}

/** The inputs of a visit that came from the terminal win over the remembered ones; a different symbol drops the old stop / take (they belong to the old price). */
export function mergeStart(saved: SavedCalc, q: CalcQuery): SavedCalc {
  if (!q.ticker) return saved;
  const sameTicker = saved.ticker === q.ticker;
  return {
    ...saved,
    ticker: q.ticker,
    entry: q.entry ?? (sameTicker ? saved.entry : ""),
    stop: sameTicker && !q.entry ? saved.stop : "",
    take: sameTicker && !q.entry ? saved.take : "",
  };
}

export const CALC_MANUAL_KEY = "fomo-calc-manual-v1";

/** Contract numbers typed by hand (the app screen, when MOEX cannot be reached): on / off and the three values. */
export interface ManualSpec {
  on: boolean;
  minStep: string;
  stepPrice: string;
  margin: string;
}

export const EMPTY_MANUAL: ManualSpec = { on: false, minStep: "", stepPrice: "", margin: "" };

export function parseManual(raw: string | null | undefined): ManualSpec {
  try {
    const o = JSON.parse(raw || "null") as Record<string, unknown> | null;
    if (!o || typeof o !== "object") return { ...EMPTY_MANUAL };
    return { on: o.on === true, minStep: numStr(o.minStep), stepPrice: numStr(o.stepPrice), margin: numStr(o.margin) };
  } catch {
    return { ...EMPTY_MANUAL };
  }
}

/** The numbers the math needs out of the typed ones (0 where a field is empty or junk: calcPosition then says «no step data»). */
export function manualParams(m: ManualSpec): SpecParams {
  const n = (s: string) => {
    const v = parseNum(s);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return { minStep: n(m.minStep), stepPrice: n(m.stepPrice), initialMargin: n(m.margin) };
}

type StoredSpec = Pick<FuturesSpec, "ticker" | "secid" | "shortname" | "expiry" | "minStep" | "stepPrice" | "initialMargin" | "last" | "bid" | "offer" | "fetchedAt">;

function validSpec(v: unknown): v is StoredSpec {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const nul = (x: unknown) => x === null || num(x);
  return (
    typeof s.ticker === "string" &&
    typeof s.secid === "string" &&
    typeof s.shortname === "string" &&
    typeof s.expiry === "string" &&
    num(s.minStep) &&
    num(s.stepPrice) &&
    num(s.initialMargin) &&
    nul(s.last) &&
    nul(s.bid) &&
    nul(s.offer) &&
    num(s.fetchedAt)
  );
}

/** ticker -> the last spec MOEX answered with (what the screen falls back to without a network). */
export function parseSpecCache(raw: string | null | undefined): Record<string, FuturesSpec> {
  try {
    const o = JSON.parse(raw || "null") as Record<string, unknown> | null;
    const out: Record<string, FuturesSpec> = {};
    if (!o || typeof o !== "object") return out;
    for (const [k, v] of Object.entries(o)) if (FUTURES_LIST.some((i) => i.ticker === k) && validSpec(v)) out[k] = v as FuturesSpec;
    return out;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// «Copy the result»
// ---------------------------------------------------------------------------------------------------------------------

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** A plain-text summary of a calculation for the clipboard (messengers, the trading journal). Empty when the numbers are not usable yet. */
export function resultText(p: { t: Tr; locale: string; name: string; contract: string; inputs: CalcInputs; calc: CalcResult; side: TradeSide | null; sideLabel?: string }): string {
  const { t, locale, calc, inputs } = p;
  if (calc.error) return "";
  const head = [p.name, p.contract].filter(Boolean).join(" · ");
  // field labels carry units / hints for the form ("Размер депозита, ₽", "Тейк (необязательно)"): the clipboard text does not need them
  const lbl = (key: string) => t(key).replace(/\s*[,，]\s*₽\s*$/, "").replace(/\s*[(（][^)）]*[)）]\s*$/, "");
  const lines = [
    `${t("nav.calculator")}: ${head}${p.sideLabel ? ` (${p.sideLabel})` : ""}`,
    `${lbl("calc.deposit")}: ${fmtRub(parseNum(inputs.deposit), locale)} · ${t("calc.riskPerTrade")}: ${inputs.riskPercent}%`,
    `${t("calc.entry")}: ${normNum(inputs.entry)} · ${t("calc.stop")}: ${normNum(inputs.stop)}${inputs.take.trim() ? ` · ${lbl("calc.take")}: ${normNum(inputs.take)}` : ""}`,
    `${t("calc.contracts")} ${calc.contracts}`,
  ];
  if (calc.contracts > 0) {
    lines.push(`${t("calc.actualRisk")}: ${fmtRub(calc.actualRisk, locale)} (${t("calc.riskLimit", { pct: inputs.riskPercent })}: ${fmtRub(calc.riskBudget, locale)})`);
    lines.push(`${t("calc.requiredMargin")}: ${fmtRub(calc.requiredMargin, locale)}`);
    if (calc.potentialProfit != null && calc.rr != null) {
      lines.push(`${t("calc.potentialProfit")}: ${fmtRub(calc.potentialProfit, locale)}`);
      lines.push(`${t("calc.rr")}: 1 : ${calc.rr.toFixed(2)}`);
    }
  } else {
    lines.push(t("calc.tooRisky", { perContract: fmtRub(calc.riskPerContract, locale), budget: fmtRub(calc.riskBudget, locale) }));
  }
  return lines.join("\n");
}
