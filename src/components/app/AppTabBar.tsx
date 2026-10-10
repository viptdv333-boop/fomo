"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { canOpenNativeSettings, nativeBridge, openNativeSettings } from "@/lib/native-app";
import { APP_TABS, activeAppTab, appTabHref, badgeLabel, dockDragScroll, dockKeyAction, dockKeyTarget, dockWheelDelta, isDockDrag, isTabSwipe, raisesKeyboard, swipeAxis, swipeTargetTab, type AppTabId } from "@/lib/app-ui";
import { hiddenTabUnread, tabBadgeLabel } from "@/lib/app-badges";
import AppIcon, { type AppIconName } from "./AppIcon";
import { useAppUi } from "./useAppUi";
import { useTabBadges } from "./useTabBadges";
import { applyFontStep, readFontStep } from "./fontStep";
import { hostNavigate, useAppPathname } from "./tabhost/store";

const ICON: Record<AppTabId, AppIconName> = { feed: "board", terminal: "terminal", calculator: "calc", chat: "chat", calendar: "cal", channels: "channels", authors: "users", me: "user", settings: "sliders" };

/** Hides the bar while a text field is focused: the Android WebView shrinks to the space above the keyboard and a fixed bar would ride on top of it. (Not in the desktop window: there is no soft keyboard.) */
function useKeyboardClass() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("app-desktop")) return;
    const sync = () => root.classList.toggle("app-kbd", raisesKeyboard(document.activeElement as HTMLElement | null));
    const onOut = () => window.setTimeout(sync, 0); // focus moving from one field to another must not flicker the bar
    document.addEventListener("focusin", sync);
    document.addEventListener("focusout", onOut);
    sync();
    return () => {
      document.removeEventListener("focusin", sync);
      document.removeEventListener("focusout", onOut);
      root.classList.remove("app-kbd");
    };
  }, []);
}


/** Where a sideways swipe must NOT switch the section: fields, the chart, sheets / dialogs, the dock itself, anything that really scrolls sideways. */
const NO_SWIPE = "input, textarea, select, canvas, [contenteditable], [data-no-swipe], [role=dialog], .app-tabbar, .app-dock-more, .app-term-chart, .ac-sheet-wrap, .app-sheet, .app-term-fs";
function scrollsSideways(el: Element | null): boolean {
  for (let n: Element | null = el; n && n !== document.body && n.tagName !== "MAIN"; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && n.scrollWidth > n.clientWidth + 8) return true;
  }
  return false;
}
const SLIDE_KEY = "fomo-tab-slide";

/**
 * Swipe left / right on a tab's root screen switches to the next / previous dock section. It follows the finger (the screen slides a little),
 * fires as soon as the move is long enough (no waiting for the finger to lift), the screen slides out at once and the new one slides in.
 * The neighbours are prefetched so the switch does not wait for the network more than it has to.
 */
