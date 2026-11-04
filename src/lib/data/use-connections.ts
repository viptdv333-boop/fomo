"use client";

/* The signed-in user's data-provider connections (which providers have a key), shared by the provider page, the connect window and the search rows.
   One fetch per page load; `refreshConnections()` after a key is saved / removed. A plain module store, like the other small client flags. */
import { useEffect, useState } from "react";

interface State {
  loaded: boolean;
  /** provider ids with a stored, enabled key */
  on: Set<string>;
  /** the account is not signed in / the request failed: nothing is known */
  unknown: boolean;
}

let state: State = { loaded: false, on: new Set(), unknown: false };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function refreshConnections(): Promise<void> {
  inflight ??= fetch("/api/data/connections", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((d: { connections?: { provider: string; enabled: boolean }[] }) => {
      state = { loaded: true, unknown: false, on: new Set((d.connections ?? []).filter((c) => c.enabled).map((c) => c.provider)) };
    })
    .catch(() => {
      state = { loaded: true, unknown: true, on: new Set() };
    })
    .finally(() => {
      inflight = null;
      emit();
    });
  return inflight;
}

export function useConnections(): State {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    if (!state.loaded) void refreshConnections();
    return () => {
      listeners.delete(f);
    };
  }, []);
  return state;
}
