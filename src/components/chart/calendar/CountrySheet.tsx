"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "../ModalPortal";
import { OPEN_GUARD_MS } from "./FloatingPanel";

/**
 * A bottom sheet for pickers on a phone: dim backdrop, a title row with the «Done» button, a body that scrolls on its own and a
 * footer. Unlike the anchored popover it is NOT closed by `resize` / `blur` / `visualViewport` events (the keyboard and the
 * collapsing address bar fire them all the time): only the backdrop tap, «Done» and Escape close it, and a backdrop tap right
 * after opening (the tail of the tap that opened it) is ignored.
 */
export default function CountrySheet({ title, onClose, header, footer, children }: { title: string; onClose: () => void; header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const { t } = useT();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const openedAt = useRef(0);

  useEffect(() => {
    openedAt.current = Date.now();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, []);

  return (
    <ModalPortal>
      <div
        data-country-sheet
        className="fixed inset-0 z-[85] flex items-end bg-black/45"
        onClick={(e) => {
          if (e.target === e.currentTarget && Date.now() - openedAt.current > OPEN_GUARD_MS) closeRef.current();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="relative flex max-h-[72dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-2xl"
        >
          <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
            <span aria-hidden className="absolute left-1/2 top-1.5 h-1 w-9 -translate-x-1/2 rounded-full bg-[var(--tv3-fill2)]" />
            <h2 className="min-w-0 flex-1 truncate text-[16px] font-semibold">{title}</h2>
            {!footer && (
              <button type="button" onClick={onClose} className="h-10 shrink-0 cursor-pointer rounded-[10px] px-3 text-[14px] font-semibold text-[var(--tv3-accent)] active:bg-[var(--tv3-fill)]">
                {t("ec.sheet.done")}
              </button>
            )}
          </div>
          {header && <div className="shrink-0 border-b border-[var(--tv3-hair2)] px-3 pb-2.5 pt-1">{header}</div>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="shrink-0 border-t border-[var(--tv3-hair2)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5">{footer}</div>}
          {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
        </div>
      </div>
    </ModalPortal>
  );
}
