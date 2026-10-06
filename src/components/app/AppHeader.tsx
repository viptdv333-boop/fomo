"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { appHeaderHidden } from "@/lib/app-ui";
import { isTerminalSite } from "@/lib/site-mode";
import ThemeToggle from "@/components/layout/ThemeToggle";
import NotificationBell from "@/components/layout/NotificationBell";
import { useAppUi } from "./useAppUi";

// terminal.fomo.spot: the logo leads to the terminal
const TERMINAL = isTerminalSite();

function Header() {
  const { data: session } = useSession();
  const { locale } = useT();

  // the design's header: the logo, the theme switch and the bell. The profile (photo, menu, settings, text size, update, downloads, sign out)
  // lives in the «Профиль» tab of the dock (components/app/profile).
  return (
    <header className="app-header" data-app-header>
      <Link href={localizedPath(locale as Locale, TERMINAL ? "/terminal" : "/feed")} className="app-logo" aria-label={TERMINAL ? "FOMO Terminal" : "FOMO"}>
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
        {session && (
          <div className="app-hbtn">
            <NotificationBell />
          </div>
        )}
      </div>
    </header>
  );
}

/** No header on the terminal, but the bell keeps running (unread count, sound, socket) exactly as it did in the site header. */
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
  const pathname = usePathname() || "/";
  if (!on) return null;
  if (appHeaderHidden(pathname)) return <HiddenBell />;
  return <Header />;
}
