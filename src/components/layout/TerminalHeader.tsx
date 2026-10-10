"use client";

import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/locale-url";
import ThemeToggle from "./ThemeToggle";
import NotificationBell from "./NotificationBell";
import LanguageSelector from "./LanguageSelector";
import { useT } from "@/lib/i18n/client";
import { ensurePushSubscription } from "@/lib/push-client";
import { unregisterNativePush } from "@/lib/native-push";
import { useAppUi } from "@/components/app/useAppUi";

/**
 * Header of the terminal site (terminal.fomo.spot, SITE_MODE=terminal; the main site uses Header.tsx): «FOMO Terminal» brand,
 * Терминал / Профиль (the calendar is a tab inside the terminal), language, theme, the bell and the sign-in / sign-out button. No messenger, no admin link
 * (the admin panel stays reachable by address for ADMIN / OWNER), no board, chat, channels or authors.
 */
export default function TerminalHeader() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string } | undefined;
  const userId = user?.id;
  const pathname = stripLocale(usePathname() || "/").path;
  const { t } = useT();
  // in the app UI the compact AppHeader owns the bell (this header is hidden by CSS): no double polling
  const appUi = useAppUi();

  // same as the main header: a signed-in visitor is (re)subscribed to Web Push on load, see ensurePushSubscription
  useEffect(() => {
    if (!userId) return;
    ensurePushSubscription();
  }, [userId]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const links = [
    { href: "/terminal", label: t("nav.terminal") },
    ...(session ? [{ href: "/calculator", label: t("nav.calculator") }] : []),
    ...(session ? [{ href: "/profile", label: t("profile.profile") }] : []),
  ];

  return (
    <header data-app-hide data-terminal-header className="bg-white dark:bg-gray-900 shadow-sm sticky top-0 z-50">
      <div className="w-full px-3 sm:px-4 py-1 flex items-center gap-2 sm:gap-6">
        <Link href="/terminal" aria-label={t("termsite.name")} className="flex items-center gap-2 shrink-0">
          <div className="w-[64px] sm:w-[88px] h-[40px] sm:h-[48px] overflow-hidden relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-fomo-sm.webp" width={480} height={320} alt="FOMO" className="absolute w-full h-auto" style={{ top: "-16%" }} />
          </div>
          <span className="hidden sm:inline text-base font-semibold text-green-600 dark:text-green-400 tracking-wide -ml-1">Terminal</span>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-6 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] sm:justify-center" aria-label={t("termsite.name")}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm font-medium whitespace-nowrap transition ${
                isActive(link.href)
                  ? "text-green-600 dark:text-green-400"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <div className="hidden sm:block">
            <LanguageSelector />
          </div>
          <ThemeToggle />
          {session && !appUi && <NotificationBell />}
          {session ? (
            <button
              type="button"
              onClick={() => void unregisterNativePush().finally(() => signOut({ callbackUrl: "/" }))}
              className="px-2 py-1.5 text-xs sm:text-sm text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 transition whitespace-nowrap"
            >
              {t("profile.logout")}
            </button>
          ) : (
            <Link href="/login" className="bg-green-600 text-white px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-green-700 transition whitespace-nowrap">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
