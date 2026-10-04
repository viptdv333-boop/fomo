"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeEvents } from "./normalize";
import { useCalPrefs } from "./prefs";
import { rangeBounds, MAX_RANGE_DAYS, daySpan, addDays, type DateRange } from "./time";
import type { CalEvent } from "./types";

export type CalStatus = "loading" | "ok" | "error";

export interface CalData {
  events: CalEvent[];
  status: CalStatus;
  /** X-Calendar-Reason of the last response ("ok", "restricted", "range-unsupported", ...). */
  reason: string;
  stale: boolean;
  fetchedAt: number;
  /** Provider that answered: tradingview | fmp | forexfactory | mock | none. */
  source: string;
  /** The Moscow Exchange layer is part of the answer. */
  moex: boolean;
  /** The commodities / agriculture layer is part of the answer. */
  commodity: boolean;
  /** The corporate-events layer (dividends, coupons, reports) is part of the answer. */
  corp: boolean;
  /** The Russia layer is part of the answer. */
  russia: boolean;
  /** The span the provider knows about (Forex Factory: this + next week); null = unlimited. */
  coverage: { from: number; to: number } | null;
  refresh: () => void;
}

interface CacheEntry {
  events: CalEvent[];
  reason: string;
  stale: boolean;
  at: number;
  source: string;
  moex: boolean;
  commodity: boolean;
  corp: boolean;
  russia: boolean;
  coverage: { from: number; to: number } | null;
}
const memo = new Map<string, CacheEntry>();
const FAIL_REASONS = new Set(["restricted", "unauthorized", "no-key", "upstream-error", "rate-limited", "bad-range", "range-unsupported"]);

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The API (UTC dates) range that exactly covers a display-zone range. */
export function apiRange(range: DateRange, zone: string): { from: string; to: string } {
  const b = rangeBounds(range, zone);
  const from = isoDay(b.start);
  let to = isoDay(b.end - 1);
  if (daySpan({ from, to }) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
  return { from, to };
}

function parseCoverage(h: string | null): { from: number; to: number } | null {
  const m = h ? /^(\d+)\.\.(\d+)$/.exec(h) : null;
  return m ? { from: +m[1], to: +m[2] } : null;
}

const EMPTY: CalEvent[] = [];

/** Events of a date range (in the display zone) with auto refresh: every minute while visible, every 15 s around releases. */
export function useCalendarRange(range: DateRange, zone: string, enabled: boolean, lang = "ru"): CalData {
  const { from, to } = apiRange(range, zone);
  // the «Dividends and reporting» chip is a server side switch (corp=0): part of the cache key, so toggling it refetches once and then flips instantly
  const [prefs] = useCalPrefs();
  const key = `${lang}|${from}..${to}|${prefs.corp ? 1 : 0}`;
  const [, bump] = useState(0);
  const entry = memo.get(key);
  const [status, setStatus] = useState<CalStatus>(entry ? "ok" : "loading");
  const lastRef = useRef(entry?.at ?? 0);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async (silent: boolean) => {
    const k = keyRef.current;
    abortRef.current?.abort();
    const ctl = new AbortController();
    abortRef.current = ctl;
    if (!silent && !memo.has(k)) setStatus("loading");
    try {
      const [lg, span, corpOn] = k.split("|");
      const [f, t] = span.split("..");
      const res = await fetch(`/api/economic-calendar?from=${f}&to=${t}&lang=${lg}${corpOn === "0" ? "&corp=0" : ""}`, { signal: ctl.signal });
      const reason = res.headers.get("X-Calendar-Reason") || (res.ok ? "ok" : "upstream-error");
      const body: unknown = await res.json().catch(() => []);
      if (ctl.signal.aborted || keyRef.current !== k) return;
      const events = Array.isArray(body) ? (body as CalEvent[]) : [];
      const failed = events.length === 0 && (FAIL_REASONS.has(reason) || !res.ok);
      const entryNew: CacheEntry = {
        events,
        reason,
        stale: res.headers.get("X-Calendar-Stale") === "1",
        at: Date.now(),
        source: res.headers.get("X-Calendar-Source") || "none",
        moex: (res.headers.get("X-Calendar-Layers") || "").includes("moex"),
        commodity: (res.headers.get("X-Calendar-Layers") || "").includes("commodity"),
        corp: (res.headers.get("X-Calendar-Layers") || "").includes("corp"),
        russia: (res.headers.get("X-Calendar-Layers") || "").includes("russia"),
        coverage: parseCoverage(res.headers.get("X-Calendar-Coverage")),
      };
      if (failed && memo.get(k)?.events.length) {
        memo.set(k, { ...memo.get(k)!, reason, stale: true });
        setStatus("ok");
      } else {
        memo.set(k, entryNew);
        setStatus(failed ? "error" : "ok");
      }
      lastRef.current = Date.now();
      bump((n) => n + 1);
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      if (keyRef.current !== k) return;
      if (!memo.get(k)?.events.length) {
        memo.set(k, { events: [], reason: "upstream-error", stale: false, at: Date.now(), source: "none", moex: false, commodity: false, corp: false, russia: false, coverage: null });
        setStatus("error");
      }
      lastRef.current = Date.now();
      bump((n) => n + 1);
    }
  }, []);

  // range changed or panel shown: show the remembered copy at once, refresh in the background
  useEffect(() => {
    if (!enabled) return;
    const e = memo.get(key);
    setStatus(e ? (e.events.length === 0 && FAIL_REASONS.has(e.reason) ? "error" : "ok") : "loading");
    lastRef.current = e?.at ?? 0;
    void load(!!e);
    return () => abortRef.current?.abort();
  }, [key, enabled, load]);

  // periodic refresh
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      const now = Date.now();
      const evs = memo.get(keyRef.current)?.events ?? [];
      const hot = evs.some((e) => !e.allDay && e.actual === null && now - e.ts > -30_000 && now - e.ts < 15 * 60_000);
      if (now - lastRef.current >= (hot ? 15_000 : 60_000)) void load(true);
    }, 5000);
    const onVis = () => {
      if (!document.hidden && Date.now() - lastRef.current > 60_000) void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [enabled, load]);

  const cur = memo.get(key);
  const refresh = useCallback(() => void load(false), [load]);
  return {
    events: cur?.events ?? EMPTY,
    status,
    reason: cur?.reason ?? "ok",
    stale: cur?.stale ?? false,
    fetchedAt: cur?.at ?? 0,
    source: cur?.source ?? "none",
    moex: cur?.moex ?? false,
    commodity: cur?.commodity ?? false,
    corp: cur?.corp ?? false,
    russia: cur?.russia ?? false,
    coverage: cur?.coverage ?? null,
    refresh,
  };
}

