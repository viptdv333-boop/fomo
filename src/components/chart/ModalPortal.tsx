"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./terminal-v3.css";

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
