"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
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
import ChartEventsButton from "./ChartEventsMenu";
import EventDetails from "./EventDetails";
import { CountryFilter, EnergyChip, ImpactToggles, MoexChip, QuickChips, SearchBox } from "./Filters";
import FloatingPanel, { anchorOf, type Anchor } from "./FloatingPanel";
import MiniMonth from "./MiniMonth";
import { ActualValue, ImpactDots, MoexMark, SourceFooter, useNow } from "./parts";

const TABS: { id: Exclude<RangePreset, "custom">; key: string }[] = [
  { id: "yesterday", key: "ec.tab.yesterday" },
  { id: "today", key: "ec.tab.today" },
  { id: "tomorrow", key: "ec.tab.tomorrow" },
  { id: "week", key: "ec.tab.week" },
  { id: "nextweek", key: "ec.tab.nextweek" },
];

export const iconBtn =
  "h-7 w-7 shrink-0 inline-flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer disabled:opacity-40 disabled:cursor-default transition";

/* ───────────── "next event in ..." chip ───────────── */

export function NextChip({ zone, enabled, onPick }: { zone: string; enabled: boolean; onPick: (ev: CalEvent, a: Anchor) => void }) {
  const { t, locale } = useT();
  const [prefs] = useCalPrefs();
  const now = useNow(1000, enabled);
  const today = dayKey(now, zone);
  const range = useMemo(() => ({ from: today, to: addDays(today, 6) }), [today]);
  const data = useCalendarRange(range, zone, enabled, locale);
  const countries = useMemo(() => new Set(prefs.countries), [prefs.countries]);
  const impacts = useMemo(() => new Set(prefs.impacts), [prefs.impacts]);
  const next = useMemo(() => filterEvents(data.events, { countries, impacts, noMoex: !prefs.moex, energy: prefs.energy }).find((e) => !e.allDay && e.ts > now), [data.events, countries, impacts, prefs.moex, prefs.energy, now]);
  if (!next) return <span className="flex-1 truncate text-[11px] text-gray-400">{data.status === "loading" ? "" : t("ec.next.none")}</span>;
  return (
    <button
      type="button"
      onClick={(e) => onPick(next, anchorOf(e.currentTarget))}
      title={`${countryName(next.country, locale, t)}: ${next.event}`}
      className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md bg-gray-100 px-2 text-left text-[11px] cursor-pointer hover:bg-gray-200 dark:bg-[#262a36] dark:hover:bg-[#2f3341]"
    >
      <span className="shrink-0 text-gray-400">{EC_ICONS.clock}</span>
      <Flag code={next.country} width={15} />
      <span className="min-w-0 flex-1 truncate text-gray-700 dark:text-gray-200">{next.event}</span>
      <span className="shrink-0 font-semibold tabular-nums text-gray-900 dark:text-gray-100">{formatCountdown(next.ts - now)}</span>
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
  return (
    <button
      type="button"
      data-ev={ev.id}
      onClick={(e) => onOpen(ev, anchorOf(e.currentTarget))}
      className={`block w-full border-b border-gray-100 px-3 py-1.5 text-left cursor-pointer hover:bg-gray-50 dark:border-[#242833] dark:hover:bg-[#222633] ${ev.category === "moex" ? "border-l-2 border-l-sky-500" : ""} ${focus ? "bg-sky-50 dark:bg-sky-500/10" : ""} ${past ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className="w-[38px] shrink-0 pt-px text-[11px] tabular-nums text-gray-500 dark:text-gray-400">{ev.allDay ? t("ec.allDayShort") : formatClock(ev.ts, zone)}</span>
        <Flag code={ev.country} width={16} className="mt-[2px]" />
        <span className="min-w-0 flex-1 text-[12px] leading-snug text-gray-900 dark:text-gray-100 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
          {ev.category === "moex" && <MoexMark title={t("ec.moex")} />} {ev.event}
        </span>
        {reminded && <span className="mt-px shrink-0 text-amber-500"><span className="scale-[0.62] inline-block origin-center">{EC_ICONS.bellOn}</span></span>}
        <span className="pt-[3px]"><ImpactDots level={ev.impact} size={5} /></span>
      </div>
      {hasFigures && (
        <div className="mt-1 grid grid-cols-3 gap-1 pl-[56px] text-[11px] tabular-nums">
          <span className="min-w-0 truncate"><span className="block text-[9px] uppercase leading-tight tracking-wide text-gray-400">{t("ec.act")}</span><ActualValue ev={ev} locale={locale} /></span>
          <span className="min-w-0 truncate"><span className="block text-[9px] uppercase leading-tight tracking-wide text-gray-400">{t("ec.fcst")}</span><span className="text-gray-700 dark:text-gray-300">{formatValue(ev.forecast, ev.unit, locale) || "—"}</span></span>
          <span className="min-w-0 truncate"><span className="block text-[9px] uppercase leading-tight tracking-wide text-gray-400">{t("ec.prev")}</span><span className="text-gray-700 dark:text-gray-300">{formatValue(ev.previous, ev.unit, locale) || "—"}</span></span>
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
  const val = "text-gray-700 dark:text-gray-300";
  return (
    <button
      type="button"
      data-ev={ev.id}
      onClick={(e) => onOpen(ev, anchorOf(e.currentTarget))}
      className={`grid w-full ${compact ? DAY_COLS : WIDE_COLS} items-center gap-x-2 border-b border-gray-100 px-3 py-1.5 text-left text-[12.5px] cursor-pointer hover:bg-gray-50 dark:border-[#242833] dark:hover:bg-[#222633] ${ev.category === "moex" ? "border-l-2 border-l-sky-500" : ""} ${focus ? "bg-sky-50 dark:bg-sky-500/10" : ""} ${past ? "opacity-60 hover:opacity-100" : ""}`}
    >
      <span className="tabular-nums text-gray-500 dark:text-gray-400">{ev.allDay ? t("ec.allDayShort") : formatClock(ev.ts, zone)}</span>
      <span className="flex items-center gap-1.5">
        <Flag code={ev.country} width={20} />
        <span className="text-[11px] text-gray-500">{ev.country || "—"}</span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-gray-900 dark:text-gray-100">
        {ev.category === "moex" && <MoexMark title={t("ec.moex")} />}
        <span className="truncate">{ev.event}</span>
        {reminded && <span className="shrink-0 text-amber-500"><span className="inline-block scale-[0.62]">{EC_ICONS.bellOn}</span></span>}
      </span>
      {!compact && <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{t(`ec.cat.${ev.category}`)}</span>}
      <span title={t(`ec.impact.${ev.impact}`)}><ImpactDots level={ev.impact} /></span>
      <span className="text-right tabular-nums"><ActualValue ev={ev} locale={locale} /></span>
      <span className={`text-right tabular-nums ${val}`}>{formatValue(ev.forecast, ev.unit, locale) || "—"}</span>
      <span className={`text-right tabular-nums ${val}`}>{formatValue(ev.previous, ev.unit, locale) || "—"}</span>
      <span className={`text-right tabular-nums ${change === null ? "text-gray-400" : val}`}>{change === null ? "—" : formatChange(change, ev.unit, locale)}</span>
      {!compact && <span className="text-center text-[11px] text-gray-500">{ev.unit || "—"}</span>}
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
}

export default function CalendarView({ variant, zone, visible, onExpand, query = "" }: CalendarViewProps) {
  const { t, locale } = useT();
  const loc = intlLocale(locale);
  const wide = variant === "embedded";
  const [prefs, update] = useCalPrefs();
  const reminders = useReminders();
  const [qLocal, setQLocal] = useState("");
  const q = wide ? query : qLocal;
  const [rangeAnchor, setRangeAnchor] = useState<Anchor | null>(null);
  const [details, setDetails] = useState<{ ev: CalEvent; anchor: Anchor } | null>(null);
  const now = useNow(wide ? 15_000 : 20_000, visible);
  const today = dayKey(now, zone);

  const rf = rangeFor(prefs.preset, zone, now, prefs.custom ?? undefined);
  const range = useMemo(() => ({ from: rf.from, to: rf.to }), [rf.from, rf.to]);
  const data = useCalendarRange(range, zone, visible, locale);

  const countries = useMemo(() => new Set(prefs.countries), [prefs.countries]);
  const impacts = useMemo(() => new Set(prefs.impacts), [prefs.impacts]);
  const seen = useMemo(() => [...new Set(data.events.map((e) => e.country).filter(Boolean))], [data.events]);

  const list = useMemo(() => {
    const inRange = data.events.filter((e) => {
      const d = eventDay(e, zone);
      return d >= range.from && d <= range.to;
    });
    return filterEvents(inRange, { countries, impacts, q, noMoex: !prefs.moex, energy: prefs.energy });
  }, [data.events, zone, range, countries, impacts, q, prefs.moex, prefs.energy]);

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

  // bring the "now" line into view once per range
  const scrollRef = useRef<HTMLDivElement>(null);
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

  const filtersActive = prefs.impacts.length < 3 || prefs.countries.length > 0 || q.trim() !== "" || !prefs.moex || prefs.energy;
  const resetFilters = () => {
    setQLocal("");
    update((p) => ({ ...p, impacts: [1, 2, 3], countries: [], moex: true, energy: false }));
  };
  const openDetails = (ev: CalEvent, anchor: Anchor) => setDetails({ ev, anchor });

  const rangeTabs = (
    <div className={`flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${wide ? "px-3 py-2" : ""}`} role="tablist" aria-label={t("ec.range")}>
      {TABS.map((tb) => {
        const on = prefs.preset === tb.id;
        return (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => update((p) => ({ ...p, preset: tb.id }))}
            className={`h-7 shrink-0 rounded-md px-2 text-[12px] cursor-pointer transition ${on ? "bg-green-600/12 font-semibold text-green-700 dark:text-green-400" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2e39]"}`}
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
        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[12px] cursor-pointer transition ${prefs.preset === "custom" ? "bg-green-600/12 font-semibold text-green-700 dark:text-green-400" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-[#2a2e39]"}`}
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
            <div key={i} className="h-9 animate-pulse rounded bg-gray-100 dark:bg-[#262a36]" style={{ opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      );
    }
    if (data.status === "error") {
      const msg = t(errKey);
      return (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">{t(data.reason === "range-unsupported" ? "ec.err.rangeTitle" : "ec.err.title")}</div>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">{msg === errKey ? t("ec.err.upstream-error") : msg}</p>
          <button type="button" onClick={data.refresh} className="mt-1 h-8 rounded-md border border-gray-200 px-3 text-xs cursor-pointer hover:bg-gray-100 dark:border-[#363a45] dark:hover:bg-[#2a2e39]">
            {t("ec.retry")}
          </button>
        </div>
      );
    }
    if (list.length === 0) {
      return (
        <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
          <div className="text-sm text-gray-600 dark:text-gray-300">{t(filtersActive ? "ec.emptyFiltered" : "ec.empty")}</div>
          {filtersActive && (
            <button type="button" onClick={resetFilters} className="h-8 rounded-md border border-gray-200 px-3 text-xs cursor-pointer hover:bg-gray-100 dark:border-[#363a45] dark:hover:bg-[#2a2e39]">
              {t("ec.resetFilters")}
            </button>
          )}
        </div>
      );
    }
    return (
      <div>
        {groups.map(([day, evs]) => {
          const isToday = day === today;
          const firstFuture = isToday ? evs.findIndex((e) => !isPast(e, now, zone)) : -1;
          return (
            <section key={day}>
              <h3 className={`sticky z-[5] flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:border-[#2a2e39] dark:bg-[#1b1f2a] dark:text-gray-400 ${wide ? "top-8" : "top-0"}`}>
                <span className={isToday ? "text-green-700 dark:text-green-400" : ""}>{formatDayHeading(day, loc)}</span>
                {isToday && <span className="rounded bg-green-600/15 px-1 text-[10px] normal-case text-green-700 dark:text-green-400">{t("ec.tab.today")}</span>}
                <span className="ml-auto font-normal normal-case text-gray-400">{evs.length}</span>
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
      </div>
    );
  })();

  const notices = (
    <>
      {data.stale && <div className="border-b border-amber-300/40 bg-amber-50 px-3 py-1 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("ec.stale")}</div>}
      {data.reason === "partial" && <div className="border-b border-amber-300/40 bg-amber-50 px-3 py-1 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">{t("ec.partial")}</div>}
      {data.reason === "mock" && <div className="border-b border-sky-300/40 bg-sky-50 px-3 py-1 text-[11px] text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">{t("ec.mock")}</div>}
    </>
  );

  const rangePopover = rangeAnchor && (
    <FloatingPanel anchor={rangeAnchor} onClose={() => setRangeAnchor(null)} width={260} label={t("ec.tab.custom")}>
      <div className="space-y-2 p-3 text-[13px]">
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3">
            <span className="text-gray-500 dark:text-gray-400">{t(k === "from" ? "ec.from" : "ec.to")}</span>
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
              className="h-8 rounded-md border border-gray-200 bg-transparent px-2 text-[13px] outline-none focus:border-green-600 dark:border-[#363a45] dark:[color-scheme:dark]"
            />
          </label>
        ))}
        <p className="text-[11px] text-gray-400">{t("ec.maxRange")}</p>
      </div>
    </FloatingPanel>
  );

  /* the side panel */
  if (!wide) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#1e222d] dark:md:bg-transparent">
        <div className="shrink-0 space-y-1.5 border-b border-gray-100 px-2 py-2 dark:border-[#2a2e39]">
          <div className="flex items-center gap-1">
            <NextChip zone={zone} enabled={visible} onPick={openDetails} />
            <button type="button" onClick={data.refresh} title={t("ec.refresh")} aria-label={t("ec.refresh")} className={iconBtn}>
              <span className={`inline-flex scale-[0.8] ${data.status === "loading" ? "animate-spin" : ""}`}>{EC_ICONS.refresh}</span>
            </button>
            <ChartEventsButton className={iconBtn} onClassName="bg-green-600/12! text-green-700! dark:text-green-400!" />
            <button
              type="button"
              onClick={() => update((p) => ({ ...p, panelGrid: !p.panelGrid }))}
              title={t(prefs.panelGrid ? "ec.view.list" : "ec.view.grid")}
              aria-label={t(prefs.panelGrid ? "ec.view.list" : "ec.view.grid")}
              aria-pressed={prefs.panelGrid}
              className={`${iconBtn} ${prefs.panelGrid ? "bg-green-600/12! text-green-700! dark:text-green-400!" : ""}`}
            >
              <span className="scale-[0.8]">{EC_ICONS.grid}</span>
            </button>
            {onExpand && (
              <button type="button" onClick={onExpand} title={t("ec.expand")} aria-label={t("ec.expand")} className={iconBtn}>
                <span className="scale-[0.8]">{EC_ICONS.expand}</span>
              </button>
            )}
          </div>
          {!prefs.panelGrid && rangeTabs}
          <div className="flex items-center gap-1.5">
            <ImpactToggles />
            <CountryFilter seen={seen} />
          </div>
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1"><QuickChips /></div>
            <EnergyChip />
            <MoexChip />
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
        <SourceFooter source={data.source} moex={data.moex} className="shrink-0 border-t border-gray-100 dark:border-[#2a2e39]" />
        {rangePopover}
        {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
      </div>
    );
  }

  /* the list of the full page */
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-gray-200 dark:border-[#2a2e39]">{rangeTabs}</div>
      {notices}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="min-w-[960px]">
          <div className={`sticky top-0 z-[6] grid h-8 items-center ${WIDE_COLS} gap-x-2 border-b border-gray-200 bg-white px-3 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 dark:border-[#2a2e39] dark:bg-[#1e222d]`}>
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
          {body}
        </div>
      </div>
      <SourceFooter source={data.source} moex={data.moex} className="shrink-0 border-t border-gray-100 dark:border-[#2a2e39]" />
      {rangePopover}
      {details && <EventDetails ev={details.ev} anchor={details.anchor} zone={zone} onClose={() => setDetails(null)} />}
    </div>
  );
}
