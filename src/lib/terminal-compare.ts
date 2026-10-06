// «Сколько это стоит у других»: the facts of the comparison table on the terminal landing (TerminalLanding).
// ONE place to update. Everything here was read from the official public page below on `checkedAt` and nothing else is stated.
// When a number changes (or the date gets old), edit the rows and bump `checkedAt`; the landing prints «на <месяц год>» from it.
// Keep it factual: only figures that the source page lists; no prices (they differ by billing period and region) and no
// real-time claims. Russian alternatives were not added: no official page could be verified.
//
// Source: https://www.tradingview.com/pricing/ , plan comparison table (indicators per chart, charts per tab, active price alerts).

export interface CompareRow {
  /** stable id, also used as the React key */
  id: string;
  /** plan name as the service writes it */
  plan: string;
  /** "free" = a free plan, "paid" = a paid plan */
  kind: "free" | "paid";
  indicatorsPerChart: number;
  chartsPerTab: number;
  activePriceAlerts: number;
}

export interface CompareSource {
  service: string;
  url: string;
  /** shown in small print */
  label: string;
}

/** ISO date (YYYY-MM-DD) on which the figures below were checked against the source. */
export const checkedAt = "2026-10-06";

export const compareSource: CompareSource = {
  service: "TradingView",
  url: "https://www.tradingview.com/pricing/",
  label: "tradingview.com/pricing",
};

/** TradingView plans, in the order of the source page. */
export const tradingViewPlans: CompareRow[] = [
  { id: "tv-basic", plan: "Basic", kind: "free", indicatorsPerChart: 2, chartsPerTab: 1, activePriceAlerts: 3 },
  { id: "tv-essential", plan: "Essential", kind: "paid", indicatorsPerChart: 5, chartsPerTab: 2, activePriceAlerts: 20 },
  { id: "tv-plus", plan: "Plus", kind: "paid", indicatorsPerChart: 10, chartsPerTab: 4, activePriceAlerts: 100 },
  { id: "tv-premium", plan: "Premium", kind: "paid", indicatorsPerChart: 25, chartsPerTab: 8, activePriceAlerts: 400 },
  { id: "tv-ultimate", plan: "Ultimate", kind: "paid", indicatorsPerChart: 50, chartsPerTab: 16, activePriceAlerts: 1000 },
];

/**
 * What FOMO Terminal itself does, from the code (not from marketing):
 *  - there are no plans, so nothing limits the number of indicators per chart;
 *  - up to four linked charts on one screen (docs: tf.f11 on the terminal features page);
 *  - MAX_ACTIVE_ALERTS = 100 in src/app/api/terminal/alerts/schema.ts.
 */
export const fomoTerminal = { chartsPerTab: 4, activePriceAlerts: 100 } as const;

const MONTHS: Record<"ru" | "en", string[]> = {
  ru: ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "октябрь 2026" / "October 2026" / "2026年10月" for the lead sentence of the section. */
export function checkedLabel(locale: string, iso: string = checkedAt): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const year = m[1];
  const month = Math.min(12, Math.max(1, parseInt(m[2], 10)));
  if (locale === "cn") return `${year}年${month}月`;
  if (locale === "en") return `${MONTHS.en[month - 1]} ${year}`;
  return `${MONTHS.ru[month - 1]} ${year}`;
}
