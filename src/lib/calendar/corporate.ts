import { eventId } from "./normalize";
import type { CalEvent } from "./types";

/*
 * CORPORATE EVENTS LAYER (category "corp", country RU), merged into every calendar answer next to the MOEX and commodity layers:
 *   - dividends of liquid Moscow Exchange shares (last day to buy / record date, amount, yield),
 *   - bond coupons (OFZ + the most liquid corporate bonds), aggregated per day,
 *   - reporting dates of the same shares.
 *
 * SOURCE: the T-Invest (ex Tinkoff Invest) API, REST gateway invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1.*
 * (contract: github.com/RussianInvestments/investAPI, src/docs/contracts/instruments.proto), all calls are InstrumentsService:
 *   Shares / Bonds           the instrument lists (ticker, classCode, uid, isin, name, nominal ...)       1 call each
 *   GetDividends             {instrumentId, from, to} filtered by record_date                            1 call per share
 *   GetAssetReports          {instrumentId = instrument uid, from, to}: upcoming report dates             1 call per share
 *   GetBondCoupons           {instrumentId, from, to} filtered by coupon_date                            1 call per bond
 * The token is read from process.env.TINKOFF_READONLY_TOKEN || TINKOFF_TOKEN at call time, goes into the Authorization header only
 * and is never logged or stored. The liquidity ranking (which shares / corporate bonds are in scope) comes from the public MOEX ISS
 * (VALTODAY_RUR of TQBR / TQCB); OFZ are all instruments of the T-Invest class TQOB.
 *
 * BUDGET: the Instruments service allows 200 unary calls per minute for the whole token (docs: limits.md); a refresh is paced at one
 * call per ~700 ms (about 85 / min, so the quote route that shares the budget keeps room), 429 waits for the reset and retries.
 * Default scope: 150 shares (2 calls each), all OFZ (~60) and the 100 most liquid corporate bonds -> ~2 + 300 + 60 + 100 = ~460 calls,
 * about 5.5 minutes in the background, at most every 6 hours.
 *
 * CACHE: rows are kept in memory and in the Prisma table CorporateEvent (idempotent migration 20261004193000_corporate_events), so a
 * restart or a second pm2 instance does not call the API again within 6 hours. A calendar request NEVER waits for a refresh: it
 * serves the cached rows and, when they are older than 6 h, starts one background refresh (stale-while-revalidate, one in flight).
 * Without a token nothing is fetched and the layer only shows what the table already holds.
 * Failure of the table (not migrated yet) degrades to a process-lifetime in-memory store.
 */

export type CorpLang = "ru" | "en" | "cn";
export type CorpKind = "div" | "coupon" | "report";

/** One cached fact. date = the event day (YYYY-MM-DD, Moscow calendar day of the source timestamp). */
export interface CorpRow {
  id: string;
  kind: CorpKind;
  ticker: string;
  name: string;
  date: string;
  amount: number | null;
  currency: string | null;
  extra: Record<string, unknown>;
}

/* ───────────── tunables ───────────── */

export const REFRESH_MS = 6 * 3_600_000;
const RETRY_MS = 30 * 60_000; // after a failed / aborted refresh
const RELOAD_MS = 5 * 60_000; // re-read the table (another instance may have refreshed it)
const FIRST_LOAD_TIMEOUT_MS = 3000;
export const CALL_GAP_MS = 700;
export const SHARES_LIMIT = 150;
export const CORP_BONDS_LIMIT = 100;
export const BLUE_CHIPS = 20; // top-N of the liquidity ranking: importance 3
export const TOP_REPORTS = 50; // reports of the top-N shares: importance 2, the others 1
const DIV_IMPORTANCE = { blue: 3, other: 2 } as const;
const COUPON_IMPORTANCE = 1;
const MAX_LIST_LINES = 40;
const T_BASE = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const ISS = "https://iss.moex.com/iss/engines/stock/markets";

/** Fallback scope when the ISS ranking is unreachable (liquid blue chips, in a rough order of turnover). */
export const STATIC_BLUE = ["SBER", "GAZP", "LKOH", "ROSN", "GMKN", "NVTK", "YDEX", "T", "TATN", "SNGS", "MTSS", "MGNT", "PLZL", "CHMF", "NLMK", "ALRS", "VTBR", "MOEX", "PHOR", "AFLT", "SBERP", "TATNP", "SNGSP", "IRAO", "HYDR", "SIBN", "TRNFP", "PIKK", "RUAL", "CBOM", "OZON", "FLOT", "MAGN", "AFKS", "BSPB", "ENPG", "FEES", "POLY", "UPRO", "LSRG"];

/* ───────────── small helpers ───────────── */

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** REST MoneyValue / Quotation {units: "33", nano: 300000000} -> 33.3 (null when absent). */
export function moneyOf(v: unknown): { value: number; currency: string } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as { units?: unknown; nano?: unknown; currency?: unknown };
  const units = num(o.units ?? 0);
  const nano = num(o.nano ?? 0);
  if (units === null || nano === null) return null;
  return { value: units + nano / 1e9, currency: typeof o.currency === "string" ? o.currency.toUpperCase() : "" };
}

