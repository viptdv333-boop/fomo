"use client";

/* Optional "macOS" look of the desktop terminal (design "FOMO Terminal macOS v2"). The classic look stays the default; the choice is a per-device
   switch kept in localStorage. It is a skin only: the same components run, `html[data-tvmac]` + `.tvmac` (terminal-mac.css) restyle them.
   The skin needs room (menu bar + window + labelled toolbar), so it is active only on a wide, tall, fine-pointer window. */
import { useEffect, useSyncExternalStore } from "react";

export const MAC_SKIN_KEY = "fomo-terminal-skin-v1";
const EVENT = "fomo-mac-skin";
/** the design is laid out for 1100x680; it still holds down to a small window (compact rules in terminal-mac.css) */
const WIDE = "(min-width: 900px) and (min-height: 480px) and (hover: hover) and (pointer: fine)";

function stored(): boolean {
  try {
    return localStorage.getItem(MAC_SKIN_KEY) === "mac";
  } catch {
    return false;
  }
}

function storedApp(): boolean {
  try {
    return localStorage.getItem(MAC_SKIN_KEY) !== "classic";
  } catch {
    return true;
  }
}

/** Chosen by the user (any window size). */
export function setMacSkin(on: boolean): void {
  try {
    // an explicit "classic" matters on the phone, where the new look is the default
    localStorage.setItem(MAC_SKIN_KEY, on ? "mac" : "classic");
  } catch {
    /* storage unavailable: the choice lasts until reload */
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  const mq = window.matchMedia(WIDE);
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  mq.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    mq.removeEventListener("change", cb);
  };
}

/** The typeface of the design (Golos Text), loaded once, only while a look that uses it is on. */
export function ensureMacFont(): void {
  if (document.getElementById("tvmac-font")) return;
  const link = document.createElement("link");
  link.id = "tvmac-font";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700;800&display=swap";
  document.head.appendChild(link);
}

/** `html`: this caller mirrors the switch on <html> (only the terminal page does, never the chart panes or the app screen). */
export function useMacSkin(html = false): { on: boolean; canOffer: boolean; chosen: boolean; set: (v: boolean) => void } {
  const chosen = useSyncExternalStore(subscribe, stored, () => false);
  const canOffer = useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
  const on = chosen && canOffer;
  // the page background (wallpaper) and the site header are outside the terminal root, so the switch is mirrored on <html>
  useEffect(() => {
    if (!on || !html) return;
    document.documentElement.setAttribute("data-tvmac", "");
    // the typeface of the design, loaded only while the skin is on
    ensureMacFont();
    return () => document.documentElement.removeAttribute("data-tvmac");
  }, [on, html]);
  return { on, canOffer, chosen, set: setMacSkin };
}

/**
 * The phone version of the look (app UI terminal screen, design "FOMO Terminal Mobile"): the same per-device switch, but not tied to a wide window.
 * `allowed` = the screen can wear it (a phone-style layout); the desktop skin above is untouched.
 */
export function useAppMacSkin(allowed = true): { on: boolean; chosen: boolean; set: (v: boolean) => void } {
  // on the phone the new look is the DEFAULT: it is off only after the user picked the classic look ("Прежний вид")
  const chosen = useSyncExternalStore(subscribe, storedApp, () => true);
  const on = chosen && allowed;
  useEffect(() => {
    if (on) ensureMacFont();
  }, [on]);
  return { on, chosen, set: setMacSkin };
}
