"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import type { CalEvent } from "./types";

/*
 * One-line impact summaries of the events («brief») for the rows of the calendar. They are NOT in the list payload: the client
 * looks them up by the glossary key `gk` in the glossary chunk, which is loaded lazily (once, shared by all rows). Rows
 * subscribe to the load, so they re-render when the chunk arrives. Russian only (the texts exist only in Russian).
 */

type Glossary = typeof import("./glossary");

let gl: Glossary | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function load() {
  if (gl || loading) return;
  loading = import("./glossary")
    .then((m) => {
      gl = m;
      listeners.forEach((l) => l());
    })
    .catch(() => {
      loading = null; // a later subscriber retries
    });
}

function subscribe(l: () => void) {
  listeners.add(l);
  load();
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => gl;
const serverSnapshot = () => null;

const OBVIOUS = /stocks|storage|inventor|rig count/i;
/** Energy inventories, rig counts and the USDA stock reports (Grain Stocks, Cold Storage) need no comment: clear from the title. */
const STOCK_KEYS = new Set(["agro.grainstocks", "agro.coldstorage"]);
const isInventory = (ev: CalEvent) =>
  ((ev.tags ?? []).some((t) => t === "oil" || t === "gas") && OBVIOUS.test(ev.eventEn ?? "")) || (!!ev.gk && STOCK_KEYS.has(ev.gk));

/** The brief of an event, or null (energy inventories, MOEX rows, not Russian). Needs the glossary loaded. */
export function briefOf(g: Glossary | null, ev: CalEvent, locale: string): string | null {
  if (!g || locale !== "ru" || ev.category === "moex" || isInventory(ev)) return null;
  // every event has a line: its own rule, else the generic text of its category (the ruble wording for Russia), else the catch-all
  return g.glossaryBrief(ev.gk ?? `~${ev.category}`, locale, ev.country) ?? g.glossaryBrief("~other", locale, ev.country);
}

/** Whether an event can have a brief at all (so a row can reserve its line while the glossary chunk is still loading). */
export const mayHaveBrief = (ev: CalEvent, locale: string) => locale === "ru" && ev.category !== "moex" && !isInventory(ev);

/**
 * `get(ev)` returns the brief of an event (null when there is none); `ready` is false until the glossary chunk has arrived.
 * Every component that calls the hook re-renders once the chunk is there.
 */
export function useBriefs(): { ready: boolean; get: (ev: CalEvent) => string | null } {
  const { locale } = useT();
  const g = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const get = useCallback((ev: CalEvent) => briefOf(g, ev, locale), [g, locale]);
  return { ready: g !== null || locale !== "ru", get };
}
