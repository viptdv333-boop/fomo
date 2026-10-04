"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/calendar/countries";
import { buildMonthCells, monthWindowStart, outsideCoverage } from "@/lib/calendar/grid";
import { parseCalendarHash, offsetForDay } from "@/lib/calendar/hash";
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
import { CommodityChip, CorpChip, CountryFilter, EnergyChip, MoexChip, QuickChips, RussiaChip, SearchBox } from "./Filters";
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
    () => filterEvents(data.events, { countries: new Set(prefs.countries), q, noMoex: !prefs.moex, noCommodity: !prefs.commodities, noRu: !prefs.russia, energy: prefs.energy }),
    [data.events, prefs.countries, prefs.moex, prefs.commodities, prefs.russia, prefs.energy, q]
  );
  const seen = useMemo(() => [...new Set(data.events.map((e) => e.country).filter(Boolean))], [data.events]);

  const dayEvents = useMemo(() => (openDay ? events.filter((e) => eventDay(e, zone) === openDay.date) : []), [events, openDay, zone]);
  const idx = openDay ? cells.findIndex((c) => c.date === openDay.date) : -1;
  const goDay = useCallback((delta: number) => setOpenDay((d) => (d ? { date: addDays(d.date, delta) } : d)), []);

  // the link of a reminder notification, /calendar#2026-10-05, opens that day
  useEffect(() => {
    if (mode !== "page") return;
    const day = parseCalendarHash(window.location.hash);
    if (!day) return;
    update((p) => (p.view === "grid" ? p : { ...p, view: "grid" }));
    setOffset(offsetForDay(monthWindowStart(dayKey(Date.now(), zone)), day));
    setOpenDay({ date: day });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className={`inline-flex h-7 items-center gap-1.5 rounded-[7px] px-2.5 text-[12px] font-semibold cursor-pointer transition ${prefs.view === id ? "bg-[var(--tv3-card)] font-semibold text-[var(--tv3-text)] shadow-sm" : "text-[var(--tv3-muted)] hover:text-[var(--tv3-text)]"}`}
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
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--tv3-card)] text-[var(--tv3-text)]">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--tv3-hair)] px-3 py-2 sm:px-4">
        {mode === "layer" && (
          <button type="button" onClick={onClose} className="inline-flex h-8 items-center gap-1.5 rounded-[9px] bg-[var(--tv3-fill)] px-2.5 text-[12px] font-medium cursor-pointer hover:bg-[var(--tv3-fill)]">
            <span className="scale-[0.8]">{EC_ICONS.prev}</span>
            {t("ec.back")}
          </button>
        )}
        <h2 className="text-base font-semibold sm:text-lg">{t("ec.title")}</h2>
        <div className="flex rounded-[9px] bg-[var(--tv3-fill2)] p-0.5" role="tablist" aria-label={t("ec.view")}>
          {seg("grid", EC_ICONS.grid, t("ec.view.grid"))}
          {seg("list", EC_ICONS.list, t("ec.view.list"))}
        </div>
        <div className="hidden min-w-0 max-w-[420px] flex-1 md:flex">
          <NextChip zone={zone} enabled={visible} onPick={openDetails} />
        </div>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[11px] text-[var(--tv3-muted)] sm:inline">{t("ec.tz")}: {zone}</span>
          {zoneSlot}
          {grid && (
            <button type="button" onClick={data.refresh} title={t("ec.refresh")} aria-label={t("ec.refresh")} className={iconBtn}>
              <span className={`inline-flex scale-[0.8] ${data.status === "loading" ? "animate-spin" : ""}`}>{EC_ICONS.refresh}</span>
            </button>
          )}
          {mode === "layer" && <ChartEventsButton className={iconBtn} onClassName="bg-[var(--tv3-accent-soft)]! text-[var(--tv3-accent)]!" />}
          {mode === "layer" && (
            <button type="button" onClick={onClose} aria-label={t("shell.close")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.close}</span>
            </button>
          )}
        </span>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--tv3-hair2)] px-3 py-2 sm:px-4">
        {grid && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setOffset((o) => o - 1)} aria-label={t("ec.prevPeriod")} title={t("ec.prevPeriod")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.prev}</span>
            </button>
            <button type="button" onClick={() => setOffset(0)} disabled={offset === 0} className="h-7 rounded-[9px] bg-[var(--tv3-fill)] px-2 text-[12px] cursor-pointer hover:bg-[var(--tv3-fill)] disabled:opacity-50 disabled:cursor-default">
              {t("ec.tab.today")}
            </button>
            <button type="button" onClick={() => setOffset((o) => o + 1)} aria-label={t("ec.nextPeriod")} title={t("ec.nextPeriod")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.next}</span>
            </button>
            <span className="ml-1 text-[12px] font-medium tabular-nums text-[var(--tv3-text2)]">{rangeTitle}</span>
          </div>
        )}
        <div className="flex w-[190px] max-w-full"><CountryFilter seen={seen} /></div>
        <div className="hidden sm:block"><QuickChips /></div>
        <EnergyChip />
        <MoexChip />
        <CommodityChip />
        <RussiaChip />
        <CorpChip />
        <div className="flex min-w-[150px] max-w-[260px] flex-1"><SearchBox q={q} setQ={setQ} /></div>
      </div>

      {banner}

      <div className="relative min-h-0 flex-1 overflow-auto" aria-busy={data.status === "loading"}>
        {grid && data.status === "loading" && data.events.length === 0 && (
          <div role="status" className="pointer-events-none absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-[var(--tv3-hair)] bg-[var(--tv3-card)] px-4 py-2 text-sm text-[var(--tv3-text2)] shadow-lg">
            {t("ec.loading")}
          </div>
        )}
        {grid ? (
          <MonthGrid cells={cells} events={events} zone={zone} locale={loc} coverage={data.coverage} onOpenDay={(date, focusId) => setOpenDay({ date, focusId })} />
        ) : (
          <CalendarView variant="embedded" zone={zone} visible={visible} query={q} />
        )}
      </div>
      {grid && <SourceFooter source={data.source} moex={data.moex} commodity={data.commodity} russia={data.russia} className="shrink-0 border-t border-[var(--tv3-hair2)]" />}

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
