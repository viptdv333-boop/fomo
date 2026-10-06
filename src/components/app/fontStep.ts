"use client";

import { APP_FONT_KEY, parseFontStep, type AppFontStep } from "@/lib/app-ui";

export function readFontStep(): AppFontStep {
  try {
    return parseFontStep(localStorage.getItem(APP_FONT_KEY));
  } catch {
    return "m";
  }
}

/** Sets data-app-fz on <html> (CSS multiplies the board text by --app-fz) and remembers the choice on this device. */
export function applyFontStep(step: AppFontStep, persist = false) {
  document.documentElement.dataset.appFz = step;
  if (persist) {
    try {
      localStorage.setItem(APP_FONT_KEY, step);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event("fomo-app-fz"));
  }
}
