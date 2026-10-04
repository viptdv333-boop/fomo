"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rangeBounds, MAX_RANGE_DAYS, daySpan, addDays, type DateRange } from "./time";
import type { CalEvent } from "./types";

export type CalStatus = "loading" | "ok" | "error";

export interface CalData {
  events: CalEvent[];
  status: CalStatus;
  /** X-Calendar-Reason of the last response ("ok", "restricted", "no-key", ...). */
  reason: string;
  stale: boolean;
  fetchedAt: number;
  refresh: () => void;
}

interface CacheEntry {
  events: CalEvent[];
  reason: string;
  stale: boolean;
  at: number;
}
const memo = new Map<string, CacheEntry>();
const FAIL_REASONS = new Set(["restricted", "unauthorized", "no-key", "upstream-error", "rate-limited", "bad-range"]);

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The API (UTC dates) range that exactly covers a display-zone range. */
export function apiRange(range: DateRange, zone: string): { from: string; to: string } {
  const b = rangeBounds(range, zone);
  const from = isoDay(b.start);
  let to = isoDay(b.end - 1);
  if (daySpan({ from, to }) > MAX_RANGE_DAYS) to = addDays(from, MAX_RANGE_DAYS - 1);
  return { from, to };
}

/** Events of a date range (in the display zone) with auto refresh: every minute while visible, every 15 s around releases. */
export function useCalendarRange(range: DateRange, zone: string, enabled: boolean): CalData {
  const { from, to } = apiRange(range, zone);
  const key = `${from}..${to}`;
  const [, bump] = useState(0);
  const entry = memo.get(key);
  const [status, setStatus] = useState<CalStatus>(entry ? "ok" : "loading");
  const lastRef = useRef(entry?.at ?? 0);
  const abortRef = useRef<AbortController | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(
    async (silent: boolean) => {
      const k = keyRef.current;
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      if (!silent && !memo.has(k)) setStatus("loading");
      try {
        const [f, t] = k.split("..");
        const res = await fetch(`/api/economic-calendar?from=${f}&to=${t}`, { signal: ctl.signal });
        const reason = res.headers.get("X-Calendar-Reason") || (res.ok ? "ok" : "upstream-error");
        const body: unknown = await res.json().catch(() => []);
        if (ctl.signal.aborted || keyRef.current !== k) return;
        const events = Array.isArray(body) ? (body as CalEvent[]) : [];
        const failed = events.length === 0 && (FAIL_REASONS.has(reason) || !res.ok);
        const stale = res.headers.get("X-Calendar-Stale") === "1";
        if (failed && memo.get(k)?.events.length) {
          // keep what we have, only flag it
          memo.set(k, { ...memo.get(k)!, reason, stale: true });
          setStatus("ok");
        } else {
          memo.set(k, { events, reason, stale, at: Date.now() });
          setStatus(failed ? "error" : "ok");
        }
        lastRef.current = Date.now();
        bump((n) => n + 1);
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") return;
        if (keyRef.current !== k) return;
        if (!memo.get(k)?.events.length) {
          memo.set(k, { events: [], reason: "upstream-error", stale: false, at: Date.now() });
          setStatus("error");
        }
        lastRef.current = Date.now();
        bump((n) => n + 1);
      }
    },
    []
  );

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
    refresh,
  };
}

const EMPTY: CalEvent[] = [];
