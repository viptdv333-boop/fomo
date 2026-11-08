"use client";

import { useSyncExternalStore } from "react";

/**
 * Whether the terminal screen is showing its calendar right now (the terminal site has no calendar page: the calendar is a segment of the terminal
 * screen). The dock reads this to light its «Календарь» tab instead of «Список» (AppTabBar.tsx); AppTerminal.tsx publishes it.
 */
let on = false;
const subs = new Set<() => void>();

export function setTermCal(v: boolean): void {
  if (on === v) return;
  on = v;
  subs.forEach((f) => f());
}

export function useTermCal(): boolean {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    () => on,
    () => false,
  );
}
