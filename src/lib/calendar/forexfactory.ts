import { categoryOf, eventId, inferUnit, parseCalDate, parseImpact } from "./normalize";
import type { CalEvent } from "./types";

/*
 * FALLBACK PROVIDER: the public weekly JSON feed of Forex Factory (https://nfs.faireconomy.media/ff_calendar_thisweek.json,
 * and ff_calendar_nextweek.json once it is published; it answers 404 until then).
 *
 * LICENSING NOTE: this feed is an unofficial, undocumented endpoint with no stated terms for third-party use. It is used only
 * because the primary provider (FMP) may not include the economic calendar in the plan, and only while FMP does not answer.
 * It is trivially replaceable: everything provider specific lives in this file and in the "forexfactory" branch of
 * source.ts; the rest of the app only sees normalised CalEvent objects. As soon as FMP answers (a paid key), FMP takes over
 * automatically and this file is never called.
 *
 * Shape: [{ title, country: "USD" | "EUR" | ... | "All", date: ISO with the New York UTC offset, impact: High | Medium |
 * Low | Holiday, forecast: "0.3%" | "215K" | "1.2B" | "2.10T" | "", previous: same, may be "4.83|2.7" (yield|bid-to-cover) }].
 * There is NO "actual" (verified against the real feed), so actual stays null and the UI shows a neutral note.
 */

const CURRENCY_COUNTRY: Record<string, string> = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", CNY: "CN", CNH: "CN", RUB: "RU", CAD: "CA", AUD: "AU", NZD: "NZ", CHF: "CH",
  INR: "IN", BRL: "BR", MXN: "MX", KRW: "KR", TRY: "TR", ZAR: "ZA", SEK: "SE", NOK: "NO", DKK: "DK", PLN: "PL", HKD: "HK",
  SGD: "SG", IDR: "ID", SAR: "SA", ARS: "AR", CZK: "CZ", HUF: "HU", ILS: "IL", THB: "TH",
};

const SCALE: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

/** "0.3%" -> {0.3,"%"}, "215K" -> {215000,null}, "2.10T" -> {2.1e12,null}, "4.83|2.7" -> first part, "" -> null. */
export function parseFfValue(v: unknown): { value: number; percent: boolean } | null {
  if (typeof v !== "string") return null;
  const first = v.split("|")[0].trim();
  const m = /^(-?\d+(?:\.\d+)?)\s*([KMBT%])?$/i.exec(first);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = (m[2] || "").toUpperCase();
  if (suffix === "%") return { value: n, percent: true };
  const scaled = suffix ? n * SCALE[suffix] : n;
  return { value: Math.round(scaled * 1e6) / 1e6, percent: false };
}

/** Raw feed rows -> normalised events (same shape and id function as the FMP path). Never throws. */
export function normalizeForexFactory(rows: unknown): CalEvent[] {
  if (!Array.isArray(rows)) return [];
  const byId = new Map<string, CalEvent>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const name = typeof row.title === "string" ? row.title.replace(/\s+/g, " ").trim() : "";
    const when = parseCalDate(row.date);
    if (!name || !when) continue;
    const cur = typeof row.country === "string" ? row.country.trim().toUpperCase() : "";
    const country = cur === "ALL" ? "" : (CURRENCY_COUNTRY[cur] ?? (/^[A-Z]{2}$/.test(cur) ? cur : ""));
    const currency = cur === "ALL" ? "" : cur.slice(0, 4);
    const holiday = typeof row.impact === "string" && row.impact.trim().toLowerCase() === "holiday";
    const f = parseFfValue(row.forecast);
    const p = parseFfValue(row.previous);
    const percent = !!(f?.percent || p?.percent);
    const ev: CalEvent = {
      id: eventId(when.ts, country, name),
      ts: when.ts,
      allDay: when.allDay,
      country,
      currency,
      event: name.slice(0, 200),
      category: holiday ? "holiday" : categoryOf(name),
      impact: holiday ? 1 : parseImpact(row.impact),
      actual: null,
      forecast: f ? f.value : null,
      previous: p ? p.value : null,
      unit: percent ? "%" : inferUnit(name, null),
      change: null,
      changePercentage: null,
    };
    if (!byId.has(ev.id)) byId.set(ev.id, ev);
  }
  return [...byId.values()].sort((a, b) => a.ts - b.ts || b.impact - a.impact || a.event.localeCompare(b.event));
}

/**
 * The time span a feed covers: the week (Sunday-start, by the New York calendar date the feed uses) its earliest row falls in,
 * as UTC ms [from, to). Days of that week without rows are real "no events" days; anything outside is unknown.
 */
export function ffCoverage(rows: unknown): { from: number; to: number } | null {
  if (!Array.isArray(rows)) return null;
  let min = "";
  for (const r of rows) {
    const d = r && typeof r === "object" ? (r as { date?: unknown }).date : null;
    if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(d)) continue;
    const day = d.slice(0, 10);
    if (!min || day < min) min = day;
  }
  if (!min) return null;
  const [y, m, d] = min.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const from = Date.UTC(y, m - 1, d - wd);
  return { from, to: from + 7 * 86_400_000 };
}