/**
 * A window of up to 35 days (the month grid): two requests (21 + 14 days) merged. Status is "error" only when both fail;
 * the coverage and source are those of the first part that answered.
 */
export function useCalendarWindow(start: string, zone: string, enabled: boolean, lang = "ru", days = 35): CalData {
  const r1 = useMemo(() => ({ from: start, to: addDays(start, Math.min(days, 21) - 1) }), [start, days]);
  const r2 = useMemo(() => (days > 21 ? { from: addDays(start, 21), to: addDays(start, days - 1) } : { from: addDays(start, 20), to: addDays(start, 20) }), [start, days]);
  const a = useCalendarRange(r1, zone, enabled, lang);
  const b = useCalendarRange(r2, zone, enabled && days > 21, lang);
  const events = useMemo(() => (days > 21 ? mergeEvents([a.events, b.events]) : a.events), [a.events, b.events, days]);
  const status: CalStatus = a.status === "loading" || (days > 21 && b.status === "loading") ? (events.length ? "ok" : "loading") : a.status === "error" && (days <= 21 || b.status === "error") ? "error" : "ok";
  const best = a.status === "ok" && a.events.length ? a : b.status === "ok" && b.events.length ? b : a;
  return {
    events,
    status,
    reason: a.status === "error" ? a.reason : best.reason,
    stale: a.stale || b.stale,
    fetchedAt: Math.max(a.fetchedAt, b.fetchedAt),
    source: best.source,
    moex: a.moex || b.moex,
    commodity: a.commodity || b.commodity,
    corp: a.corp || b.corp,
    russia: a.russia || b.russia,
    coverage: a.coverage ?? b.coverage,
    refresh: () => {
      a.refresh();
      if (days > 21) b.refresh();
    },
  };
}
