"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/calendar/countries";
import { buildMonthCells, monthWindowStart, outsideCoverage } from "@/lib/calendar/grid";
import { filterEvents } from "@/lib/calendar/normalize";
import { useCalPrefs } from "@/lib/calendar/prefs";
import { addDays, dayKey, eventDay, formatDayHeading } from "@/lib/calendar/time";
import { useCalendarWindow } from "@/lib/calendar/useCalendar";
import type { CalEvent } from "@/lib/calendar/types";
import { EC_ICONS } from "../icons-econ";
import ChartEventsButton from "./ChartEventsMenu";
import CalendarView, { NextChip, iconBtn } from "./CalendarView";
import DayModal from "./DayModal";
import EventDetails from "./EventDetails";
import { CountryFilter, ImpactToggles, MoexChip, QuickChips, SearchBox } from "./Filters";
import type { Anchor } from "./FloatingPanel";
import MonthGrid from "./MonthGrid";
import { SourceFooter, useNow } from "./parts";

const DAYS = 35;

interface Props {
  /** IANA zone the times are shown in. */
  zone: string;
  /** "layer": opened from the terminal (back button, Esc); "page": the public /calendar page. */
  mode: "layer" | "page";
  onClose?: () => void;
  /** extra controls in the header (the time zone picker of the public page) */
  zoneSlot?: ReactNode;
  visible?: boolean;
}

/**
 * The world economic calendar on a whole page: a month of squares with the day's events in each (default) or the list, the
 * filter bar on top, a day modal on click. One component for the terminal's full-page layer and the public /calendar page.
 */
