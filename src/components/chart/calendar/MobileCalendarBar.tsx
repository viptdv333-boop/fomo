"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { EC_ICONS } from "../icons-econ";
import ChartEventsButton from "./ChartEventsMenu";
import { iconBtn } from "./CalendarView";
import type { CalEvent } from "@/lib/calendar/types";
import { CategoryFilter, CountryFilter, SearchBox } from "./Filters";

interface Props {
  mode: "layer" | "page";
  onClose?: () => void;
  /** the time zone picker of the public page */
  zoneSlot?: ReactNode;
  /** the Calendar / List switch */
  viewTabs: ReactNode;
  /** the month window has navigation (the Calendar view); the List view has its own range tabs */
  nav: boolean;
  atToday: boolean;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  loading: boolean;
  onRefresh?: () => void;
  q: string;
  setQ: (v: string) => void;
  seen: string[];
  /** events of the shown range after the country and search filters: the category picker counts them */
  catEvents?: readonly CalEvent[];
}

/**
 * The header and the filters of the calendar on a phone, in tidy lines that never overflow the viewport:
 * title + zone + refresh (+ close), the view switch + month navigation, then the filters in the same order as everywhere:
 * countries and categories (two bottom-sheet pickers side by side), search.
 */
export default function MobileCalendarBar({ mode, onClose, zoneSlot, viewTabs, nav, atToday, onPrev, onToday, onNext, loading, onRefresh, q, setQ, seen, catEvents }: Props) {
  const { t } = useT();
  return (
    <div className="shrink-0 border-b border-[var(--tv3-hair)] px-3 pb-2 pt-2">
      <div className="flex min-w-0 items-center gap-2">
        {mode === "layer" && (
          <button type="button" onClick={onClose} aria-label={t("ec.back")} className={iconBtn}>
            <span className="scale-[0.92]">{EC_ICONS.prev}</span>
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{t("ec.title")}</h2>
        {zoneSlot && <div className="min-w-0 shrink [&_select]:h-8 [&_select]:max-w-[132px] [&_select]:text-[12px]">{zoneSlot}</div>}
        {onRefresh && (
          <button type="button" onClick={onRefresh} title={t("ec.refresh")} aria-label={t("ec.refresh")} className={iconBtn}>
            <span className={`inline-flex scale-[0.92] ${loading ? "animate-spin" : ""}`}>{EC_ICONS.refresh}</span>
          </button>
        )}
        {mode === "layer" && <ChartEventsButton className={iconBtn} onClassName="bg-[var(--tv3-accent-soft)]! text-[var(--tv3-accent)]!" />}
        {mode === "layer" && (
          <button type="button" onClick={onClose} aria-label={t("shell.close")} className={iconBtn}>
            <span className="scale-[0.92]">{EC_ICONS.close}</span>
          </button>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex shrink-0 rounded-[9px] bg-[var(--tv3-fill2)] p-0.5" role="tablist" aria-label={t("ec.view")}>
          {viewTabs}
        </div>
        {nav && (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={onPrev} aria-label={t("ec.prevPeriod")} title={t("ec.prevPeriod")} className={iconBtn}>
              <span className="scale-[0.92]">{EC_ICONS.prev}</span>
            </button>
            <button type="button" onClick={onToday} disabled={atToday} className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-[13px] font-medium cursor-pointer disabled:opacity-50 disabled:cursor-default">
              {t("ec.tab.today")}
            </button>
            <button type="button" onClick={onNext} aria-label={t("ec.nextPeriod")} title={t("ec.nextPeriod")} className={iconBtn}>
              <span className="scale-[0.92]">{EC_ICONS.next}</span>
            </button>
          </div>
        )}
      </div>

      <div role="group" aria-label={t("ec.filters")} className="mt-2 flex items-center gap-2">
        <div className="flex min-w-0 flex-1"><CountryFilter seen={seen} /></div>
        <div className="flex min-w-0 flex-1"><CategoryFilter events={catEvents} /></div>
      </div>

      <div className="mt-2 flex"><SearchBox q={q} setQ={setQ} /></div>
    </div>
  );
}
