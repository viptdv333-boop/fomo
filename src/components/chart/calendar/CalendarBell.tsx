"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { LEAD_OPTIONS } from "@/lib/calendar/reminder-logic";
import { addReminder, removeReminder, useReminderMode, useReminders } from "@/lib/calendar/reminders";
import { useTerminalNotifyDefaults } from "@/lib/terminal-alert-defaults-client";
import type { CalEvent } from "@/lib/calendar/types";
import { EC_ICONS } from "../icons-econ";
import FloatingPanel, { anchorOf, type Anchor } from "./FloatingPanel";

type Tr = (key: string, vars?: Record<string, string | number>) => string;

/** "В момент выхода" / "За 15 мин" / "За 1 час" */
export const leadLabel = (t: Tr, m: number) => (m === 0 ? t("calrem.lead.0") : m === 60 ? t("calrem.lead.60") : t("calrem.lead.n", { min: m }));
/** lower-case form for a sentence: "за 15 мин" */
export const leadShort = (t: Tr, m: number) => (m === 0 ? t("calrem.lead.short.0") : m === 60 ? t("calrem.lead.short.60") : t("calrem.lead.short.n", { min: m }));

/** A reminder can be set only for an event with a clock time that has not been released yet. */
export const canRemind = (ev: Pick<CalEvent, "ts" | "allDay">, now = Date.now()) => !ev.allDay && ev.ts > now;

/** State and actions of one event's reminder, shared by the bell, its popover and the block in the event popup. */
export function useEventReminder(ev: CalEvent) {
  const { t } = useT();
  const reminders = useReminders();
  const mode = useReminderMode();
  const defaults = useTerminalNotifyDefaults();
  const existing = reminders.find((r) => r.id === ev.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = useCallback(
    async (lead: number): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const res = await addReminder(ev, lead);
      setBusy(false);
      if (!res.ok) {
        setError(t(res.error === "limit" ? "calrem.err.limit" : res.error === "past" ? "calrem.err.past" : "calrem.err.failed"));
        return false;
      }
      // a local reminder is shown by the page: ask once for permission to also use a system notification
      if (!res.server) {
        try {
          if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
        } catch {}
      }
      return true;
    },
    [ev, t]
  );
  const clear = useCallback(async () => {
    setBusy(true);
    setError(null);
    await removeReminder(ev.id);
    setBusy(false);
  }, [ev.id]);

  return { existing, mode, defaultLead: defaults.reminderLeadMin, set, clear, busy, error };
}

/** The channels / guest note under the lead choices. */
function Note({ mode }: { mode: "unknown" | "server" | "local" }) {
  const { t } = useT();
  if (mode === "local") {
    return (
      <div className="rounded-[10px] bg-[var(--tv3-fill3)] p-2.5 text-[11.5px] leading-snug text-[var(--tv3-text2)]">
        <div className="font-medium text-[var(--tv3-text)]">{t("calrem.guest.title")}</div>
        <p className="mt-1 text-[var(--tv3-muted)]">{t("calrem.guest.hint")}</p>
        <Link href="/login" className="mt-2 inline-flex h-7 items-center rounded-[9px] bg-[var(--tv3-accent)] px-3 text-xs font-semibold text-white hover:bg-[var(--tv3-accent-hover)]">
          {t("calrem.guest.login")}
        </Link>
      </div>
    );
  }
  return (
    <p className="text-[11px] leading-snug text-[var(--tv3-muted)]">
      {t("calrem.pop.channels")}{" "}
      <Link href="/profile?tab=notifications" className="text-[var(--tv3-accent)] hover:underline">
        {t("calrem.pop.settings")}
      </Link>
    </p>
  );
}

/** The lead-time list of the popover. */
function LeadList({ ev, onDone }: { ev: CalEvent; onDone: () => void }) {
  const { t } = useT();
  const { existing, mode, defaultLead, set, clear, busy, error } = useEventReminder(ev);
  const current = existing?.minutes ?? defaultLead;
  const now = Date.now();
  return (
    <div className="space-y-2.5 p-3" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <div className="min-w-0">
        <div className="text-[13px] font-semibold text-[var(--tv3-text)]">{t("calrem.pop.title")}</div>
        <div className="truncate text-[11px] text-[var(--tv3-muted)]">{ev.event}</div>
      </div>
      {mode === "local" && <Note mode={mode} />}
      <div role="radiogroup" aria-label={t("calrem.pop.lead")} className="flex flex-col gap-1">
        {LEAD_OPTIONS.map((m) => {
          const on = existing ? existing.minutes === m : false;
          const isDefault = !existing && m === current;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              autoFocus={m === current}
              onClick={async () => {
                if (await set(m)) onDone();
              }}
              className={`flex h-8 w-full items-center justify-between rounded-[10px] px-2.5 text-left text-[13px] cursor-pointer disabled:opacity-60 ${
                on ? "bg-[var(--tv3-accent)] font-semibold text-white" : isDefault ? "bg-[var(--tv3-fill)] ring-1 ring-[var(--tv3-accent)] hover:bg-[var(--tv3-fill2)]" : "bg-[var(--tv3-fill)] hover:bg-[var(--tv3-fill2)]"
              }`}
            >
              <span>{leadLabel(t, m)}</span>
              {ev.ts - m * 60_000 <= now && !on && <span className="text-[10.5px] opacity-60">{t("calrem.pop.asap")}</span>}
              {on && <span aria-hidden="true">✓</span>}
            </button>
          );
        })}
      </div>
      {error && <p className="text-xs text-[var(--tv3-down)]">{error}</p>}
      {existing && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            await clear();
            onDone();
          }}
          className="h-8 w-full rounded-[10px] bg-[var(--tv3-fill)] text-xs font-semibold cursor-pointer hover:bg-[var(--tv3-fill2)] disabled:opacity-60"
        >
          {t("calrem.pop.remove")}
        </button>
      )}
      {mode !== "local" && <Note mode={mode} />}
    </div>
  );
}

