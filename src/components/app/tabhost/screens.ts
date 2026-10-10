"use client";

// The screens of the dock tabs as the tab host mounts them. Each is the SAME component the tab's route renders (the route page, or the client
// part of it), loaded lazily: the screen of the page that was opened first is already in the bundle, the others are fetched when first needed
// or, earlier, at idle (preloadScreens). Nothing here is imported by the route pages.
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { prefetchOrder, type HostScreenId } from "@/lib/app-tabhost";

type Loader = () => Promise<{ default: ComponentType }>;

const LOADERS: Partial<Record<HostScreenId, Loader>> = {
  feed: () => import("@/app/(main)/feed/page"),
  terminal: () => import("@/app/(main)/terminal/page"),
  chat: () => import("@/app/(main)/chat/page"),
  // the calendar route is a server page (SEO text + JSON-LD) around this client component
  calendar: () => import("@/components/chart/calendar/CalendarPageClient"),
  channels: () => import("@/app/(main)/channels/page"),
  authors: () => import("@/app/(main)/authors/page"),
  me: () => import("@/app/(main)/profile/page"),
  // pushed from the profile and from the terminal: opens as fast as a tab (the code is fetched at idle); a transient screen, its inputs come from the link
  calculator: () => import("@/app/(main)/calculator/page"),
};

const lazies = new Map<HostScreenId, LazyExoticComponent<ComponentType>>();
const loaded = new Set<HostScreenId>();

/** The lazy component of a tab's screen (stable between renders). */
export function screenFor(tab: HostScreenId): LazyExoticComponent<ComponentType> | null {
  const load = LOADERS[tab];
  if (!load) return null;
  let c = lazies.get(tab);
  if (!c) {
    c = lazy(() =>
      load().then((m) => {
        loaded.add(tab);
        return m;
      }),
    );
    lazies.set(tab, c);
  }
  return c;
}

/** Fetch the code of a screen (resolves when it is in memory). */
export function loadScreen(tab: HostScreenId): Promise<void> {
  const load = LOADERS[tab];
  if (!load || loaded.has(tab)) return Promise.resolve();
  return load().then(() => void loaded.add(tab));
}

interface Conn {
  saveData?: boolean;
  effectiveType?: string;
}

/** Slow or metered connection: nothing is fetched ahead of need. */
export function savingData(): boolean {
  const c = (navigator as Navigator & { connection?: Conn }).connection;
  return !!c && (c.saveData === true || c.effectiveType === "slow-2g" || c.effectiveType === "2g");
}

/** The chart's last symbol: its bars into memory and a fresh copy into the store (chunk of the chart is loaded first). */
export async function warmTerminalBars(): Promise<void> {
  if (savingData()) return;
  try {
    const m = await import("@/components/chart/TradingChart");
    await m.warmLastSymbolBars();
  } catch {
    /* ignore */
  }
}

function whenIdle(cb: () => void): void {
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 5000 });
  else setTimeout(cb, 300);
}

/**
 * After the first screen has settled, load the code of the other tabs one by one, each in an idle moment (the neighbours of the shown tab first),
 * so even the FIRST switch to a tab finds its code in memory. The terminal's chart engine comes last. Returns a cancel function.
 */
export function preloadScreens(active: HostScreenId | null, tabs?: readonly HostScreenId[]): () => void {
  let stop = false;
  if (savingData()) return () => {};
  const order = prefetchOrder(active).filter((t) => !tabs || tabs.includes(t));
  const steps: (() => Promise<unknown>)[] = order.filter((t) => !loaded.has(t) && LOADERS[t]).map((t) => () => LOADERS[t]!().then(() => void loaded.add(t)));
  if (!tabs || tabs.includes("terminal")) steps.push(() => import("@/components/chart/MultiChart"));
  // the two neighbours (a swipe or a tap goes there first) start almost at once, like the router's own prefetch of them used to; the rest wait for the page to settle
  const near = steps.splice(0, 2);
  const t0 = Date.now();
  let queue = near;
  const next = () => {
    if (stop) return;
    const step = queue.shift();
    if (!step) {
      if (queue === near && steps.length) {
        queue = steps;
        start = setTimeout(next, Math.max(0, 2500 - (Date.now() - t0)));
      }
      return;
    }
    whenIdle(() => {
      if (stop || document.hidden) return;
      step()
        .catch(() => {})
        .finally(() => setTimeout(next, 150));
    });
  };
  let start = setTimeout(next, 700);
  return () => {
    stop = true;
    clearTimeout(start);
  };
}
