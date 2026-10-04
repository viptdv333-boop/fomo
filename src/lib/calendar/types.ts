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
  | "other";

export type ImpactLevel = 1 | 2 | 3;

/** Filter used by both the API and the UI. null = no restriction. */
export interface CalFilter {
  countries?: ReadonlySet<string> | null;
  impacts?: ReadonlySet<number> | null;
  q?: string;
}

/** Why a response carries no (or only partial) data; sent in the X-Calendar-Reason header. */
export type CalReason = "ok" | "mock" | "no-key" | "restricted" | "unauthorized" | "upstream-error" | "rate-limited" | "partial" | "clamped" | "bad-range";
