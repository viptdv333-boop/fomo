"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useReminders } from "@/lib/calendar/reminders";
import { dayKey, formatDayHeading } from "@/lib/calendar/time";
import type { CalEvent } from "@/lib/calendar/types";
import { EC_ICONS } from "../icons-econ";
import ModalPortal from "../ModalPortal";
import EventDetails from "./EventDetails";
import { CommodityChip, CorpChip, CountryFilter, EnergyChip, MoexChip, QuickChips, RussiaChip } from "./Filters";
import type { Anchor } from "./FloatingPanel";
import { DAY_COLS, NowMarker, PanelRow, WideRow, iconBtn, isPast } from "./CalendarView";
import { useNarrow, useNow } from "./parts";

interface Props {
  date: string;
  /** events of this day that passed the filters, sorted by time */
  events: CalEvent[];
  zone: string;
  locale: string;
  /** the event the modal was opened on (scrolled to and highlighted) */
  focusId?: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  /** description of why the day is empty (provider has no data) */
  noData?: boolean;
}

/** One day of the calendar in a modal (a bottom sheet on a phone): filters, the full table, the event popup with reminders. */
export default function DayModal({ date, events, zone, locale, focusId, canPrev, canNext, onPrev, onNext, onClose, noData }: Props) {
  const { t } = useT();
  const narrow = useNarrow();
  const now = useNow(15_000);
  const reminders = useReminders();
  const [details, setDetails] = useState<{ ev: CalEvent; anchor: Anchor } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const remindedIds = useMemo(() => new Set(reminders.map((r) => r.id)), [reminders]);
  const isToday = dayKey(now, zone) === date;
  const firstFuture = isToday ? events.findIndex((e) => !isPast(e, now, zone)) : -1;
  const seen = useMemo(() => [...new Set(events.map((e) => e.country).filter(Boolean))], [events]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(); // a popup inside stops the event before it gets here
      else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
        if (e.key === "ArrowLeft" && canPrev) onPrev();
        if (e.key === "ArrowRight" && canNext) onNext();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext, canPrev, canNext]);

  // scroll to the event the modal was opened on
  useEffect(() => {
    if (!focusId) return;
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-ev="${focusId}"]`);
    el?.scrollIntoView({ block: "center" });
  }, [focusId, date]);

  const open = (ev: CalEvent, anchor: Anchor) => setDetails({ ev, anchor });
  const heading = formatDayHeading(date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <ModalPortal>
      <div data-day-modal className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={heading}
          className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--tv3-card)] pb-[env(safe-area-inset-bottom)] text-[var(--tv3-text)] shadow-2xl sm:max-h-[86vh] sm:max-w-[1040px] sm:rounded-2xl sm:pb-0 sm:shadow-[var(--tv3-shadow-pop)]"
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-[var(--tv3-hair)] px-3 py-2">
            <button type="button" onClick={onPrev} disabled={!canPrev} aria-label={t("ec.prevDay")} title={t("ec.prevDay")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.prev}</span>
            </button>
            <button type="button" onClick={onNext} disabled={!canNext} aria-label={t("ec.nextDay")} title={t("ec.nextDay")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.next}</span>
            </button>
            <div className="ml-1 min-w-0 flex-1">
              <h2 className="truncate text-[15px] font-semibold first-letter:uppercase">{heading}</h2>
              <div className="text-[11px] text-[var(--tv3-muted)]">
                {t("ec.nEvents", { n: events.length })} · {zone}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label={t("shell.close")} className={iconBtn}>
              <span className="scale-[0.8]">{EC_ICONS.close}</span>
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[var(--tv3-hair2)] px-3 py-2">
            <div className="flex w-[170px] max-w-full"><CountryFilter seen={seen} /></div>
            <QuickChips />
            <EnergyChip />
            <MoexChip />
            <CommodityChip />
            <RussiaChip />
            <CorpChip />
          </div>

          <div ref={bodyRef} className="min-h-0 flex-1 overflow-auto">
            {events.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--tv3-muted)]">{noData ? t("ec.nodata") : t("ec.emptyFiltered")}</div>
            ) : (
              <div className={narrow ? "" : "min-w-[760px]"}>
                {!narrow && (
                  <div className={`sticky top-0 z-[6] grid h-8 items-center ${DAY_COLS} gap-x-2 border-b border-[var(--tv3-hair)] bg-[var(--tv3-card)] px-3 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]`}>
                    <span>{t("ec.col.time")}</span>
                    <span>{t("ec.col.country")}</span>
                    <span>{t("ec.col.event")}</span>
                    <span>{t("ec.col.impact")}</span>
                    <span className="text-right">{t("ec.actual")}</span>
                    <span className="text-right">{t("ec.forecast")}</span>
                    <span className="text-right">{t("ec.previous")}</span>
                    <span className="text-right">{t("ec.change")}</span>
                  </div>
                )}
                {events.map((e, i) => (
                  <div key={e.id}>
                    {isToday && i === firstFuture && <NowMarker now={now} zone={zone} />}
                    {narrow ? (
                      <PanelRow ev={e} zone={zone} now={now} locale={locale} reminded={remindedIds.has(e.id)} onOpen={open} focus={e.id === focusId} />
                    ) : (
                      <WideRow compact ev={e} zone={zone} now={now} locale={locale} reminded={remindedIds.has(e.id)} onOpen={open} focus={e.id === focusId} />
                    )}
                  </div>
                ))}
                {isToday && firstFuture === -1 && <NowMarker now={now} zone={zone} />}
              </div>
            )}
          </div>
        </div>
      </div>
      {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
    </ModalPortal>
  );
}
