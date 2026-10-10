"use client";

// Pre-mounting of the tab screens ("warm-up"): after the first screen has settled, the other tabs are mounted ONE BY ONE, invisibly (a hidden box),
// so each loads its data and fills its state, then they are put to sleep (React <Activity> hidden: effects cleaned up, state and DOM kept). The first
// switch to any tab then shows ready content, not a loading state. While a screen is warming it must not touch what the user is looking at: the html.app-*-on
// classes the screens set for their own layout are taken off again and main.scrollTo() does nothing (see startFirewall).
import { createContext, useContext } from "react";
import type { HostScreenId } from "@/lib/app-tabhost";

/** True inside a screen that is being pre-mounted (not visible yet): screens that count time or watch the user (the guest demo gate) wait. */
export const ScreenWarmCtx = createContext(false);
export function useScreenWarm(): boolean {
  return useContext(ScreenWarmCtx);
}

/** html classes each screen family sets for itself while it is mounted (they restyle <main> / the dock). */
const FAMILY_CLASSES: Partial<Record<HostScreenId, readonly string[]>> = {
  chat: ["app-chat-on", "app-thread-on", "app-split-on"],
  channels: ["app-ch-on"],
  authors: ["app-ch-on"],
  me: ["app-prof-on"],
  terminal: ["app-term-on"],
  calculator: ["app-calc-on"],
};

/** Channels and authors are one screen with two faces (the same html class): one is not warmed while the other is on screen. */
export function warmConflict(active: HostScreenId | null, warming: HostScreenId): boolean {
  if (!active) return false;
  const a = FAMILY_CLASSES[active];
  const w = FAMILY_CLASSES[warming];
  return !!a && !!w && a.some((c) => w.includes(c));
}

/**
 * While `tab` is warming: any of its family's html classes that was not there before is removed the moment it appears (a MutationObserver callback is a
 * microtask: it runs before the next paint), and <main>.scrollTo is a no-op. The returned function undoes both.
 */
export function startFirewall(tab: HostScreenId): () => void {
  const root = document.documentElement;
  const mine = FAMILY_CLASSES[tab] ?? [];
  const had = new Set(mine.filter((c) => root.classList.contains(c)));
  const strip = () => {
    for (const c of mine) if (!had.has(c) && root.classList.contains(c)) root.classList.remove(c);
  };
  const mo = new MutationObserver(strip);
  mo.observe(root, { attributes: true, attributeFilter: ["class"] });
  const main = document.querySelector("main") as (HTMLElement & { scrollTo: unknown }) | null;
  const hadOwn = main ? Object.prototype.hasOwnProperty.call(main, "scrollTo") : false;
  if (main) main.scrollTo = () => {};
  return () => {
    mo.disconnect();
    strip();
    if (main && !hadOwn) delete (main as { scrollTo?: unknown }).scrollTo;
  };
}
