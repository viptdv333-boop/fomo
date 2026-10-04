"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Toolbar dropdown: a trigger button and a fixed-position panel that closes on outside click / Escape. */
export default function MenuPopover({
  title,
  trigger,
  children,
  width = 220,
  className = "",
  align = "left",
  up = false,
  maxHeight,
  onOpenChange,
}: {
  title: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  className?: string;
  align?: "left" | "right";
  /** Open above the trigger (bottom bar). */
  up?: boolean;
  maxHeight?: number;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number }>({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) {
      const left = align === "right" ? r.right - width : r.left;
      const clamped = Math.max(4, Math.min(left, window.innerWidth - width - 4));
      setPos(up ? { bottom: window.innerHeight - r.top + 4, left: clamped } : { top: r.bottom + 4, left: clamped });
    }
    setOpen((o) => {
      onOpenChange?.(!o);
      return !o;
    });
  };
  const close = () => {
    setOpen(false);
    onOpenChange?.(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button ref={ref} onClick={toggle} title={title} aria-label={title} aria-expanded={open} className={className}>
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
          <div
            className="tv3-pop fixed z-[56] py-1.5 rounded-2xl text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] overflow-y-auto overflow-x-hidden"
            style={{ ...pos, width, maxHeight: maxHeight ?? Math.min(560, typeof window !== "undefined" ? window.innerHeight - 70 : 560) }}
          >
            {children(close)}
          </div>
        </>
      )}
    </>
  );
}
