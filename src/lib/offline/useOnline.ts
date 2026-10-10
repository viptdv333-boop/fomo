"use client";

import { useSyncExternalStore } from "react";
import { isOnline, subscribeOnline } from "./online";

/** True while the network is there (see online.ts). Always true on the server and during hydration, so the markup matches. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}
