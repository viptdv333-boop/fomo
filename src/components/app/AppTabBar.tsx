"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { nativeBridge } from "@/lib/native-app";
import { APP_TABS, activeAppTab, appTabHref, badgeLabel, raisesKeyboard, type AppTabId } from "@/lib/app-ui";
import { useChatBadge } from "@/components/layout/useChatBadge";
import AppIcon, { type AppIconName } from "./AppIcon";
import { useAppUi } from "./useAppUi";
import { applyFontStep, readFontStep } from "./fontStep";

const ICON: Record<AppTabId, AppIconName> = { feed: "board", terminal: "terminal", chat: "chat", calendar: "cal", channels: "channels" };

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
  useKeyboardClass();
  useEffect(() => {
    applyFontStep(readFontStep());
  }, []);

  return (
    <nav className="app-tabbar" aria-label={t("appui.nav")} data-app-tabbar>
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
            onClick={() => {
              try {
                nativeBridge()?.haptic?.();
              } catch {
                /* old app build */
              }
              if (on) document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <span className="app-tab-ico">
              <AppIcon name={ICON[tab.id]} size={24} />
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
