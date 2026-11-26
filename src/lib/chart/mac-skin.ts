"use client";

import { useEffect, useSyncExternalStore } from "react";

const WIDE = "(min-width: 900px) and (min-height: 480px) and (hover: hover) and (pointer: fine)";
const isWide = () => window.matchMedia(WIDE).matches;

function subscribe(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
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

/** Desktop chrome follows the available space and input device. */
export function useMacSkin(html = false) {
  const on = useSyncExternalStore(subscribe, isWide, () => false);
  useEffect(() => {
    if (!on || !html) return;
    document.documentElement.setAttribute("data-tvmac", "");
    ensureMacFont();
    return () => document.documentElement.removeAttribute("data-tvmac");
  }, [on, html]);
  return { on };
}

export function useAppMacSkin(on = true) {
  useEffect(() => {
    if (on) ensureMacFont();
  }, [on]);
  return { on };
}
