"use client";

import { useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { dayCounts, outsideCoverage, pickForCell, type GridCell } from "@/lib/calendar/grid";
import { addDays, formatClock, formatDayHeading } from "@/lib/calendar/time";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "../Flag";
import { useBriefs } from "@/lib/calendar/useBriefs";
import { IMPACT_COLOR } from "./parts";

interface Props {
  cells: GridCell[];
  /** events that passed the filters */
  events: CalEvent[];
  zone: string;
  locale: string;
  coverage: { from: number; to: number } | null;
  /** squares keep their height on the whole page: rows share the free height */
  fill?: boolean;
  onOpenDay: (date: string, eventId?: string) => void;
}

const MAX_ROWS = 5;

/**
 * The month of squares: 7 columns (Mon..Sun), a list of the day's events in every square (most important kept when there are
 * many, shown in time order, "+N more" for the rest), weekends dimmed, today ringed. Click / Enter opens the day; a click on an
 * event row opens the day on that event. Arrow keys move between squares. On a phone the lists become impact dots.
 */
export default function MonthGrid({ cells, events, zone, locale, coverage, fill = true, onOpenDay }: Props) {
  const { t } = useT();
  const { get: briefOf } = useBriefs();
  const by = useMemo(() => dayCounts(events, zone), [events, zone]);
  const refs = useRef(new Map<string, HTMLElement>());
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const todayCell = cells.find((c) => c.today)?.date ?? cells[0]?.date;
  const tab = focusDate && cells.some((c) => c.date === focusDate) ? focusDate : todayCell;
  const heads = useMemo(() => cells.slice(0, 7).map((c) => ({ long: formatDayHeading(c.date, locale, { weekday: "long" }), short: formatDayHeading(c.date, locale, { weekday: "short" }) })), [cells, locale]);

  const move = (date: string, delta: number) => {
    const next = addDays(date, delta);
    const el = refs.current.get(next);
    if (el) {
      setFocusDate(next);
      el.focus();
    }
  };

  const onKey = (e: React.KeyboardEvent, date: string) => {
    if (e.target !== e.currentTarget) return; // keys inside an event row keep their own meaning
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        onOpenDay(date);
        break;
      case "ArrowLeft":
        e.preventDefault();
        move(date, -1);
        break;
      case "ArrowRight":
        e.preventDefault();
        move(date, 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(date, -7);
        break;
      case "ArrowDown":
        e.preventDefault();
        move(date, 7);
        break;
      case "Home":
        e.preventDefault();
        move(date, -(cells.findIndex((c) => c.date === date) % 7));
        break;
      case "End":
        e.preventDefault();
        move(date, 6 - (cells.findIndex((c) => c.date === date) % 7));
        break;
    }
  };

  return (
    <div role="grid" aria-label={t("ec.title")} className={`flex min-h-0 flex-col ${fill ? "h-full" : ""}`}>
      <div role="row" className="sticky top-0 z-[8] grid shrink-0 grid-cols-7 border-b border-gray-200 bg-white text-center text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:border-[#2a2e39] dark:bg-[#1e222d] dark:text-gray-400 sm:text-[11px]">
        {heads.map((h, i) => (
          <div key={i} role="columnheader" className={`py-1.5 ${i >= 5 ? "opacity-60" : ""}`} title={h.long}>
            <span className="sm:hidden">{h.short.slice(0, 2)}</span>
            <span className="hidden sm:inline">{h.short}</span>
          </div>
        ))}
      </div>
      <div className={`grid flex-1 grid-cols-7 auto-rows-[minmax(64px,1fr)] sm:auto-rows-[minmax(150px,1fr)]`}>
        {cells.map((c) => {
          const b = by.get(c.date);
          const none = outsideCoverage(c.date, coverage, zone);
          const { shown, more, total } = b ? pickForCell(b.events, MAX_ROWS) : { shown: [] as CalEvent[], more: 0, total: 0 };
          const high = b?.byImpact[2] ?? 0;
          const day = Number(c.date.slice(8));
          return (
            <div
              key={c.date}
              ref={(el) => {
                if (el) refs.current.set(c.date, el);
                else refs.current.delete(c.date);
              }}
              role="gridcell"
              tabIndex={tab === c.date ? 0 : -1}
              data-date={c.date}
              aria-label={`${formatDayHeading(c.date, locale)}, ${none ? t("ec.nodata") : t("ec.nEvents", { n: total })}`}
              onClick={() => !none && onOpenDay(c.date)}
              onFocus={() => setFocusDate(c.date)}
              onKeyDown={(e) => onKey(e, c.date)}
              className={`relative flex min-w-0 flex-col gap-0.5 overflow-hidden border-b border-r border-gray-200 p-1 outline-none transition focus-visible:z-[2] focus-visible:ring-2 focus-visible:ring-green-600 dark:border-[#2a2e39] sm:gap-1 sm:p-1.5 ${none ? "cursor-default" : "cursor-pointer hover:bg-gray-50 dark:hover:bg-[#222633]"} ${
                c.weekend ? "bg-gray-50/70 dark:bg-white/[.025]" : ""
              } ${c.today ? "bg-green-600/[.06] ring-1 ring-inset ring-green-600" : ""} ${c.past && !c.today ? "opacity-75" : ""}`}
            >
              <div className="flex items-center gap-1">
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums sm:text-xs ${
                    c.today ? "bg-green-600 text-white" : c.weekend ? "text-gray-400 dark:text-gray-500" : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {day}
                </span>
                {(c.first || c.date === cells[0].date) && <span className="text-[10px] font-semibold uppercase text-gray-400">{formatDayHeading(c.date, locale, { month: "short" })}</span>}
                <span className="ml-auto flex items-center gap-1">
                  {high > 0 && (
                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white" title={t("ec.impact.3")}>
                      {high}
                    </span>
                  )}
                  {total > 0 && <span className="hidden text-[10px] tabular-nums text-gray-400 sm:inline">{total}</span>}
                </span>
              </div>

              {none ? (
                <span className="mt-auto pb-1 text-center text-[10px] leading-tight text-gray-400 dark:text-gray-600">{t("ec.nodata")}</span>
              ) : (
                <>
                  <div className="hidden min-h-0 flex-col gap-px sm:flex">
                    {shown.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        tabIndex={-1}
                        data-ev={e.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          onOpenDay(c.date, e.id);
                        }}
                        title={`${e.allDay ? "" : formatClock(e.ts, zone) + " "}${e.event}${briefOf(e) ? `\n${briefOf(e)}` : ""}`}
                        className={`flex w-full min-w-0 items-center gap-1 rounded px-0.5 py-px text-left text-[11px] leading-tight hover:bg-black/5 dark:hover:bg-white/10 ${e.category === "moex" ? "border-l-2 border-sky-500 pl-1" : ""}`}
                      >
                        <span className="w-[30px] shrink-0 tabular-nums text-[10px] text-gray-400">{e.allDay ? "•" : formatClock(e.ts, zone)}</span>
                        <Flag code={e.country} width={14} />
                        <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{e.event}</span>
                        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: IMPACT_COLOR[e.impact] }} />
                      </button>
                    ))}
                    {more > 0 && <span className="px-0.5 text-[10.5px] font-medium text-gray-500 dark:text-gray-400">{t("ec.more", { n: more })}</span>}
                  </div>
                  <div className="mt-auto flex flex-wrap gap-[3px] sm:hidden">
                    {(b?.events ?? []).slice(0, 8).map((e) => (
                      <span key={e.id} className="h-[7px] w-[7px] rounded-full" style={{ background: e.category === "moex" ? "#0ea5e9" : IMPACT_COLOR[e.impact] }} />
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
