/**
 * Per-user defaults of the terminal's alerts and calendar reminders (Settings → Notifications → «Терминал»).
 * Pure data + pure functions (no React, no I/O): shared by the settings card, the alert dialog, the calendar bell and the
 * terminal's "an alert fired" listener, and checked by scripts/check-notify-terminal.ts. Stored with the other per-user
 * terminal blobs (TerminalUserData, kind "terminal_notify", key "default"); see terminal-alert-defaults-client.ts.
 */

export interface TerminalNotifyDefaults {
  /** NEW alerts fire every time (with a cooldown) instead of once. */
  repeat: boolean;
  /** Minimum minutes between two firings of a repeating alert. */
  cooldownMin: number;
  /** Lifetime of a NEW alert in days; 0 = until cancelled. */
  expiryDays: number;
  /** Play a sound in the terminal when one of my alerts fires. */
  sound: boolean;
  /** Show a pop-up in the terminal while it is open. */
  popup: boolean;
  /** Default lead time of a calendar reminder, minutes before the release (0 = at the time). */
  reminderLeadMin: number;
}

export const TERMINAL_NOTIFY_KIND = "terminal_notify";
export const TERMINAL_NOTIFY_KEY = "default";

export const COOLDOWN_OPTIONS = [1, 5, 15, 30, 60] as const;
export const EXPIRY_OPTIONS = [0, 1, 7, 30] as const;
export const REMINDER_LEAD_OPTIONS = [0, 5, 15, 60] as const;

export const DEFAULT_TERMINAL_NOTIFY: TerminalNotifyDefaults = {
  repeat: false,
  cooldownMin: 1,
  expiryDays: 0,
  sound: true,
  popup: true,
  reminderLeadMin: 15,
};

function pick<T extends number>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "number" && (allowed as readonly number[]).includes(v) ? (v as T) : fallback;
}

/** Whatever came out of storage -> a complete, valid object (unknown / invalid fields fall back to the defaults). */
export function sanitizeTerminalNotify(raw: unknown): TerminalNotifyDefaults {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_TERMINAL_NOTIFY;
  return {
    repeat: typeof r.repeat === "boolean" ? r.repeat : d.repeat,
    cooldownMin: pick(r.cooldownMin, COOLDOWN_OPTIONS, d.cooldownMin),
    expiryDays: pick(r.expiryDays, EXPIRY_OPTIONS, d.expiryDays),
    sound: typeof r.sound === "boolean" ? r.sound : d.sound,
    popup: typeof r.popup === "boolean" ? r.popup : d.popup,
    reminderLeadMin: pick(r.reminderLeadMin, REMINDER_LEAD_OPTIONS, d.reminderLeadMin),
  };
}

/** ISO expiry of a new alert from the default (null = never). */
export function expiryFromDefaults(days: number, now: number = Date.now()): string | null {
  return days > 0 ? new Date(now + days * 86_400_000).toISOString() : null;
}

/** The alert-form fields a new alert starts from. */
export function alertFormDefaults(d: TerminalNotifyDefaults): { repeat: boolean; cooldownMin: number; expiryDays: number } {
  return { repeat: d.repeat, cooldownMin: d.cooldownMin, expiryDays: d.expiryDays };
}

/** Notification.type values the terminal announces with a sound / pop-up while it is open (alerts and calendar reminders). */
export const TERMINAL_ALERT_TYPES: readonly string[] = ["price_alert", "line_alert", "calendar_reminder"];
export const isTerminalAlertType = (type: string): boolean => TERMINAL_ALERT_TYPES.includes(type);

/** True when every row is a terminal alert type (and there is at least one): the terminal announces them itself. */
export const onlyTerminalAlerts = (rows: readonly { type: string }[]): boolean => rows.length > 0 && rows.every((r) => isTerminalAlertType(r.type));

/**
 * Which of the bell rows that arrived should be announced in the terminal: alert types only, created after `since` (ms),
 * not announced before, oldest first, at most `max`.
 */
export function pickToAnnounce<T extends { id: string; type: string; createdAt: string | number | Date }>(rows: readonly T[], since: number, seen: ReadonlySet<string>, max = 3): T[] {
  return rows
    .filter((r) => isTerminalAlertType(r.type) && !seen.has(r.id) && new Date(r.createdAt).getTime() >= since)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-max);
}
