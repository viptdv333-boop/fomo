"use client";

import { useEffect } from "react";

const UPDATE_EVERY_MS = 30 * 60 * 1000;

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // `next dev`: chunks have no content hash there, so a cache-first worker would keep serving old code after every edit. No worker in development
    // (and one left over from an earlier visit of this origin is removed).
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {});
      return;
    }
    let reg: ServiceWorkerRegistration | null = null;
    // A new release ships a new sw.js: the browser looks for it on navigations only, an installed app that stays open for days never navigates.
    // Ask on every return to the app and every half hour (the new worker skips waiting and claims the windows by itself, see sw.js).
    const checkForUpdate = () => {
      try {
        void reg?.update().catch(() => {});
      } catch {}
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    // Register after load so the SW install can't compete with initial paint.
    const onLoad = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((r) => {
          reg = r;
          timer = setInterval(checkForUpdate, UPDATE_EVERY_MS);
          document.addEventListener("visibilitychange", onVisible);
        })
        .catch(() => {
          /* ignore — SW is a progressive enhancement, not required for the app */
        });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => {
      window.removeEventListener("load", onLoad);
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) clearInterval(timer);
    };
  }, []);
  return null;
}
