"use client";

import { useEffect } from "react";
import { applyLite, watchPerformance } from "@/lib/lite-mode";

/** Puts the light-mode flag on <html> as soon as the page is alive (the stylesheet is lite.css) and lets the page switch it on by itself on a weak
 *  video card. Renders nothing. */
export default function LiteMode() {
  useEffect(() => {
    applyLite();
    const on = () => applyLite();
    window.addEventListener("storage", on);
    const stop = watchPerformance();
    return () => {
      window.removeEventListener("storage", on);
      stop();
    };
  }, []);
  return null;
}
