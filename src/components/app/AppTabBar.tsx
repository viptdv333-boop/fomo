"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { canOpenNativeSettings, nativeBridge, openNativeSettings } from "@/lib/native-app";
import { APP_TABS, activeAppTab, appTabHref, raisesKeyboard, type AppTabId } from "@/lib/app-ui";
import { tabBadgeLabel } from "@/lib/app-badges";
import AppIcon, { type AppIconName } from "./AppIcon";
import { useAppUi } from "./useAppUi";
import { useTabBadges } from "./useTabBadges";
import { applyFontStep, readFontStep } from "./fontStep";

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
  const counts = useTabBadges(active); // red badges: Доска / Терминал / Болталка / Календарь / Каналы (src/lib/app-badges.ts)
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

  // the dock is a carousel: arrows on the sides that have more tabs behind them + a scroll thumb above the bar (all driven by the bar's scroll position)
  const thumb = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState({ l: false, r: false });
  useEffect(() => {
    const nav = bar.current;
    if (!nav) return;
    const sync = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      const l = max > 2 && nav.scrollLeft > 2;
      const r = max > 2 && nav.scrollLeft < max - 2;
      setMore((m) => (m.l === l && m.r === r ? m : { l, r }));
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
  }, []);
  const page = (dir: 1 | -1) => bar.current?.scrollBy({ left: dir * bar.current.clientWidth * 0.6, behavior: "smooth" });

  return (
    <>
    <nav ref={bar} className="app-tabbar" style={{ "--app-tab-w": APP_TABS.length > 5 ? "18.18%" : `${100 / APP_TABS.length}%` } as React.CSSProperties} aria-label={t("appui.nav")} data-app-tabbar>
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
    <div className="app-dock-track" aria-hidden="true">
      <span ref={thumb} className="app-dock-thumb" />
    </div>
    {more.l && (
      <button type="button" className="app-dock-arrow app-dock-arrow-l" onClick={() => page(-1)} aria-label={t("appui.dockPrev")}>
        <AppIcon name="chevL" size={18} stroke={2.2} />
      </button>
    )}
    {more.r && (
      <button type="button" className="app-dock-arrow app-dock-arrow-r" onClick={() => page(1)} aria-label={t("appui.dockNext")}>
        <AppIcon name="chevR" size={18} stroke={2.2} />
      </button>
    )}
    </>
  );
}

/** Bottom tab bar of the app UI: five tabs, position:fixed to the viewport, never part of the scrolling content. Renders nothing outside the app UI. */
export default function AppTabBar() {
  const on = useAppUi();
  return on ? <TabBar /> : null;
}
