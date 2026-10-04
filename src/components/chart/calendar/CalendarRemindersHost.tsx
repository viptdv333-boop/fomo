"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { countryName } from "@/lib/calendar/countries";
import { dueReminders, markFired, removeReminder, useReminders, type Reminder } from "@/lib/calendar/reminders";
import { formatCountdown } from "@/lib/calendar/time";
import ModalPortal from "../ModalPortal";
import { useTerminalAlertToasts } from "../useTerminalAlertToasts";
import Flag from "../Flag";
import { EC_ICONS } from "../icons-econ";

/**
 * Mounted once in the terminal (and on the /calendar page): fires the calendar reminders that live in this browser (guests:
 * an in-page toast, plus a system notification when the browser allows it) while the page is open; it only ticks when there is
 * at least one. Reminders of a signed-in user are delivered by the server (server/calendar-reminders.ts) and only show up here as
 * the notification pop-up below.
 * It also announces the server-side notifications (price alert, line alert, calendar reminder) with a sound / pop-up, as set in
 * Settings -> Notifications -> Terminal (src/components/chart/useTerminalAlertToasts.ts).
 */
export default function CalendarRemindersHost() {
  const { t, locale } = useT();
  const reminders = useReminders();
  const alertToasts = useTerminalAlertToasts();
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

  const localCount = reminders.filter((r) => !r.server).length;
  useEffect(() => {
    if (localCount === 0) return;
    const check = () => {
      for (const r of dueReminders(remRef.current, Date.now())) fire(r);
    };
    check();
    const id = setInterval(() => {
      check();
      tick((n) => n + 1);
    }, 5000);
    return () => clearInterval(id);
  }, [localCount, fire]);

  // drop a toast after a while
  useEffect(() => {
    if (toasts.length === 0) return;
    const id = setTimeout(() => setToasts((x) => x.slice(1)), 25_000);
    return () => clearTimeout(id);
  }, [toasts]);

  if (toasts.length === 0 && alertToasts.toasts.length === 0) return null;
  const now = Date.now();
  return (
    <ModalPortal>
      <div className="fixed z-[90] right-3 bottom-3 flex w-[min(340px,calc(100vw-24px))] flex-col gap-2" role="status" aria-live="polite">
        {alertToasts.toasts.map((n) => (
          <div key={n.id} className="rounded-lg border border-amber-400/60 bg-[var(--tv3-card)] p-3 shadow-2xl dark:border-amber-500/50">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-amber-500">{EC_ICONS.bellOn}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[var(--tv3-text)]">{n.title}</div>
                {n.body && <div className="mt-0.5 whitespace-pre-line text-xs text-[var(--tv3-muted)]">{n.body}</div>}
                {n.link && (
                  <Link href={n.link} onClick={() => alertToasts.dismiss(n.id)} className="mt-1 inline-block text-xs font-medium text-[var(--tv3-accent)] hover:underline">
                    {t(n.type === "calendar_reminder" ? "calrem.toast.open" : "alerts.open")}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => alertToasts.dismiss(n.id)}
                aria-label={t("shell.close")}
                className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)]"
              >
                <span className="scale-75">{EC_ICONS.close}</span>
              </button>
            </div>
          </div>
        ))}
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
