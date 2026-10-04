"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { countryName } from "@/lib/calendar/countries";
import { dueReminders, markFired, removeReminder, useReminders, type Reminder } from "@/lib/calendar/reminders";
import { formatCountdown } from "@/lib/calendar/time";
import ModalPortal from "../ModalPortal";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";

/**
 * Mounted once in the terminal: fires calendar reminders (an in-page toast, plus a system notification when the browser
 * allows it) while the terminal is open. It only ticks when there is at least one reminder.
 */
export default function CalendarRemindersHost() {
  const { t, locale } = useT();
  const reminders = useReminders();
  const [toasts, setToasts] = useState<Reminder[]>([]);
  const [, tick] = useState(0);
  const remRef = useRef(reminders);
  remRef.current = reminders;

  const fire = useCallback(
    (r: Reminder) => {
      markFired(r);
      setToasts((x) => (x.some((y) => y.id === r.id) ? x : [...x, r].slice(-4)));
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const n = new Notification(t("ec.rem.notifTitle"), { body: `${countryName(r.country, locale, t)}: ${r.event}`, tag: `ec-${r.id}` });
          n.onclick = () => window.focus();
        }
      } catch {}
    },
    [t, locale]
  );

  useEffect(() => {
    if (reminders.length === 0) return;
    const check = () => {
      for (const r of dueReminders(remRef.current, Date.now())) fire(r);
    };
    check();
    const id = setInterval(() => {
      check();
      tick((n) => n + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [reminders.length, fire]);

  // drop a toast after a while
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts((x) => x.slice(1)), 25_000);
    return () => clearTimeout(id);
  }, [toasts]);

  if (toasts.length === 0) return null;
  const now = Date.now();
  return (
    <ModalPortal>
      <div className="fixed z-[90] right-3 bottom-3 flex w-[min(340px,calc(100vw-24px))] flex-col gap-2" role="status" aria-live="polite">
        {toasts.map((r) => {
          const left = r.ts - now;
          return (
            <div key={r.id} className="rounded-lg border border-amber-400/60 bg-[var(--tv3-card)] p-3 shadow-2xl dark:border-amber-500/50">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-amber-500">{EC_ICONS.bellOn}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">{t("ec.rem.notifTitle")}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-[var(--tv3-text)]">
                    <Flag code={r.country} width={16} />
                    <span className="truncate">{r.event}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--tv3-muted)]">{left > 0 ? t("ec.rem.in", { time: formatCountdown(left) }) : t("ec.rem.now")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setToasts((x) => x.filter((y) => y.id !== r.id));
                    removeReminder(r.id);
                  }}
                  aria-label={t("shell.close")}
                  className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)]"
                >
                  <span className="scale-75">{EC_ICONS.close}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ModalPortal>
  );
}
