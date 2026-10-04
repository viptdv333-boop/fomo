import { categoryOf, eventId, inferUnit, parseCalDate, parseNum } from "./normalize";
import type { CalCategory, CalEvent } from "./types";

/*
 * PROVIDER 1 (primary): the economic-calendar endpoint behind TradingView's own calendar widget:
 *   GET https://economic-calendar.tradingview.com/events?from=<ISO>&to=<ISO>&countries=US,RU,...&minImportance=-1
 * with browser-like headers (Origin / Referer https://www.tradingview.com, a normal User-Agent), called from the server only.
 *
 * NOTE: this endpoint is UNOFFICIAL and undocumented. It is the data TradingView's public widget uses; it may change, start
 * requiring a key, or be blocked at any moment. Everything provider specific is in this file and in the "tradingview" entry
 * of source.ts; the rest of the app sees normalised CalEvent objects only, so it can be replaced (FMP and Forex Factory
 * stay in the chain behind it as fallbacks).
 *
 * Answer: { status: "ok", result: [{ id, title, country (ISO2), indicator, category, period, referenceDate, source, source_url,
 *   actual, forecast, previous (scaled), actualRaw, forecastRaw, previousRaw (full numbers), currency, unit, scale (K|M|B|T),
 *   ticker, comment (long description), importance (-1 low, 0 medium, 1 high), date (ISO UTC) }] }.
 * Verified: up to 31 days and all countries in one request.
 */

/** TradingView's own category codes -> ours (used when the title alone says nothing). */
const TV_CATEGORY: Record<string, CalCategory> = {
  prce: "inflation",
  lbr: "employment",
  gdp: "growth",
  bsnss: "manufacturing",
  cnsm: "consumer",
  hse: "housing",
  trd: "trade",
  mny: "centralbank",
  bnd: "auction",
  enrg: "energy",
};

const MAX_DESC = 900;

function num(raw: unknown, scaled: unknown, scale: unknown): number | null {
  const r = parseNum(raw);
  if (r !== null) return r;
  const v = parseNum(scaled);
  if (v === null) return null;
  const mul = typeof scale === "string" ? ({ K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as Record<string, number>)[scale.toUpperCase()] ?? 1 : 1;
  return Math.round(v * mul * 1e6) / 1e6;
}

export function normalizeTradingView(body: unknown): CalEvent[] {
  const rows = body && typeof body === "object" ? (body as { result?: unknown }).result : null;
  if (!Array.isArray(rows)) return [];
  const byId = new Map<string, CalEvent>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const name = typeof row.title === "string" ? row.title.replace(/\s+/g, " ").trim() : "";
    const when = parseCalDate(row.date);
    if (!name || !when) continue;
    const country = typeof row.country === "string" && /^[A-Za-z]{2}$/.test(row.country.trim()) ? row.country.trim().toUpperCase() : "";
    const holiday = row.indicator === "Holidays" || /\bholiday\b/i.test(name);
    const imp = typeof row.importance === "number" ? row.importance : -1;
    let category: CalCategory = holiday ? "holiday" : categoryOf(name);
    if (category === "other" && typeof row.category === "string") category = TV_CATEGORY[row.category] ?? "other";
    const comment = typeof row.comment === "string" ? row.comment.trim().slice(0, MAX_DESC) : "";
    const ev: CalEvent = {
      id: eventId(when.ts, country, name),
      ts: when.ts,
      allDay: holiday, // holidays carry 00:00Z: no clock time
      country,
      currency: typeof row.currency === "string" ? row.currency.trim().toUpperCase().slice(0, 4) : "",
      event: name.slice(0, 200),
      category,
      impact: holiday ? 1 : imp >= 1 ? 3 : imp === 0 ? 2 : 1,
      actual: num(row.actualRaw, row.actual, row.scale),
      forecast: num(row.forecastRaw, row.forecast, row.scale),
      previous: num(row.previousRaw, row.previous, row.scale),
      unit: inferUnit(name, row.unit === "%" ? "%" : typeof row.unit === "string" && row.unit.length <= 3 ? row.unit : null),
      change: null,
      changePercentage: null,
    };
    if (comment) {
      ev.description = comment;
      ev.hasDesc = true;
    }
    if (typeof row.period === "string" && row.period) ev.period = row.period.slice(0, 12);
    if (typeof row.ticker === "string" && row.ticker) ev.ticker = row.ticker.slice(0, 40);
    if (typeof row.source === "string" && row.source) ev.origin = row.source.slice(0, 80);
    const prev = byId.get(ev.id);
    if (!prev || (ev.actual !== null && prev.actual === null)) byId.set(ev.id, ev);
  }
  return [...byId.values()].sort((a, b) => a.ts - b.ts || b.impact - a.impact || a.event.localeCompare(b.event));
}

export const TV_URL = "https://economic-calendar.tradingview.com/events";
export const TV_HEADERS: Record<string, string> = {
  Origin: "https://www.tradingview.com",
  Referer: "https://www.tradingview.com/",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
};