const MSK_MS = 3 * 3_600_000;
/** ISO timestamp of the API -> the Moscow calendar day (handles both 00:00Z and 21:00Z of the day before). null when unusable. */
export function mskDay(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.UTC(2100, 0, 1)) return null;
  return new Date(t + MSK_MS).toISOString().slice(0, 10);
}

const CUR: Record<string, string> = { RUB: "₽", USD: "$", EUR: "€", CNY: "¥", HKD: "HK$" };

/** 33.3 -> «33,3», 1234.5 -> «1 234,5», 0.0145 -> «0,0145» (ru) / «33.3» (en). */
export function fmtNum(n: number, lang: CorpLang = "ru"): string {
  const a = Math.abs(n);
  const digits = a >= 100 ? 2 : a >= 1 ? 2 : 4;
  let s = n.toFixed(digits);
  if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
  const [i, f] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, lang === "ru" ? " " : ",");
  return f ? `${grouped}${lang === "ru" ? "," : "."}${f}` : grouped;
}

export function fmtMoney(n: number, cur: string | null, lang: CorpLang = "ru"): string {
  const c = (cur || "RUB").toUpperCase();
  const sym = CUR[c];
  if (lang === "ru") return `${fmtNum(n, lang)} ${sym ?? c}`;
  return sym && c !== "RUB" ? `${sym}${fmtNum(n, lang)}` : `${c} ${fmtNum(n, lang)}`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const dmy = (d: string): string => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/* ───────────── API responses -> rows (pure) ───────────── */

export interface ShareInfo {
  ticker: string;
  uid: string;
  figi: string;
  name: string;
  isin: string;
  /** 1-based rank in the liquidity ranking (1 = most traded), 0 when unknown */
  rank: number;
}
export interface BondInfo {
  ticker: string;
  uid: string;
  figi: string;
  name: string;
  isin: string;
  classCode: string;
  ofz: boolean;
  nominal: number;
  perQuarterYear: number;
  floating: boolean;
  maturity: string | null;
}

const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** InstrumentsService/Shares answer -> TQBR shares by ticker. */
export function parseShares(body: unknown): Map<string, Omit<ShareInfo, "rank">> {
  const out = new Map<string, Omit<ShareInfo, "rank">>();
  for (const i of arr((body as { instruments?: unknown } | null)?.instruments)) {
    const ticker = str(i.ticker);
    if (!ticker || str(i.classCode).toUpperCase() !== "TQBR" || out.has(ticker)) continue;
    const uid = str(i.uid);
    if (!uid) continue;
    out.set(ticker, { ticker, uid, figi: str(i.figi), name: str(i.name) || ticker, isin: str(i.isin) });
  }
  return out;
}

/** InstrumentsService/Bonds answer -> OFZ (TQOB) and corporate (TQCB) bonds by ISIN; matured and perpetual-less junk is kept out by the caller. */
export function parseBonds(body: unknown): Map<string, BondInfo> {
  const out = new Map<string, BondInfo>();
  for (const i of arr((body as { instruments?: unknown } | null)?.instruments)) {
    const cc = str(i.classCode).toUpperCase();
    if (cc !== "TQOB" && cc !== "TQCB") continue;
    const isin = str(i.isin);
    const ticker = str(i.ticker);
    const uid = str(i.uid);
    if (!isin || !ticker || !uid || out.has(isin)) continue;
    out.set(isin, {
      ticker,
      uid,
      figi: str(i.figi),
      name: str(i.name) || ticker,
      isin,
      classCode: cc,
      ofz: cc === "TQOB",
      nominal: moneyOf(i.nominal)?.value ?? 0,
      perQuarterYear: num(i.couponQuantityPerYear) ?? 0,
      floating: i.floatingCouponFlag === true,
      maturity: mskDay(i.maturityDate),
    });
  }
  return out;
}

/** GetDividends answer -> rows. Cancelled payments and daily accruals are dropped, so are amounts <= 0. */
export function parseDividends(body: unknown, sh: ShareInfo): CorpRow[] {
  const rows: CorpRow[] = [];
  for (const d of arr((body as { dividends?: unknown } | null)?.dividends)) {
    const type = str(d.dividendType);
    if (/^(cancelled|daily accrual)/i.test(type)) continue;
    const m = moneyOf(d.dividendNet);
    if (!m || !(m.value > 0)) continue;
    const record = mskDay(d.recordDate);
    const lastBuy = mskDay(d.lastBuyDate);
    const date = lastBuy ?? record;
    if (!date) continue;
    const y = moneyOf(d.yieldValue);
    rows.push({
      id: `div:${sh.ticker}:${record ?? date}`,
      kind: "div",
      ticker: sh.ticker,
      name: sh.name,
      date,
      amount: m.value,
      currency: m.currency || "RUB",
      extra: {
        basis: lastBuy ? "lastBuy" : "record",
        record,
        lastBuy,
        pay: mskDay(d.paymentDate),
        declared: mskDay(d.declaredDate),
        type: type || null,
        regularity: str(d.regularity) || null,
        yield: y && y.value > 0 && y.value < 300 ? Math.round(y.value * 100) / 100 : null,
        blue: sh.rank > 0 && sh.rank <= BLUE_CHIPS,
        rank: sh.rank,
      },
    });
  }
  return rows;
}

const PERIOD_TYPE: Record<string, "q" | "h" | "y"> = { PERIOD_TYPE_QUARTER: "q", PERIOD_TYPE_SEMIANNUAL: "h", PERIOD_TYPE_ANNUAL: "y" };

/** GetAssetReports answer -> rows (one per reporting period). */
export function parseReports(body: unknown, sh: ShareInfo): CorpRow[] {
  const rows: CorpRow[] = [];
  for (const r of arr((body as { events?: unknown } | null)?.events)) {
    const date = mskDay(r.reportDate);
    const year = num(r.periodYear);
    const pn = num(r.periodNum);
    if (!date || year === null || year < 2000 || year > 2100) continue;
    const type = PERIOD_TYPE[str(r.periodType)] ?? null;
    const n = pn === null ? 0 : pn;
    rows.push({
      id: `rep:${sh.ticker}:${year}:${type ?? "x"}:${n}`,
      kind: "report",
      ticker: sh.ticker,
      name: sh.name,
      date,
      amount: null,
      currency: null,
      extra: { year, num: n, type, rank: sh.rank },
    });
  }
  return rows;
}

/** GetBondCoupons answer -> rows. The annual rate is derived from the payment, the nominal and the coupon period. */
export function parseCoupons(body: unknown, b: BondInfo): CorpRow[] {
  const rows: CorpRow[] = [];
  for (const c of arr((body as { events?: unknown } | null)?.events)) {
    const date = mskDay(c.couponDate);
    if (!date) continue;
    const m = moneyOf(c.payOneBond);
    const amount = m && m.value > 0 ? m.value : null;
    const period = num(c.couponPeriod) ?? 0;
    const number = num(c.couponNumber) ?? 0;
    let rate: number | null = null;
    if (amount !== null && b.nominal > 0) {
      const ppy = period > 0 ? 365 / period : b.perQuarterYear;
      if (ppy > 0) rate = Math.round(((amount / b.nominal) * ppy * 100) * 10) / 10;
    }
    rows.push({
      id: `cpn:${b.ticker}:${number || date}`,
      kind: "coupon",
      ticker: b.ticker,
      name: b.name,
      date,
      amount,
      currency: m?.currency || "RUB",
      extra: { n: number, rate: rate !== null && rate > 0 && rate < 100 ? rate : null, ofz: b.ofz, floating: b.floating || str(c.couponType) === "COUPON_TYPE_FLOATING", fix: mskDay(c.fixDate), period: period || null, isin: b.isin },
    });
  }
  return rows;
}

/* ───────────── rows -> calendar events (pure) ───────────── */

const T = {
  ru: {
    div: "Дивиденды",
    perShare: "на акцию",
    basisLastBuy: "последний день покупки",
    basisRecord: "закрытие реестра",
    coupon: "Купон",
    couponsOfz: "Купоны ОФЗ",
    couponsCorp: "Купоны корпоративных облигаций",
    issues: ["выпуск", "выпуска", "выпусков"] as const,
    report: "Отчётность",
    quarter: "кв.",
    half: "пол.",
    year: "год",
    src: "Источник: T-Invest API",
  },
  en: {
    div: "Dividends",
    perShare: "per share",
    basisLastBuy: "last day to buy",
    basisRecord: "record date",
    coupon: "Coupon",
    couponsOfz: "OFZ coupons",
    couponsCorp: "Corporate bond coupons",
    issues: ["issue", "issues", "issues"] as const,
    report: "Earnings report",
    quarter: "Q",
    half: "H",
    year: "year",
    src: "Source: T-Invest API",
  },
} as const;

const TAGS_BY_KIND = { div: ["div", "stocks", "rub"], coupon: ["coupon", "bonds", "rub"], report: ["earnings", "stocks", "rub"] } as const;
const GK = { div: "corp.div", coupon: "corp.coupon", report: "corp.report" } as const;

function periodLabel(x: { year?: unknown; num?: unknown; type?: unknown }, l: (typeof T)["ru"] | (typeof T)["en"], ru: boolean): string {
  const y = num(x.year) ?? 0;
  const n = num(x.num) ?? 0;
  if (x.type === "q" && n >= 1 && n <= 4) return ru ? `${n} ${l.quarter} ${y}` : `${l.quarter}${n} ${y}`;
  if (x.type === "h" && n >= 1 && n <= 2) return ru ? `${n} ${l.half} ${y}` : `${l.half}${n} ${y}`;
  if (x.type === "y") return ru ? `${y} ${l.year}` : `FY ${y}`;
  return String(y);
}

function base(ts: number, title: string, kind: CorpKind, impact: 1 | 2 | 3, currency: string, desc: string, search: string, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id: eventId(ts, "RU", title),
    ts,
    allDay: true,
    country: "RU",
    currency,
    event: title,
    category: "corp",
    impact,
    actual: null,
    forecast: null,
    previous: null,
    unit: null,
    change: null,
    changePercentage: null,
    description: desc,
    hasDesc: true,
    origin: "T-Invest API",
    gk: GK[kind],
    tags: [...TAGS_BY_KIND[kind]],
    search: search.toLowerCase().slice(0, 800),
    ...extra,
  };
}

