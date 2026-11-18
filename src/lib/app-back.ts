// Pure helpers of the Android «Назад» button of the app UI (src/components/app/AppBackHandler.tsx, window.FomoBack).
// No React, no DOM access except the tiny layer registry below: scripts/check-app-ui.ts runs them.
//
// Why: the Android shell used to call WebView.goBack() and nothing else. That minimises the app whenever the WebView has no previous history
// entry (a notification / deep link opens a screen as the FIRST entry, `/` -> `/feed` leaves one entry, ...), never closes a bottom sheet
// (a sheet is no history entry) and walks the dock tab by tab instead of going «to the board». MainActivity now asks the page first
// (`window.FomoBack()`); the page decides with the rules below and only returns false at the home screen, where the system may minimise.
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { APP_TABS, type AppTabDef } from "@/lib/app-ui";

/* ---------- where «Назад» leads: the path -> parent map ---------- */

export type BackLevel = "up" | "home";

export interface BackTarget {
  /** locale-less path + query of the screen one level up (or of the home section) */
  href: string;
  /** "up": the current screen is a pushed one (thread, idea, channel, author, profile sub-screen ...). "home": a section root, Back goes to the home section. */
  level: BackLevel;
}

/** The home section: the board on the main site, the terminal on the terminal site. */
export function backHome(terminal: boolean): string {
  return terminal ? "/terminal" : "/feed";
}

