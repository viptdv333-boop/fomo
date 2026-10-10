"use client";

import * as React from "react";
import { Suspense, createContext, startTransition, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { hostTabForPath, isHostHref, maxMounted, prefetchOrder, touchTab, TRANSIENT_TABS, type HostScreenId } from "@/lib/app-tabhost";
import { APP_TABS } from "@/lib/app-ui";
import { apiReadsInFlight, subscribeApiReads } from "@/lib/offline/fetch-guard";
import { useAppUi } from "../useAppUi";
import { loadScreen, preloadScreens, savingData, screenFor, warmTerminalBars } from "./screens";
import { bumpFreshAll, clearPending, freshGeneration, hostNavigate, setHostOn, useFreshVersion, usePendingNav, useTabHostAllowed } from "./store";
import { ScreenWarmCtx, startFirewall, warmConflict } from "./warm";
import "./tabhost.css";

/**
 * Keep-alive for the screens of the dock tabs (app UI only). A tab root (/feed, /chat, /calendar, /channels, /authors, /profile, /terminal) is not
 * rendered by Next's route tree here: the host mounts the tab's screen itself, keeps it mounted (hidden, with its state and scroll position) while the
 * user is on another tab, and a tab switch is just a change of the visible screen plus the URL in place (store.ts hostNavigate). Everything that is
 * not a tab root (an idea, a channel, an author, a form ...) is an ordinary route: Next renders `children` and the kept screens wait, hidden.
 * Switched off (kill switch ?tabhost=0 / localStorage fomo-tabhost=0, outside the app UI, before hydration) it renders `children` and nothing else,
 * exactly like the layout did before. Documented in docs/tabhost.md.
 *
 * Hidden screens are React <Activity mode="hidden">: their effects are cleaned up (timers, sockets, listeners, the html.app-*-on classes of the
 * screens) and run again when shown, which doubles as «refresh on return»; state and DOM stay. After the first screen has settled the other tabs are
 * PRE-MOUNTED one by one in idle time (warm.ts): each loads its data in a hidden box and is then put to sleep, so the first switch to any tab shows
 * ready content. The terminal and the calculator are released when left (a chart engine with live feeds / inputs that come from the link): only one
 * chart ever exists and nothing polls in the background.
 */

const ScreenCtx = createContext<HostScreenId | null>(null);
/** The screen of the tab host this component is part of (null in an ordinary route). */
export function useTabScreen(): HostScreenId | null {
  return useContext(ScreenCtx);
}

type ActivityType = React.ComponentType<{ mode: "visible" | "hidden"; children?: ReactNode }>;
const ReactAny = React as unknown as { Activity?: ActivityType; unstable_Activity?: ActivityType };
// the vendored React of the App Router builds knows <Activity> (it is what Next's own back/forward cache is made of) but does not export it by name
const Activity: ActivityType = ReactAny.Activity ?? ReactAny.unstable_Activity ?? ((Symbol.for("react.activity") as unknown) as ActivityType);

type Mode = "shown" | "warm" | "hidden";

function Fallback() {
  const { t } = useT();
  return <div className="text-gray-500 py-12 text-center">{t("common.loading")}</div>;
}

function Screen({ tab, mode }: { tab: HostScreenId; mode: Mode }) {
  const Comp = screenFor(tab);
  // A screen that was warming (its effects have run, but the firewall kept its html classes off) and is now opened is put to sleep for one commit and woken up
  // again before the next paint: all its effects run anew, as after any other sleep, so the classes, listeners and timers of a shown screen are in place.
  const prevMode = useRef<Mode>(mode);
  const [, setBounced] = useState(0);
  const bounce = mode === "shown" && prevMode.current === "warm";
  useLayoutEffect(() => {
    prevMode.current = mode;
    if (bounce) setBounced((n) => n + 1);
  }, [mode, bounce]);
  if (!Comp) return null;
  return (
    <ScreenCtx.Provider value={tab}>
      <ScreenWarmCtx.Provider value={mode === "warm"}>
        <Activity mode={mode === "hidden" || bounce ? "hidden" : "visible"}>
          {/* display:contents = the screen's elements lay out as direct children of <main>, as they did before the host; a warming screen sits in a box that is not displayed */}
          <div style={{ display: mode === "warm" ? "none" : "contents" }} data-tab-screen={tab} data-mode={mode}>
            <Suspense fallback={mode === "shown" ? <Fallback /> : null}>
              <Comp />
            </Suspense>
          </div>
        </Activity>
      </ScreenWarmCtx.Provider>
    </ScreenCtx.Provider>
  );
}

function memoryBudget(): number {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { deviceMemory?: number }) : null;
  return maxMounted(nav?.deviceMemory);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
function idleSlot(): Promise<void> {
  return new Promise((resolve) => {
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => resolve(), { timeout: 3000 });
    else setTimeout(resolve, 200);
  });
}

