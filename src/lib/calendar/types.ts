/** One normalised economic-calendar event (the shape of /api/economic-calendar and of everything in the terminal). */
export interface CalEvent {
  /** Stable hash of time + country + event name (survives refetches, used for reminders and React keys). */
  id: string;
  /** Release time, real UTC ms. */
  ts: number;
  /** The source gave a date only (no clock time): shown as "all day" and never counted as "next event". */
  allDay: boolean;
  /** ISO-3166 alpha-2 ("EU" for the euro area), "" when unknown. */
  country: string;
  currency: string;
  /** Title. The API translates it for lang=ru (glossary); the original English name is then in `eventEn`. */
  event: string;
  category: CalCategory;
  /** 1 low, 2 medium, 3 high. */
  impact: 1 | 2 | 3;
  actual: number | null;
  /** The consensus estimate. */
  forecast: number | null;
  previous: number | null;
  /** "%", "K", "M", "B" or any text the source provides; inferred from the name when absent. */
  unit: string | null;
  /** actual - previous as given by the source, when present. */
  change: number | null;
  changePercentage: number | null;
  /** Long description of the indicator (TradingView `comment`, MOEX notes). The API strips the text unless `desc=1` and sets `hasDesc`. */
  description?: string;
  hasDesc?: boolean;
  /** Reference period ("Sep", "Q3"), TradingView ticker and the publisher of the figure; only when the source gives them. */
  period?: string;
  ticker?: string;
  origin?: string;
  /** Original (TradingView) name when `event` was translated: search matches it too, inverse-indicator detection uses it. */
  eventEn?: string;
  /** Glossary key (lib/calendar/glossary): the popup looks the «что это» / «на что влияет» texts up by it (they never travel in the list). */
  gk?: string;
  /** Markets the indicator moves (usd, oil, gas, stocks ...), labels in glossary TAGS. */
  tags?: string[];
  /** Extra lower-case text the search box matches besides the title (corporate layer: tickers and names of an aggregated event). */
  search?: string;
}

export type CalCategory =
  | "centralbank"
  | "inflation"
  | "employment"
  | "growth"
  | "manufacturing"
  | "consumer"
  | "housing"
  | "trade"
  | "energy"
  | "auction"
  | "holiday"
  /** Events built from the Moscow Exchange itself (trading calendar, expirations): own badge and colour in the UI. */
  | "moex"
  /** Scheduled reports of agriculture / soft commodities (USDA, CONAB, cocoa grindings, MPOB ...): lib/calendar/commodities.ts. */
  | "commodity"
  /** The Russia layer, scheduled macro releases (Bank of Russia, Rosstat, Minfin OFZ auctions): lib/calendar/russia.ts. Dividends, coupons and reports are the "corp" layer. */
  | "ru"
  /** Corporate events of Russian issuers (dividends, bond coupons, reporting dates), T-Invest API cache: lib/calendar/corporate.ts. */
  | "corp"
  | "other";

export type ImpactLevel = 1 | 2 | 3;

/** Filter used by both the API and the UI. null = no restriction. */
export interface CalFilter {
  /** Selected countries; empty / null = all. Applies to EVERY event, layers included (the Moscow Exchange layer carries country RU). */
  countries?: ReadonlySet<string> | null;
  impacts?: ReadonlySet<number> | null;
  q?: string;
  /** Categories of lib/calendar/categories.ts (eventCategory); empty / null = all. */
  categories?: ReadonlySet<string> | null;
  /** API only (`energy=1`): just the oil and gas events (tags oil | gas), from any country (the country filter does not apply). */
  energy?: boolean;
}

/** Why a response carries no (or only partial) data; sent in the X-Calendar-Reason header. */
export type CalReason = "ok" | "mock" | "no-key" | "restricted" | "unauthorized" | "upstream-error" | "rate-limited" | "partial" | "clamped" | "bad-range" | "range-unsupported";

/** The providers of the chain, in priority order. */
export type CalSource = "tradingview" | "fmp" | "forexfactory" | "mock" | "none";
