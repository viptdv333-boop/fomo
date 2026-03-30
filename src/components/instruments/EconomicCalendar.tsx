"use client";

import { useEffect, useState } from "react";

interface CalendarEvent {
  date: string;
  country: string;
  event: string;
  currency: string;
  previous: number | null;
  estimate: number | null;
  actual: number | null;
  impact: string;
  unit: string | null;
}

const FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", JP: "🇯🇵", CN: "🇨🇳", RU: "🇷🇺", DE: "🇩🇪", FR: "🇫🇷",
};

const IMPACT_COLORS: Record<string, string> = {
  High: "bg-red-500",
  Medium: "bg-amber-500",
  Low: "bg-gray-400",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru", { day: "numeric", month: "short" });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

function formatVal(v: number | null, unit: string | null): string {
  if (v == null) return "—";
  const suffix = unit ? ` ${unit}` : "";
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + "M" + suffix;
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + "K" + suffix;
  return v.toString() + suffix;
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/economic-calendar?days=7")
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 animate-pulse h-[300px]" />;
  }

  if (events.length === 0) return null;

  // Group by date
  const grouped = new Map<string, CalendarEvent[]>();
  events.forEach((e) => {
    const day = formatDate(e.date);
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(e);
  });

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 uppercase tracking-wide">
        Экономический календарь
      </h3>
      <div className="space-y-4 max-h-[500px] overflow-y-auto">
        {[...grouped.entries()].map(([day, dayEvents]) => (
          <div key={day}>
            <div className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase">{day}</div>
            <div className="space-y-1">
              {dayEvents.map((e, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50 dark:border-gray-800/30 last:border-b-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${IMPACT_COLORS[e.impact] || "bg-gray-400"}`} />
                  <span className="text-xs text-gray-400 w-10 shrink-0">{formatTime(e.date)}</span>
                  <span className="text-sm shrink-0">{FLAGS[e.country] || e.country}</span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">{e.event}</span>
                  <div className="flex items-center gap-3 shrink-0 text-[11px]">
                    {e.actual != null && (
                      <span className="font-medium text-gray-900 dark:text-gray-100">{formatVal(e.actual, e.unit)}</span>
                    )}
                    {e.estimate != null && (
                      <span className="text-gray-400">п: {formatVal(e.estimate, e.unit)}</span>
                    )}
                    {e.previous != null && (
                      <span className="text-gray-400">п: {formatVal(e.previous, e.unit)}</span>
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
