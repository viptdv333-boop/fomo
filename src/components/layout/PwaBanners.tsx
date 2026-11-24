"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { isAnyNativeShell } from "@/lib/native-app";
import { openIosSteps } from "@/lib/pwa-install";
import { DL_FILES, detectPlatform } from "@/lib/downloads";
import { isTerminalSite } from "@/lib/site-mode";
import PlatformIcon from "@/components/shared/PlatformIcons";

// WebAPKs minted before the manifest icon fix (2026-09-14) silently drop
// every push notification — the only cure is reinstalling the app. Installs
// completed through this component stamp pwa-installed-at, so anything
// standalone WITHOUT a stamp newer than the fix is a broken legacy install.
const REINSTALL_FIX_DATE = new Date("2026-09-14T12:00:00Z").getTime();
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export default function PwaBanners() {
  const { t } = useT();
  // a phone in a browser (not the app, not an installed PWA): which platform it is -> the banner «Установите приложение» with the choice
  const [phone, setPhone] = useState<"android" | "ios" | null>(null);
  // the cookie notice sits at the bottom too: the install card stands above it, not over it
  const [lift, setLift] = useState(0);
  useEffect(() => {
    if (!phone) return;
    const tick = () => {
      const el = document.querySelector("[data-cookie-banner]");
      setLift(el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    };
    tick();
    const iv = setInterval(tick, 600);
    return () => clearInterval(iv);
  }, [phone]);
  const [showReinstall, setShowReinstall] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    // the Android app (android/) and the Windows desktop app (desktop/) are not PWAs: no install prompt, no "reinstall the PWA" notice
    if (isAnyNativeShell()) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches;

    if (standalone) {
      const installedAt = Number(localStorage.getItem("pwa-installed-at") || 0);
      const dismissedAt = Number(localStorage.getItem("pwa-reinstall-dismissed") || 0);
      if (installedAt < REINSTALL_FIX_DATE && Date.now() - dismissedAt > DISMISS_MS) {
        setShowReinstall(true);
      }
      return;
    }

    // Android gets the APK, only the iPhone gets the PWA (home-screen steps): the browser's own «install the site» prompt is not offered
    const plat = detectPlatform({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints });
    const dismissedAt = Number(localStorage.getItem("pwa-install-dismissed") || 0);
    if ((plat === "android" || plat === "ios") && Date.now() - dismissedAt > DISMISS_MS) setPhone(plat);
    const onPrompt = (e: Event) => e.preventDefault();
    const onInstalled = () => {
      localStorage.setItem("pwa-installed-at", String(Date.now()));
      setPhone(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const declineInstall = () => {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setPhone(null);
  };

  const dismissReinstall = () => {
    localStorage.setItem("pwa-reinstall-dismissed", String(Date.now()));
    setShowReinstall(false);
  };

  if (phone) {
    const files = DL_FILES[isTerminalSite() ? "terminal" : "main"];
    const order: ("android" | "ios")[] = phone === "ios" ? ["ios", "android"] : ["android", "ios"];
    const tile = "flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold";
    return (
      // at the BOTTOM of the screen: the top of a phone page holds the theme / language switches, a bar there covered them
      <div
        data-app-hide
        role="dialog"
        aria-label={t("pwa.bannerTitle")}
        className="fixed inset-x-3 z-[60] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        style={{ bottom: `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${lift}px)` }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("pwa.bannerTitle")}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t("pwa.bannerPick")}</div>
          </div>
          <button type="button" onClick={declineInstall} aria-label={t("pwa.installNo")} className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="mt-2.5 flex gap-2">
          {order.map((p) =>
            p === "ios" ? (
              <button
                key={p}
                type="button"
                onClick={() => {
                  declineInstall();
                  openIosSteps();
                }}
                className={`${tile} border-gray-200 text-gray-800 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800`}
              >
                <PlatformIcon platform="ios" size={20} colored />
                iPhone
              </button>
            ) : (
              <a
                key={p}
                href={files.android.path}
                download={files.android.fileName}
                onClick={() => setTimeout(declineInstall, 300)}
                className={`${tile} border-green-600 bg-green-600 text-white hover:bg-green-700`}
              >
                <PlatformIcon platform="android" size={20} />
                Android
              </a>
            )
          )}
        </div>
      </div>
    );
  }

  if (showReinstall) {
    return (
      <div data-app-hide className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2.5 text-sm">
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <span className="text-gray-800 dark:text-gray-100 font-medium">{t("pwa.updateTitle")}</span>
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="px-4 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
          >
            {t("pwa.updateBtn")}
          </button>
          <button
            onClick={dismissReinstall}
            className="px-4 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {t("pwa.later")}
          </button>
        </div>
        {showSteps && (
          <ol className="mt-2 max-w-xl mx-auto list-decimal list-inside space-y-1 text-gray-700 dark:text-gray-300">
            <li>{t("pwa.updateStep1")}</li>
            <li>{t("pwa.updateStep2")}</li>
            <li>{t("pwa.updateStep3")}</li>
          </ol>
        )}
      </div>
    );
  }

  return null;
}
