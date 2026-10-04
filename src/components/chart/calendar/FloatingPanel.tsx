"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import ModalPortal from "../ModalPortal";

export interface Anchor {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function anchorOf(el: Element): Anchor {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

const MARGIN = 8;

/**
 * A popover placed next to an anchor rectangle (below it, flipped above when there is no room, kept inside the viewport);
 * on a phone it becomes a bottom sheet. Closes on outside press and Escape. Rendered through ModalPortal so the chart
 * panel's overflow never clips it.
 */
export default function FloatingPanel({
  anchor,
  onClose,
  width = 280,
  children,
  label,
}: {
  anchor: Anchor;
  onClose: () => void;
  width?: number;
  children: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; sheet: boolean } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw < 640) {
      setPos({ left: 0, top: 0, sheet: true });
      return;
    }
    const w = Math.min(width, vw - MARGIN * 2);
    const h = el?.offsetHeight ?? 320;
    let left = anchor.left;
    if (left + w + MARGIN > vw) left = Math.max(MARGIN, anchor.right - w);
    if (left + w + MARGIN > vw) left = Math.max(MARGIN, vw - w - MARGIN);
    let top = anchor.bottom + 4;
    if (top + h + MARGIN > vh) {
      const above = anchor.top - h - 4;
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - h - MARGIN);
    }
    setPos({ left, top, sheet: false });
  }, [anchor, width]);

  useEffect(() => {
    const down = (e: Event) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const sheet = pos?.sheet ?? false;
  return (
    <ModalPortal>
      {sheet && <div className="fixed inset-0 z-[84] bg-black/40" aria-hidden="true" />}
      <div
        ref={ref}
        role="dialog"
        aria-label={label}
        style={sheet ? undefined : { position: "fixed", left: pos?.left ?? anchor.left, top: pos?.top ?? anchor.bottom, width: Math.min(width, 9999), visibility: pos ? "visible" : "hidden" }}
        className={
          sheet
            ? "fixed inset-x-0 bottom-0 z-[85] max-h-[80vh] overflow-y-auto rounded-t-2xl bg-[var(--tv3-card)] pb-[env(safe-area-inset-bottom)] text-[var(--tv3-text)] shadow-2xl"
            : "z-[85] max-h-[min(80vh,640px)] overflow-y-auto rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        }
      >
        {children}
      </div>
    </ModalPortal>
  );
}
