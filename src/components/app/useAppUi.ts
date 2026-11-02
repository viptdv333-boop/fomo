"use client";

import { useSyncExternalStore } from "react";
import { isDesktopUi, isNativeUi } from "@/lib/native-app";
import { APP_TOPBAR_MIN_PX, appTopToolbar } from "@/lib/app-terminal";

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

const TOPBAR_MQ = `(min-width: ${APP_TOPBAR_MIN_PX}px)`;
const FINE_MQ = "(pointer: fine)";
const topbarSnapshot = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return appTopToolbar({ appUi: isNativeUi(), width: window.matchMedia(TOPBAR_MQ).matches ? APP_TOPBAR_MIN_PX : 0, finePointer: window.matchMedia(FINE_MQ).matches, desktopUi: isDesktopUi() });
};

/**
 * True when the app UI terminal shows the web terminal's top toolbar: a wide window with a mouse (see appTopToolbar). False on the server and
 * during hydration, then the real value (live: it follows a resize).
 */
export function useAppTopToolbar(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const list = [window.matchMedia(TOPBAR_MQ), window.matchMedia(FINE_MQ)];
      for (const mq of list) mq.addEventListener("change", cb);
      return () => {
        for (const mq of list) mq.removeEventListener("change", cb);
      };
    },
    topbarSnapshot,
    () => false,
  );
}

/** The window is wide enough for master-detail screens and multi-column lists (the same breakpoint as the CSS in app-desktop.css). */
export const DESKTOP_WIDE_PX = 900;