export default function WorldCalendar({ zone, mode, onClose, zoneSlot, visible = true }: Props) {
  const { t, locale } = useT();
  const loc = intlLocale(locale);
  const [prefs, update] = useCalPrefs();
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [openDay, setOpenDay] = useState<{ date: string; focusId?: string } | null>(null);
  const [details, setDetails] = useState<{ ev: CalEvent; anchor: Anchor } | null>(null);
  const now = useNow(60_000, visible);
  const today = dayKey(now, zone);
  const start = useMemo(() => addDays(monthWindowStart(today), offset * 28), [today, offset]);
  const grid = prefs.view === "grid";
  const data = useCalendarWindow(start, zone, visible && grid, locale, DAYS);
  const cells = useMemo(() => buildMonthCells(start, today, DAYS), [start, today]);

  const events = useMemo(
    () => filterEvents(data.events, { countries: new Set(prefs.countries), impacts: new Set(prefs.impacts), q, noMoex: !prefs.moex }),
    [data.events, prefs.countries, prefs.impacts, prefs.moex, q]
  );
  const seen = useMemo(() => [...new Set(data.events.map((e) => e.country).filter(Boolean))], [data.events]);

  const dayEvents = useMemo(() => (openDay ? events.filter((e) => eventDay(e, zone) === openDay.date) : []), [events, openDay, zone]);
  const idx = openDay ? cells.findIndex((c) => c.date === openDay.date) : -1;
  const goDay = useCallback((delta: number) => setOpenDay((d) => (d ? { date: addDays(d.date, delta) } : d)), []);

  // Esc closes the layer (a day modal or a popup inside stops it first)
  useEffect(() => {
    if (mode !== "layer" || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[data-day-modal]")) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, onClose]);

  const rangeTitle = `${formatDayHeading(start, loc, { day: "numeric", month: "short" })} — ${formatDayHeading(addDays(start, DAYS - 1), loc, { day: "numeric", month: "short", year: "numeric" })}`;
  const openDetails = (ev: CalEvent, anchor: Anchor) => setDetails({ ev, anchor });

  const seg = (id: "grid" | "list", icon: ReactNode, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={prefs.view === id}
      onClick={() => update((p) => ({ ...p, view: id }))}
      className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] cursor-pointer transition ${prefs.view === id ? "bg-white font-semibold text-gray-900 shadow-sm dark:bg-[#363a45] dark:text-gray-100" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"}`}
    >
      <span className="scale-[0.72]">{icon}</span>
      {label}
    </button>
  );

  const banner = (() => {
    if (!grid) return null;
    if (data.status === "error") {
      const key = `ec.err.${data.reason}`;
      const msg = t(key);
      return (
        <div className="flex items-center gap-3 border-b border-red-300/40 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
          <span className="font-semibold">{t(data.reason === "range-unsupported" ? "ec.err.rangeTitle" : "ec.err.title")}</span>
          <span className="flex-1">{msg === key ? t("ec.err.upstream-error") : msg}</span>
          <button type="button" onClick={data.refresh} className="h-7 rounded-md border border-red-300/60 px-2.5 cursor-pointer hover:bg-red-100 dark:hover:bg-red-500/20">
            {t("ec.retry")}
          </button>
        </div>
      );
    }
    if (data.coverage) return <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("ec.err.range-unsupported")}</div>;
    if (data.stale) return <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("ec.stale")}</div>;
    if (data.reason === "partial") return <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-1.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("ec.partial")}</div>;
    if (data.reason === "mock") return <div className="border-b border-sky-300/40 bg-sky-50 px-4 py-1.5 text-xs text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{t("ec.mock")}</div>;
    return null;
  })();

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white text-gray-900 dark:bg-[#1e222d] dark:text-gray-100">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200 px-3 py-2 dark:border-[#2a2e39] sm:px-4">
        {mode === "layer" && (
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 text-[12px] font-medium cursor-pointer hover:bg-gray-100 dark:border-[#363a45] dark:hover:bg-[#2a2e39]">
            <span className="scale-[0.8]">{EC_ICONS.prev}</span>
            {t("ec.back")}
          </button>
        )}
        <h2 className="text-base font-semibold sm:text-lg">{t("ec.title")}</h2>
        <div className="flex rounded-lg bg-gray-100 p-0.5 dark:bg-[#262a36]" role="tablist" aria-label={t("ec.view")}>
          {seg("grid", EC_ICONS.grid, t("ec.view.grid"))}
          {seg("list", EC_ICONS.list, t("ec.view.list"))}
        </div>
        <div className="hidden min-w-0 max-w-[420px] flex-1 md:flex">
          <NextChip zone={zone} enabled={visible} onPick={openDetails} />
        </div>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[11px] text-gray-400 sm:inline">{t("ec.tz")}: {zone}</span>
          {zoneSlot}
          {grid && (
            <button type="button" onClick={data.refresh} title={t("ec.refresh")} aria-label={t("ec.refresh")} className={iconBtn}>
              <span className={`inline-flex scale-[0.8] ${data.status === "loading" ? "animate-spin" : ""}`}>{EC_ICONS.refresh}</span>
            </button>
          )}
          {mode === "layer" && <ChartEventsButton className={iconBtn} onClassName="bg-green-600/12! text-green-700! dark:text-green-400!" />}
          {mode === "layer" && (
            <button type="button" onClick={onClose} aria-label={t("shell.close")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.close}</span>
            </button>
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-3 py-2 dark:border-[#2a2e39] sm:px-4">
        {grid && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={t("ec.prevPeriod")} title={t("ec.prevPeriod")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.prev}</span>
            </button>
            <button type="button" onClick={() => setOffset(0)} disabled={offset === 0} className="h-7 rounded-md border border-gray-200 px-2 text-[12px] cursor-pointer hover:bg-gray-100 disabled:opacity-50 disabled:cursor-default dark:border-[#363a45] dark:hover:bg-[#2a2e39]">
              {t("ec.tab.today")}
            </button>
            <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label={t("ec.nextPeriod")} title={t("ec.nextPeriod")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.next}</span>
            </button>
            <span className="ml-1 text-[12px] font-medium tabular-nums text-gray-700 dark:text-gray-200">{rangeTitle}</span>
          </div>
        )}
        <ImpactToggles />
        <div className="flex w-[190px] max-w-full"><CountryFilter seen={seen} /></div>
        <div className="hidden sm:block"><QuickChips /></div>
        <MoexChip />
        <div className="flex min-w-[150px] max-w-[260px] flex-1"><SearchBox q={q} setQ={setQ} /></div>
      </div>

      {banner}

      <div className="min-h-0 flex-1 overflow-auto" aria-busy={data.status === "loading"}>
        {grid ? (
          <MonthGrid cells={cells} events={events} zone={zone} locale={loc} coverage={data.coverage} onOpenDay={(date, focusId) => setOpenDay({ date, focusId })} />
        ) : (
          <CalendarView variant="embedded" zone={zone} visible={visible} query={q} />
        )}
      </div>
      {grid && <SourceFooter source={data.source} moex={data.moex} className="shrink-0 border-t border-gray-100 dark:border-[#2a2e39]" />}

      {openDay && (
        <DayModal
          date={openDay.date}
          events={dayEvents}
          zone={zone}
          locale={loc}
          focusId={openDay.focusId}
          canPrev={idx > 0}
          canNext={idx >= 0 && idx < cells.length - 1}
          noData={outsideCoverage(openDay.date, data.coverage, zone)}
          onPrev={() => goDay(-1)}
          onNext={() => goDay(1)}
          onClose={() => setOpenDay(null)}
        />
      )}
      {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
    </div>
  );
}
