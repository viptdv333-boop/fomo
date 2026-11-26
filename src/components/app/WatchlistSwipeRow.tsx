"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import AppIcon from "./AppIcon";

/** Touch gestures belong to this row, not to the dock's page swipe or list reordering. */
export default function WatchlistSwipeRow({ rowKey, open, pinned, onOpen, onPin, onAdd, onRemove, onLongPress, children }: {
  rowKey: string; open: boolean; pinned: boolean; onOpen: (open: boolean) => void;
  onPin: () => void; onAdd: () => void; onRemove: () => void; onLongPress: () => void; children: ReactNode;
}) {
  const { t } = useT();
  const actions = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number; start: number; offset: number; axis: "x" | "y" | null } | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(0);
  const actionTouch = useRef<{ id: number; x: number; y: number } | null>(null);
  const actionClickUntil = useRef(0);
  const [offset, setOffset] = useState<number | null>(null);
  const clearHold = () => { if (hold.current) clearTimeout(hold.current); hold.current = null; };
  useEffect(() => () => { if (hold.current) clearTimeout(hold.current); }, []);
  const action = (fn: () => void) => { onOpen(false); fn(); };
  // Respond on touch release: WebViews can delay/suppress the compatibility click after a swipe.
  const actionEvents = (fn: () => void) => ({
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.pointerType !== "mouse") actionTouch.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    },
    onPointerCancel: () => { actionTouch.current = null; },
    onPointerUp: (e: PointerEvent<HTMLButtonElement>) => {
      const touch = actionTouch.current; actionTouch.current = null;
      if (!touch || touch.id !== e.pointerId || Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) return;
      e.preventDefault(); e.stopPropagation();
      actionClickUntil.current = Date.now() + 700;
      action(fn);
    },
    onClick: () => { if (Date.now() >= actionClickUntil.current) action(fn); },
  });

  return (
    <div className="app-wl-swipe" data-row-key={rowKey} data-no-swipe data-open={open || undefined}
      onPointerDownCapture={(e) => {
        if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("[data-swipe-action]")) return;
        e.stopPropagation();
        if (!e.isPrimary) { clearHold(); gesture.current = null; setOffset(null); return; }
        const width = actions.current?.offsetWidth ?? 234;
        const start = open ? -width : 0;
        gesture.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start, offset: start, axis: null };
        clearHold();
        hold.current = setTimeout(() => {
          if (!gesture.current || gesture.current.axis) return;
          gesture.current = null; setOffset(null); suppressClick.current = Date.now() + 700;
          onOpen(false); onLongPress();
        }, 650);
      }}
      onPointerMoveCapture={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 9) {
          clearHold();
          g.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
          if (g.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
        }
        if (g.axis !== "x") return;
        e.stopPropagation(); e.preventDefault();
        const width = actions.current?.offsetWidth ?? 234;
        g.offset = Math.max(-width, Math.min(0, g.start + dx));
        setOffset(g.offset);
        suppressClick.current = Date.now() + 700;
      }}
      onPointerUpCapture={(e) => {
        const g = gesture.current;
        if (!g || g.id !== e.pointerId) return;
        clearHold(); gesture.current = null; setOffset(null);
        if (g.axis === "x") {
          e.stopPropagation();
          const dx = g.offset - g.start;
          onOpen(open ? dx < 36 : dx < -36);
          suppressClick.current = Date.now() + 700;
        }
      }}
      onPointerCancelCapture={() => { clearHold(); gesture.current = null; setOffset(null); }}
      onContextMenu={(e) => { e.preventDefault(); clearHold(); onOpen(false); onLongPress(); }}
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-swipe-action]")) return;
        if (open || Date.now() < suppressClick.current) {
          e.preventDefault(); e.stopPropagation();
          if (open && Date.now() >= suppressClick.current) onOpen(false);
        }
      }}>
      <div className="app-wl-swipe-actions" ref={actions} data-no-drag inert={!open && offset === null}>
        <button type="button" data-swipe-action data-tone="pin" title={t(pinned ? "wl.unpin" : "wl.pin")} {...actionEvents(onPin)}>
          <AppIcon name="pin" size={20} /><span>{t(pinned ? "wl.unpin" : "wl.pinShort")}</span>
        </button>
        <button type="button" data-swipe-action data-tone="add" {...actionEvents(onAdd)}>
          <AppIcon name="plus" size={20} /><span>{t("wl.addTo")}</span>
        </button>
        <button type="button" data-swipe-action data-tone="remove" {...actionEvents(onRemove)}>
          <AppIcon name="trash" size={20} /><span>{t("wl.deleteShort")}</span>
        </button>
      </div>
      <div className="app-wl-swipe-front" style={offset === null ? undefined : { transform: `translateX(${offset}px)`, transition: "none" }}>
        {children}
        {pinned && <span className="app-wl-pin" aria-label={t("wl.pin")}><AppIcon name="pin" size={12} /></span>}
      </div>
    </div>
  );
}
