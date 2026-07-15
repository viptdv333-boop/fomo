"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // Register after load so the SW install can't compete with initial paint.
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* ignore — SW is a progressive enhancement, not required for the app */
      });
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
