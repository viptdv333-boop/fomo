"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { isTerminalSite } from "@/lib/site-mode";
import { backHrefFor, backLayerCount, backTarget, closeTopBackLayer, nextEntryIndex, planBack, withEntryIndex, type BackAction } from "@/lib/app-back";
import { useAppUi } from "./useAppUi";

/** Everything that can sit above a screen without registering itself (the site's dialogs, a lightbox, a menu backdrop). */
const OVERLAY = '[role="dialog"], [aria-modal="true"], .ac-sheet-wrap, .fixed.inset-0';
const BACKDROP = '.ac-sheet-back, [class*="inset-0"][class*="bg-"], .absolute.inset-0';
/** Overlays Back already tried to close and that stayed (a lock card, a dialog that ignores Escape): left alone, Back must never get stuck. */
const tried = new WeakMap<Element, number>();

function visible(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest("[data-app-tabbar], [data-back-ignore]")) return false;
  const cs = getComputedStyle(el);
  return cs.display !== "none" && cs.visibility !== "hidden" && el.getClientRects().length > 0;
}

/** The topmost open overlay of the page that Back may still close, or null. */
function findOpenOverlay(): HTMLElement | null {
  const all = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY)).filter((el) => visible(el) && (tried.get(el) ?? 0) < 2);
  return all.length ? all[all.length - 1] : null;
}

/** Close an overlay the way the user would: Escape (the dialogs of the site listen to it), then a click on its backdrop if it is still there. */
function closeOverlay(el: HTMLElement) {
  tried.set(el, (tried.get(el) ?? 0) + 1);
  try {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true }));
  } catch {
    /* old WebView */
  }
  window.setTimeout(() => {
    if (!el.isConnected) return;
    const back = el.matches(".fixed.inset-0") && !el.querySelector(BACKDROP) ? el : el.querySelector<HTMLElement>(BACKDROP);
    try {
      back?.click();
    } catch {
      /* nothing to click */
    }
  }, 90);
}

/**
 * Ledger of the entries the app pushed itself: history.state gets fomoBackIdx (0 = the first screen of a document, +1 per pushState,
 * kept on replaceState). Tells «there is an in-app screen behind this one» without trusting history.length. Installed once, never removed.
 */
function installLedger() {
  const w = window as unknown as { __fomoBackLedger?: boolean };
  if (w.__fomoBackLedger) return;
  w.__fomoBackLedger = true;
  const push = history.pushState;
  const replace = history.replaceState;
  history.pushState = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
    let s = state;
    try {
      s = withEntryIndex(state, nextEntryIndex("push", history.state, state)) ?? state;
    } catch {
      /* keep the original state */
    }
    return push.call(this, s, unused, url);
  };
  history.replaceState = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
    let s = state;
    try {
      s = withEntryIndex(state, nextEntryIndex("replace", history.state, state)) ?? state;
    } catch {
      /* keep the original state */
    }
    return replace.call(this, s, unused, url);
  };
}

type FomoBackFn = (() => boolean) & { plan?: () => BackAction };

/**
 * window.FomoBack(): the page's half of the Android «Назад» button (MainActivity.setupBack asks it first).
 * Returns true when it handled Back; false at the home screen (the app may minimise). Only exists while the app UI is on.
 * Rules and their order: src/lib/app-back.ts planBack. FomoBack.plan() names the action without doing it (debugging).
 */
function Handler() {
  const router = useRouter();
  const pathname = usePathname();
  const { locale } = useT();
  const live = useRef({ router, locale: locale as Locale });
  useEffect(() => {
    live.current = { router, locale: locale as Locale };
  });
  useEffect(() => installLedger(), []);
  // the previous step has not finished (a history.back() / replace is under way): a second press must not stack another one
  const busy = useRef(0);
  useEffect(() => {
    busy.current = 0;
  }, [pathname]);

  useEffect(() => {
    const terminal = isTerminalSite();
    const snapshot = () => {
      const overlay = backLayerCount("sheet") > 0 ? null : findOpenOverlay();
      const target = backTarget(window.location.pathname, window.location.search, terminal);
      const action = planBack({ layers: backLayerCount("sheet"), overlay: !!overlay, fullscreen: backLayerCount("screen") > 0, state: history.state, historyLength: history.length, target });
      return { overlay, target, action };
    };
    const hrefOf = (path: string) => backHrefFor(path, (stripLocale(window.location.pathname).locale ?? live.current.locale) as Locale, window.location.search);

    /** Replace the current entry with the screen one level up. The chat and the profile are query-driven screens of one page: the URL changes in place (as their own Back does), no round trip. */
    const goTo = (href: string) => {
      let samePage = false;
      try {
        samePage = new URL(href, window.location.href).pathname === window.location.pathname;
      } catch {
        /* unparsable: let the router decide */
      }
      if (samePage) window.history.replaceState({}, "", href);
      else live.current.router.replace(href);
    };

    const fn: FomoBackFn = () => {
      try {
        if (Date.now() < busy.current) return true;
        const { overlay, target, action } = snapshot();
        switch (action) {
          case "layer":
            return closeTopBackLayer("sheet");
          case "overlay":
            if (overlay) closeOverlay(overlay);
            return !!overlay;
          case "fullscreen":
            return closeTopBackLayer("screen");
          case "history": {
            const before = window.location.href;
            let popped = false;
            const onPop = () => {
              popped = true;
            };
            window.addEventListener("popstate", onPop, { once: true });
            busy.current = Date.now() + 450;
            history.back();
            // a ledger that outlived its entries (WebView.clearHistory keeps the state of the last entry): nothing popped, go up by address instead
            window.setTimeout(() => {
              window.removeEventListener("popstate", onPop);
              if (!popped && window.location.href === before && target) goTo(hrefOf(target.href));
            }, 400);
            return true;
          }
          case "parent":
          case "home":
            if (!target) return false;
            busy.current = Date.now() + 450;
            goTo(hrefOf(target.href));
            return true;
          default:
            return false;
        }
      } catch {
        return false;
      }
    };
    fn.plan = () => snapshot().action;
    const w = window as unknown as { FomoBack?: FomoBackFn };
    w.FomoBack = fn;
    return () => {
      if (w.FomoBack === fn) delete w.FomoBack;
    };
  }, []);

  return null;
}

/** Mounted once in the app layout: defines window.FomoBack while the app UI is on (Android app, desktop shell, ?appui=1 preview); nothing otherwise. */
export default function AppBackHandler() {
  const on = useAppUi();
  return on ? <Handler /> : null;
}
