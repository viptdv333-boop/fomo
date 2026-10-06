// Pure helpers of the app-only Terminal screen (src/components/app/AppTerminal.tsx). No React, no DOM: scripts/check-app-ui.ts runs them.
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";

/** The timeframe chips of the design («1м 5м 15м 30м 1ч 4ч Д Н М») as the chart's interval ids. */
export const APP_TERM_TFS: readonly string[] = ["1", "5", "15", "30", "60", "240", "D", "W", "M"];

/** The range row of the design («1Д 5Д 1М 3М 6М YTD 1Г 5Л Все»), in the chart's range ids. */
export const APP_TERM_RANGES = ["1d", "5d", "1m", "3m", "6m", "ytd", "1y", "5y", "all"] as const;

/** Shown while a number is unknown. */
export const NO_VALUE = "\u2014";

/** "+1.25%" / "-0.40%" / "0.00%"; junk -> "—". Locale only changes the decimal separator. */
export function pctLabel(v: unknown, locale: string): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return NO_VALUE;
  const rounded = Math.round(Math.abs(v) * 100) / 100;
  const s = rounded.toFixed(2);
  const body = locale === "ru" ? s.replace(".", ",") : s;
  return `${rounded === 0 ? "" : v > 0 ? "+" : "-"}${body}%`;
}

/** The design colors the change green for >= 0 and red below; unknown values stay neutral (null). */
export function changeTone(v: unknown): "up" | "down" | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v >= 0 ? "up" : "down";
}

interface BoardInstrumentLike {
  id: string;
  ticker?: string | null;
}

/** The board's instrument (feed filter `instrumentId`) that stands for a terminal ticker: the exact ticker, case-insensitive; null when the board has none. */
export function pickBoardInstrument<T extends BoardInstrumentLike>(list: unknown, ticker: string): T | null {
  if (!Array.isArray(list)) return null;
  const want = ticker.trim().toLowerCase();
  if (!want) return null;
  for (const it of list) {
    if (it && typeof it === "object" && typeof (it as T).id === "string" && typeof (it as T).ticker === "string" && (it as T).ticker!.toLowerCase() === want) return it as T;
  }
  return null;
}

/** The board link of the «Идеи FOMO по …» card: the feed filtered to the instrument (the same `instrumentId` the feed page reads), the whole feed when the board has no such instrument. */
export function ideasHref(locale: Locale, instrumentId: string | null): string {
  const base = localizedPath(locale, "/feed");
  return instrumentId ? `${base}?instrumentId=${encodeURIComponent(instrumentId)}` : base;
}

/** Idea count out of an /api/ideas answer (`total`); anything else -> null (unknown, the card shows no number). */
export function ideasTotal(answer: unknown): number | null {
  const n = (answer as { total?: unknown } | null)?.total;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** The delay sentence of the disclaimer applies to MOEX data that is delayed (the chart says so) or a guest's MOEX data. */
export function showDelayNote(source: string, chartDelayed: boolean, guest: boolean): boolean {
  return source === "moex" && (chartDelayed || guest);
}

/** Vertical size of the chart block of the page (CSS length): the design's chart is a ~300px card; the real chart needs room for its own panes. */
export const APP_TERM_CHART_HEIGHT = "clamp(360px, 46dvh, 480px)";
