// Pure helpers of the app-only «Профиль» tab (the design's profile screen and the screens pushed from it). No React, no DOM:
// scripts/check-app-ui.ts runs them.
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";

/** The screens of the Профиль tab: the home list and the screens pushed from it. */
export type ProfileScreen = "home" | "edit" | "finance" | "subs" | "ideas" | "rooms" | "notifications" | "security" | "app";

/** `?tab=` values of /profile (the old page's tabs keep opening the same thing) -> screen. «profile» was the old default tab: the edit form. */
const TAB_TO_SCREEN: Record<string, ProfileScreen> = {
  profile: "edit",
  finance: "finance",
  subs: "subs",
  ideas: "ideas",
  rooms: "rooms",
  notifications: "notifications",
  security: "security",
  app: "app",
};
const SCREEN_TO_TAB: Record<Exclude<ProfileScreen, "home">, string> = {
  edit: "profile",
  finance: "finance",
  subs: "subs",
  ideas: "ideas",
  rooms: "rooms",
  notifications: "notifications",
  security: "security",
  app: "app",
};

/** Which screen a URL shows. /subscriptions is the «Каналы и подписки» screen; /profile?tab=… the others; anything else the home list. */
export function parseProfileScreen(path: string, tab: unknown): ProfileScreen {
  const clean = (path || "/").split(/[?#]/)[0].replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
  if (clean === "/subscriptions" || clean.startsWith("/subscriptions/")) return "subs";
  if (typeof tab !== "string") return "home";
  return Object.prototype.hasOwnProperty.call(TAB_TO_SCREEN, tab) ? TAB_TO_SCREEN[tab] : "home";
}

/** Locale-aware URL of a screen: /profile, /profile?tab=finance, /en/profile?tab=ideas. Extra query pairs (the ?appui=1 preview flag) ride along. */
export function profileHref(locale: Locale, screen: ProfileScreen, keep: Record<string, string> = {}): string {
  const pairs: string[] = [];
  if (screen !== "home") pairs.push(`tab=${SCREEN_TO_TAB[screen]}`);
  for (const [k, v] of Object.entries(keep)) if (v) pairs.push(`${k}=${encodeURIComponent(v)}`);
  const base = localizedPath(locale, "/profile");
  return pairs.length ? `${base}?${pairs.join("&")}` : base;
}

/** "Фьючерсы, сырьё · Москва · 8 лет": the non-empty parts of the hero's third line, joined the way the design does. */
export function heroLine(parts: ReadonlyArray<string | null | undefined>): string {
  return parts
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}

/** "★ 6.4" of the hero's stat tile; junk -> "★ 0.0". */
export function ratingLabel(r: unknown): string {
  const n = typeof r === "string" ? Number(r) : typeof r === "number" ? r : NaN;
  return `★ ${(Number.isFinite(n) ? n : 0).toFixed(1)}`;
}

/** Initial of the round avatar (first letter of the name, upper case; "?" for nothing). */
export function avatarInitial(name: string | null | undefined): string {
  const c = (name || "").trim().charAt(0);
  return c ? c.toUpperCase() : "?";
}

/** The red badge of the «Финансы» row: sales that wait for the seller (pending with a receipt attached). */
export function pendingSalesCount(sales: ReadonlyArray<{ status?: string; receiptUrl?: string | null }> | null | undefined): number {
  return (sales || []).filter((s) => s && s.status === "PENDING" && !!s.receiptUrl).length;
}

/** Row value of a counter ("4"); 0 / junk -> "" (the design shows no value then). */
export function countValue(n: unknown): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v > 0 ? String(v) : "";
}

/** Minutes after midnight -> "07:30"; out of range -> "00:00". */
export function minToTime(m: number): string {
  const v = Number.isFinite(m) && m >= 0 && m < 1440 ? Math.floor(m) : 0;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

/** "07:30" -> minutes; anything else -> null. */
export function timeToMin(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
}

/** Quiet-hours choices of the design's pickers: every hour, plus the stored value when it is not on the hour. */
export function quietTimeOptions(current: number): number[] {
  const all = Array.from({ length: 24 }, (_, i) => i * 60);
  return all.includes(current) || !(current >= 0 && current < 1440) ? all : [...all, Math.floor(current)].sort((a, b) => a - b);
}

/** Sub line of a «Мои идеи» row: "❤ 23 · 2 ч" (+ " · в архиве"). */
export function ideaSubLine(votes: number, age: string, archivedLabel: string | null): string {
  return [`❤️ ${Number.isFinite(votes) ? votes : 0}`, age, archivedLabel].filter(Boolean).join(" · ");
}

/** The three-way theme picker of the design reduced to what the site supports. */
export const APP_THEMES = ["light", "dark"] as const;
export type AppThemeName = (typeof APP_THEMES)[number];

/** Index of a text-size step (the picker rows follow APP_FONT_STEPS). */
export function fontStepIndex(step: string): number {
  const i = ["s", "m", "l", "xl"].indexOf(step);
  return i < 0 ? 1 : i;
}

/** Specialisations of the profile form (the same values and dictionary keys as the old page). */
export const SPECIALIZATIONS: readonly { value: string; labelKey: string }[] = [
  { value: "trader", labelKey: "profile2.specTrader" },
  { value: "analyst", labelKey: "profile2.specAnalyst" },
  { value: "investor", labelKey: "profile2.specInvestor" },
  { value: "scalper", labelKey: "profile2.specScalper" },
  { value: "algotrader", labelKey: "profile2.specAlgotrader" },
];

/** Labels of the chosen specialisations, in the form's order; unknown values are dropped. */
export function specLabels(values: ReadonlyArray<string> | null | undefined, label: (key: string) => string): string[] {
  const set = new Set(values || []);
  return SPECIALIZATIONS.filter((s) => set.has(s.value)).map((s) => label(s.labelKey));
}

/** Events of the terminal site's notification settings (the same list the site-mode helpers use): the system messages and the terminal / calendar alerts. */
export const TERMINAL_SITE_EVENT_IDS: readonly string[] = ["system", "price_alert", "line_alert", "calendar_reminder"];

/** The events a site's settings screen shows: everything on the board site, the terminal subset on the terminal site. */
export function notifEventsFor<T extends { id: string }>(terminal: boolean, events: readonly T[]): T[] {
  return terminal ? events.filter((e) => TERMINAL_SITE_EVENT_IDS.includes(e.id)) : [...events];
}

const FALLBACK_ZONES = ["Europe/Kaliningrad", "Europe/Moscow", "Europe/Samara", "Asia/Yekaterinburg", "Asia/Omsk", "Asia/Novosibirsk", "Asia/Krasnoyarsk", "Asia/Irkutsk", "Asia/Yakutsk", "Asia/Vladivostok", "Asia/Magadan", "Asia/Kamchatka", "Europe/Kyiv", "Europe/Minsk", "Europe/London", "Europe/Berlin", "Asia/Almaty", "Asia/Tashkent", "Asia/Dubai", "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore", "America/New_York", "America/Chicago", "America/Los_Angeles", "UTC"];

/** Time zones of the quiet-hours picker: the browser's full list when it has one, a curated one otherwise; the stored zone is always in it. */
export function quietZones(current?: string | null): string[] {
  let all: string[] = FALLBACK_ZONES;
  try {
    const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (sv) all = sv("timeZone");
  } catch {
    /* old browser: the curated list */
  }
  return !current || all.includes(current) ? all : [current, ...all];
}
