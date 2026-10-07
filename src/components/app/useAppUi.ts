"use client";

import { useSyncExternalStore } from "react";
import { isDesktopUi, isNativeUi } from "@/lib/native-app";

const subscribe = () => () => {};

/**
 * True when the app-only UI is on (Android app, or the ?appui=1 browser preview). False on the server and during hydration,
 * then the real value, so server HTML and the first client render always agree. In an ordinary browser it is always false.
 */
export function useAppUi(): boolean {
  return useSyncExternalStore(subscribe, isNativeUi, () => false);
}

/**
 * True in the wide-window layout of the app UI (html.app-desktop: the Windows / macOS app, or the ?appui=1&appdesktop=1 preview).
 * False on the server and during hydration, like useAppUi.
 */
export function useAppDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopUi, () => false);
}

/** True while the window is at least `px` wide (matchMedia, live). False on the server and during hydration. */
export function useMinWidth(px: number): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(`(min-width: ${px}px)`);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(`(min-width: ${px}px)`).matches,
    () => false,
  );
}

/** The window is wide enough for master-detail screens and multi-column lists (the same breakpoint as the CSS in app-desktop.css). */
export const DESKTOP_WIDE_PX = 900;
