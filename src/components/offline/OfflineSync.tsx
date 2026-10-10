"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { installFetchGuard, setGuardTexts } from "@/lib/offline/fetch-guard";
import { startOnlineWatch } from "@/lib/offline/online";
import { isOfflineModeEnabled, swPost } from "@/lib/offline/sw-bridge";
import { TOAST_EVENT } from "@/lib/offline/toast";
import { stripLocale } from "@/lib/i18n/locale-url";

/** Build ids the service worker saw: the server runs another release than this bundle -> UpdateBanner re-checks at once. */
export const BUILD_CHANGED_EVENT = "fomo-build-changed";

/**
 * Root-level plumbing of the offline mode (renders only the toast): the fetch guard, the online watch, the worker's messages, the switch.
 * Sign-in screens have no SessionProvider, so on them it asks for the session once: the worker learns «no user» from that answer.
 */
export default function OfflineSync() {
  const { t } = useT();
  const pathname = usePathname() || "/";
  const [toast, setToast] = useState("");

  useEffect(() => {
    installFetchGuard();
    startOnlineWatch();
  }, []);

  useEffect(() => {
    setGuardTexts({ noNetwork: t("offline.noNetwork"), signOutPending: t("offline.signOutPending") });
  }, [t]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    swPost({ type: "fomo-config", enabled: isOfflineModeEnabled() });
    const onMsg = (e: MessageEvent) => {
      if (e.data && e.data.type === "fomo-build") window.dispatchEvent(new Event(BUILD_CHANGED_EVENT));
    };
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const p = stripLocale(pathname).path;
    if (/^\/(login|register|forgot-password)(\/|$)/.test(p)) void fetch("/api/auth/session", { cache: "no-store" }).catch(() => {});
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const h = (e: Event) => {
      setToast((e as CustomEvent<{ text: string }>).detail?.text || "");
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setToast(""), 3200);
    };
    window.addEventListener(TOAST_EVENT, h);
    return () => {
      window.removeEventListener(TOAST_EVENT, h);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!toast) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-app-lift
      className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[80] max-w-[90vw] rounded-full bg-gray-900/95 dark:bg-gray-100/95 px-4 py-2 text-sm font-medium text-white dark:text-gray-900 shadow-lg pointer-events-none"
    >
      {toast}
    </div>
  );
}
