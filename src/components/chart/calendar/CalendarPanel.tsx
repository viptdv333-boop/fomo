"use client";

import { useLayoutEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "../ModalPortal";
import CalendarView from "./CalendarView";
import WorldCalendar from "./WorldCalendar";

/** The economic calendar tab of the right panel; "expand" opens the whole-page calendar over the terminal. */
export default function CalendarPanel({ zone, visible }: { zone: string; visible: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="min-h-0 flex-1">
        <CalendarView variant="panel" zone={zone} visible={visible && !open} onExpand={() => setOpen(true)} />
      </div>
      {open && <CalendarLayer zone={zone} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A fixed layer from the bottom of the site header to the bottom of the viewport, edge to edge (the same rule as the terminal). */
export function CalendarLayer({ zone, onClose }: { zone: string; onClose: () => void }) {
  const { t } = useT();
  const [top, setTop] = useState(56);
  useLayoutEffect(() => {
    const main = document.querySelector("main");
    const measure = () => setTop(Math.max(0, Math.round(main?.getBoundingClientRect().top ?? 0)));
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return (
    <ModalPortal>
      <div role="dialog" aria-label={t("ec.title")} className="fixed inset-x-0 bottom-0 z-[70] bg-[var(--tv3-card)]" style={{ top }}>
        <WorldCalendar zone={zone} mode="layer" onClose={onClose} />
      </div>
    </ModalPortal>
  );
}
