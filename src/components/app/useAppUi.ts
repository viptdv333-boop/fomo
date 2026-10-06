"use client";

import { useSyncExternalStore } from "react";
import { isNativeUi } from "@/lib/native-app";

const subscribe = () => () => {};

/**
 * True when the app-only UI is on (Android app, or the ?appui=1 browser preview). False on the server and during hydration,
 * then the real value, so server HTML and the first client render always agree. In an ordinary browser it is always false.
 */
export function useAppUi(): boolean {
  return useSyncExternalStore(subscribe, isNativeUi, () => false);
}
