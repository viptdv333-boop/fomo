"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { appHeaderHidden } from "@/lib/app-ui";
import { isTerminalSite } from "@/lib/site-mode";
import ThemeToggle from "@/components/layout/ThemeToggle";
import NotificationBell from "@/components/layout/NotificationBell";
import { useAppUi } from "./useAppUi";
import { hostNavigate, useAppPathname } from "./tabhost/store";

// terminal.fomo.spot: the logo leads to the terminal
const TERMINAL = isTerminalSite();

function Header() {
  const { locale } = useT();

  // the design's header: the logo and the theme switch (no bell and no counter: the unread counts are the red badges of the dock, see AppTabBar). The profile (photo, menu, settings, text size, update, downloads, sign out)
  // lives in the «Профиль» tab of the dock (components/app/profile).
  return (
    <header className="app-header" data-app-header>
      <Link
        href={localizedPath(locale as Locale, TERMINAL ? "/terminal" : "/feed")}
        className="app-logo"
        aria-label={TERMINAL ? "FOMO Terminal" : "FOMO"}
        onClick={(e) => {
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && hostNavigate(localizedPath(locale as Locale, TERMINAL ? "/terminal" : "/feed"))) e.preventDefault();
        }}
      >
        <span className="app-logo-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-fomo-sm.webp" width={480} height={320} alt="FOMO" />
        </span>
        <span className="app-logo-tag">Find Opportunities, Make Outcomes</span>
      </Link>
      <div className="app-header-right">
        <div className="app-hbtn">
          <ThemeToggle />
        </div>
      </div>
      <HiddenBell />
    </header>
  );
}

/** The bell is never shown in the app UI, but it keeps running everywhere (sound, socket, push) exactly as it did in the site header. */
function HiddenBell() {
  const { data: session } = useSession();
  return session ? (
    <div hidden aria-hidden="true">
      <NotificationBell />
    </div>
  ) : null;
}

/** Compact top header of the app UI (logo, theme, bell). Hidden where a screen has its own bar (terminal, chat, channels / authors, profile); renders nothing outside the app UI. */
export default function AppHeader() {
  const on = useAppUi();
  const pathname = useAppPathname();
  if (!on) return null;
  if (appHeaderHidden(pathname)) return <HiddenBell />;
  return <Header />; // carries its own HiddenBell
}
