"use client";

import { useLayoutEffect } from "react";
import { registerOwnBack } from "@/lib/app-back";

/**
 * Call it in a screen / bar that draws its own «Назад» control inside the app UI: while it is mounted the generic back button of the app header
 * (AppHeader) is not drawn, so there is never a second one. `active` false = no own control right now.
 * A layout effect: the header re-renders before the first paint, the generic button never flashes.
 */
export function useOwnBack(active: boolean = true): void {
  useLayoutEffect(() => {
    if (!active) return;
    return registerOwnBack();
  }, [active]);
}
