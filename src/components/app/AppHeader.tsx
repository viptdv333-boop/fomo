"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { localizedPath, type Locale } from "@/lib/i18n/locale-url";
import { unregisterNativePush } from "@/lib/native-push";
import { APP_FONT_STEPS, appHeaderHidden, type AppFontStep } from "@/lib/app-ui";
import ThemeToggle from "@/components/layout/ThemeToggle";
import NotificationBell from "@/components/layout/NotificationBell";
import UpdateAppButton from "@/components/shared/UpdateAppButton";
import { DownloadAppsRow } from "@/components/shared/DownloadApps";
import { useNativeSettingsAvailable } from "@/components/shared/NativeSettingsLink";
import { openNativeSettings } from "@/lib/native-app";
import { isTerminalSite } from "@/lib/site-mode";
import AppIcon, { type AppIconName } from "./AppIcon";
import { useAppUi } from "./useAppUi";
import { applyFontStep, readFontStep } from "./fontStep";

// terminal.fomo.spot: no help / ideas / subscriptions / finance entries, no admin link, no download row of the main apps
const TERMINAL = isTerminalSite();

interface SheetUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  fomoId?: string | null;
  role?: string | null;
}

function Avatar({ user, size }: { user: SheetUser | undefined; size: number }) {
  return (
    <span className="app-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {user?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" />
      ) : (
        (user?.name?.[0] || "?").toUpperCase()
      )}
    </span>
  );
}

function Row({ icon, children, href, onClick, tone }: { icon: AppIconName; children: ReactNode; href?: string; onClick?: () => void; tone?: "danger" }) {
  const inner = (
    <>
      <span className="app-row-ico">
        <AppIcon name={icon} size={18} />
      </span>
      <span className="app-row-label">{children}</span>
      {href && <AppIcon name="chevR" size={18} className="app-row-chev" />}
    </>
  );
  return href ? (
    <Link href={href} onClick={onClick} className="app-row" data-tone={tone}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className="app-row" data-tone={tone}>
      {inner}
    </button>
  );
}

/** Bottom sheet with the profile menu: the same entries as the site's profile dropdown (the site header is hidden in the app). */
function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { data: session } = useSession();
  const { t, locale } = useT();
  const user = session?.user as SheetUser | undefined;
  const loc = locale as Locale;
  const nativeSettings = useNativeSettingsAvailable();
  const [fz, setFz] = useState<AppFontStep>("m");
  useEffect(() => setFz(readFontStep()), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fzLabel: Record<AppFontStep, string> = { s: t("appui.fontS"), m: t("appui.fontM"), l: t("appui.fontL"), xl: t("appui.fontXl") };
  const p = (path: string) => localizedPath(loc, path);

  return (
    <div className="app-sheet-wrap" role="dialog" aria-modal="true" aria-label={t("appui.profile")}>
      <div className="app-sheet-back" onClick={onClose} />
      <div className="app-sheet">
        <div className="app-sheet-grip" />
        <div className="app-sheet-bar">
          <span />
          <span className="app-sheet-title">{t("profile.cabinet")}</span>
          <button type="button" className="app-sheet-close" onClick={onClose}>
            {t("appui.close")}
          </button>
        </div>
        <div className="app-sheet-body">
          {user ? (
            <div className="app-user">
              <Avatar user={user} size={52} />
              <div className="app-user-txt">
                <div className="app-user-name">{user.name}</div>
                <div className="app-user-sub">{user.fomoId ? `#${user.fomoId}` : user.email}</div>
              </div>
            </div>
          ) : (
            <Link href={p("/login")} onClick={onClose} className="app-cta">
              <span>{t("nav.login")}</span>
              <AppIcon name="chevR" size={18} />
            </Link>
          )}
          {!TERMINAL && (
            <Link href={p("/help")} onClick={onClose} className="app-cta">
              <AppIcon name="help" size={22} />
              <span>{t("nav.help")}</span>
              <AppIcon name="chevR" size={18} />
            </Link>
          )}
          {user && (
            <div className="app-group">
              {nativeSettings && (
                <Row
                  icon="sliders"
                  onClick={() => {
                    onClose();
                    openNativeSettings();
                  }}
                >
                  {t("app.settings")}
                </Row>
              )}
              <Row icon="bell" href={p("/profile?tab=notifications")} onClick={onClose}>
                {t("profile.notifications")}
              </Row>
              <Row icon="user" href={p("/profile")} onClick={onClose}>
                {t("profile.profile")}
              </Row>
              {!TERMINAL && (
                <>
                  <Row icon="list" href={p("/profile?tab=ideas")} onClick={onClose}>
                    {t("profile.ideas")}
                  </Row>
                  <Row icon="card" href={p("/subscriptions")} onClick={onClose}>
                    {t("profile.subscriptions")}
                  </Row>
                  <Row icon="wallet" href={p("/payments")} onClick={onClose}>
                    {t("profile.finance")}
                  </Row>
                </>
              )}
            </div>
          )}
          <div className="app-group">
            <div className="app-fz">
              <div className="app-fz-title">{t("appui.fontSize")}</div>
              <div className="app-seg" role="group" aria-label={t("appui.fontSize")}>
                {APP_FONT_STEPS.map((s, i) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={fz === s}
                    aria-label={fzLabel[s]}
                    data-on={fz === s ? "1" : undefined}
                    onClick={() => {
                      setFz(s);
                      applyFontStep(s, true);
                    }}
                  >
                    <span style={{ fontSize: 12 + i * 2 }}>A</span>
                  </button>
                ))}
              </div>
            </div>
            <UpdateAppButton onNavigate={onClose} className="app-row" />
            {!TERMINAL && <DownloadAppsRow variant="app" onNavigate={onClose} />}
          </div>
          {!TERMINAL && user && (user.role === "ADMIN" || user.role === "OWNER") && (
            <div className="app-group">
              <Row icon="shield" href="/admin" onClick={onClose}>
                {t("profile.admin")}
              </Row>
            </div>
          )}
          {user && (
            <div className="app-group">
              <Row
                icon="logout"
                tone="danger"
                onClick={() => {
                  onClose();
                  void unregisterNativePush().finally(() => signOut({ callbackUrl: "/" }));
                }}
              >
                {t("profile.logout")}
              </Row>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Header() {
  const { data: session } = useSession();
  const { t, locale } = useT();
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const user = session?.user as SheetUser | undefined;
  useEffect(() => setOpen(false), [pathname]);

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
        <button type="button" className="app-profile-btn" aria-label={t("appui.profile")} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          {session ? <Avatar user={user} size={32} /> : <AppIcon name="user" size={22} />}
        </button>
      </div>
      {open && <ProfileSheet onClose={() => setOpen(false)} />}
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

/** Compact top header of the app UI (logo, theme, bell, profile sheet). Hidden on the terminal; renders nothing outside the app UI. */
export default function AppHeader() {
  const on = useAppUi();
  const pathname = usePathname() || "/";
  if (!on) return null;
  if (appHeaderHidden(pathname)) return <HiddenBell />;
  return <Header />;
}