function seg(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function qs(search: string): URLSearchParams {
  try {
    return new URLSearchParams(search || "");
  } catch {
    return new URLSearchParams();
  }
}

/** Screens of the profile tab that are pushed from its list (parseProfileScreen without the import cycle): ?tab=<known>. */
const PROFILE_TABS = ["profile", "finance", "subs", "ideas", "rooms", "notifications", "inbox", "security", "app"];

/**
 * The screen one level up from this one, or null when the screen is a ROOT (a section's list, the board, an unknown / legal page).
 * Path without the locale prefix, search with or without "?". Pure.
 *   /ideas/<id>, /ideas/new, /feed/<slug>     -> /feed          /ideas/<id>/edit  -> /ideas/<id>
 *   /channels/<id>, /channels/create          -> /channels      /channels/edit/<id> -> /channels/<id>
 *   /authors/<id>, /profile/<userId>          -> /authors
 *   /chat?room= | ?dm= | ?with= | ?groups=1, /chat/<slug>, /rooms/<id>, /messages?dm=   -> the chat list (/chat, /chat?seg=dms)
 *   /profile?tab=<screen>, /subscriptions, /payments  -> /profile
 *   /calculator?from=terminal -> /terminal (a bare /calculator is a dock tab: a root)   /terminal/features -> /terminal      /instruments/category/<x>, /instruments/<x> -> /instruments
 */
export function parentHref(pathname: string, search: string): string | null {
  const path = stripLocale((pathname || "/").split(/[?#]/)[0]).path.replace(/\/+$/, "") || "/";
  const s = seg(path);
  const q = qs(search);
  switch (s[0]) {
    case "ideas":
      if (s.length === 3 && s[2] === "edit") return `/ideas/${s[1]}`;
      // a post started from a channel returns to that channel
      if (s.length === 2 && s[1] === "new" && /^[\w-]+$/.test(q.get("channelId") || "")) return `/channels/${q.get("channelId")}`;
      return s.length >= 2 ? "/feed" : null;
    case "feed":
      return s.length >= 2 ? "/feed" : null;
    case "channels":
      if (s[1] === "edit" && s[2]) return `/channels/${s[2]}`;
      return s.length >= 2 ? "/channels" : null;
    case "authors":
      return s.length >= 2 ? "/authors" : null;
    case "profile":
      if (s.length >= 2) return "/authors"; // /profile/<userId>: a user's public page = the author screen of the «Авторы» tab
      return PROFILE_TABS.includes(q.get("tab") || "") ? "/profile" : null;
    case "subscriptions":
    case "payments":
      return "/profile";
    case "chat":
    case "messages":
    case "rooms": {
      if (s[0] === "rooms" && s[1] === "join") return "/chat";
      const thread = (s[0] === "chat" && s.length >= 2) || (s[0] === "rooms" && s.length >= 2) || !!(q.get("room") || q.get("dm") || q.get("conversation") || q.get("with") || q.get("startWith") || q.get("groups") === "1");
      if (!thread) return null;
      const dms = s[0] === "messages" || !!(q.get("dm") || q.get("conversation") || q.get("with") || q.get("startWith")) || (s[0] === "chat" && q.get("seg") === "dms" && !q.get("room"));
      return dms ? "/chat?seg=dms" : "/chat";
    }
    case "terminal":
      return s.length >= 2 ? "/terminal" : null;
    case "calendar":
      return s.length >= 2 ? "/calendar" : null; // a day / an event of the calendar
    case "calculator":
      // a dock tab (a root: Back goes to the home section); opened from the terminal's «Калькулятор» card (?from=terminal) it is pushed over the terminal
      return q.get("from") === "terminal" ? "/terminal" : null;
    case "instruments":
      return s.length >= 2 ? "/instruments" : null;
    default:
      return null;
  }
}

/**
 * What «Назад» does at this location: the level up for a pushed screen, the home section for a section's root (calendar, channels, authors, chat list,
 * profile list, the terminal on the main site, help / terms ...), null at home itself (the system minimises the app there).
 */
export function backTarget(pathname: string, search: string, terminal: boolean): BackTarget | null {
  const up = parentHref(pathname, search);
  if (up) return { href: up, level: "up" };
  const path = stripLocale((pathname || "/").split(/[?#]/)[0]).path.replace(/\/+$/, "") || "/";
  const home = backHome(terminal);
  if (path === home || path === "/") return null;
  return { href: home, level: "home" };
}

/**
 * The screen is the ROOT of a dock tab (or the home screen): it is left through the dock, so no on-screen «Назад» is shown there.
 * A root is the tab's own path with no pushed sub-screen behind it (parentHref null): /feed, /terminal, /calculator, /chat, /calendar, /channels, /authors, /profile
 * (the terminal site: /terminal, /calculator, /profile). /chat?room=7, /profile?tab=finance, /calculator?from=terminal, /ideas/5 ... are not roots.
 */
export function isDockRoot(pathname: string, search: string, tabs: readonly AppTabDef[] = APP_TABS): boolean {
  if (parentHref(pathname, search)) return false;
  const path = stripLocale((pathname || "/").split(/[?#]/)[0]).path.replace(/\/+$/, "") || "/";
  if (path === "/") return true;
  return tabs.some((t) => t.href.split("?")[0] === path);
}

/**
 * What the on-screen «Назад» button of the app header does as a fallback (when the in-app history has no entry behind the screen), or null when no button is
 * shown (a dock tab root). A pushed screen goes to its parent (every page that belongs to a dock tab has one in parentHref); a screen that is none of the known ones
 * (help, terms, data providers, the invitation page ...) goes to the home section. The button itself calls window.FomoBack() (AppBackHandler), the same code path as the Android hardware button, which
 * prefers one step back in history and uses this target only when there is none.
 */
export function appBackTarget(pathname: string, search: string, terminal: boolean, tabs: readonly AppTabDef[] = APP_TABS): BackTarget | null {
  if (isDockRoot(pathname, search, tabs)) return null;
  const up = parentHref(pathname, search);
  if (up) return { href: up, level: "up" };
  return { href: backHome(terminal), level: "home" };
}

/** The back-layer actions that LEAVE the screen (an unsaved-changes guard may veto them); closing a sheet / overlay / the full-screen chart does not leave it. */
export function leavesScreen(action: BackAction): boolean {
  return action === "history" || action === "parent" || action === "home";
}

/** Where a computed target really goes: locale prefix back on, the preview flags (?appui=1 ...) of the current URL kept. */
export function backHrefFor(target: string, locale: Locale, currentSearch: string): string {
  const [p, query = ""] = target.split("?");
  const out = new URLSearchParams(query);
  const cur = qs(currentSearch);
  for (const k of ["appui", "appdesktop"]) {
    const v = cur.get(k);
    if (v && !out.has(k)) out.set(k, v);
  }
  const base = localizedPath(locale, p);
  const str = out.toString();
  return str ? `${base}?${str}` : base;
}

/* ---------- the in-app history ledger ---------- */

/** history.state key: this entry's position among the entries the app itself pushed (0 = the first screen of a document: cold start, deep link). */
export const BACK_INDEX_KEY = "fomoBackIdx";

/** Position stored in a history.state value (any shape, junk-safe); 0 when none. */
export function entryIndex(state: unknown): number {
  if (!state || typeof state !== "object") return 0;
  const v = (state as Record<string, unknown>)[BACK_INDEX_KEY];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

/** The state to hand to pushState / replaceState with the ledger position written in (a plain object only: null and foreign shapes are left alone -> null). */
export function withEntryIndex(state: unknown, idx: number): Record<string, unknown> | null {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  return { ...(state as Record<string, unknown>), [BACK_INDEX_KEY]: Math.max(0, Math.floor(idx)) };
}

/** Position for a new entry: push = one past the current, replace = the explicit one the caller carried, else the current one's. */
export function nextEntryIndex(kind: "push" | "replace", currentState: unknown, newState: unknown): number {
  if (kind === "push") return entryIndex(currentState) + 1;
  const own = entryIndex(newState);
  return own > 0 ? own : entryIndex(currentState);
}

/** The app pushed an entry before the current one and the browser really has one to go to. */
export function canStepBack(state: unknown, historyLength: number): boolean {
  return entryIndex(state) >= 1 && historyLength > 1;
}

/** history.state marks of the screens that push their own entry (chat thread, profile screen). */
export function isMarkedScreenState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const s = state as Record<string, unknown>;
  return !!(s.appChat || s.appProf);
}

/* ---------- the priority of «Назад» ---------- */

export type BackAction =
  /** close the topmost registered sheet / dialog / menu */
  | "layer"
  /** close an overlay that did not register (found in the DOM: role=dialog, fixed backdrop ...) */
  | "overlay"
  /** collapse the full-screen chart */
  | "fullscreen"
  /** history.back(): the previous entry is an in-app one */
  | "history"
  /** router.replace(level up): a deep screen with no entry behind it */
  | "parent"
  /** router.replace(home section): a section root */
  | "home"
  /** nothing to do: the home screen, the system minimises the app */
  | "none";

export interface BackSnapshot {
  /** number of open registered sheets / dialogs */
  layers: number;
  /** an unregistered overlay is open in the DOM */
  overlay: boolean;
  /** the full-screen chart is open */
  fullscreen: boolean;
  /** history.state of the current entry */
  state: unknown;
  historyLength: number;
  target: BackTarget | null;
}

/**
 * The order of the rules (the first that applies wins):
 *  1. a registered layer (sheet), then an overlay found in the DOM - closed, the screen stays;
 *  2. the full-screen chart is collapsed;
 *  3. a pushed screen: one step back in history when the app pushed the entry behind it (or the screen itself is marked), otherwise straight to its parent;
 *  4. a section root that is not home: to the home section;
 *  5. home: nothing (the app minimises).
 */
export function planBack(s: BackSnapshot): BackAction {
  if (s.layers > 0) return "layer";
  if (s.overlay) return "overlay";
  if (s.fullscreen) return "fullscreen";
  const stepBack = isMarkedScreenState(s.state) || canStepBack(s.state, s.historyLength);
  if (!s.target) return isMarkedScreenState(s.state) ? "history" : "none";
  if (s.target.level === "up") return stepBack ? "history" : "parent";
  return "home";
}

/* ---------- registry of open layers (sheets, the full-screen chart ...) ---------- */

/** "sheet": a sheet / dialog / menu above the screen (closed first). "screen": a layer that is a screen of its own (the full-screen chart), closed after the overlays. */
export type BackLayerKind = "sheet" | "screen";

interface BackLayer {
  kind: BackLayerKind;
  close: () => void;
  /** how many times Back tried to close it: a layer that ignores Back three times is left alone (Back must never get stuck) */
  tries: number;
}

const MAX_TRIES = 3;
const layers: BackLayer[] = [];

/** Register an open layer; the returned function unregisters it. The last registered layer of a kind is its topmost. */
export function registerBackLayer(close: () => void, kind: BackLayerKind = "sheet"): () => void {
  const layer: BackLayer = { kind, close, tries: 0 };
  layers.push(layer);
  return () => {
    const i = layers.indexOf(layer);
    if (i >= 0) layers.splice(i, 1);
  };
}

function live(kind: BackLayerKind): BackLayer[] {
  return layers.filter((l) => l.kind === kind && l.tries < MAX_TRIES);
}

/** Number of open registered layers of a kind that Back can still close. */
export function backLayerCount(kind: BackLayerKind = "sheet"): number {
  return live(kind).length;
}

/** Close the topmost registered layer of a kind; true when there was one. */
export function closeTopBackLayer(kind: BackLayerKind = "sheet"): boolean {
  const top = live(kind).pop();
  if (!top) return false;
  top.tries++;
  try {
    top.close();
  } catch {
    /* a failing close handler must not break Back */
  }
  return true;
}

/** Test helper: forget every layer. */
export function resetBackLayers(): void {
  layers.length = 0;
}

/* ---------- screens that draw their own «Назад» (the generic button of the app header steps aside) ---------- */

let ownBack = 0;
const ownBackSubs = new Set<() => void>();

/** A screen with a back control of its own (a pushed-screen bar: «‹ Профиль», «‹ Каналы», a thread's «‹ Назад») is on display; the returned function says it is gone. */
export function registerOwnBack(): () => void {
  ownBack++;
  ownBackSubs.forEach((f) => f());
  let done = false;
  return () => {
    if (done) return;
    done = true;
    ownBack = Math.max(0, ownBack - 1);
    ownBackSubs.forEach((f) => f());
  };
}
export function ownBackCount(): number {
  return ownBack;
}
export function subscribeOwnBack(cb: () => void): () => void {
  ownBackSubs.add(cb);
  return () => void ownBackSubs.delete(cb);
}

/**
 * Screens whose header is hidden because they carry a top bar of their own WITH a «Назад» in it (the chat threads, a channel, an author, the profile's pushed screens,
 * the calculator opened from the terminal). Known by path, so no slim generic bar flashes in before such a screen has mounted. (The terminal's pushed pages, e.g.
 * /terminal/features, are plain pages with no bar: they get the generic one.)
 */
export function hasOwnBackBar(pathname: string): boolean {
  const s = seg(stripLocale((pathname || "/").split(/[?#]/)[0]).path);
  switch (s[0]) {
    case "chat":
    case "messages":
    case "channels":
    case "authors":
    case "profile":
    case "subscriptions":
    case "calculator":
      return true;
    case "rooms":
      return s[1] !== "join";
    default:
      return false;
  }
}

/** What the app header draws on this screen: nothing (a root, or the screen has its own back control), the button in the compact header, or a slim bar where the header is hidden. */
export type BackChrome = "none" | "header" | "bar";
export function backChrome(opts: { target: BackTarget | null; headerHidden: boolean; ownBack: boolean }): BackChrome {
  if (!opts.target || opts.ownBack) return "none";
  return opts.headerHidden ? "bar" : "header";
}

/* ---------- unsaved-changes guards (a form with edits asks before Back leaves it) ---------- */

type BackGuard = () => boolean;
const guards: BackGuard[] = [];

/** Register a guard; while it is registered, a Back that would LEAVE the screen calls it first: it returns true when it took over (asked the user, Back stays). Last registered asks first. */
export function registerBackGuard(g: BackGuard): () => void {
  guards.push(g);
  return () => {
    const i = guards.indexOf(g);
    if (i >= 0) guards.splice(i, 1);
  };
}

/** True when a guard vetoed the Back (it is asking the user). */
export function runBackGuard(): boolean {
  const g = guards[guards.length - 1];
  if (!g) return false;
  try {
    return g() === true;
  } catch {
    return false;
  }
}

/** Test helper. */
export function resetBackGuards(): void {
  guards.length = 0;
  ownBack = 0;
}
