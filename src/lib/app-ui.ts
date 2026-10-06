// Pure helpers of the app-only UI shell (bottom tab bar + compact header). No React, no DOM: scripts/check-app-ui.ts runs them.
import { stripLocale, localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { isTerminalSite } from "@/lib/site-mode";

export type AppTabId = "feed" | "terminal" | "chat" | "calendar" | "channels" | "authors" | "me" | "settings";

export interface AppTabDef {
  id: AppTabId;
  /** path without a locale prefix */
  href: string;
  /** dictionary key of the label (existing nav.* strings) */
  labelKey: string;
  /** every path prefix that lights this tab up */
  match: string[];
}

/** The dock of the design: eight tabs in this order, five visible at a time, the rest by swiping the bar sideways. */
export const MAIN_APP_TABS: readonly AppTabDef[] = [
  { id: "feed", href: "/feed", labelKey: "nav.feed", match: ["/feed", "/ideas"] },
  { id: "terminal", href: "/terminal", labelKey: "nav.terminal", match: ["/terminal"] },
  { id: "chat", href: "/chat", labelKey: "nav.chat", match: ["/chat", "/messages", "/rooms"] },
  { id: "calendar", href: "/calendar", labelKey: "nav.calendar", match: ["/calendar"] },
  { id: "channels", href: "/channels", labelKey: "nav.channels", match: ["/channels"] },
  { id: "authors", href: "/authors", labelKey: "nav.authors", match: ["/authors"] },
  /* the app settings: opens the native screen inside the app, the notification settings page otherwise (see AppTabBar) */
  { id: "settings", href: "/profile?tab=notifications", labelKey: "appui.tab.settings", match: [] },
  /* the profile is always the last tab (shown with the user's avatar) */
  { id: "me", href: "/profile", labelKey: "profile.profile", match: ["/profile", "/payments", "/subscriptions"] },
];

/** The dock of the terminal site (terminal.fomo.spot): three tabs. The calendar is not a tab there: it lives inside the terminal next to the watchlist. */
export const TERMINAL_APP_TABS: readonly AppTabDef[] = MAIN_APP_TABS.filter((tab) => ["terminal", "settings", "me"].includes(tab.id)).map((tab) =>
  tab.id === "me" ? { ...tab, match: ["/profile"] } : tab
);

/** The tabs of THIS site: the eight of the board site, or the four of the terminal site (SITE_MODE=terminal). */
export const APP_TABS: readonly AppTabDef[] = isTerminalSite() ? TERMINAL_APP_TABS : MAIN_APP_TABS;

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/** A user's public page (/profile/<id>): the author screen of the «Авторы» tab, not the own profile (/profile). */
function isAuthorPage(clean: string): boolean {
  return clean.startsWith("/profile/") && clean.split("/").filter(Boolean).length === 2;
}

/** Which tab a pathname belongs to (locale prefix, query and hash ignored); null for pages that belong to no tab (profile, help, authors ...). */
export function activeAppTab(pathname: string): AppTabId | null {
  const clean = stripLocale((pathname || "/").split(/[?#]/)[0]).path;
  if (isAuthorPage(clean)) return "authors";
  for (const tab of APP_TABS) if (tab.match.some((p) => underPrefix(clean, p))) return tab.id;
  return null;
}

/** The «Каналы» / «Авторы» screens of the design: the lists, a channel, an author (their own title / bar). /channels/create and /channels/edit/<id> stay the site's forms and keep the header. */
function isChannelsScreen(clean: string): boolean {
  const seg = clean.split("/").filter(Boolean);
  if (seg[0] === "channels") return seg.length === 1 || (seg.length === 2 && seg[1] !== "create" && seg[1] !== "edit");
  if (seg[0] === "authors") return seg.length <= 2;
  return isAuthorPage(clean);
}

/** The own profile tab (/profile and its pushed screens, /subscriptions): the design's profile screens carry their own large title / bar. */
function isProfileScreen(clean: string): boolean {
  return clean === "/profile" || clean === "/subscriptions";
}

/** The compact header is hidden where the screen has its own top bar: the terminal (the chart takes the whole screen), the chat, the channels / authors screens and the profile tab (the design's screens carry their own title / thread bar). */
export function appHeaderHidden(pathname: string): boolean {
  const clean = stripLocale((pathname || "/").split(/[?#]/)[0]).path;
  // /rooms/<id> is a private group (a link from a notification) shown inside the chat screens; /rooms/join/<token> is the invitation page and keeps the header
  return underPrefix(clean, "/terminal") || isChannelsScreen(clean) || isProfileScreen(clean) || underPrefix(clean, "/chat") || underPrefix(clean, "/messages") || (underPrefix(clean, "/rooms") && !underPrefix(clean, "/rooms/join"));
}

/** Locale-aware link of a tab ("/en/feed", "/zh/feed", "/feed"). */
export function appTabHref(locale: Locale, tab: AppTabDef): string {
  return localizedPath(locale, tab.href);
}

/** "99+" cap of the red badges. 0 / negative / junk -> "". */
export function badgeLabel(n: unknown): string {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : 0;
  return v <= 0 ? "" : v > 99 ? "99+" : String(v);
}

/** Text-size steps of the app UI (the design's "Размер шрифта"): a multiplier applied to the board cards. */
export const APP_FONT_STEPS = ["s", "m", "l", "xl"] as const;
export type AppFontStep = (typeof APP_FONT_STEPS)[number];
export const APP_FONT_KEY = "fomo-app-fz";
export function parseFontStep(v: unknown): AppFontStep {
  return typeof v === "string" && (APP_FONT_STEPS as readonly string[]).includes(v) ? (v as AppFontStep) : "m";
}

/** True for focus targets that raise the soft keyboard (the tab bar hides while one is focused). */
export function raisesKeyboard(el: { tagName?: string; type?: string; isContentEditable?: boolean; readOnly?: boolean; disabled?: boolean } | null | undefined): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA") return !el.readOnly && !el.disabled;
  if (tag === "INPUT") {
    const t = (el.type || "text").toLowerCase();
    if (["checkbox", "radio", "button", "submit", "reset", "file", "image", "range", "color"].includes(t)) return false;
    return !el.readOnly && !el.disabled;
  }
  return false;
}

const AGO: Record<string, { now: string; min: string; h: string; d: string }> = {
  ru: { now: "только что", min: "мин", h: "ч", d: "дн" },
  en: { now: "just now", min: "min", h: "h", d: "d" },
  cn: { now: "刚刚", min: "分钟", h: "小时", d: "天" },
};

/** Short relative age of the design cards: "только что" / "5 мин" / "2 ч" / "3 дн". Junk or future dates -> "". */
export function agoLabel(iso: string | number | Date, locale: string, now: number = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = AGO[locale] ?? AGO.ru;
  const mins = Math.floor((now - t) / 60000);
  if (mins < 0) return "";
  if (mins < 1) return s.now;
  if (mins < 60) return `${mins} ${s.min}`;
  if (mins < 1440) return `${Math.round(mins / 60)} ${s.h}`;
  return `${Math.round(mins / 1440)} ${s.d}`;
}
