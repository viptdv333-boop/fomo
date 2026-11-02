"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./terminal-v3.css";

/**
 * A menu / popover opened from the toolbar or from a window header: rendered at the top level of the page at once (no wait for an effect, so the
 * panel can be measured in the first layout effect) and so ABOVE every floating window - the windows live in their own stacking context under
 * the chart area, a menu inside a window would never get over the windows that are above that window. In fullscreen it goes into the fullscreen
 * element. Only for content that is rendered after a click (never on the server).
 */
export function PopupPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="tv3" style={{ display: "contents" }}>
      {children}
    </div>,
    document.fullscreenElement ?? document.body,
  );
}

/** Renders modal content at the top level of the page (above the site header, which the terminal container sits under);
    while the chart is fullscreen it goes into the fullscreen element so it stays visible. */
export default function ModalPortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    const pick = () => setHost(document.fullscreenElement ?? document.body);
    pick();
    document.addEventListener("fullscreenchange", pick);
    return () => document.removeEventListener("fullscreenchange", pick);
  }, []);
  // `tv3` + display:contents: portaled content gets the terminal design tokens without adding a layout box
  return host ? createPortal(<div className="tv3" style={{ display: "contents" }}>{children}</div>, host) : null;
}
