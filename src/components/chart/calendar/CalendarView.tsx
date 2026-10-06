"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { eventCategory, eventCategoryKey } from "@/lib/calendar/categories";
import { countryName, intlLocale } from "@/lib/calendar/countries";
import { filterEvents } from "@/lib/calendar/normalize";
import { useCalPrefs } from "@/lib/calendar/prefs";
import { useReminders } from "@/lib/calendar/reminders";
import { useCalendarRange } from "@/lib/calendar/useCalendar";
import { formatChange, formatValue } from "@/lib/calendar/surprise";
import { addDays, dayKey, eventDay, formatClock, formatCountdown, formatDayHeading, rangeFor, type RangePreset } from "@/lib/calendar/time";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";
import CalendarBell from "./CalendarBell";
import ChartEventsButton from "./ChartEventsMenu";
import EventDetails from "./EventDetails";
import { CategoryFilter, CountryFilter, SearchBox } from "./Filters";
import FloatingPanel, { anchorOf, type Anchor } from "./FloatingPanel";
import MiniMonth from "./MiniMonth";
import { ActualValue, BriefLine, CommodityMark, ImpactDot, ImpactDots, MoexMark, RuMark, SourceFooter, useNow } from "./parts";
import { useIsPhone } from "./useViewport";

const TABS: { id: Exclude<RangePreset, "custom">; key: string }[] = [
  { id: "yesterday", key: "ec.tab.yesterday" },
  { id: "today", key: "ec.tab.today" },
  { id: "tomorrow", key: "ec.tab.tomorrow" },
  { id: "week", key: "ec.tab.week" },
  { id: "d30", key: "ec.tab.d30" },
  { id: "nextweek", key: "ec.tab.nextweek" },
];

/** Day groups rendered at a time in a long list (30 days / a custom month). */
const DAYS_STEP = 7;

export const iconBtn =
  "tv3-press h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-[10px] bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)] cursor-pointer disabled:opacity-40 disabled:cursor-default";

/* ───────────── "next event in ..." chip ───────────── */

export function NextChip({ zone, enabled, onPick }: { zone: string; enabled: boolean; onPick: (ev: CalEvent, a: Anchor) => void }) {
  const { t, locale } = useT();
  const [prefs] = useCalPrefs();
  const now = useNow(1000, enabled);
  const today = dayKey(now, zone);
  const range = useMemo(() => ({ from: today, to: addDays(today, 6) }), [today]);
  const data = useCalendarRange(range, zone, enabled, locale);
  const countries = useMemo(() => new Set(prefs.countries), [prefs.countries]);
  const categories = useMemo(() => new Set<string>(prefs.categories), [prefs.categories]);
  const next = useMemo(() => filterEvents(data.events, { countries, categories }).find((e) => !e.allDay && e.ts > now), [data.events, countries, categories, now]);
  if (!next) return <span className="flex-1 truncate text-[12px] text-[var(--tv3-muted)]">{data.status === "loading" ? "" : t("ec.next.none")}</span>;
  return (
    <button
      type="button"
      onClick={(e) => onPick(next, anchorOf(e.currentTarget))}
      title={`${countryName(next.country, locale, t)}: ${next.event}`}
      className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-left text-[12px] cursor-pointer hover:bg-[var(--tv3-fill2)]"
    >
      <span className="shrink-0 text-[var(--tv3-muted)]">{EC_ICONS.clock}</span>
      <Flag code={next.country} width={15} />
      <span className="min-w-0 flex-1 truncate text-[var(--tv3-text2)]">{next.event}</span>
      <span className="shrink-0 font-semibold tabular-nums text-[var(--tv3-text)]">{formatCountdown(next.ts - now)}</span>
    </button>
  );
}

/* ───────────── rows ───────────── */

export interface RowProps {
  ev: CalEvent;
  zone: string;
  now: number;
  locale: string;
  reminded: boolean;
  onOpen: (ev: CalEvent, a: Anchor) => void;
  /** highlighted (the event the day modal was opened on) */
  focus?: boolean;
}

export const isPast = (ev: CalEvent, now: number, zone: string) => (ev.allDay ? eventDay(ev, zone) < dayKey(now, zone) : ev.ts <= now);

