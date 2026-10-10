"use client";

// Shared state of the app UI's tab host (AppTabHost.tsx): is the host running, the tab the user has just asked for (shown at once, before Next's
// own router state catches up), and the in-place navigation between tab roots. Everything here is client only.
import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { hostTabForPath, needsFreshMount, tabHostSwitch, TABHOST_KEY, type HostScreenId } from "@/lib/app-tabhost";

let hostOn = false;
let pending: { path: string; tab: HostScreenId } | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** AppTabHost tells whether it is running (app UI on, kill switch off). While it is not, hostNavigate() declines and callers use the router. */
export function setHostOn(on: boolean): void {
  hostOn = on;
  if (!on) clearPending();
}
export function hostIsOn(): boolean {
  return hostOn;
}

/** The tab asked for by hostNavigate() whose URL the router has not reported yet (null otherwise). */
export function pendingNav(): { path: string; tab: HostScreenId } | null {
  return pending;
}
export function clearPending(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = null;
  if (!pending) return;
  pending = null;
  notify();
}
function setPending(p: { path: string; tab: HostScreenId }): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pending = p;
  pendingTimer = setTimeout(clearPending, 2000); // never stuck: the real pathname takes over
  notify();
}
const subscribe = (cb: () => void) => {
  subs.add(cb);
  return () => void subs.delete(cb);
};

const freshGen: Partial<Record<HostScreenId, number>> = {};
let freshVersion = 0;
/** How many times the screen of this tab has been thrown away on purpose (part of its React key: a new number = a fresh mount). */
export function freshGeneration(tab: HostScreenId): number {
  return freshGen[tab] ?? 0;
}
function bumpFresh(tab: HostScreenId): void {
  freshGen[tab] = (freshGen[tab] ?? 0) + 1;
  freshVersion++;
  notify();
}
/** Every screen mounts again (the account changed: nothing a kept screen holds is the new user's). */
export function bumpFreshAll(): void {
  for (const id of ["feed", "terminal", "chat", "calendar", "channels", "authors", "me", "calculator"] as HostScreenId[]) freshGen[id] = (freshGen[id] ?? 0) + 1;
  freshVersion++;
  notify();
}
export function useFreshVersion(): number {
  return useSyncExternalStore(subscribe, () => freshVersion, () => 0);
}

/** The pathname the UI should act on: the tab just asked for (instantly) or, otherwise, Next's own. */
export function useAppPathname(): string {
  const real = usePathname() || "/";
  const p = useSyncExternalStore(subscribe, pendingNav, () => null);
  return p ? p.path : real;
}
export function usePendingNav(): { path: string; tab: HostScreenId } | null {
  return useSyncExternalStore(subscribe, pendingNav, () => null);
}

/**
 * Open the root screen of a dock tab without a server round trip: the host shows the screen that is (or is about to be) mounted and the URL
 * changes in place (history.pushState / replaceState, which Next's router follows: usePathname / useSearchParams update).
 * Returns false when the host does not handle this link (it is off, another origin, not a tab root): the caller then navigates the usual way.
 */
export function hostNavigate(href: string, mode: "push" | "replace" = "push"): boolean {
  if (!hostOn || typeof window === "undefined") return false;
  let u: URL;
  try {
    u = new URL(href, window.location.href);
  } catch {
    return false;
  }
  if (u.origin !== window.location.origin) return false;
  const tab = hostTabForPath(u.pathname);
  if (!tab) return false;
  const next = u.pathname + u.search + u.hash;
  const cur = window.location.pathname + window.location.search + window.location.hash;
  if (next === cur) return true;
  if (needsFreshMount(tab, u.search)) bumpFresh(tab);
  setPending({ path: u.pathname, tab });
  try {
    if (mode === "push") window.history.pushState({}, "", next);
    else window.history.replaceState({}, "", next);
  } catch {
    clearPending();
    return false;
  }
  return true;
}

let switchRead = false;
let switchDisabled = false;
/** The kill switch (?tabhost=0 / localStorage fomo-tabhost=0), read once per page load; the query is remembered. */
export function tabHostKillSwitch(): boolean {
  if (typeof window === "undefined") return true;
  if (switchRead) return switchDisabled;
  switchRead = true;
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(TABHOST_KEY);
  } catch {
    /* private mode */
  }
  const s = tabHostSwitch(window.location.search, stored);
  try {
    if (s.persist === "0") window.localStorage.setItem(TABHOST_KEY, "0");
    else if (s.persist === "clear") window.localStorage.removeItem(TABHOST_KEY);
  } catch {
    /* private mode */
  }
  switchDisabled = s.disabled;
  return switchDisabled;
}

/** True when the tab host may run in this page (false on the server and during hydration, then the real value). */
export function useTabHostAllowed(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => !tabHostKillSwitch(),
    () => false,
  );
}
