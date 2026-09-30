"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  return host ? createPortal(children, host) : null;
}
