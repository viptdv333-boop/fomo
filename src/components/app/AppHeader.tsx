"use client";

import { Suspense, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { appHeaderHidden } from "@/lib/app-ui";
import { appBackTarget, backChrome, hasOwnBackBar, ownBackCount, subscribeOwnBack, type BackTarget } from "@/lib/app-back";
import { isTerminalSite } from "@/lib/site-mode";
import FomoLogo from "@/components/brand/FomoLogo";
import ThemeToggle from "@/components/layout/ThemeToggle";
import LanguageSelector from "@/components/layout/LanguageSelector";
import NotificationBell from "@/components/layout/NotificationBell";
import { useAppUi } from "./useAppUi";
import AppBackButton from "./AppBackButton";
import { hostNavigate, useAppPathname, usePendingNav } from "./tabhost/store";

// terminal.fomo.spot: the logo leads to the terminal
const TERMINAL = isTerminalSite();

function Header({ back }: { back: BackTarget | null }) {
  const { locale } = useT();

  // the design's header: the logo and the theme switch (no bell and no counter: the unread counts are the red badges of the dock, see AppTabBar). The profile (photo, menu, settings, text size, update, downloads, sign out)
  // lives in the «Профиль» tab of the dock (components/app/profile). The hidden bell is NOT in here (see AppHeader): it must outlive the header.
  return (
    <header className="app-header" data-app-product={TERMINAL ? "terminal" : "main"} data-app-header data-has-back={back ? "1" : undefined}>
      <div className="app-header-left">
      {back ? <AppBackButton target={back} variant="header" /> : null}
      <Link
        href={localizedPath(locale as Locale, TERMINAL ? "/terminal" : "/feed")}
        className="app-logo"
        aria-label={TERMINAL ? "FOMO Terminal" : "FOMO"}
        onClick={(e) => {
          if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && hostNavigate(localizedPath(locale as Locale, TERMINAL ? "/terminal" : "/feed"))) e.preventDefault();
        }}
      >
        <FomoLogo product={TERMINAL ? "terminal" : "spot"} />
      </Link>
      </div>
      <div className="app-header-right">
        <div className="app-hbtn">
          <LanguageSelector compact />
        </div>
        <div className="app-hbtn">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** The bell is never shown in the app UI, but it keeps running everywhere (socket, badge polling, the chime) as it did in the site header. */
function HiddenBell() {
  const { data: session } = useSession();
  return session ? (
    <div hidden aria-hidden="true">
      <NotificationBell />
    </div>
  ) : null;
}

/** A slim bar with only the back button: for a pushed screen whose header is hidden and that has no bar of its own (the terminal's feature page). */
function BackBar({ back }: { back: BackTarget }) {
  return (
    <div className="app-backbar" data-app-header data-app-backbar>
      <AppBackButton target={back} variant="bar" />
    </div>
  );
}

/** Header or slim bar of this screen, with the generic «Назад» where the screen is not the root of a dock tab and has no back control of its own. */
function HeaderOrBar({ pathname }: { pathname: string }) {
  const sp = useSearchParams();
  const pending = usePendingNav(); // a dock tab was just tapped: its root is what is shown, whatever the query of the old URL still says
  const ownBar = useSyncExternalStore(subscribeOwnBack, () => ownBackCount() > 0, () => false);
  const hidden = appHeaderHidden(pathname);
  const search = pending ? "" : sp?.toString() ? `?${sp.toString()}` : "";
  const target = appBackTarget(pathname, search, isTerminalSite());
  const chrome = backChrome({ target, headerHidden: hidden, ownBack: ownBar || (hidden && hasOwnBackBar(pathname)) });
  if (chrome === "bar" && target) return <BackBar back={target} />;
  if (hidden) return null;
  return <Header back={chrome === "header" ? target : null} />;
}

/**
 * Compact top header of the app UI (logo, theme; the generic «Назад» on every pushed screen). Hidden where a screen has its own bar (terminal, chat, channels / authors, profile); renders nothing outside the app UI.
 * The hidden bell is a SIBLING of the header, always at the same place in the tree: when it lived inside the header, every switch between a tab with a header
 * (Доска, Календарь) and one without (Терминал, Болталка, Каналы, Профиль) unmounted and mounted it again, and a fresh bell chimes for the unread rows it finds
 * (src/components/layout/NotificationBell.tsx) — a sound at every other tap of the dock, with no new event behind it.
 */
export default function AppHeader() {
  const on = useAppUi();
  const pathname = useAppPathname();
  if (!on) return null;
  return (
    <>
      <Suspense fallback={appHeaderHidden(pathname) ? null : <Header back={null} />}>
        <HeaderOrBar pathname={pathname} />
      </Suspense>
      <HiddenBell />
    </>
  );
}
