"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { canOpenNativeSettings, nativeBridge, openNativeSettings } from "@/lib/native-app";
import { APP_TABS, activeAppTab, appTabHref, badgeLabel, raisesKeyboard, type AppTabId } from "@/lib/app-ui";
import { useChatBadge } from "@/components/layout/useChatBadge";
import AppIcon, { type AppIconName } from "./AppIcon";
import { useAppUi } from "./useAppUi";
import { applyFontStep, readFontStep } from "./fontStep";

const HINT_KEY = "fomo-dock-hint-v2";

const ICON: Record<AppTabId, AppIconName> = { feed: "board", terminal: "terminal", chat: "chat", calendar: "cal", channels: "channels", authors: "users", me: "user", settings: "sliders" };

/** Hides the bar while a text field is focused: the Android WebView shrinks to the space above the keyboard and a fixed bar would ride on top of it. */
function useKeyboardClass() {
  useEffect(() => {
    const root = document.documentElement;
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

function TabBar() {
  const { t, locale } = useT();
  const pathname = usePathname() || "/";
  const active = activeAppTab(pathname);
  const unread = badgeLabel(useChatBadge());
  const { data: session } = useSession();
  const me = session?.user as { image?: string | null; name?: string | null } | undefined;
  useKeyboardClass();
  const bar = useRef<HTMLElement>(null);
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

  // the dock is a carousel: fade the edge that has more tabs behind it, and nudge it sideways a few times so it reads as swipeable
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;
    const sync = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      nav.dataset.more = max <= 2 ? "" : nav.scrollLeft <= 2 ? "r" : nav.scrollLeft >= max - 2 ? "l" : "lr";
    };
    sync();
    nav.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    let hinted = 0;
    try {
      hinted = Number(localStorage.getItem(HINT_KEY) || 0);
    } catch {
      /* private mode: hint every time */
    }
    const timers: number[] = [];
    let raf = 0;
    let touched = false;
    const stop = () => {
      touched = true;
    };
    nav.addEventListener("touchstart", stop, { passive: true, once: true });
    if (hinted < 6 && nav.scrollWidth - nav.clientWidth > 24) {
      timers.push(
        window.setTimeout(() => {
          if (touched) return;
          // scroll-snap mandatory would pull a small smooth scroll straight back: switch it off while the nudge runs, animate by hand (there and back)
          const from = nav.scrollLeft;
          const dist = Math.min(72, nav.scrollWidth - nav.clientWidth - from);
          const dur = 900;
          const t0 = performance.now();
          nav.style.scrollSnapType = "none";
          const tick = (now: number) => {
            const k = Math.min(1, (now - t0) / dur);
            nav.scrollLeft = from + dist * Math.sin(Math.PI * k); // 0 -> dist -> 0
            if (k < 1 && !touched) raf = requestAnimationFrame(tick);
            else nav.style.scrollSnapType = "";
          };
          raf = requestAnimationFrame(tick);
          try {
            localStorage.setItem(HINT_KEY, String(hinted + 1));
          } catch {
            /* ignore */
          }
        }, 1200)
      );
    }
    return () => {
      nav.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      timers.forEach((t) => window.clearTimeout(t));
      cancelAnimationFrame(raf);
      nav.style.scrollSnapType = "";
    };
  }, []);

  return (
    <nav ref={bar} className="app-tabbar" aria-label={t("appui.nav")} data-app-tabbar>
      {APP_TABS.map((tab) => {
        const on = tab.id === active;
        const label = t(tab.labelKey);
        const badge = tab.id === "chat" ? unread : "";
        return (
          <Link
            key={tab.id}
            href={appTabHref(locale as "ru" | "en" | "cn", tab)}
            prefetch={false}
            className="app-tab"
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
  );
}

/** Bottom tab bar of the app UI: five tabs, position:fixed to the viewport, never part of the scrolling content. Renders nothing outside the app UI. */
export default function AppTabBar() {
  const on = useAppUi();
  return on ? <TabBar /> : null;
}