export const PanelRow = memo(function PanelRow({ ev, zone, now, locale, reminded, onOpen, focus }: RowProps) {
  const { t } = useT();
  const past = isPast(ev, now, zone);
  const hasFigures = ev.actual !== null || ev.forecast !== null || ev.previous !== null;
  const lab = "uppercase";
  return (
    <button
      type="button"
      data-ev={ev.id}
      onClick={(e) => onOpen(ev, anchorOf(e.currentTarget))}
      className={`mb-1.5 block w-full rounded-xl px-2.5 py-[9px] text-left cursor-pointer max-sm:min-h-[52px] hover:bg-[var(--tv3-fill)] ${focus ? "bg-[var(--tv3-fill)] outline outline-1 -outline-offset-1 outline-sky-500" : "bg-[var(--tv3-fill3)]"} ${past ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <div className="flex items-start gap-2.5">
        <span className="w-[34px] shrink-0 pt-0.5 text-[12px] tabular-nums text-[var(--tv3-muted)]">{ev.allDay ? t("ec.allDayShort") : formatClock(ev.ts, zone)}</span>
        <Flag code={ev.country} width={16} className="mt-[3px]" />
        <span className="min-w-0 flex-1">
          <span className="text-[14px] font-medium leading-snug text-[var(--tv3-text)] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
            {ev.category === "moex" && <MoexMark title={t("ec.moex")} />}{ev.category === "commodity" && <CommodityMark title={t("ec.commodity")} />}{ev.category === "ru" && <RuMark title={t("ec.russia")} />} {ev.event}
          </span>
          <BriefLine ev={ev} />
        </span>
        {/* on a phone the bell is a 44 px tap target (negative margins keep the row height) */}
        <CalendarBell ev={ev} className="mt-px max-sm:-my-3 max-sm:-mr-2 max-sm:h-11 max-sm:w-11" />
        <span className="pt-[6px]" title={t(`ec.impact.${ev.impact}`)}><ImpactDot level={ev.impact} /></span>
      </div>
      {hasFigures && (
        <div className="mt-1.5 flex gap-[18px] pl-[44px] text-[12px] tabular-nums text-[var(--tv3-muted)]">
          <span className="min-w-0 truncate"><span className={lab}>{t("ec.act")}</span> <ActualValue ev={ev} locale={locale} /></span>
          <span className="min-w-0 truncate"><span className={lab}>{t("ec.fcst")}</span> <b className="font-semibold text-[var(--tv3-text)]">{formatValue(ev.forecast, ev.unit, locale) || "—"}</b></span>
          <span className="min-w-0 truncate"><span className={lab}>{t("ec.prev")}</span> <b className="font-semibold text-[var(--tv3-text)]">{formatValue(ev.previous, ev.unit, locale) || "—"}</b></span>
        </div>
      )}
    </button>
  );
});

export const WIDE_COLS = "grid-cols-[52px_60px_minmax(200px,1fr)_110px_50px_84px_84px_84px_84px_44px]";
/** the day modal: no category / unit columns */
export const DAY_COLS = "grid-cols-[52px_64px_minmax(180px,1fr)_50px_88px_88px_88px_88px]";

export const WideRow = memo(function WideRow({ ev, zone, now, locale, reminded, onOpen, focus, compact }: RowProps & { compact?: boolean }) {
  const { t } = useT();
  const past = isPast(ev, now, zone);
  const change = ev.change ?? (ev.actual !== null && ev.previous !== null ? ev.actual - ev.previous : null);
  const val = "text-[var(--tv3-text2)]";
  return (
    <button
      type="button"
      data-ev={ev.id}
      onClick={(e) => onOpen(ev, anchorOf(e.currentTarget))}
      className={`grid w-full ${compact ? DAY_COLS : WIDE_COLS} items-center gap-x-2 border-b border-[var(--tv3-hair2)] px-3 py-1.5 text-left text-[12.5px] cursor-pointer hover:bg-[var(--tv3-fill3)] ${ev.category === "moex" ? "border-l-2 border-l-sky-500" : ev.category === "commodity" ? "border-l-2 border-l-lime-600" : ev.category === "ru" ? "border-l-2 border-l-teal-600" : ""} ${focus ? "bg-sky-50 dark:bg-sky-500/10" : ""} ${past ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <span className="tabular-nums text-[var(--tv3-muted)]">{ev.allDay ? t("ec.allDayShort") : formatClock(ev.ts, zone)}</span>
      <span className="flex items-center gap-1.5">
        <Flag code={ev.country} width={20} />
        <span className="text-[11px] text-[var(--tv3-muted)]">{ev.country || "—"}</span>
      </span>
      <span className="min-w-0 text-[var(--tv3-text)]">
        <span className="flex min-w-0 items-center gap-1.5">
          {ev.category === "moex" && <MoexMark title={t("ec.moex")} />}
          {ev.category === "commodity" && <CommodityMark title={t("ec.commodity")} />}
          {ev.category === "ru" && <RuMark title={t("ec.russia")} />}
          <span className="truncate">{ev.event}</span>
          <CalendarBell ev={ev} className="ml-auto" />
        </span>
        <BriefLine ev={ev} />
      </span>
      {!compact && <span className="truncate text-[11px] text-[var(--tv3-muted)]">{t(eventCategoryKey(eventCategory(ev)))}</span>}
      <span title={t(`ec.impact.${ev.impact}`)}><ImpactDots level={ev.impact} /></span>
      <span className="text-right tabular-nums"><ActualValue ev={ev} locale={locale} /></span>
      <span className={`text-right tabular-nums ${val}`}>{formatValue(ev.forecast, ev.unit, locale) || "—"}</span>
      <span className={`text-right tabular-nums ${val}`}>{formatValue(ev.previous, ev.unit, locale) || "—"}</span>
      <span className={`text-right tabular-nums ${change === null ? "text-[var(--tv3-muted)]" : val}`}>{change === null ? "—" : formatChange(change, ev.unit, locale)}</span>
      {!compact && <span className="text-center text-[11px] text-[var(--tv3-muted)]">{ev.unit || "—"}</span>}
    </button>
  );
});

export function NowMarker({ now, zone }: { now: number; zone: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-0.5" data-now-marker>
      <span className="h-px flex-1 bg-red-500/80" />
      <span className="text-[10px] font-semibold tabular-nums text-red-500">{formatClock(now, zone)}</span>
      <span className="h-px w-3 bg-red-500/80" />
    </div>
  );
}

/* ───────────── the view: side panel or the list of the full page ───────────── */

export interface CalendarViewProps {
  /** panel: the narrow side panel with its own toolbar; embedded: only the list (filters come from the parent). */
  variant: "panel" | "embedded";
  /** IANA zone of the chart (settings: time zone). */
  zone: string;
  /** Whether it is on screen: fetching and timers stop when false. */
  visible: boolean;
  onExpand?: () => void;
  /** embedded: the search text of the parent. */
  query?: string;
  /** embedded: the events of the range after the country and search filters (before the category one): the parent's category picker counts them. */
  onBase?: (events: CalEvent[]) => void;
}

export default function CalendarView({ variant, zone, visible, onExpand, query = "", onBase }: CalendarViewProps) {
  const { t, locale } = useT();
  const loc = intlLocale(locale);
  const embedded = variant === "embedded";
  // the full-page list is a wide table; on a phone (< 640 px) it becomes the compact rows of the side panel instead
  const phone = useIsPhone();
  const wide = embedded && phone !== true;
  const [prefs, update] = useCalPrefs();
  const reminders = useReminders();
  const [qLocal, setQLocal] = useState("");
  const q = embedded ? query : qLocal;
  const [rangeAnchor, setRangeAnchor] = useState<Anchor | null>(null);
  const [details, setDetails] = useState<{ ev: CalEvent; anchor: Anchor } | null>(null);
  const now = useNow(wide ? 15_000 : 20_000, visible);
  const today = dayKey(now, zone);

  const rf = rangeFor(prefs.preset, zone, now, prefs.custom ?? undefined);
  const range = useMemo(() => ({ from: rf.from, to: rf.to }), [rf.from, rf.to]);
  const data = useCalendarRange(range, zone, visible, locale);

  const countries = useMemo(() => new Set(prefs.countries), [prefs.countries]);
  const categories = useMemo(() => new Set<string>(prefs.categories), [prefs.categories]);
  const seen = useMemo(() => [...new Set(data.events.map((e) => e.country).filter(Boolean))], [data.events]);

  // country and search first: the category picker counts these (what each category would show), then the category filter itself
  const base = useMemo(() => {
    const inRange = data.events.filter((e) => {
      const d = eventDay(e, zone);
      return d >= range.from && d <= range.to;
    });
    return filterEvents(inRange, { countries, q });
  }, [data.events, zone, range, countries, q]);
  const list = useMemo(() => filterEvents(base, { categories }), [base, categories]);
  useEffect(() => {
    if (embedded) onBase?.(base);
  }, [embedded, onBase, base]);

  const groups = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of list) {
      const d = eventDay(e, zone);
      const g = m.get(d);
      if (g) g.push(e);
      else m.set(d, [e]);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [list, zone]);

  const remindedIds = useMemo(() => new Set(reminders.map((r) => r.id)), [reminders]);

  // a 30-day list holds ~2000 rows: the day groups are rendered a week at a time (the first one always reaches today), the next week
  // is added when the end of the list scrolls near
  const resetKey = `${range.from}..${range.to}|${q}|${prefs.countries.join()}|${prefs.categories.join()}|${wide}`;
  const todayIdx = groups.findIndex(([d]) => d >= today);
  const firstDays = Math.max(DAYS_STEP, todayIdx + 3);
  const [grow, setGrow] = useState({ key: "", extra: 0 });
  const extra = grow.key === resetKey ? grow.extra : 0;
  const shownDays = firstDays + extra;
  const visibleGroups = shownDays >= groups.length ? groups : groups.slice(0, shownDays);
  const moreDays = visibleGroups.length < groups.length;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!moreDays || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) setGrow({ key: resetKey, extra: extra + DAYS_STEP });
      },
      { root: scrollRef.current, rootMargin: "600px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [moreDays, resetKey, extra]);

  // bring the "now" line into view once per range
  const scrolledFor = useRef("");
  useEffect(() => {
    const k = `${range.from}..${range.to}|${wide}`;
    if (!visible || data.status !== "ok" || scrolledFor.current === k) return;
    const el = scrollRef.current;
    if (!el) return;
    scrolledFor.current = k;
    const marker = el.querySelector<HTMLElement>("[data-now-marker]");
    if (marker) {
      const top = marker.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
      el.scrollTop = Math.max(0, top - el.clientHeight * 0.3);
    } else el.scrollTop = 0;
  }, [visible, data.status, range, wide, list.length]);

  const filtersActive = prefs.countries.length > 0 || prefs.categories.length > 0 || q.trim() !== "";
  const resetFilters = () => {
    setQLocal("");
    update((p) => ({ ...p, countries: [], categories: [], moex: true, commodities: true, russia: true, corp: true, energy: false }));
  };
  const openDetails = (ev: CalEvent, anchor: Anchor) => setDetails({ ev, anchor });

  const rangeTabs = (
    <div className={`flex items-center ${wide ? "mx-3 my-2 w-fit overflow-x-auto rounded-[9px] bg-[var(--tv3-fill2)] p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : `flex-wrap gap-y-0.5 rounded-[9px] bg-[var(--tv3-fill2)] p-0.5 ${embedded ? "mx-3 my-2" : ""}`}`} role="tablist" aria-label={t("ec.range")}>
      {TABS.map((tb) => {
        const on = prefs.preset === tb.id;
        return (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => update((p) => ({ ...p, preset: tb.id }))}
            className={`h-6 shrink-0 whitespace-nowrap rounded-[7px] px-1.5 text-[12px] font-semibold cursor-pointer transition ${wide ? "px-2.5" : "flex-auto"} ${on ? "bg-[var(--tv3-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" : "text-[var(--tv3-text2)]"}`}
          >
            {t(tb.key)}
          </button>
        );
      })}
      <button
        type="button"
        title={t("ec.tab.custom")}
        aria-label={t("ec.tab.custom")}
        aria-selected={prefs.preset === "custom"}
        onClick={(e) => setRangeAnchor(anchorOf(e.currentTarget))}
        className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-[7px] px-1.5 text-[12px] font-semibold cursor-pointer transition ${prefs.preset === "custom" ? "bg-[var(--tv3-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" : "text-[var(--tv3-text2)]"}`}
      >
        {EC_ICONS.calendarRange}
        {prefs.preset === "custom" && <span className="tabular-nums">{rf.from.slice(5)}{rf.to !== rf.from ? `…${rf.to.slice(5)}` : ""}</span>}
      </button>
    </div>
  );

  const errKey = `ec.err.${data.reason}`;
  const body = (() => {
    if (data.status === "loading" && data.events.length === 0) {
      return (
        <div className="space-y-2 p-3" aria-busy="true">
          {Array.from({ length: wide ? 10 : 7 }, (_, i) => (
            <div key={i} className="h-9 animate-pulse rounded-xl bg-[var(--tv3-fill)]" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      );
    }
    if (data.status === "error") {
      const msg = t(errKey);
      return (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-sm font-medium text-[var(--tv3-text)]">{t(data.reason === "range-unsupported" ? "ec.err.rangeTitle" : "ec.err.title")}</div>
          <p className="text-xs leading-relaxed text-[var(--tv3-muted)]">{msg === errKey ? t("ec.err.upstream-error") : msg}</p>
          <button type="button" onClick={data.refresh} className="mt-1 h-8 rounded-[10px] bg-[var(--tv3-fill)] px-3 text-xs font-semibold cursor-pointer hover:bg-[var(--tv3-fill2)]">
            {t("ec.retry")}
          </button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-sm text-[var(--tv3-text2)]">{t(filtersActive ? "ec.emptyFiltered" : "ec.empty")}</div>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-3 text-xs font-semibold cursor-pointer hover:bg-[var(--tv3-fill2)]">
              {t("ec.resetFilters")}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className={wide ? "" : "px-2.5 pb-2.5"}>
        {visibleGroups.map(([day, evs]) => {
          const isToday = day === today;
          const firstFuture = isToday ? evs.findIndex((e) => !isPast(e, now, zone)) : -1;
          return (
            <section key={day}>
              <h3 className={`sticky z-[5] flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)] ${wide ? "top-8 border-b border-[var(--tv3-hair)] bg-[var(--tv3-fill3)] px-3 py-1" : "top-0 bg-[var(--tv3-card)] px-1 pb-1.5 pt-2 text-[12px] tracking-[.3px]"}`}>
                <span className={isToday ? "text-[var(--tv3-accent)]" : ""}>{formatDayHeading(day, loc)}</span>
                {isToday && <span className="rounded bg-[var(--tv3-accent-soft)] px-1 text-[10px] normal-case text-[var(--tv3-accent)]">{t("ec.tab.today")}</span>}
                <span className="ml-auto font-normal normal-case text-[var(--tv3-muted)]">{evs.length}</span>
              </h3>
              {evs.map((e, i) => (
                <div key={e.id}>
                  {isToday && i === firstFuture && <NowMarker now={now} zone={zone} />}
                  {wide ? <WideRow ev={e} zone={zone} now={now} locale={loc} reminded={remindedIds.has(e.id)} onOpen={openDetails} /> : <PanelRow ev={e} zone={zone} now={now} locale={loc} reminded={remindedIds.has(e.id)} onOpen={openDetails} />}
                </div>
              ))}
              {isToday && firstFuture === -1 && <NowMarker now={now} zone={zone} />}
            </section>
          );
        })}
        {moreDays && (
          <div ref={sentinelRef} className="flex h-12 items-center justify-center">
            <button type="button" onClick={() => setGrow({ key: resetKey, extra: extra + DAYS_STEP })} className="h-8 cursor-pointer rounded-[10px] bg-[var(--tv3-fill)] px-3 text-xs font-semibold text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)]">
              {t("ec.moreDays")}
            </button>
          </div>
        )}
      </div>
    );
  })();

  const notices = (
    <>
      {data.stale && <div className="mx-2.5 mb-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">{t("ec.stale")}</div>}
      {data.reason === "partial" && <div className="mx-2.5 mb-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">{t("ec.partial")}</div>}
      {data.reason === "mock" && <div className="mx-2.5 mb-1.5 rounded-lg bg-sky-500/10 px-2.5 py-1 text-[11px] text-sky-700 dark:text-sky-300">{t("ec.mock")}</div>}
    </>
  );

  const rangePopover = rangeAnchor && (
    <FloatingPanel anchor={rangeAnchor} onClose={() => setRangeAnchor(null)} width={260} label={t("ec.tab.custom")}>
      <div className="space-y-2 p-3 text-[13px]">
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3">
            <span className="text-[var(--tv3-muted)]">{t(k === "from" ? "ec.from" : "ec.to")}</span>
            <input
              type="date"
              value={rf[k]}
              onChange={(e) => {
                const v = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                let from = k === "from" ? v : rf.from;
                let to = k === "to" ? v : rf.to;
                if (to < from) [from, to] = [to, from];
                if (to > addDays(from, 30)) to = addDays(from, 30);
                update((p) => ({ ...p, preset: "custom", custom: { from, to } }));
              }}
              className="h-8 rounded-[9px] bg-[var(--tv3-fill)] px-2 text-[13px] text-[var(--tv3-text)] outline-none dark:[color-scheme:dark]"
            />
          </label>
        ))}
        <p className="text-[11px] text-[var(--tv3-muted)]">{t("ec.maxRange")}</p>
      </div>
    </FloatingPanel>
  );

  /* the side panel */
  if (!embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--tv3-card)] md:bg-transparent">
        <div className="shrink-0 space-y-2.5 px-2.5 pb-2.5">
          <div className="flex items-center gap-1.5">
            <NextChip zone={zone} enabled={visible} onPick={openDetails} />
            <button type="button" onClick={data.refresh} title={t("ec.refresh")} aria-label={t("ec.refresh")} className={iconBtn}>
              <span className={`inline-flex scale-[0.92] ${data.status === "loading" ? "animate-spin" : ""}`}>{EC_ICONS.refresh}</span>
            </button>
            <ChartEventsButton className={iconBtn} onClassName="bg-[var(--tv3-accent-soft)]! text-[var(--tv3-accent)]!" />
            <button
              type="button"
              onClick={() => update((p) => ({ ...p, panelGrid: !p.panelGrid }))}
              title={t(prefs.panelGrid ? "ec.view.list" : "ec.view.grid")}
              aria-label={t(prefs.panelGrid ? "ec.view.list" : "ec.view.grid")}
              aria-pressed={prefs.panelGrid}
              className={`${iconBtn} ${prefs.panelGrid ? "bg-[var(--tv3-accent-soft)]! text-[var(--tv3-accent)]!" : ""}`}
            >
              <span className="scale-[0.92]">{EC_ICONS.grid}</span>
            </button>
            {onExpand && (
              <button type="button" onClick={onExpand} title={t("ec.expand")} aria-label={t("ec.expand")} className={iconBtn}>
                <span className="scale-[0.92]">{EC_ICONS.expand}</span>
              </button>
            )}
          </div>
          {!prefs.panelGrid && rangeTabs}
          <div className="flex items-center gap-1.5">
            <CountryFilter seen={seen} />
            <CategoryFilter events={base} />
          </div>
          <div className="flex"><SearchBox q={qLocal} setQ={setQLocal} /></div>
        </div>
        {prefs.panelGrid ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MiniMonth zone={zone} visible={visible} q={qLocal} />
          </div>
        ) : (
          <>
            {notices}
            <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">{body}</div>
          </>
        )}
        <SourceFooter source={data.source} moex={data.moex} commodity={data.commodity} russia={data.russia} disclaimer className="shrink-0 border-t border-[var(--tv3-hair2)] px-3.5! pb-2.5! pt-2! text-[11px]!" />
        {rangePopover}
        {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
      </div>
    );
  }

  /* the list of the full page */
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-[var(--tv3-hair)]">{rangeTabs}</div>
      {notices}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className={wide ? "min-w-[960px]" : ""}>
          {wide && (
            <div className={`sticky top-0 z-[6] grid h-8 items-center ${WIDE_COLS} gap-x-2 border-b border-[var(--tv3-hair)] bg-[var(--tv3-card)] px-3 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]`}>
              <span>{t("ec.col.time")}</span>
              <span>{t("ec.col.country")}</span>
              <span>{t("ec.col.event")}</span>
              <span>{t("ec.col.category")}</span>
              <span>{t("ec.col.impact")}</span>
              <span className="text-right">{t("ec.actual")}</span>
              <span className="text-right">{t("ec.forecast")}</span>
              <span className="text-right">{t("ec.previous")}</span>
              <span className="text-right">{t("ec.change")}</span>
              <span className="text-center">{t("ec.col.unit")}</span>
            </div>
          )}
          {body}
        </div>
      </div>
      <SourceFooter source={data.source} moex={data.moex} commodity={data.commodity} russia={data.russia} className="shrink-0 border-t border-[var(--tv3-hair2)]" />
      {rangePopover}
      {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
    </div>
  );
}
