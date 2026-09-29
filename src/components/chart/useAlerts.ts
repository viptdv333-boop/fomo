"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseLineSpec, type LineSpec } from "@/lib/alerts/evaluate";

export interface AlertItem {
  id: string;
  source: string;
  dataTicker: string;
  ticker: string;
  name: string;
  kind: "price" | "line";
  condition: "cross" | "up" | "down";
  price: number | null;
  line: LineSpec | null;
  message: string | null;
  repeat: boolean;
  status: "active" | "triggered" | "paused" | "expired";
  expiresAt: string | null;
  triggeredAt: string | null;
  lastTriggerAt: string | null;
  triggerCount: number;
  createdAt: string;
}

export interface CreateAlertInput {
  source: string;
  ticker: string;
  dataTicker: string;
  name: string;
  kind: "price" | "line";
  condition: "cross" | "up" | "down";
  price?: number;
  line?: LineSpec;
  message?: string;
  repeat: boolean;
  expiresAt: string | null;
}

export type AlertPatch = Partial<Pick<AlertItem, "status" | "condition" | "price" | "message" | "repeat">>;

export type AlertResult = { ok: true } | { ok: false; error: "auth" | "limit" | "failed" };

const REFRESH_MS = 60_000;

function normalize(raw: any): AlertItem {
  return { ...raw, line: parseLineSpec(raw.line) };
}

/** The signed-in user's terminal alerts: fetched on mount, every 60 s, and on demand. */
export function useAlerts() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [guest, setGuest] = useState(false);
  const guestRef = useRef(false);
  const alive = useRef(true);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/terminal/alerts", { cache: "no-store" });
      if (!alive.current) return;
      if (r.status === 401) {
        guestRef.current = true;
        setGuest(true);
        setAlerts([]);
        return;
      }
      if (!r.ok) return;
      const j = await r.json();
      guestRef.current = false;
      setGuest(false);
      setAlerts(Array.isArray(j.alerts) ? j.alerts.map(normalize) : []);
    } catch {
      // offline: keep what we have
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refetch();
    const timer = setInterval(() => {
      if (!document.hidden && !guestRef.current) refetch();
    }, REFRESH_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refetch]);

  const call = useCallback(async (url: string, init: RequestInit): Promise<{ result: AlertResult; alert?: AlertItem }> => {
    try {
      const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      if (r.status === 401) return { result: { ok: false, error: "auth" } };
      if (r.status === 409) return { result: { ok: false, error: "limit" } };
      if (!r.ok) return { result: { ok: false, error: "failed" } };
      const j = await r.json().catch(() => ({}));
      return { result: { ok: true }, alert: j.alert ? normalize(j.alert) : undefined };
    } catch {
      return { result: { ok: false, error: "failed" } };
    }
  }, []);

  const create = useCallback(
    async (input: CreateAlertInput): Promise<AlertResult> => {
      const { result, alert } = await call("/api/terminal/alerts", { method: "POST", body: JSON.stringify(input) });
      if (result.ok && alert) setAlerts((a) => [alert, ...a]);
      else if (!result.ok && result.error === "auth") setGuest(true);
      return result;
    },
    [call]
  );

  const update = useCallback(
    async (id: string, patch: AlertPatch): Promise<AlertResult> => {
      const { result, alert } = await call(`/api/terminal/alerts/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
      if (result.ok && alert) setAlerts((a) => a.map((x) => (x.id === id ? alert : x)));
      return result;
    },
    [call]
  );

  const remove = useCallback(
    async (id: string): Promise<AlertResult> => {
      const { result } = await call(`/api/terminal/alerts/${id}`, { method: "DELETE" });
      if (result.ok) setAlerts((a) => a.filter((x) => x.id !== id));
      return result;
    },
    [call]
  );

  const activeCount = alerts.filter((a) => a.status === "active").length;
  return { alerts, activeCount, loading, guest, refetch, create, update, remove };
}

export type AlertsApi = ReturnType<typeof useAlerts>;