/**
 * The bell of an event: outline = no reminder, filled amber = one is set (tooltip says how long before). A click opens a small
 * popover with the lead time (preselected from Settings → Notifications → «Терминал») and, when set, «Убрать напоминание».
 * It is a span with role=button, not a <button>, because the rows it sits in are buttons themselves.
 * `quiet` dims the outline until the row is hovered / focused (month grid and dense lists).
 */
export default function CalendarBell({ ev, className = "", quiet = false }: { ev: CalEvent; className?: string; quiet?: boolean }) {
  const { t } = useT();
  const reminders = useReminders();
  const existing = reminders.find((r) => r.id === ev.id);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const closedAt = useRef(0);

  const open = (el: Element) => {
    if (Date.now() - closedAt.current < 250) return; // the press that just closed the popover must not reopen it
    setAnchor(anchorOf(el));
  };
  const close = useCallback(() => {
    closedAt.current = Date.now();
    setAnchor(null);
  }, []);

  if (!canRemind(ev)) {
    // released already: a set reminder is still shown, nothing can be added
    return existing ? <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center text-amber-500 ${className}`}><span className="inline-block scale-[0.62]">{EC_ICONS.bellOn}</span></span> : null;
  }

  const label = existing ? t("calrem.bell.set", { lead: leadShort(t, existing.minutes) }) : t("calrem.bell.add");
  const onClick = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    open(e.currentTarget);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.stopPropagation();
      e.preventDefault();
      open(e.currentTarget);
    }
  };

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-haspopup="dialog"
        aria-pressed={Boolean(existing)}
        title={label}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)] ${
          existing ? "text-amber-500 hover:bg-amber-500/15" : `text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill2)] hover:text-[var(--tv3-text)] ${quiet ? "opacity-0 group-hover:opacity-100 focus-visible:opacity-100" : "opacity-60 hover:opacity-100"}`
        } ${className}`}
      >
        <span className="inline-block scale-[0.62]">{existing ? EC_ICONS.bellOn : EC_ICONS.bell}</span>
      </span>
      {anchor && (
        <FloatingPanel anchor={anchor} onClose={close} width={264} label={t("calrem.pop.title")}>
          <LeadList ev={ev} onDone={close} />
        </FloatingPanel>
      )}
    </>
  );
}

/**
 * The reminder block of the event popup (EventDetails): lead-time select plus a button, or the current reminder with «Убрать».
 * Same store and API as the bell.
 */
export function ReminderBlock({ ev }: { ev: CalEvent }) {
  const { t } = useT();
  const { existing, mode, defaultLead, set, clear, busy, error } = useEventReminder(ev);
  const [lead, setLead] = useState<number | null>(null);
  const value = lead ?? existing?.minutes ?? defaultLead;
  return (
    <div className="mt-3 border-t border-[var(--tv3-hair2)] pt-3">
      {existing ? (
        <div className="flex items-center gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-[var(--tv3-text2)]">
            <span className="shrink-0 text-amber-500"><span className="inline-block scale-[0.7]">{EC_ICONS.bellOn}</span></span>
            <span className="truncate">{t("calrem.set", { lead: leadShort(t, existing.minutes) })}</span>
          </span>
          <select
            value={value}
            disabled={busy}
            onChange={async (e) => {
              const m = +e.target.value;
              setLead(m);
              await set(m);
            }}
            aria-label={t("calrem.pop.lead")}
            className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-1.5 text-xs text-[var(--tv3-text)] outline-none"
          >
            {LEAD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {leadLabel(t, m)}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => void clear()} className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-2.5 text-xs font-semibold cursor-pointer hover:bg-[var(--tv3-fill2)] disabled:opacity-60">
            {t("ec.rem.remove")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={value}
            onChange={(e) => setLead(+e.target.value)}
            aria-label={t("calrem.pop.lead")}
            className="h-8 rounded-[10px] bg-[var(--tv3-fill)] px-1.5 text-xs text-[var(--tv3-text)] outline-none"
          >
            {LEAD_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {leadLabel(t, m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy}
            onClick={() => void set(value)}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-[var(--tv3-accent)] px-3 text-xs font-semibold text-white cursor-pointer hover:bg-[var(--tv3-accent-hover)] disabled:opacity-60"
          >
            <span className="scale-[0.72]">{EC_ICONS.bell}</span>
            {t("ec.rem.add")}
          </button>
        </div>
      )}
      {error && <p className="mt-1.5 text-xs text-[var(--tv3-down)]">{error}</p>}
      <div className="mt-1.5">
        <Note mode={mode} />
      </div>
    </div>
  );
}
