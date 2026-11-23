"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";

interface Props {
  src: string;
  alt?: string;
  className?: string;
}

/// Click a thumbnail to see it full-size in a modal instead of relying on
/// browser page-zoom. Doesn't fight the copy-protection already applied to
/// idea text (this only ever renders <img>, no selectable text).
export default function ImageLightbox({ src, alt, className }: Props) {
  const [open, setOpen] = useState(false);
  const { t } = useT();
  /* zoom / pan of the opened picture: two fingers (pinch), one finger when zoomed, the wheel, a double tap; the phone app has no page zoom inside a modal */
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gest = useRef<{ d: number; k: number; x: number; y: number; cx: number; cy: number } | null>(null);
  const lastTap = useRef(0);
  const clampView = (k: number, x: number, y: number) => {
    const kk = Math.min(8, Math.max(1, k));
    if (kk === 1) return { k: 1, x: 0, y: 0 };
    const lim = (kk - 1) * 0.5;
    const w = typeof window !== "undefined" ? window.innerWidth : 400;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return { k: kk, x: Math.min(lim * w, Math.max(-lim * w, x)), y: Math.min(lim * h, Math.max(-lim * h, y)) };
  };
  const onDown = (e: React.PointerEvent) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const a = [...pts.current.values()];
    if (a.length === 2) gest.current = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), k: view.k, x: view.x, y: view.y, cx: (a[0].x + a[1].x) / 2, cy: (a[0].y + a[1].y) / 2 };
    else if (a.length === 1) gest.current = { d: 0, k: view.k, x: view.x, y: view.y, cx: a[0].x, cy: a[0].y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest.current;
    if (!g) return;
    const a = [...pts.current.values()];
    if (a.length >= 2 && g.d > 0) {
      const d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      const cx = (a[0].x + a[1].x) / 2;
      const cy = (a[0].y + a[1].y) / 2;
      setView(clampView(g.k * (d / g.d), g.x + (cx - g.cx), g.y + (cy - g.cy)));
    } else if (a.length === 1 && g.k > 1) {
      setView(clampView(g.k, g.x + (a[0].x - g.cx), g.y + (a[0].y - g.cy)));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const moved = gest.current ? Math.hypot(e.clientX - gest.current.cx, e.clientY - gest.current.cy) > 8 : false;
    pts.current.delete(e.pointerId);
    if (pts.current.size === 0) {
      if (!moved && gest.current && gest.current.d === 0) {
        const now = Date.now();
        if (now - lastTap.current < 320) setView((v) => (v.k > 1 ? { k: 1, x: 0, y: 0 } : clampView(2.5, 0, 0)));
        lastTap.current = now;
      }
      gest.current = null;
    } else {
      const a = [...pts.current.values()];
      gest.current = { d: 0, k: view.k, x: view.x, y: view.y, cx: a[0].x, cy: a[0].y };
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        className={`${className || ""} cursor-zoom-in`}
        onClick={() => {
          setView({ k: 1, x: 0, y: 0 });
          setOpen(true);
        }}
      />

      {open && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 bg-black/90 z-[1000] flex items-center justify-center p-4 cursor-zoom-out"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
        >
          {/* the cross sits ON the picture (its top-right corner), not at the edge of the screen */}
          <div
            className="relative inline-flex max-h-full max-w-full touch-none"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onWheel={(e) => setView((v) => clampView(v.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15), v.x, v.y))}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, transition: gest.current ? "none" : "transform .15s" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt || ""}
              className="max-h-[calc(100vh-2rem)] max-w-full object-contain select-none cursor-default"
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-red-600 text-white shadow-lg hover:bg-red-700"
            aria-label={t("common.close")}
            title={t("common.close")}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
