"use client";

import { useEffect } from "react";
import { APP_UI_CLASS, appUiClassMissing, nativeBridge } from "@/lib/native-app";
import { raisesKeyboard } from "@/lib/app-ui";
import { warmFirewallActive } from "./tabhost/warm";

/**
 * Self-heal of the app UI's page invariants. The Android app opens a page from a notification / a link into a WebView that was in the background (the
 * document is the same one that was frozen there, or a new one that loads while the activity is still resuming); a few things can then be out of step
 * with what the app UI needs, and the owner's only remedy used to be a refresh. On mount and whenever the app comes back (visibilitychange, pageshow,
 * focus, a window resize) this:
 *   - puts `html.app-ui` back if the Android app's <html> lost it (everything of the app UI hangs on it: the dock, the compact header, the screens' skin);
 *   - drops a stale `html.app-kbd` (the dock is hidden while a field is focused; the WebView takes the focus away natively when the app is paused, without
 *     a focusout, and the dock stayed hidden);
 *   - takes the tab host's warm-up stub off <main>.scrollTo when no warm-up is running (a leftover would make every scroll-to-top / scroll-to-comment a no-op).
 * Renders nothing; does nothing in a browser or in the desktop app.
 */
export default function AppUiGuard() {
  useEffect(() => {
    const root = document.documentElement;
    const heal = () => {
      try {
        if (appUiClassMissing(root.classList.contains(APP_UI_CLASS), navigator.userAgent, nativeBridge() !== null)) root.classList.add(APP_UI_CLASS);
        if (!root.classList.contains(APP_UI_CLASS)) return;
        if (root.classList.contains("app-kbd") && !root.classList.contains("app-desktop") && !raisesKeyboard(document.activeElement as HTMLElement | null)) root.classList.remove("app-kbd");
        const main = document.querySelector("main") as { scrollTo?: unknown } | null;
        if (main && !warmFirewallActive() && Object.prototype.hasOwnProperty.call(main, "scrollTo")) delete main.scrollTo;
      } catch {
        /* a guard must never break the page */
      }
    };
    const onVis = () => {
      if (!document.hidden) heal();
    };
    heal();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pageshow", heal);
    window.addEventListener("focus", heal);
    window.addEventListener("resize", heal);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pageshow", heal);
      window.removeEventListener("focus", heal);
      window.removeEventListener("resize", heal);
    };
  }, []);
  return null;
}