function useSwipeTabs() {
  const router = useRouter();
  const pathname = useAppPathname();
  const { locale } = useT();
  const loc = locale as "ru" | "en" | "cn";

  // the new screen slides in from the side the swipe came from
  useEffect(() => {
    const m = document.querySelector("main") as HTMLElement | null;
    if (m) {
      m.style.transition = "";
      m.style.transform = "";
      m.style.opacity = "";
    }
    let dir = "";
    try {
      dir = sessionStorage.getItem(SLIDE_KEY) || "";
      sessionStorage.removeItem(SLIDE_KEY);
    } catch {
      /* private mode */
    }
    if (dir !== "l" && dir !== "r") return;
    const root = document.documentElement;
    root.dataset.slide = dir;
    const t = window.setTimeout(() => delete root.dataset.slide, 320);
    return () => window.clearTimeout(t);
  }, [pathname]);

  // warm up the two neighbours
  useEffect(() => {
    const search = window.location.search;
    for (const d of [-1, 1] as const) {
      const tab = swipeTargetTab(pathname, search, d);
      if (!tab) continue;
      try {
        router.prefetch(appTabHref(loc, tab));
      } catch {
        /* old router */
      }
    }
  }, [pathname, loc, router]);

  useEffect(() => {
    let sx = 0;
    let sy = 0;
    let ok = false;
    let axis: "h" | "v" | null = null;
    const main = () => document.querySelector("main") as HTMLElement | null;
    const reset = (animate: boolean) => {
      const m = main();
      if (!m) return;
      m.style.transition = animate ? "transform 0.16s ease-out, opacity 0.16s ease-out" : "";
      m.style.transform = "";
      m.style.opacity = "";
      if (animate) window.setTimeout(() => (m.style.transition = ""), 200);
    };
    const start = (e: TouchEvent) => {
      ok = false;
      axis = null;
      if (e.touches.length !== 1) return;
      const t = e.target as Element | null;
      if (!t || t.closest(NO_SWIPE) || scrollsSideways(t)) return;
      if (document.documentElement.classList.contains("app-term-fs") || document.querySelector("[role=dialog], .ac-sheet-wrap")) return;
      if (window.history.state && (window.history.state.appChat || window.history.state.appProf)) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      ok = true;
    };
    const move = (e: TouchEvent) => {
      if (!ok) return;
      const c = e.touches[0];
      if (!c) return;
      const dx = c.clientX - sx;
      const dy = c.clientY - sy;
      if (!axis) {
        axis = swipeAxis(dx, dy);
        if (!axis) return;
      }
      if (axis === "v") {
        ok = false;
        return;
      }
      const dir = dx < 0 ? 1 : -1;
      const target = swipeTargetTab(pathname, window.location.search, dir);
      const m = main();
      if (m && !window.getSelection()?.toString()) {
        // follows the finger, with resistance (and almost none where there is nothing to switch to)
        m.style.transition = "none";
        m.style.transform = `translateX(${Math.round(dx * (target ? 0.45 : 0.12))}px)`;
        m.style.opacity = target ? String(Math.max(0.55, 1 - Math.abs(dx) / 420)) : "";
      }
      if (target && isTabSwipe(dx, dy)) {
        ok = false;
        try {
          nativeBridge()?.haptic?.();
        } catch {
          /* old app build */
        }
        try {
          sessionStorage.setItem(SLIDE_KEY, dir === 1 ? "l" : "r");
        } catch {
          /* private mode */
        }
        if (m) {
          m.style.transition = "transform 0.12s ease-in, opacity 0.12s ease-in";
          m.style.transform = `translateX(${dir === 1 ? "-32%" : "32%"})`;
          m.style.opacity = "0.25";
          window.setTimeout(() => reset(false), 3500); // the screen waits faded until the new one arrives (the route effect clears it); this only guards a stalled load
        }
        const href = appTabHref(loc, target);
        if (!hostNavigate(href)) router.push(href);
      }
    };
    const end = () => {
      if (axis === "h" && ok) reset(true);
      ok = false;
      axis = null;
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", end, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", end);
      reset(false);
    };
  }, [pathname, loc, router]);
}

/**
 * Mouse and keyboard on the desktop window (html.app-desktop only): the wheel over the dock scrolls it sideways, the dock can be dragged with the
 * mouse (a click on a tab still opens it), Ctrl+← / Ctrl+→ switch to the previous / next section and Ctrl+1 … Ctrl+8 jump to the n-th one
 * (never while a field is focused, a sheet / dialog is open or the chart is full screen). Touch is untouched: the swipe code above listens to touches only.
 */
