"use client";

import { useMemo } from "react";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/calendar/countries";
import { buildMonthCells, dayCounts, monthWindowStart, outsideCoverage } from "@/lib/calendar/grid";
import { filterEvents } from "@/lib/calendar/normalize";
import { useCalPrefs } from "@/lib/calendar/prefs";
import { dayKey, formatDayHeading } from "@/lib/calendar/time";
import { useCalendarWindow } from "@/lib/calendar/useCalendar";
import { IMPACT_COLOR, useNow } from "./parts";

/** The side panel's month: 7 columns of small squares with just the impact dots; a click opens that day in the list. */
export default function MiniMonth({ zone, visible, q }: { zone: string; visible: boolean; q: string }) {
  const { t, locale } = useT();
  const loc = intlLocale(locale);
  const [prefs, update] = useCalPrefs();
  const now = useNow(60_000, visible);
  const today = dayKey(now, zone);
  const start = monthWindowStart(today);
  const data = useCalendarWindow(start, zone, visible, locale, 35);
  const cells = useMemo(() => buildMonthCells(start, today, 35), [start, today]);
  const events = useMemo(
    () => filterEvents(data.events, { countries: new Set(prefs.countries), impacts: new Set(prefs.impacts), q, noMoex: !prefs.moex, energy: prefs.energy }),
    [data.events, prefs.countries, prefs.impacts, prefs.moex, prefs.energy, q]
  );
  const by = useMemo(() => dayCounts(events, zone), [events, zone]);
  const heads = useMemo(() => cells.slice(0, 7).map((c) => formatDayHeading(c.date, loc, { weekday: "narrow" })), [cells, loc]);

  return (
    <div className="p-2">
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-gray-400">
        {heads.map((h, i) => (
          <span key={i} className={i >= 5 ? "opacity-60" : ""}>{h}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          const b = by.get(c.date);
          const none = outsideCoverage(c.date, data.coverage, zone);
          const levels = b ? ([3, 2, 1] as const).filter((lv) => b.byImpact[lv - 1] > 0) : [];
          return (
            <button
              key={c.date}
              type="button"
              disabled={none}
              onClick={() => update((p) => ({ ...p, preset: "custom", custom: { from: c.date, to: c.date }, panelGrid: false }))}
              title={`${formatDayHeading(c.date, loc)}${none ? ` — ${t("ec.nodata")}` : b ? ` — ${b.total}` : ""}`}
              className={`flex aspect-square min-w-0 flex-col items-center justify-between rounded-md border p-1 text-[11px] cursor-pointer transition disabled:cursor-default ${
                c.today ? "border-green-600 bg-green-600/10 font-bold text-green-700 dark:text-green-400" : "border-gray-200 hover:bg-gray-100 dark:border-[#2d3140] dark:hover:bg-[#262a36]"
              } ${c.weekend && !c.today ? "bg-gray-50 text-gray-400 dark:bg-white/[.03]" : ""} ${none ? "opacity-35" : c.past && !c.today ? "opacity-70" : ""}`}
            >
              <span className="leading-none">{Number(c.date.slice(8))}</span>
              <span className="flex h-2 items-center gap-[2px]">
                {levels.map((lv) => (
                  <span key={lv} className="h-[5px] w-[5px] rounded-full" style={{ background: IMPACT_COLOR[lv] }} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {data.status === "error" && <p className="mt-2 text-center text-[11px] text-gray-400">{t("ec.err.title")}</p>}
    </div>
  );
}