const dayTs = (d: string): number => Date.parse(`${d}T00:00:00Z`);

/** Rows with a date in [from, to] (inclusive) -> events: dividends and reports one by one, coupons aggregated per day and group (OFZ / corporate). */
export function buildCorporateEvents(rows: readonly CorpRow[], from: string, to: string, lang: CorpLang = "ru"): CalEvent[] {
  const ru = lang === "ru";
  const l = ru ? T.ru : T.en;
  const out: CalEvent[] = [];
  const seen = new Set<string>();
  const couponDays = new Map<string, CorpRow[]>();

  for (const r of rows) {
    if (!r || r.date < from || r.date > to) continue;
    const ts = dayTs(r.date);
    if (!Number.isFinite(ts)) continue;
    const x = r.extra ?? {};

    if (r.kind === "div") {
      if (r.amount === null || !(r.amount > 0)) continue;
      const key = `d|${r.ticker}|${r.date}|${r.amount}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const y = num(x.yield);
      const who = r.name && r.name !== r.ticker ? `${r.name} (${r.ticker})` : r.ticker;
      const title = `${l.div}: ${who} — ${fmtMoney(r.amount, r.currency, lang)} ${l.perShare}${y ? ` (${fmtNum(y, lang)}%)` : ""}`;
      const basis = x.basis === "lastBuy" ? l.basisLastBuy : l.basisRecord;
      const parts: string[] = [];
      if (ru) {
        parts.push(`${r.name} (${r.ticker}): дивиденд ${fmtMoney(r.amount, r.currency, lang)} на акцию${y ? `, доходность около ${fmtNum(y, lang)}% к цене закрытия` : ""}.`);
        if (typeof x.lastBuy === "string") parts.push(`Последний день покупки, дающий право на дивиденд: ${dmy(x.lastBuy)} (сама дата в календаре — этот день).`);
        if (typeof x.record === "string") parts.push(`Дата закрытия реестра: ${dmy(x.record)}.`);
        if (typeof x.pay === "string") parts.push(`Выплата: ${dmy(x.pay)}.`);
        if (typeof x.declared === "string") parts.push(`Объявлено: ${dmy(x.declared)}.`);
        if (x.regularity === "Annual") parts.push("Выплата ежегодная.");
        else if (x.regularity === "Semi-Anl") parts.push("Выплата раз в полгода.");
        if (typeof x.type === "string" && /return of capital/i.test(x.type)) parts.push("Тип выплаты: возврат капитала.");
      } else {
        parts.push(`${r.name} (${r.ticker}): dividend ${fmtMoney(r.amount, r.currency, lang)} per share${y ? `, yield about ${fmtNum(y, lang)}% of the close price` : ""}.`);
        if (typeof x.lastBuy === "string") parts.push(`Last day to buy to receive it: ${dmy(x.lastBuy)} (the calendar date is this day).`);
        if (typeof x.record === "string") parts.push(`Record date: ${dmy(x.record)}.`);
        if (typeof x.pay === "string") parts.push(`Payment: ${dmy(x.pay)}.`);
      }
      parts.push(l.src);
      out.push(base(ts, title, "div", x.blue === true ? DIV_IMPORTANCE.blue : DIV_IMPORTANCE.other, r.currency || "RUB", parts.join(" "), `${r.ticker} ${r.name}`, { period: basis }));
    } else if (r.kind === "report") {
      const key = `r|${r.ticker}|${x.year}|${x.type}|${x.num}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rank = num(x.rank) ?? 0;
      const per = periodLabel(x, l, ru);
      const title = `${l.report}: ${r.name} (${r.ticker}), ${per}`;
      const desc = ru
        ? `${r.name} (${r.ticker}) публикует финансовую отчётность за период «${per}». Стандарт (МСФО или РСБУ) источник не указывает; дата может сдвинуться, сверяйтесь с сайтом компании. ${l.src}`
        : `${r.name} (${r.ticker}) is due to publish its financial statements for "${per}". The source does not say whether IFRS or local GAAP; the date may move. ${l.src}`;
      out.push(base(ts, title, "report", rank > 0 && rank <= TOP_REPORTS ? 2 : 1, "RUB", desc, `${r.ticker} ${r.name}`));
    } else if (r.kind === "coupon") {
      const key = `c|${r.ticker}|${r.date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const gk = `${r.date}|${x.ofz === true ? "ofz" : "corp"}`;
      const g = couponDays.get(gk);
      if (g) g.push(r);
      else couponDays.set(gk, [r]);
    }
  }

  for (const [gk, list] of couponDays) {
    const [date, grp] = gk.split("|");
    const ts = dayTs(date);
    list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const line = (r: CorpRow): string => {
      const x = r.extra ?? {};
      const rate = num(x.rate);
      const amt = r.amount !== null ? fmtMoney(r.amount, r.currency, lang) : ru ? "размер определяется позже" : "amount not set yet";
      return `${r.name} — ${amt}${rate ? (ru ? `, около ${fmtNum(rate, lang)}% годовых` : `, about ${fmtNum(rate, lang)}% p.a.`) : ""}`;
    };
    const search = list.map((r) => `${r.ticker} ${r.name}`).join(" ");
    if (list.length === 1) {
      const r = list[0];
      const title = r.amount !== null ? `${l.coupon}: ${r.name} — ${fmtMoney(r.amount, r.currency, lang)}` : `${l.coupon}: ${r.name}`;
      const n = num(r.extra?.n);
      const desc = `${ru ? "Выплата купона" : "Coupon payment"}${n ? ` №${n}` : ""}: ${line(r)}. ${ru ? "Тикер" : "Ticker"}: ${r.ticker}. ${l.src}`;
      out.push(base(ts, title, "coupon", COUPON_IMPORTANCE, r.currency || "RUB", desc, search));
      continue;
    }
    const n = list.length;
    const label = grp === "ofz" ? l.couponsOfz : l.couponsCorp;
    const title = `${label}: ${n} ${plural(n, l.issues[0], l.issues[1], l.issues[2])}`;
    const lines = list.slice(0, MAX_LIST_LINES).map(line);
    if (n > MAX_LIST_LINES) lines.push(ru ? `…и ещё ${n - MAX_LIST_LINES}` : `…and ${n - MAX_LIST_LINES} more`);
    const desc = `${ru ? "Выплаты купонов за день" : "Coupon payments of the day"}:\n${lines.join("\n")}\n${l.src}`;
    out.push(base(ts, title, "coupon", COUPON_IMPORTANCE, "RUB", desc, search));
  }

  return out.sort((a, b) => a.ts - b.ts || b.impact - a.impact || a.event.localeCompare(b.event));
}

/* ───────────── store ───────────── */

export interface CorpStore {
  /** Everything cached: the rows and the time of the last completed refresh (0 = never). */
  load(): Promise<{ rows: CorpRow[]; refreshedAt: number }>;
  /** Replaces all rows of the kind for these tickers by the given rows (rows of other tickers stay). */
  replace(kind: CorpKind, tickers: readonly string[], rows: readonly CorpRow[]): Promise<void>;
  /** Drops rows of the kind whose ticker is not in `keep` and rows older than minDate. */
  prune(kind: CorpKind, keep: readonly string[], minDate: string): Promise<void>;
  /** Marks a completed refresh. */
  touch(at: number): Promise<void>;
}

export function createMemStore(): CorpStore & { rows: Map<string, CorpRow>; at: number } {
  const rows = new Map<string, CorpRow>();
  const s = {
    rows,
    at: 0,
    async load() {
      return { rows: [...rows.values()], refreshedAt: s.at };
    },
    async replace(kind: CorpKind, tickers: readonly string[], list: readonly CorpRow[]) {
      const set = new Set(tickers);
      for (const [id, r] of rows) if (r.kind === kind && set.has(r.ticker)) rows.delete(id);
      for (const r of list) rows.set(r.id, r);
    },
    async prune(kind: CorpKind, keep: readonly string[], minDate: string) {
      const set = new Set(keep);
      for (const [id, r] of rows) if (r.kind === kind && (!set.has(r.ticker) || r.date < minDate)) rows.delete(id);
    },
    async touch(at: number) {
      s.at = at;
    },
  };
  return s;
}

/** The Prisma table; the client is imported lazily so that pure users of this module never touch the database. */
export function createPrismaStore(): CorpStore {
  const db = async () => (await import("../prisma")).prisma;
  const toRow = (r: { id: string; kind: string; ticker: string; name: string; date: Date; amount: number | null; currency: string | null; extra: unknown }): CorpRow => ({
    id: r.id,
    kind: r.kind as CorpKind,
    ticker: r.ticker,
    name: r.name,
    date: r.date.toISOString().slice(0, 10),
    amount: r.amount,
    currency: r.currency,
    extra: r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? (r.extra as Record<string, unknown>) : {},
  });
  return {
    async load() {
      const p = await db();
      const [list, meta] = await Promise.all([p.corporateEvent.findMany({ where: { kind: { in: ["div", "coupon", "report"] } } }), p.corporateEvent.findUnique({ where: { id: "meta:refresh" } })]);
      return { rows: list.map(toRow), refreshedAt: meta ? meta.updatedAt.getTime() : 0 };
    },
    async replace(kind, tickers, rows) {
      if (!tickers.length) return;
      const p = await db();
      await p.$transaction([
        p.corporateEvent.deleteMany({ where: { kind, ticker: { in: [...tickers] } } }),
        p.corporateEvent.createMany({
          data: rows.map((r) => ({ id: r.id, kind: r.kind, ticker: r.ticker, name: r.name, date: new Date(`${r.date}T00:00:00Z`), amount: r.amount, currency: r.currency, extra: r.extra as object })),
          skipDuplicates: true,
        }),
      ]);
    },
    async prune(kind, keep, minDate) {
      const p = await db();
      await p.corporateEvent.deleteMany({ where: { kind, OR: [{ ticker: { notIn: [...keep] } }, { date: { lt: new Date(`${minDate}T00:00:00Z`) } }] } });
    },
    async touch(at) {
      const p = await db();
      const data = { kind: "meta", ticker: "-", name: "refresh", date: new Date(at), extra: { at } };
      await p.corporateEvent.upsert({ where: { id: "meta:refresh" }, create: { id: "meta:refresh", ...data }, update: data });
    },
  };
}

/* ───────────── refresh (network) ───────────── */

export interface RefreshDeps {
  token: string;
  fetchImpl: typeof fetch;
  store: CorpStore;
  now?: number;
  sleep?: (ms: number) => Promise<void>;
  gapMs?: number;
  sharesLimit?: number;
  corpBondsLimit?: number;
  /** progress lines (never contain the token) */
  log?: (line: string) => void;
}

export interface RefreshReport {
  ok: boolean;
  /** ok | no-token | unauthorized | upstream-error */
  reason: string;
  calls: number;
  failedCalls: number;
  shares: number;
  bonds: number;
  dividends: number;
  reports: number;
  coupons: number;
  universe: "iss" | "static";
  ms: number;
}

class Fatal extends Error {}

/** TQBR / TQCB turnover ranking of the public ISS: SECID -> {isin, turnover}, sorted by turnover descending. */
export function parseIssTurnover(body: unknown): { secid: string; isin: string; turnover: number }[] {
  const b = body as { securities?: { columns?: string[]; data?: unknown[][] }; marketdata?: { columns?: string[]; data?: unknown[][] } } | null;
  const sc = b?.securities?.columns;
  const mc = b?.marketdata?.columns;
  if (!sc || !mc || !Array.isArray(b?.securities?.data) || !Array.isArray(b?.marketdata?.data)) return [];
  const sId = sc.indexOf("SECID");
  const sIsin = sc.indexOf("ISIN");
  const mId = mc.indexOf("SECID");
  const mVal = mc.indexOf("VALTODAY_RUR") >= 0 ? mc.indexOf("VALTODAY_RUR") : mc.indexOf("VALTODAY");
  if (sId < 0 || mId < 0 || mVal < 0) return [];
  const turn = new Map<string, number>();
  for (const r of b!.marketdata!.data!) turn.set(String(r[mId]), num(r[mVal]) ?? 0);
  const out: { secid: string; isin: string; turnover: number }[] = [];
  for (const r of b!.securities!.data!) {
    const secid = String(r[sId] ?? "");
    if (secid) out.push({ secid, isin: sIsin >= 0 ? String(r[sIsin] ?? "") : "", turnover: turn.get(secid) ?? 0 });
  }
  return out.sort((a, b2) => b2.turnover - a.turnover);
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One full refresh. Never throws (errors end up in the report). Per-instrument failures leave that instrument's old rows alone;
 * a 401 / 403 aborts (reason "unauthorized"). The table is written after every phase, so an interrupted run keeps its progress.
 */
export async function refreshCorporate(deps: RefreshDeps): Promise<RefreshReport> {
  const t0 = Date.now();
  const rep: RefreshReport = { ok: false, reason: "upstream-error", calls: 0, failedCalls: 0, shares: 0, bonds: 0, dividends: 0, reports: 0, coupons: 0, universe: "iss", ms: 0 };
  const now = deps.now ?? Date.now();
  const sleep = deps.sleep ?? defaultSleep;
  const gap = deps.gapMs ?? CALL_GAP_MS;
  const log = deps.log ?? (() => {});
  if (!deps.token) return { ...rep, reason: "no-token", ms: Date.now() - t0 };

  let lastCall = 0;
  const pace = async () => {
    const wait = lastCall + gap - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
  };

  /** One paced T-Invest call; null = this instrument failed (4xx other than auth / exhausted retries). */
  async function ti(method: string, body: Record<string, unknown>): Promise<unknown | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
      await pace();
      rep.calls++;
      let res: Response;
      try {
        res = await deps.fetchImpl(`${T_BASE}.InstrumentsService/${method}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${deps.token}` },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      } catch {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (res.status === 401 || res.status === 403) throw new Fatal("unauthorized");
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        await sleep(Math.min(65, Number.isFinite(reset) && reset > 0 ? reset + 1 : 20) * 1000);
        continue;
      }
      if (res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      if (!res.ok) {
        rep.failedCalls++;
        return null;
      }
      try {
        return await res.json();
      } catch {
        rep.failedCalls++;
        return null;
      }
    }
    rep.failedCalls++;
    return null;
  }

  async function iss(path: string): Promise<unknown | null> {
    try {
      const res = await deps.fetchImpl(`${ISS}/${path}`, { headers: { Accept: "application/json" }, cache: "no-store" });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  try {
    const iso = (ms: number) => new Date(ms).toISOString();
    const day = 86_400_000;
    const minDate = new Date(now - 60 * day).toISOString().slice(0, 10);
    const [sharesBody, bondsBody] = [await ti("Shares", { instrumentStatus: "INSTRUMENT_STATUS_BASE" }), await ti("Bonds", { instrumentStatus: "INSTRUMENT_STATUS_BASE" })];
    const tiShares = parseShares(sharesBody);
    const tiBonds = parseBonds(bondsBody);
    if (tiShares.size === 0 && tiBonds.size === 0) return { ...rep, reason: "upstream-error", ms: Date.now() - t0 };

    /* universe: ISS liquidity ranking, static blue chips when ISS is down */
    const [tqbr, tqcb] = [parseIssTurnover(await iss("shares/boards/TQBR/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,ISIN&marketdata.columns=SECID,VALTODAY_RUR,VALTODAY")), parseIssTurnover(await iss("bonds/boards/TQCB/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,ISIN&marketdata.columns=SECID,VALTODAY_RUR,VALTODAY"))];
    const ranked: string[] = tqbr.filter((r) => r.turnover > 0 && tiShares.has(r.secid)).map((r) => r.secid);
    rep.universe = ranked.length > 0 ? "iss" : "static";
    const order = rep.universe === "iss" ? ranked : STATIC_BLUE.filter((t) => tiShares.has(t));
    const shares: ShareInfo[] = order.slice(0, deps.sharesLimit ?? SHARES_LIMIT).map((t, i) => ({ ...tiShares.get(t)!, rank: i + 1 }));

    const ofz = [...tiBonds.values()].filter((b) => b.ofz && (!b.maturity || b.maturity >= iso(now).slice(0, 10)));
    const corpIsin = new Set(tqcb.filter((r) => r.turnover > 0 && r.isin).slice(0, (deps.corpBondsLimit ?? CORP_BONDS_LIMIT) * 3).map((r) => r.isin));
    const corp = [...tiBonds.values()]
      .filter((b) => !b.ofz && corpIsin.has(b.isin) && (!b.maturity || b.maturity >= iso(now).slice(0, 10)))
      .sort((a, b) => [...corpIsin].indexOf(a.isin) - [...corpIsin].indexOf(b.isin))
      .slice(0, deps.corpBondsLimit ?? CORP_BONDS_LIMIT);
    log(`scope: ${shares.length} shares (${rep.universe}), ${ofz.length} OFZ, ${corp.length} corporate bonds`);

    /* phase 1: shares (dividends + reports) */
    const divRows: CorpRow[] = [];
    const repRows: CorpRow[] = [];
    const divOk: string[] = [];
    const repOk: string[] = [];
    for (const [i, sh] of shares.entries()) {
      const d = await ti("GetDividends", { instrumentId: sh.uid, from: iso(now - 45 * day), to: iso(now + 365 * day) });
      if (d !== null) {
        divOk.push(sh.ticker);
        divRows.push(...parseDividends(d, sh));
      }
      const r = await ti("GetAssetReports", { instrumentId: sh.uid, from: iso(now - 30 * day), to: iso(now + 365 * day) });
      if (r !== null) {
        repOk.push(sh.ticker);
        repRows.push(...parseReports(r, sh));
      }
      if ((i + 1) % 25 === 0) log(`shares ${i + 1}/${shares.length}, ${rep.calls} calls`);
    }
    await deps.store.replace("div", divOk, divRows);
    await deps.store.replace("report", repOk, repRows);
    rep.shares = shares.length;
    rep.dividends = divRows.length;
    rep.reports = repRows.length;

    /* phase 2: bonds (coupons) */
    const bonds = [...ofz, ...corp];
    const cpnRows: CorpRow[] = [];
    const cpnOk: string[] = [];
    for (const [i, b] of bonds.entries()) {
      const c = await ti("GetBondCoupons", { instrumentId: b.uid, from: iso(now - 14 * day), to: iso(now + 270 * day) });
      if (c !== null) {
        cpnOk.push(b.ticker);
        cpnRows.push(...parseCoupons(c, b));
      }
      if ((i + 1) % 25 === 0) log(`bonds ${i + 1}/${bonds.length}, ${rep.calls} calls`);
    }
    await deps.store.replace("coupon", cpnOk, cpnRows);
    rep.bonds = bonds.length;
    rep.coupons = cpnRows.length;

    /* housekeeping: only when the phase saw most of its universe, so one bad run cannot wipe the table */
    const mostly = (ok: number, all: number) => all > 0 && ok >= all * 0.8;
    if (mostly(divOk.length, shares.length)) await deps.store.prune("div", shares.map((s) => s.ticker), minDate);
    if (mostly(repOk.length, shares.length)) await deps.store.prune("report", shares.map((s) => s.ticker), minDate);
    if (mostly(cpnOk.length, bonds.length)) await deps.store.prune("coupon", bonds.map((b) => b.ticker), minDate);

    const progressed = divOk.length + repOk.length + cpnOk.length > 0;
    if (progressed) await deps.store.touch(Date.now());
    rep.ok = progressed;
    rep.reason = progressed ? "ok" : "upstream-error";
  } catch (e) {
    rep.reason = e instanceof Fatal ? "unauthorized" : "upstream-error";
  }
  rep.ms = Date.now() - t0;
  return rep;
}

/* ───────────── lazy layer (stale-while-revalidate) ───────────── */

interface State {
  rows: CorpRow[] | null;
  refreshedAt: number;
  loadedAt: number;
  attempt: number;
  loading: Promise<void> | null;
  refreshing: Promise<void> | null;
  last: RefreshReport | null;
}
const st: State = { rows: null, refreshedAt: 0, loadedAt: 0, attempt: 0, loading: null, refreshing: null, last: null };
let store: CorpStore | null = null;
let storeIsMem = false;
let fetchOverride: typeof fetch | null = null;
let tuning: Pick<RefreshDeps, "gapMs" | "sleep" | "sharesLimit" | "corpBondsLimit"> = {};

/** Tests: a replacement store / fetch / pacing. */
export function _setCorpTuning(t: typeof tuning) {
  tuning = t;
}
export function _setCorpStore(s: CorpStore | null) {
  store = s;
  storeIsMem = false;
}
export function _setCorpFetch(f: typeof fetch | null) {
  fetchOverride = f;
}
export function _resetCorp() {
  st.rows = null;
  st.refreshedAt = 0;
  st.loadedAt = 0;
  st.attempt = 0;
  st.loading = null;
  st.refreshing = null;
  st.last = null;
  store = null;
  storeIsMem = false;
  fetchOverride = null;
  tuning = {};
}
/** The report of the last background refresh (for diagnostics). */
export function lastCorpRefresh(): RefreshReport | null {
  return st.last;
}

export const corpToken = (): string => (process.env.TINKOFF_READONLY_TOKEN || process.env.TINKOFF_TOKEN || "").trim();

function getStore(): CorpStore {
  if (!store) store = createPrismaStore();
  return store;
}

async function loadRows(): Promise<void> {
  try {
    const r = await getStore().load();
    st.rows = r.rows;
    st.refreshedAt = r.refreshedAt;
  } catch {
    // the table is missing or the database is down: keep working from memory for the rest of the process lifetime
    if (!storeIsMem) {
      store = createMemStore();
      storeIsMem = true;
    }
    st.rows = st.rows ?? [];
  }
  st.loadedAt = Date.now();
}

function startRefresh(now: number) {
  if (st.refreshing) return;
  st.attempt = now;
  st.refreshing = (async () => {
    try {
      await loadRows(); // another instance may have refreshed the table meanwhile
      if (Date.now() - st.refreshedAt < REFRESH_MS) return;
      const rep = await refreshCorporate({ token: corpToken(), fetchImpl: fetchOverride ?? ((...a) => fetch(...a)), store: getStore(), ...tuning });
      st.last = rep;
      await loadRows();
    } catch {
      // never surfaces: the calendar keeps serving the cached rows
    } finally {
      st.refreshing = null;
    }
  })();
}

/** Corporate events of [from, to] from the cache. Never throws, never waits for a refresh (only the very first call waits, bounded, for the table). */
export async function getCorporateEvents(from: string, to: string, lang: CorpLang = "ru", now = Date.now()): Promise<CalEvent[]> {
  try {
    if (st.rows === null) {
      if (!st.loading) st.loading = loadRows().finally(() => (st.loading = null));
      await Promise.race([st.loading, new Promise<void>((r) => setTimeout(r, FIRST_LOAD_TIMEOUT_MS))]);
    } else if (now - st.loadedAt > RELOAD_MS && !st.loading) {
      st.loading = loadRows().finally(() => (st.loading = null));
    }
    if (corpToken() && now - st.refreshedAt >= REFRESH_MS && now - st.attempt >= RETRY_MS && st.rows !== null) startRefresh(now);
    return buildCorporateEvents(st.rows ?? [], from, to, lang);
  } catch {
    return [];
  }
}

/** True when the layer has anything cached (for the X-Calendar-Layers header). */
export function corpHasData(): boolean {
  return !!st.rows && st.rows.length > 0;
}
