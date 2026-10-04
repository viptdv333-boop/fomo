"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/calendar/countries";
import { formatValue } from "@/lib/calendar/surprise";
import type { CalEvent } from "@/lib/calendar/types";
import Flag from "@/components/chart/Flag";
import { useBriefs } from "@/lib/calendar/useBriefs";

const IMPACT_COLORS: Record<number, string> = {
  3: "bg-red-500",
  2: "bg-amber-500",
  1: "bg-gray-400",
};

const MAJOR = "US,EU,GB,JP,CN,RU,DE,FR";

function formatDate(ts: number, locale: string): string {
  return new Date(ts).toLocaleDateString(intlLocale(locale), { day: "numeric", month: "short" });
}

function formatTime(ts: number, locale: string): string {
  return new Date(ts).toLocaleTimeString(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });
}

export default function EconomicCalendar({ country }: { country?: string }) {
  const { t, locale } = useT();
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { get: briefOf } = useBriefs(); // compact list: the impact summary is a tooltip only

  useEffect(() => {
    // the API answers with normalised events (see lib/calendar/types); the page shows the next week of the major economies
    const params = new URLSearchParams({ days: "7", countries: country || MAJOR, limit: "30", lang: locale });
    if (!country) params.set("impact", "high,medium");
    fetch(`/api/economic-calendar?${params}`)
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [country, locale]);

  if (loading) {
    return <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 animate-pulse h-[300px]" />;
  }

  if (events.length === 0) return null;

  // Group by date
  const grouped = new Map<string, CalEvent[]>();
  events.forEach((e) => {
    const day = formatDate(e.ts, locale);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(e);
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
        {t("inst.calendar.title")}
      </h3>
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {[...grouped.entries()].map(([day, dayEvents]) => (
          <div key={day}>
            <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase">{day}</div>
            <div className="space-y-1">
              {dayEvents.map((e) => (
                <div key={e.id} title={briefOf(e) ? `${e.event}\n${briefOf(e)}` : undefined} className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${IMPACT_COLORS[e.impact] || "bg-gray-400"}`} />
                  <span className="text-xs text-gray-400 w-10 shrink-0">{e.allDay ? "—" : formatTime(e.ts, locale)}</span>
                  <Flag code={e.country} width={18} />
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{e.event}</span>
                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    {e.actual !== null && (
                      <span className="font-medium text-gray-900 dark:text-gray-100">{formatValue(e.actual, e.unit, intlLocale(locale))}</span>
                    )}
                    {e.forecast !== null && (
                      <span className="text-gray-400">{t("inst.calendar.forecast")} {formatValue(e.forecast, e.unit, intlLocale(locale))}</span>
                    )}
                    {e.previous !== null && (
                      <span className="text-gray-400">{t("inst.calendar.previous")} {formatValue(e.previous, e.unit, intlLocale(locale))}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
