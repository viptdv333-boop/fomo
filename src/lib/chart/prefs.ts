/**
 * Chart preferences (`fomo-chart-prefs-v1`, local mirror + account copy): the pure part. Whatever was stored - an old build's JSON, a foreign copy,
 * a hand-edited / half-written value - goes through `sanitizePrefs`, so a bad field falls back to its default instead of reaching the chart
 * (an object where the interval id must be a string used to take the whole page down: «Что-то пошло не так»).
 * Run the check:  npx tsx scripts/check-prefs-sanitize.ts
 */
import type { ChartType } from "./types";
import type { PanelTab } from "@/components/chart/RightPanel";
import { isValidInterval, usableInterval } from "./timeframes";

export interface Prefs {
  interval: string;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showWatermark: boolean;
  logScale: boolean;
  panelOpen: boolean;
  panelTab: PanelTab;
}

export const DEFAULT_PREFS: Prefs = {
  interval: "D",
  chartType: "candles",
  showVolume: true,
  showGrid: true,
  showWatermark: true,
  logScale: false,
  panelOpen: true,
  panelTab: "watchlist",
};

/** Exhaustive on purpose: a new chart type / panel tab that is not listed here fails the type check. */
const CHART_TYPE_SET: Record<ChartType, true> = {
  candles: true,
  hollow: true,
  bars: true,
  line: true,
  area: true,
  heikin: true,
  columns: true,
  highlow: true,
  linemarkers: true,
  step: true,
  baseline: true,
  volcandles: true,
  renko: true,
  kagi: true,
  linebreak: true,
  range: true,
  pnf: true,
  footprint: true,
};
const PANEL_TAB_SET: Record<PanelTab, true> = {
  watchlist: true,
  info: true,
  ideas: true,
  news: true,
  calendar: true,
  objects: true,
  alerts: true,
  orderbook: true,
  algo: true,
};
export const PANEL_TABS = Object.keys(PANEL_TAB_SET) as PanelTab[];

const has = (set: object, k: unknown): boolean => typeof k === "string" && Object.prototype.hasOwnProperty.call(set, k);

/** Preferences from any stored value: every field checked, anything unknown falls back to the default (an old / foreign / broken copy never breaks the chart). */
export function sanitizePrefs(raw: unknown): Prefs {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const D = DEFAULT_PREFS;
  return {
    interval: typeof o.interval === "string" && isValidInterval(o.interval) ? o.interval : D.interval,
    chartType: has(CHART_TYPE_SET, o.chartType) ? (o.chartType as ChartType) : D.chartType,
    showVolume: bool(o.showVolume, D.showVolume),
    showGrid: bool(o.showGrid, D.showGrid),
    showWatermark: bool(o.showWatermark, D.showWatermark),
    logScale: bool(o.logScale, D.logScale),
    panelOpen: bool(o.panelOpen, D.panelOpen),
    panelTab: has(PANEL_TAB_SET, o.panelTab) ? (o.panelTab as PanelTab) : D.panelTab,
  };
}

/** The stored JSON text -> preferences; unreadable / empty / not an object -> the defaults. */
export function parsePrefs(text: string | null | undefined): Prefs {
  if (!text) return DEFAULT_PREFS;
  try {
    return sanitizePrefs(JSON.parse(text));
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * The interval the chart can really show for a source: an invalid id -> the default, seconds where the source has none -> 1 minute.
 * (The chart's own effect does the second step too, once the seconds answer is in; the chip row uses this so it never shows a chip the chart does not draw.)
 */
export function shownInterval(interval: unknown, source: string): string {
  const id = typeof interval === "string" && isValidInterval(interval) ? interval : DEFAULT_PREFS.interval;
  return usableInterval(id, source);
}

/**
 * Keys the chart keeps in localStorage that «Сбросить настройки графика» clears (layout / indicators / drawings are the user's work and stay):
 * the preferences and the chart settings (pinned timeframes ...), both with and without a multi-chart pane suffix.
 */
export const CHART_RESET_KEYS = ["fomo-chart-prefs-v1", "fomo-chart-settings-v1"];

/** localStorage keys (of a list of all keys) that belong to the chart preferences: the exact keys and their `:pane` variants. */
export function chartResetKeys(allKeys: readonly string[]): string[] {
  return allKeys.filter((k) => CHART_RESET_KEYS.some((r) => k === r || k.startsWith(r + ":")));
}
