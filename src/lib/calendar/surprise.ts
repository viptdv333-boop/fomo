import type { CalEvent } from "./types";

/* Surprise colouring of the "Actual" figure and number formatting. */

/** Indicators where a HIGHER figure than expected is bad news (so it is painted red): matched against the event name. */
export const INVERSE_KEYWORDS = [
  "unemployment",
  "jobless",
  "claims",
  "deficit",
  "layoff",
  "job cuts",
  "bankruptc",
  "delinquen",
  "foreclosure",
  "default",
  "insolvenc",
  "poverty",
  "inactivity",
] as const;

const INVERSE_RE = new RegExp(INVERSE_KEYWORDS.join("|"), "i");

/** "Unemployment Change" is not a rate but still inverse (more unemployed = worse); "Employment Change" is not inverse. */
export function isInverse(eventName: string): boolean {
  return INVERSE_RE.test(eventName);
}

export type Surprise = "better" | "worse" | "inline";

/**
 * Actual vs forecast (vs previous when there is no forecast). null while there is no actual or nothing to compare to.
 * "better" = green, "worse" = red; equal figures are "inline".
 */
export function surprise(e: Pick<CalEvent, "event" | "actual" | "forecast" | "previous"> & { eventEn?: string }): Surprise | null {
  if (e.actual === null) return null;
  const ref = e.forecast ?? e.previous;
  if (ref === null) return null;
  const eps = Math.max(1e-9, Math.abs(ref) * 1e-9);
  const diff = e.actual - ref;
  if (Math.abs(diff) <= eps) return "inline";
  const up = diff > 0;
  return up !== isInverse(e.eventEn ?? e.event) ? "better" : "worse";
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, maxFrac: number): Intl.NumberFormat {
  const k = `${locale}|${maxFrac}`;
  let f = nfCache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, { maximumFractionDigits: maxFrac, minimumFractionDigits: 0 });
    nfCache.set(k, f);
  }
  return f;
}

/** Compact figure: 1 234 567 -> "1.23M", 227000 -> "227K", 0.35 -> "0.35"; "%" stays attached. Null -> "". */
export function formatValue(v: number | null, unit: string | null, locale = "en-US"): string {
  if (v === null || !Number.isFinite(v)) return "";
  if (unit === "%") return `${nf(locale, 2).format(v)}%`;
  const a = Math.abs(v);
  let body: string;
  if (a >= 1e12) body = `${nf(locale, 2).format(v / 1e12)}T`;
  else if (a >= 1e9) body = `${nf(locale, 2).format(v / 1e9)}B`;
  else if (a >= 1e6) body = `${nf(locale, 2).format(v / 1e6)}M`;
  else if (a >= 1e4) body = `${nf(locale, 1).format(v / 1e3)}K`;
  else body = nf(locale, a >= 100 ? 1 : 3).format(v);
  if (unit && unit !== "K" && unit !== "M" && unit !== "B") return /^[$€£¥₽]$/.test(unit) ? `${unit}${body}` : `${body} ${unit}`;
  return body;
}

/** Signed change text ("+0.3%", "-12K"). */
export function formatChange(v: number | null, unit: string | null, locale = "en-US"): string {
  if (v === null) return "";
  const s = formatValue(v, unit, locale);
  return v > 0 ? `+${s}` : s;
}
