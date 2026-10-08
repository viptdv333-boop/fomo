"use client";

import { useEffect, useRef } from "react";
import { registerBackLayer, type BackLayerKind } from "@/lib/app-back";

/**
 * While `active`, the Android «Назад» button (window.FomoBack, see AppBackHandler) calls `close` instead of leaving the screen.
 * Use it in every sheet / dialog / menu / full-screen layer of the app UI that is not a history entry of its own.
 * `kind` "screen" is for a layer that is a screen of its own (the full-screen chart): closed after the sheets above it.
 */
export function useBackLayer(active: boolean, close: () => void, kind: BackLayerKind = "sheet") {
  const ref = useRef(close);
  useEffect(() => {
    ref.current = close;
  });
  useEffect(() => {
    if (!active) return;
    return registerBackLayer(() => ref.current(), kind);
  }, [active, kind]);
}
