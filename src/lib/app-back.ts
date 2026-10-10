// Pure helpers of the Android «Назад» button of the app UI (src/components/app/AppBackHandler.tsx, window.FomoBack).
// No React, no DOM access except the tiny layer registry below: scripts/check-app-ui.ts runs them.
//
// Why: the Android shell used to call WebView.goBack() and nothing else. That minimises the app whenever the WebView has no previous history
// entry (a notification / deep link opens a screen as the FIRST entry, `/` -> `/feed` leaves one entry, ...), never closes a bottom sheet
// (a sheet is no history entry) and walks the dock tab by tab instead of going «to the board». MainActivity now asks the page first
// (`window.FomoBack()`); the page decides with the rules below and only returns false at the home screen, where the system may minimise.
import { localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";

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
const PROFILE_TABS = ["profile", "finance", "subs", "ideas", "rooms", "notifications", "security", "app"];

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