function useDesktopNav(bar: React.RefObject<HTMLElement | null>) {
  const router = useRouter();
  const pathname = useAppPathname();
  const { locale } = useT();
  const loc = locale as "ru" | "en" | "cn";

  useEffect(() => {
    const nav = bar.current;
    const root = document.documentElement;
    if (!nav || !root.classList.contains("app-desktop")) return;
    const onWheel = (e: WheelEvent) => {
      const d = dockWheelDelta(e.deltaX, e.deltaY, e.deltaMode);
      if (d === null || nav.scrollWidth <= nav.clientWidth + 1) return;
      e.preventDefault();
      nav.scrollLeft += d;
    };
    let down = false;
    let dragging = false;
    let startX = 0;
    let startLeft = 0;
    const eatClick = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      down = true;
      dragging = false;
      startX = e.clientX;
      startLeft = nav.scrollLeft;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      if (!dragging) {
        if (!isDockDrag(e.clientX - startX)) return;
        dragging = true;
        try {
          nav.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already gone */
        }
        nav.dataset.drag = "1";
      }
      nav.scrollLeft = dockDragScroll(startLeft, startX, e.clientX, nav.scrollWidth - nav.clientWidth);
    };
    const onUp = () => {
      if (dragging) {
        // the click that ends a drag must not open the tab under the pointer
        nav.addEventListener("click", eatClick, { capture: true, once: true });
        window.setTimeout(() => nav.removeEventListener("click", eatClick, { capture: true }), 80);
      }
      down = false;
      dragging = false;
      delete nav.dataset.drag;
    };
    const noDrag = (e: Event) => e.preventDefault(); // a dragged link would start the browser's own link drag
    nav.addEventListener("wheel", onWheel, { passive: false });
    nav.addEventListener("pointerdown", onDown);
    nav.addEventListener("pointermove", onMove);
    nav.addEventListener("pointerup", onUp);
    nav.addEventListener("pointercancel", onUp);
    nav.addEventListener("dragstart", noDrag);
    return () => {
      nav.removeEventListener("wheel", onWheel);
      nav.removeEventListener("pointerdown", onDown);
      nav.removeEventListener("pointermove", onMove);
      nav.removeEventListener("pointerup", onUp);
      nav.removeEventListener("pointercancel", onUp);
      nav.removeEventListener("dragstart", noDrag);
    };
  }, [bar]);

  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("app-desktop")) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = dockKeyAction(e);
      if (!action) return;
      const el = document.activeElement as HTMLElement | null;
      if (raisesKeyboard(el) || el?.tagName === "SELECT") return; // typing: Ctrl+← moves the caret by a word
      if (root.classList.contains("app-term-fs") || document.querySelector("[role=dialog], .ac-sheet-wrap")) return;
      const target = dockKeyTarget(action, pathname);
      if (!target) return;
      e.preventDefault();
      const href = appTabHref(loc, target);
      if (!hostNavigate(href)) router.push(href);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [pathname, loc, router]);
}

