"use client";

import { useSyncExternalStore } from "react";
import { listUserData, saveUserData } from "@/lib/chart/userdata";
import { EVENT_CATEGORIES, type EventCategory } from "./categories";
import type { DateRange, RangePreset } from "./time";

/* Calendar preferences shared by the side panel, the wide dialog and the chart overlay.
   localStorage first (no flicker), the account copy (userdata 'calendar_prefs'/'default') merged in when it is newer.
   There is no importance filter any more: the list, grid, modal and page always show every event (a stored `impacts` of older
   versions is ignored; only the chart overlay keeps its own `chart.impacts`).
   The layer switches (moex, commodities, corp, russia) and the oil-and-gas chip are gone from the UI: the data of every layer is always
   shown and narrowed by `categories` (lib/calendar/categories.ts). The old fields stay in the object so stored copies and the chart
   overlay keep working, but they are normalised to their «on» defaults, whatever an older version saved. */

export interface CalPrefs {
  v: 1;
  at: number;
  /** Selected countries; empty = all. */
  countries: string[];
  /** Selected categories (eventCategory); empty = all. */
  categories: EventCategory[];
  /** The "My countries" preset: saved with the "save as mine" action. */
  mine: string[];
  preset: RangePreset;
  custom: DateRange | null;
  /** Events on the chart. */
  chart: { on: boolean; impacts: number[] };
  /** Legacy, always true (no switch in the UI). The Moscow Exchange layer (trading calendar, expirations): list, grid and chart. */
  moex: boolean;
  /** Legacy, always true. The commodities / agriculture layer (USDA, CONAB, cocoa grindings, MPOB ... report dates): list, grid and chart. */
  commodities: boolean;
  /** Legacy, always true. The corporate-events layer (dividends, bond coupons, reporting dates of Russian issuers): always requested. */
  corp: boolean;
  /** Legacy, always true. The Russia layer (Bank of Russia, Rosstat, Minfin OFZ auction schedules): list, grid and chart. */
  russia: boolean;
  /** Legacy, always false (replaced by the «Энергетика» category). */
  energy: boolean;
  /** Full-page calendar view: month squares or the list. */
  view: "grid" | "list";
  /** Narrow side panel: mini month instead of the list. */
  panelGrid: boolean;
}

export const DEFAULT_CAL_PREFS: CalPrefs = {
  v: 1,
  at: 0,
  countries: [],
  categories: [],
  mine: [],
  preset: "today",
  custom: null,
  chart: { on: false, impacts: [3] },
  moex: true,
  commodities: true,
  corp: true,
  russia: true,
  energy: false,
  view: "grid",
  panelGrid: false,
};

const LS = "fomo-calendar-prefs-v1";
const PRESETS: RangePreset[] = ["yesterday", "today", "tomorrow", "week", "d30", "nextweek", "custom"];

const isDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const levels = (v: unknown, def: number[]): number[] => {
  if (!Array.isArray(v)) return def;
  const out = [...new Set(v.filter((x): x is number => x === 1 || x === 2 || x === 3))].sort();
  return out.length ? out : def;
};
const codes = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[A-Za-z]{2}$/.test(x)).map((x) => x.toUpperCase()))].slice(0, 80) : [];

const categoryList = (v: unknown): EventCategory[] =>
  Array.isArray(v) ? EVENT_CATEGORIES.filter((c) => v.includes(c)) : [];

export function normalizeCalPrefs(raw: unknown): CalPrefs {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const chart = r.chart && typeof r.chart === "object" ? (r.chart as Record<string, unknown>) : {};
  const custom = r.custom && typeof r.custom === "object" ? (r.custom as Record<string, unknown>) : null;
  return {
    v: 1,
    at: typeof r.at === "number" ? r.at : 0,
    countries: codes(r.countries),
    // an older copy with the «Нефть и газ» chip on becomes the «Энергетика» category (the nearest thing to what the user had)
    categories: Array.isArray(r.categories) ? categoryList(r.categories) : r.energy === true ? ["energy"] : [],
    mine: codes(r.mine),
    preset: PRESETS.includes(r.preset as RangePreset) ? (r.preset as RangePreset) : "today",
    custom: custom && isDate(custom.from) && isDate(custom.to) ? { from: custom.from, to: custom.to } : null,
    chart: { on: chart.on === true, impacts: levels(chart.impacts, DEFAULT_CAL_PREFS.chart.impacts) },
    // the layer switches are gone from the UI: a layer an older version switched off is simply shown again
    moex: true,
    commodities: true,
    corp: true,
    russia: true,
    energy: false,
    view: r.view === "list" ? "list" : "grid",
    panelGrid: r.panelGrid === true,
  };
}

let state: CalPrefs = DEFAULT_CAL_PREFS;
let started = false;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;

function emit() {
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const raw = localStorage.getItem(LS);
    if (raw) state = normalizeCalPrefs(JSON.parse(raw));
  } catch {}
  emit();
  void listUserData("calendar_prefs", "default").then((items) => {
    if (dirty) return;
    const it = items[0];
    if (!it) {
      if (state.at > 0) void saveUserData("calendar_prefs", "default", state);
      return;
    }
    const remote = normalizeCalPrefs(it.data);
    if (remote.at > state.at) {
      state = remote;
      try {
        localStorage.setItem(LS, JSON.stringify(state));
      } catch {}
      emit();
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== LS || !e.newValue) return;
    try {
      state = normalizeCalPrefs(JSON.parse(e.newValue));
      emit();
    } catch {}
  });
  window.addEventListener("pagehide", () => {
    if (dirty) void saveUserData("calendar_prefs", "default", state);
  });
}

export function getCalPrefs(): CalPrefs {
  return state;
}

export function updateCalPrefs(fn: (p: CalPrefs) => CalPrefs) {
  start();
  state = { ...normalizeCalPrefs(fn(state)), at: Date.now() };
  try {
    localStorage.setItem(LS, JSON.stringify(state));
  } catch {}
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    dirty = false;
    void saveUserData("calendar_prefs", "default", state);
  }, 900);
  emit();
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useCalPrefs(): [CalPrefs, typeof updateCalPrefs] {
  const p = useSyncExternalStore(subscribe, getCalPrefs, () => DEFAULT_CAL_PREFS);
  return [p, updateCalPrefs];
}
