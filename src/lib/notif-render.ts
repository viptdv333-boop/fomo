import { tFor } from "@/lib/i18n/for-locale";

/// Next-free (no next/headers): shared by src/lib/notifications.ts and by the
/// custom-server code (server/*.ts) through src/lib/notify-dispatch.ts.

/// A placeholder value: user-provided text (idea title, display name, channel
/// name…) goes in as-is; `{ key }` is itself translated for the recipient —
/// for server fallbacks like "Покупатель" when a name is missing.
export type NotifVar = string | number | { key: string };

/// Notification text: a plain string is stored/sent verbatim (user-generated
/// content, e.g. a comment preview); `{ key, vars }` is translated into each
/// recipient's own User.locale.
export type NotifText = string | { key: string; vars?: Record<string, NotifVar> };

export function isKeyed(text: NotifText | undefined): boolean {
  return typeof text === "object" && text !== null;
}

/// Renders a NotifText for one locale. `escapeVar` is applied to every
/// substituted value (Telegram HTML escaping) — never to the template itself,
/// so markup in the dictionary (<b>) survives.
export function renderNotifText(
  text: NotifText,
  locale: string | null | undefined,
  escapeVar?: (s: string) => string
): string {
  if (typeof text === "string") return text;
  const t = tFor(locale);
  let vars: Record<string, string | number> | undefined;
  if (text.vars) {
    vars = {};
    for (const [k, v] of Object.entries(text.vars)) {
      const raw = typeof v === "object" && v !== null ? t(v.key) : v;
      vars[k] = escapeVar ? escapeVar(String(raw)) : raw;
    }
  }
  return t(text.key, vars);
}
