// Pure logic of the app UI's tab host (src/components/app/tabhost/AppTabHost.tsx): which paths are the roots of the dock tabs, which
// screens stay mounted (LRU), the kill switch. No React, no DOM: scripts/check-tabhost.ts runs it.
//
// The idea: in the app UI the screens of the dock tabs (Доска, Болталка, Календарь, Каналы, Авторы, Профиль) are mounted ONCE by the host and kept
// alive (hidden, state and scroll position kept) while the user is elsewhere; switching a tab then only changes the URL in place
// (history.pushState, no server round trip) and shows the screen that is already there. Pushed screens (an idea, a channel, an author ...) stay
// ordinary routes rendered by Next. The terminal is the one heavy screen (a chart engine): it is mounted while it is shown and released when
// the user leaves, so two charts never live at the same time and nothing polls in the background.
import { stripLocale } from "@/lib/i18n/locale-url";
import { APP_TABS, type AppTabDef, type AppTabId } from "@/lib/app-ui";

/** A screen the host can show: a dock tab. */
export type HostScreenId = AppTabId;

/** localStorage key of the kill switch: "0" = no tab host, plain route navigation (the behaviour before the host existed). */
export const TABHOST_KEY = "fomo-tabhost";

/** Root path of each tab the host can show (the tab's own `href` without a query: «Настройки» points into the profile). */
export const HOST_ROOT: Partial<Record<HostScreenId, string>> = {
  feed: "/feed",
  terminal: "/terminal",
  chat: "/chat",
  calendar: "/calendar",
  channels: "/channels",
  authors: "/authors",
  me: "/profile",
  calculator: "/calculator",
};

/** Screens released as soon as they are left (a chart engine, sockets, timers; the calculator takes its inputs from the link): never kept hidden. */
export const TRANSIENT_TABS: readonly HostScreenId[] = ["terminal", "calculator"];

/** locale-less path without a trailing slash */
function cleanPath(pathname: string): string {
  const p = stripLocale((pathname || "/").split(/[?#]/)[0]).path.replace(/\/+$/, "");
  return p || "/";
}

/** The tab whose ROOT screen this path is (/feed, /chat ... exactly: pushed screens such as /ideas/<id> or /channels/<id> are no roots), or null. */
export function hostTabForPath(pathname: string, tabs: readonly AppTabDef[] = APP_TABS): HostScreenId | null {
  const clean = cleanPath(pathname);
  for (const t of tabs) if (HOST_ROOT[t.id] === clean) return t.id;
  return null;
}

/** True when `href` (path + optional query / hash, any locale prefix) is the root screen of a host tab. */
export function isHostHref(href: string, tabs: readonly AppTabDef[] = APP_TABS): boolean {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return false;
  return hostTabForPath(href, tabs) !== null;
}

/** How many screens may be mounted at once, by the device's memory (navigator.deviceMemory, GB; unknown -> a middle value). */
export function maxMounted(deviceMemory: number | undefined | null): number {
  if (typeof deviceMemory !== "number" || !Number.isFinite(deviceMemory) || deviceMemory <= 0) return 5;
  if (deviceMemory <= 2) return 3;
  if (deviceMemory <= 4) return 4;
  return 6;
}

/**
 * The list of mounted screens after `id` became the active one. `list` is ordered from the least to the most recently shown. Transient screens
 * (the terminal) other than the active one are dropped at once; when more than `max` screens stay mounted, the least recently shown goes.
 */
export function touchTab(list: readonly HostScreenId[], id: HostScreenId, max: number, transient: readonly HostScreenId[] = TRANSIENT_TABS): { list: HostScreenId[]; evicted: HostScreenId[] } {
  const evicted: HostScreenId[] = [];
  const next: HostScreenId[] = [];
  for (const t of list) {
    if (t === id) continue;
    if (transient.includes(t)) evicted.push(t);
    else next.push(t);
  }
  next.push(id);
  const kept = Math.max(1, Math.floor(max));
  // the transient screen is not counted against the budget of the light ones
  let light = next.filter((t) => !transient.includes(t)).length;
  const out: HostScreenId[] = [];
  for (const t of next) {
    if (!transient.includes(t) && t !== id && light > kept) {
      evicted.push(t);
      light--;
    } else out.push(t);
  }
  return { list: out, evicted };
}

export interface KillSwitch {
  /** the host must stay off */
  disabled: boolean;
  /** what to write to localStorage: "0" (remember the switch off), "clear" (remove the key), null (leave it) */
  persist: "0" | "clear" | null;
}

/**
 * ?tabhost=0 switches the host off (and remembers it in localStorage `fomo-tabhost`), ?tabhost=1 switches it on again and forgets the switch.
 * Without the query the stored value decides ("0" = off). Anything else = on.
 */
export function tabHostSwitch(search: string, stored: string | null): KillSwitch {
  let q: string | null = null;
  try {
    const all = new URLSearchParams(search || "").getAll("tabhost");
    q = all.length ? all[all.length - 1] : null;
  } catch {
    q = null;
  }
  if (q === "0") return { disabled: true, persist: "0" };
  if (q === "1") return { disabled: false, persist: "clear" };
  return { disabled: stored === "0", persist: null };
}

/** Chunks of the tab screens to fetch at idle, in the order the user is likely to need them (the screen already shown first). */
export function prefetchOrder(active: HostScreenId | null, tabs: readonly AppTabDef[] = APP_TABS): HostScreenId[] {
  const ids: HostScreenId[] = tabs.map((t) => t.id).filter((id) => HOST_ROOT[id] && id !== active);
  const i = active ? tabs.findIndex((t) => t.id === active) : -1;
  if (i < 0) return ids;
  // neighbours first (a swipe goes there), then the rest in dock order
  const near: HostScreenId[] = [tabs[i + 1]?.id, tabs[i - 1]?.id].filter((x): x is AppTabId => !!x && ids.includes(x));
  return [...near, ...ids.filter((x) => !near.includes(x))];
}

/** Screens that follow the URL while they are mounted (they read ?room= / ?tab= reactively). The others read their query once, when they mount. */
export const PARAMS_REACTIVE: readonly HostScreenId[] = ["chat", "me"];

/** Query keys that say nothing about what a screen shows (preview switches, the tab host's own kill switch). */
const NEUTRAL_QUERY = ["appui", "appdesktop", "tabhost"];

/**
 * A link into a tab root WITH a query that the kept screen would not see (it read its query when it mounted: /feed?instrumentId=7 from the terminal's
 * «Идеи по …» card): the kept copy is thrown away and the screen mounts again with the new query. Screens that follow the URL are left alone.
 */
export function needsFreshMount(tab: HostScreenId, search: string): boolean {
  if (PARAMS_REACTIVE.includes(tab) || TRANSIENT_TABS.includes(tab)) return false;
  try {
    const q = new URLSearchParams(search || "");
    for (const k of q.keys()) if (!NEUTRAL_QUERY.includes(k)) return true;
  } catch {
    /* junk query */
  }
  return false;
}