/** A thin line under the status bar while the screen on display is being refreshed from the network. Never a spinner, never an empty state. */
function RefreshLine({ hold }: { hold: boolean }) {
  const reading = useSyncExternalStore(subscribeApiReads, () => apiReadsInFlight() > 0, () => false);
  const [show, setShow] = useState(false);
  const want = reading && !hold;
  useEffect(() => {
    if (!want) {
      setShow(false);
      return;
    }
    const id = setTimeout(() => setShow(true), 350); // quick answers never flash it
    return () => clearTimeout(id);
  }, [want]);
  return <div className="app-refresh-line" data-on={show ? "1" : undefined} aria-hidden="true" />;
}

export default function AppTabHost({ children }: { children: ReactNode }) {
  const appUi = useAppUi();
  const allowed = useTabHostAllowed();
  const on = appUi && allowed;
  const real = usePathname() || "/";
  const pending = usePendingNav();
  useFreshVersion(); // re-render when a screen has to mount again (a link with a query into a kept tab)
  // the tab asked for a moment ago shows at once; Next's own pathname takes over as soon as it reports the same URL
  const tabs = APP_TABS;
  const active: HostScreenId | null = on ? (pending ? pending.tab : hostTabForPath(real, tabs)) : null;

  // which screens are mounted, least recently shown first (derived in render so a new screen mounts in the very commit that shows it)
  const [mounted, setMounted] = useState<HostScreenId[]>([]);
  let list = mounted;
  if (on && active && mounted[mounted.length - 1] !== active) {
    list = touchTab(mounted, active, memoryBudget()).list;
    setMounted(list);
  }
  if (!on && mounted.length) {
    list = [];
    setMounted(list);
  } else if (on && !active && mounted.some((t) => TRANSIENT_TABS.includes(t))) {
    // a pushed screen (an idea, a channel ...) covers the terminal / calculator: they are released, as when another tab is opened
    list = mounted.filter((t) => !TRANSIENT_TABS.includes(t));
    setMounted(list);
  }
  const listRef = useRef(list);
  listRef.current = list;
  const activeRef = useRef(active);
  activeRef.current = active;

  // Another account (sign-in after browsing as a guest, sign-out, a switch): what the kept screens hold belongs to the previous one. They are thrown away and mount again.
  const { data: session, status } = useSession();
  const uid = session?.user?.id ?? null;
  const settledUid = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (status === "loading") return;
    if (settledUid.current !== undefined && settledUid.current !== uid) bumpFreshAll();
    settledUid.current = uid;
  }, [status, uid]);

  // the screen being pre-mounted right now (invisible), if any
  const [warm, setWarm] = useState<HostScreenId | null>(null);
  const warmRef = useRef<HostScreenId | null>(null); // set and cleared only by startWarm / endWarm (never from render)
  const stopFirewall = useRef<(() => void) | null>(null);
  const endWarm = () => {
    stopFirewall.current?.();
    stopFirewall.current = null;
    warmRef.current = null;
    // same lane as the transition that started it: the later update wins, in order (an urgent update would be applied BEFORE the pending start)
    startTransition(() => setWarm(null));
  };

  useEffect(() => {
    setHostOn(on);
    return () => setHostOn(false);
  }, [on]);

  // Next has caught up with the tab that was asked for (or went elsewhere): stop overriding its pathname
  useEffect(() => {
    clearPending();
  }, [real]);

  // each tab keeps its own scroll position (the scroller is <main>, shared by all screens)
  const scrolls = useRef<Partial<Record<HostScreenId, number>>>({});
  const shown = useRef<HostScreenId | null>(null);
  useEffect(() => {
    if (!on) return;
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => {
      if (shown.current && !warmRef.current) scrolls.current[shown.current] = main.scrollTop;
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, [on]);
  useLayoutEffect(() => {
    shown.current = active;
    if (warmRef.current) endWarm(); // the user moved on: whatever was warming stops at once
    if (!on || !active) return;
    const main = document.querySelector("main");
    if (main) main.scrollTop = scrolls.current[active] ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, on]);

  // every in-app link to a tab root (the profile's «Калькулятор», the terminal's «Идеи …», a notification) opens in place too, not only the dock
  useEffect(() => {
    if (!on) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const href = a.getAttribute("href") || "";
      if (isHostHref(href) && hostNavigate(href)) e.preventDefault();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [on]);

  // After the first screen has settled: fetch the code of the other tabs, then pre-mount them one by one (invisibly) so that each has its data when first opened
  useEffect(() => {
    if (!on) return;
    const stopPreload = preloadScreens(activeRef.current);
    let dead = false;
    // a screen is not pre-mounted while the user is busy (a touch, a key in the last moments): the warm-up must never make a scroll or a tap stutter
    let lastInput = 0;
    const touched = () => (lastInput = Date.now());
    document.addEventListener("touchstart", touched, { passive: true, capture: true });
    document.addEventListener("pointerdown", touched, { passive: true, capture: true });
    document.addEventListener("keydown", touched, { passive: true, capture: true });
    const run = async () => {
      await sleep(3000);
      if (document.readyState !== "complete") await new Promise<void>((r) => window.addEventListener("load", () => r(), { once: true }));
      for (const id of prefetchOrder(activeRef.current)) {
        if (dead || savingData()) return;
        if (TRANSIENT_TABS.includes(id) || listRef.current.includes(id) || warmConflict(activeRef.current, id)) continue;
        if (listRef.current.filter((t) => !TRANSIENT_TABS.includes(t)).length >= memoryBudget()) return;
        try {
          await loadScreen(id);
        } catch {
          continue;
        }
        await idleSlot();
        while (!dead && Date.now() - lastInput < 1500) await sleep(300);
        if (dead || document.hidden || warmConflict(activeRef.current, id)) continue;
        // start: the screen mounts in a box that is not displayed, at the least recent end of the list; as a transition, so rendering it yields to the user's input
        stopFirewall.current = startFirewall(id);
        warmRef.current = id;
        startTransition(() => {
          setMounted((m) => (m.includes(id) ? m : [id, ...m]));
          setWarm(id);
        });
        // it has to be on the page before its data is waited for
        for (let i = 0; i < 50 && !dead && warmRef.current === id && !document.querySelector(`[data-tab-screen="${id}"][data-mode="warm"]`); i++) await sleep(100);
        // wait until its data has come (no /api read in flight for a moment), at most a few seconds; a tap anywhere else ends it earlier
        const t0 = Date.now();
        let quiet = 0;
        while (!dead && warmRef.current === id && Date.now() - t0 < 7000) {
          await sleep(120);
          quiet = apiReadsInFlight() === 0 ? quiet + 120 : 0;
          if (Date.now() - t0 > 900 && quiet >= 480) break;
        }
        if (warmRef.current === id) endWarm();
        await sleep(250);
      }
      // the terminal is not pre-mounted (a chart engine); its last symbol's bars are made ready instead
      if (!dead && tabs.some((t) => t.id === "terminal")) await warmTerminalBars();
    };
    void run();
    return () => {
      dead = true;
      document.removeEventListener("touchstart", touched, { capture: true });
      document.removeEventListener("pointerdown", touched, { capture: true });
      document.removeEventListener("keydown", touched, { capture: true });
      stopPreload();
      stopFirewall.current?.();
      stopFirewall.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const order: HostScreenId[] = tabs.map((tab) => tab.id);
  return (
    <>
      {/* rendered in dock order, not in order of use: re-ordering keyed children would move their DOM nodes */}
      {order
        .filter((id) => list.includes(id))
        .map((id) => (
          <Screen key={`${id}:${freshGeneration(id)}`} tab={id} mode={id === active ? "shown" : id === warm ? "warm" : "hidden"} />
        ))}
      {on && active ? null : children}
      {on && <RefreshLine hold={!!warm || !active} />}
    </>
  );
}
