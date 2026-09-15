"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

// WebAPKs minted before the manifest icon fix (2026-09-14) silently drop
// every push notification — the only cure is reinstalling the app. Installs
// completed through this component stamp pwa-installed-at, so anything
// standalone WITHOUT a stamp newer than the fix is a broken legacy install.
const REINSTALL_FIX_DATE = new Date("2026-09-14T12:00:00Z").getTime();
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export default function PwaBanners() {
  const { t } = useT();
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showReinstall, setShowReinstall] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;

    if (standalone) {
      const installedAt = Number(localStorage.getItem("pwa-installed-at") || 0);
      const dismissedAt = Number(localStorage.getItem("pwa-reinstall-dismissed") || 0);
      if (installedAt < REINSTALL_FIX_DATE && Date.now() - dismissedAt > DISMISS_MS) {
        setShowReinstall(true);
      }
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      const dismissedAt = Number(localStorage.getItem("pwa-install-dismissed") || 0);
      if (Date.now() - dismissedAt > DISMISS_MS) setInstallPrompt(e);
    };
    const onInstalled = () => {
      localStorage.setItem("pwa-installed-at", String(Date.now()));
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
    } catch {}
  };

  const declineInstall = () => {
    localStorage.setItem("pwa-install-dismissed", String(Date.now()));
    setInstallPrompt(null);
  };

  const dismissReinstall = () => {
    localStorage.setItem("pwa-reinstall-dismissed", String(Date.now()));
    setShowReinstall(false);
  };

  if (installPrompt) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap text-sm">
        <span className="text-gray-800 dark:text-gray-100 font-medium">{t("pwa.installTitle")}</span>
        <button
          onClick={install}
          className="px-4 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold"
        >
          {t("pwa.installYes")}
        </button>
        <button
          onClick={declineInstall}
          className="px-4 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          {t("pwa.installNo")}
        </button>
      </div>
    );
  }

  if (showReinstall) {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-800 px-4 py-2.5 text-sm">
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