function TabBar() {
  const { t, locale } = useT();
  const pathname = useAppPathname();
  const active = activeAppTab(pathname);
  const counts = useTabBadges(active); // red badges: Доска / Терминал / Болталка / Календарь / Каналы (src/lib/app-badges.ts)
  const { data: session } = useSession();
  const me = session?.user as { image?: string | null; name?: string | null } | undefined;
  useKeyboardClass();
  useSwipeTabs();
  const bar = useRef<HTMLElement>(null);
  useDesktopNav(bar);
  useEffect(() => {
    applyFontStep(readFontStep());
  }, []);
  // the dock is a sideways carousel: bring the active tab into view when the route changes (only the bar scrolls, never the page)
  useEffect(() => {
    const nav = bar.current;
    const el = nav?.querySelector<HTMLElement>("[data-active=\"1\"]");
    if (!nav || !el) return;
    const left = el.offsetLeft - (nav.clientWidth - el.offsetWidth) / 2;
    nav.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [active]);

  // the dock is a carousel: a scroll thumb above the bar (plus the half-visible last tab) (all driven by the bar's scroll position)
  const thumb = useRef<HTMLSpanElement>(null);
  // unread numbers of the tabs that have scrolled out of sight (their own badge cannot be seen): a red «‹ 3» / «3 ›» at the edge of the dock
  const [edge, setEdge] = useState({ l: 0, r: 0 });
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;
    const sync = () => {
      const boxes = [...nav.querySelectorAll<HTMLElement>("[data-tab]")].map((el) => ({ id: el.dataset.tab as AppTabId, left: el.offsetLeft, width: el.offsetWidth }));
      const h = hiddenTabUnread(boxes, nav.scrollLeft, nav.clientWidth, counts);
      setEdge((cur) => (cur.l === h.l && cur.r === h.r ? cur : h));
      const max = nav.scrollWidth - nav.clientWidth;
      if (thumb.current) {
        const w = max > 2 ? (nav.clientWidth / nav.scrollWidth) * 100 : 100;
        thumb.current.style.width = `${w}%`;
        thumb.current.style.left = `${max > 2 ? (nav.scrollLeft / nav.scrollWidth) * 100 : 0}%`;
        thumb.current.parentElement!.style.display = max > 2 ? "" : "none";
      }
    };
    sync();
    nav.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      nav.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [counts]);
  return (
    <>
    {/* desktop window: the bar's background spans the whole window while the tabs sit in the centred column (see app-desktop.css) */}
    <div className="app-dock-bg" aria-hidden="true" />
    <nav ref={bar} className="app-tabbar" data-tabs={APP_TABS.length} style={{ "--app-tab-w": APP_TABS.length > 5 ? "18.18%" : `${100 / APP_TABS.length}%` } as React.CSSProperties} aria-label={t("appui.nav")} data-app-tabbar>
      {APP_TABS.map((tab) => {
        const on = tab.id === active;
        const label = t(tab.labelKey);
        const badge = tabBadgeLabel(counts, tab.id);
        return (
          <Link
            key={tab.id}
            href={appTabHref(locale as "ru" | "en" | "cn", tab)}
            prefetch={false}
            className="app-tab"
            data-tab={tab.id}
            data-active={on ? "1" : undefined}
            aria-current={on ? "page" : undefined}
            aria-label={badge ? `${label}, ${t("appui.unread", { n: badge })}` : label}
            onClick={(e) => {
              if (tab.id === "settings" && canOpenNativeSettings()) {
                e.preventDefault();
                openNativeSettings();
                return;
              }
              try {
                nativeBridge()?.haptic?.();
              } catch {
                /* old app build */
              }
              if (on) document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
              // the tab host (tabhost/AppTabHost.tsx) shows a tab's screen in place: no server round trip, the screen that was open before is still mounted
              if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && hostNavigate(appTabHref(locale as "ru" | "en" | "cn", tab))) e.preventDefault();
            }}
          >
            <span className="app-tab-ico">
              {tab.id === "me" && session ? (
                <span className="app-tab-ava" aria-hidden="true">
                  {me?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={me.image} alt="" />
                  ) : (
                    (me?.name || "?").trim().charAt(0).toUpperCase()
                  )}
                </span>
              ) : (
                <AppIcon name={ICON[tab.id]} size={24} />
              )}
              {badge && <span className="app-badge">{badge}</span>}
            </span>
            <span className="app-tab-label">{label}</span>
          </Link>
        );
      })}
    </nav>
    <div className="app-dock-track" aria-hidden="true">
      <span ref={thumb} className="app-dock-thumb" />
    </div>
    {(["l", "r"] as const).map((side) =>
      edge[side] > 0 ? (
        <button
          key={side}
          type="button"
          className="app-dock-more"
          data-side={side}
          aria-label={t("appui.unread", { n: badgeLabel(edge[side]) })}
          onClick={() => bar.current?.scrollTo({ left: side === "l" ? 0 : bar.current.scrollWidth, behavior: "smooth" })}
        >
          {side === "l" ? "‹ " : ""}
          {badgeLabel(edge[side])}
          {side === "r" ? " ›" : ""}
        </button>
      ) : null
    )}
    </>
  );
}

/** Bottom tab bar of the app UI: five tabs, position:fixed to the viewport, never part of the scrolling content. Renders nothing outside the app UI. */
export default function AppTabBar() {
  const on = useAppUi();
  return on ? <TabBar /> : null;
}
