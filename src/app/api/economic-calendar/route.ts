import { NextRequest, NextResponse } from "next/server";
import { gzipSync } from "node:zlib";
import { filterEvents } from "@/lib/calendar/normalize";
import { getCalendarRange } from "@/lib/calendar/source";
import { addDays, daySpan, MAX_RANGE_DAYS } from "@/lib/calendar/time";
import type { CalReason } from "@/lib/calendar/types";

/**
 * GET /api/economic-calendar
 *   from, to   ISO dates (UTC days, inclusive; max 31 days, default today .. today+days)
 *   days       legacy: today .. today+days when from/to are absent
 *   countries  comma list of ISO2 codes or "all" (legacy single `country` works too)
 *   impact     comma list of low | medium | high (default: all)
 *   q          text search in the event name (or a country / currency code)
 *   limit      max events (default 3000)
 *   moex       0 switches the Moscow Exchange layer off (default on); lang = ru | en | cn for its texts
 *   desc       1 keeps the long event descriptions (otherwise stripped; events carry hasDesc)
 * Returns a plain array of normalised events (see lib/calendar/types). Never throws: on any failure the array is empty and the
 * reason is in X-Calendar-Reason (ok | mock | no-key | restricted | unauthorized | upstream-error | rate-limited | partial | clamped | bad-range | range-unsupported);
 * X-Calendar-Source: tradingview | fmp | forexfactory | mock | none (+ X-Calendar-Tried with what every provider said,
 * X-Calendar-Layers: moex, X-Calendar-Coverage: "fromMs..toMs" when the provider knows only a window, e.g. Forex Factory);
 * X-Calendar-Stale: 1 marks an old copy served because the refresh failed.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const IMPACT: Record<string, number> = { low: 1, medium: 2, high: 3, "1": 1, "2": 2, "3": 3 };

/* per-IP limiter, in memory (the calendar is cheap to serve from the block cache; this only stops hammering) */
const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 90;
const WINDOW_MS = 60_000;
function limited(ip: string, now: number): number {
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return 0;
  }
  h.n++;
  return h.n > LIMIT ? Math.max(1, Math.ceil((h.reset - now) / 1000)) : 0;
}

function reply(events: unknown[], reason: CalReason, extra: Record<string, string> = {}, status = 200, gzip = false) {
  const ok = reason === "ok" || reason === "mock" || reason === "clamped" || reason === "partial";
  const headers: Record<string, string> = {
    "Cache-Control": ok && events.length > 0 ? "public, max-age=30, s-maxage=60, stale-while-revalidate=120" : "public, max-age=10, s-maxage=10",
    "X-Calendar-Reason": reason,
    Vary: "Accept-Encoding",
    ...extra,
  };
  // a month of events is ~0.5 MB of JSON and nothing in front of the app compresses it: gzip it here (-> ~60 KB)
  if (gzip && events.length > 50) {
    const body = gzipSync(JSON.stringify(events), { level: 6 });
    return new NextResponse(new Uint8Array(body), { status, headers: { ...headers, "Content-Type": "application/json", "Content-Encoding": "gzip" } });
  }
  return NextResponse.json(events, { status, headers });
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || request.headers.get("x-real-ip") || "local";
    const wait = limited(ip, now);
    if (wait) return reply([], "rate-limited", { "Retry-After": String(wait) }, 429);

    const sp = request.nextUrl.searchParams;
    const today = new Date(now).toISOString().slice(0, 10);
    let from = sp.get("from") || "";
    let to = sp.get("to") || "";
    let reason: CalReason | null = null;
    if (!from && !to) {
      const days = Math.max(0, Math.min(MAX_RANGE_DAYS - 1, parseInt(sp.get("days") || "7", 10) || 0));
      from = today;
      to = addDays(today, days);
    } else {
      if (!DATE_RE.test(from) || !DATE_RE.test(to || from) || Number.isNaN(Date.parse(from))) return reply([], "bad-range", {}, 400);
      if (!to) to = from;
      if (Number.isNaN(Date.parse(to))) return reply([], "bad-range", {}, 400);
      if (to < from) [from, to] = [to, from];
      if (daySpan({ from, to }) > MAX_RANGE_DAYS) {
        to = addDays(from, MAX_RANGE_DAYS - 1);
        reason = "clamped";
      }
    }

    const cRaw = sp.get("countries") || sp.get("country") || "";
    const countries = cRaw && cRaw.toLowerCase() !== "all" ? new Set(cRaw.split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 80)) : null;
    const iRaw = (sp.get("impact") || "").toLowerCase();
    const impacts = iRaw ? new Set(iRaw.split(",").map((s) => IMPACT[s.trim()]).filter(Boolean)) : null;
    const q = (sp.get("q") || "").slice(0, 80);
    const limit = Math.max(1, Math.min(5000, parseInt(sp.get("limit") || "3000", 10) || 3000));

    const lang = ["ru", "en", "cn"].includes(sp.get("lang") || "") ? (sp.get("lang") as "ru" | "en" | "cn") : "ru";
    const moex = sp.get("moex") !== "0";
    const res = await getCalendarRange(from, to, now, { moex, lang });
    const wantDesc = sp.get("desc") === "1";
    const events = filterEvents(res.events, { countries, impacts, q })
      .slice(0, limit)
      .map((e) => {
        if (wantDesc || !e.description) return e;
        const { description: _d, ...rest } = e;
        void _d;
        return rest;
      });
    return reply(events, reason && (res.reason === "ok" || res.reason === "mock") ? reason : res.reason, {
      ...(res.stale ? { "X-Calendar-Stale": "1" } : {}),
      "X-Calendar-Source": res.source,
      "X-Calendar-Tried": res.tried.join(","),
      ...(res.moex ? { "X-Calendar-Layers": "moex" } : {}),
      ...(res.coverage ? { "X-Calendar-Coverage": `${res.coverage.from}..${res.coverage.to}` } : {}),
      "X-Calendar-Range": `${from}..${to}`,
    }, 200, /gzip/i.test(request.headers.get("accept-encoding") || ""));
  } catch {
    return reply([], "upstream-error");
  }
}
