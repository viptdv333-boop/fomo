"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "../ModalPortal";
import CalendarView from "./CalendarView";

/** The economic calendar tab of the right panel, with the "expand" button that opens the wide table in a dialog. */
export default function CalendarPanel({ zone, visible }: { zone: string; visible: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="min-h-0 flex-1">
        <CalendarView variant="panel" zone={zone} visible={visible && !open} onExpand={() => setOpen(true)} />
      </div>
      {open && <CalendarDialog zone={zone} onClose={() => setOpen(false)} />}
    </>
  );
}

export function CalendarDialog({ zone, onClose }: { zone: string; onClose: () => void }) {
  const { t } = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(); // popovers inside stop the event first
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const [shown, setShown] = useState(false);
  useEffect(() => setShown(true), []);
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("ec.title")}
          className="flex h-full w-full flex-col overflow-hidden bg-white text-gray-900 shadow-2xl dark:bg-[#1e222d] dark:text-gray-100 sm:h-[min(88vh,860px)] sm:max-w-[1180px] sm:rounded-xl sm:border sm:border-gray-200 sm:dark:border-[#2a2e39]"
        >
          {shown && <CalendarView variant="wide" zone={zone} visible onClose={onClose} />}
        </div>
      </div>
    </ModalPortal>
  );
}
