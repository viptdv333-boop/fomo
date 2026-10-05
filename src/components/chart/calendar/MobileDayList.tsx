"use client";

import { useEffect, useMemo, useRef } from "react";
import { useT } from "@/lib/i18n/client";
import { buildDayRows, type DayLayer, type DayRow } from "@/lib/calendar/dayrow";
import type { GridCell } from "@/lib/calendar/grid";
import { useReminders } from "@/lib/calendar/reminders";
import { formatClock, formatDayHeading } from "@/lib/calendar/time";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";
import { IMPACT_COLOR } from "./parts";

interface Props {
  cells: GridCell[];
  /** events that passed the filters */
  events: CalEvent[];
  zone: string;
  locale: string;
  coverage: { from: number; to: number } | null;
  onOpenDay: (date: string) => void;
}

const LAYER_COLOR: Record<DayLayer, string> = { moex: "#0ea5e9", commodity: "#65a30d", ru: "#0d9488", corp: "#8b5cf6" };
const LAYER_SHAPE: Record<DayLayer, string> = { moex: "rotate-45 rounded-none", commodity: "rounded-sm", ru: "rounded-full", corp: "rounded-sm" };

/**
 * The calendar on a phone (< 640 px): a vertical list where every day is one row. Left a date block (weekday + number, today
 * accented, weekends dimmed), then the number of events, a red badge with the count of high-importance ones, a dot per layer
 * (MOEX / commodities / Russia / dividends and reports) and the one or two most important titles. Quiet stretches are folded into
 * one slim «no events» row. A tap opens the day modal. Today is scrolled into view when the window opens.
 */
export default function MobileDayList({ cells, events, zone, locale, coverage, onOpenDay }: Props) {
  const { t } = useT();
  const reminders = useReminders();
  const remindedIds = useMemo(() => new Set(reminders.map((r) => r.id)), [reminders]);
  const rows = useMemo(() => buildDayRows(cells, events, zone, coverage), [cells, events, zone, coverage]);
  const rootRef = useRef<HTMLDivElement>(null);

  // Bring today into view (the window starts on Monday, so today is a few rows down); other windows start at the top. The rows
  // above today change height while the events of the window arrive, so it is re-aligned on every change of the rows for a few
  // seconds after the window opened, until the reader touches the list.
  const first = cells[0]?.date;
  const touched = useRef(false);
  const until = useRef(0);
  useEffect(() => {
    touched.current = false;
    until.current = Date.now() + 5000;
  }, [first]);
  useEffect(() => {
    const scroller = rootRef.current?.parentElement;
    if (!scroller) return;
    const mark = () => {
      touched.current = true;
    };
    const evs = ["touchstart", "wheel", "pointerdown", "keydown"] as const;
    for (const e of evs) scroller.addEventListener(e, mark, { passive: true });
    return () => {
      for (const e of evs) scroller.removeEventListener(e, mark);
    };
  }, []);
  useEffect(() => {
    const scroller = rootRef.current?.parentElement;
    if (!scroller || touched.current || Date.now() > until.current) return;
    const todayRow = rootRef.current?.querySelector<HTMLElement>("[data-today]");
    scroller.scrollTop = todayRow ? Math.max(0, todayRow.offsetTop - 36) : 0;
  }, [first, rows]);

  const wd = (d: string) => formatDayHeading(d, locale, { weekday: "short" });
  const dayNum = (d: string) => Number(d.slice(8));

  const renderRow = (r: DayRow) => {
    if (r.kind === "month") {
      return (
        <div key={`m${r.date}`} className="sticky top-0 z-[5] border-b border-[var(--tv3-hair)] bg-[var(--tv3-card)] px-4 py-1.5 text-[12px] font-semibold text-[var(--tv3-muted)] first-letter:uppercase">
          {formatDayHeading(r.date, locale, { month: "long", year: "numeric" })}
        </div>
      );
    }
    if (r.kind === "gap") {
      const same = r.from === r.to;
      return (
        <div key={`g${r.from}`} className="flex min-h-8 items-center gap-3 border-b border-[var(--tv3-hair2)] px-3 py-1 text-[12px] text-[var(--tv3-muted)]">
          <span className="w-11 shrink-0 text-center text-[12px] font-semibold tabular-nums">{same ? dayNum(r.from) : `${dayNum(r.from)}–${dayNum(r.to)}`}</span>
          <span className="min-w-0 truncate">
            {same ? wd(r.from) : `${wd(r.from)}–${wd(r.to)}`} · {r.noData ? t("ec.nodata") : t("ec.noEventsDay")}
          </span>
        </div>
      );
    }
    const { cell: c, summary: s } = r;
    const reminded = r.events.some((e) => remindedIds.has(e.id));
    const label = `${formatDayHeading(c.date, locale)}, ${t("ec.nEvents", { n: s.total })}`;
    return (
      <button
        key={`d${c.date}`}
        type="button"
        data-date={c.date}
        data-today={c.today ? "" : undefined}
        aria-label={label}
        onClick={() => onOpenDay(c.date)}
        className={`flex min-h-[56px] w-full items-center gap-3 border-b border-[var(--tv3-hair2)] px-3 py-2 text-left outline-none active:bg-[var(--tv3-fill)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--tv3-accent)] ${c.today ? "bg-[var(--tv3-accent-soft)]" : c.weekend ? "bg-[var(--tv3-fill3)]" : ""} ${c.past && !c.today ? "opacity-70" : ""}`}
      >
        <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl ${c.today ? "bg-[var(--tv3-accent)] text-white" : c.weekend ? "bg-[var(--tv3-fill)] text-[var(--tv3-muted)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-text)]"}`}>
          <span className="text-[10px] font-semibold uppercase leading-none">{wd(c.date)}</span>
          <span className="mt-0.5 text-[18px] font-bold leading-none tabular-nums">{dayNum(c.date)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--tv3-muted)]">
            <span className="font-medium">{s.total > 0 ? t("ec.nEvents", { n: s.total }) : t("ec.noEventsDay")}</span>
            {s.high > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold leading-none text-white" title={t("ec.impact.3")}>
                {s.high}
              </span>
            )}
            {s.layers.length > 0 && (
              <span className="flex items-center gap-1" aria-hidden="true">
                {s.layers.map((l) => (
                  <span key={l} className={`h-[7px] w-[7px] ${LAYER_SHAPE[l]}`} style={{ background: LAYER_COLOR[l] }} />
                ))}
              </span>
            )}
            {reminded && (
              <span className="ml-auto inline-flex text-amber-500" aria-hidden="true">
                <span className="inline-block scale-[0.6]">{EC_ICONS.bellOn}</span>
              </span>
            )}
          </span>
          {s.top.map((e) => (
            <span key={e.id} className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] leading-snug text-[var(--tv3-text)]">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: IMPACT_COLOR[e.impact] }} />
              <Flag code={e.country} width={14} />
              <span className="w-[34px] shrink-0 text-[11px] tabular-nums text-[var(--tv3-muted)]">{e.allDay ? "" : formatClock(e.ts, zone)}</span>
              <span className="min-w-0 flex-1 truncate">{e.event}</span>
            </span>
          ))}
        </span>
        <span className="shrink-0 text-[var(--tv3-muted)]">
          <span className="inline-block scale-[0.8]">{EC_ICONS.next}</span>
        </span>
      </button>
    );
  };

  return (
    <div ref={rootRef} className="pb-[env(safe-area-inset-bottom)]">
      {rows.map(renderRow)}
    </div>
  );
}
