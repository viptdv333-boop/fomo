"use client";

/* Drag-and-drop reordering of a vertical list with the MOUSE and with TOUCH (the HTML5 drag API does not exist on touch screens).
   The list container is the scroll box; every row carries `data-row-key`. A mouse drag starts after a few pixels of movement, a touch drag after a
   short press (so the list still scrolls with a finger). The rows move with CSS transforms while dragging (no re-render per move); `onReorder(from, to)`
   is called once on drop. Elements with `data-no-drag` (buttons inside a row) never start a drag. */
import { useEffect, useRef, type RefObject } from "react";

const MOUSE_SLOP = 5;
const TOUCH_SLOP = 9;
const TOUCH_HOLD_MS = 280;

interface Drag {
  key: string;
  from: number;
  to: number;
  pid: number;
  touchId: number | null;
  touch: boolean;
  active: boolean;
  startX: number;
  startY: number;
  startScroll: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
  rows: HTMLElement[];
  h: number;
  raf: number;
}

export function useRowReorder(ref: RefObject<HTMLElement | null>, enabled: boolean, onReorder: (from: number, to: number) => void, rebind?: unknown, onLongPress?: (rowKey: string) => void, allowReorder = true) {
  const cb = useRef(onReorder);
  cb.current = onReorder;
  const longPressCb = useRef(onLongPress);
  longPressCb.current = onLongPress;

  useEffect(() => {
    const box = ref.current;
    if (!box || !enabled) return;
    let d: Drag | null = null;
    let swallowClick = false;
    let swallowContextMenu = false;

    const rowsOf = () => Array.from(box.querySelectorAll<HTMLElement>("[data-row-key]"));

    const place = () => {
      if (!d || !d.active) return;
      const dy = d.y - d.startY + (box.scrollTop - d.startScroll);
      const dragged = d.rows[d.from];
      dragged.style.transform = `translateY(${dy}px)`;
      // the slot under the middle of the dragged row
      const mid = dragged.offsetTop + dragged.offsetHeight / 2 + dy;
      let to = d.from;
      d.rows.forEach((r, i) => {
        if (i === d!.from) return;
        const rm = r.offsetTop + r.offsetHeight / 2;
        if (i > d!.from && mid > rm) to = Math.max(to, i);
        if (i < d!.from && mid < rm) to = Math.min(to, i);
      });
      d.to = to;
      d.rows.forEach((r, i) => {
        if (i === d!.from) return;
        let shift = 0;
        if (d!.from < to && i > d!.from && i <= to) shift = -d!.h;
        if (d!.from > to && i < d!.from && i >= to) shift = d!.h;
        r.style.transform = shift ? `translateY(${shift}px)` : "";
      });
    };

    const autoScroll = () => {
      if (!d || !d.active) return;
      const r = box.getBoundingClientRect();
      const edge = 36;
      let v = 0;
      if (d.y < r.top + edge) v = -Math.min(14, (r.top + edge - d.y) / 3 + 2);
      else if (d.y > r.bottom - edge) v = Math.min(14, (d.y - (r.bottom - edge)) / 3 + 2);
      if (v) {
        box.scrollTop += v;
        place();
      }
      d.raf = requestAnimationFrame(autoScroll);
    };

    const activate = () => {
      if (!d || d.active) return;
      if (d.timer) clearTimeout(d.timer);
      d.timer = null;
      d.active = true;
      d.rows = rowsOf();
      d.from = d.rows.findIndex((r) => r.dataset.rowKey === d!.key);
      if (d.from < 0) {
        cleanup();
        return;
      }
      d.to = d.from;
      d.h = d.rows[d.from].offsetHeight;
      d.startScroll = box.scrollTop;
      d.rows.forEach((r, i) => {
        r.style.transition = i === d!.from ? "none" : "transform 140ms ease";
        r.style.willChange = "transform";
      });
      const el = d.rows[d.from];
      el.style.position = "relative";
      el.style.zIndex = "5";
      el.style.boxShadow = "0 8px 24px rgba(0,0,0,.22)";
      el.style.borderRadius = "12px";
      el.style.background = "var(--tv3-card)";
      el.style.opacity = "0.97";
      el.style.cursor = "grabbing";
      if (d.pid >= 0) {
        try { box.setPointerCapture(d.pid); } catch {}
      }
      if (d.touch && navigator.vibrate) navigator.vibrate(12);
      d.raf = requestAnimationFrame(autoScroll);
      place();
    };

    const cleanup = () => {
      if (!d) return;
      if (d.timer) clearTimeout(d.timer);
      cancelAnimationFrame(d.raf);
      for (const r of d.rows.length ? d.rows : rowsOf()) {
        r.style.transform = "";
        r.style.transition = "";
        r.style.willChange = "";
        r.style.position = "";
        r.style.zIndex = "";
        r.style.boxShadow = "";
        r.style.borderRadius = "";
        r.style.background = "";
        r.style.opacity = "";
        r.style.cursor = "";
      }
      if (d.pid >= 0) {
        try { box.releasePointerCapture(d.pid); } catch {}
      }
      d = null;
    };

    const down = (e: PointerEvent) => {
      // Touch is handled through Touch Events below. Unlike Pointer Events, a cancelable touchmove
      // can be prevented after a long-press, allowing the row to become draggable while preserving
      // ordinary vertical scrolling when the finger moves before the hold threshold.
      if (e.pointerType !== "mouse") return;
      if (d || (e.pointerType === "mouse" && e.button !== 0)) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.closest("[data-no-drag]")) return;
      const row = t.closest<HTMLElement>("[data-row-key]");
      if (!row || !box.contains(row)) return;
      d = { key: row.dataset.rowKey!, from: -1, to: -1, pid: e.pointerId, touchId: null, touch: false, active: false, startX: e.clientX, startY: e.clientY, startScroll: box.scrollTop, y: e.clientY, timer: null, rows: [], h: 0, raf: 0 };
    };

    const move = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.pid) return;
      d.y = e.clientY;
      if (!d.active) {
        const dy = e.clientY - d.startY;
        if (Math.abs(dy) > MOUSE_SLOP) {
          activate();
        }
        return;
      }
      e.preventDefault();
      place();
    };

    const up = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.pid) return;
      const was = d.active;
      const { from, to } = d;
      cleanup();
      if (was) {
        swallowClick = true;
        setTimeout(() => (swallowClick = false), 0);
        if (from !== to && from >= 0) cb.current(from, to);
      }
    };

    const cancel = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.pid) return;
      cleanup();
    };

    const touchStart = (e: TouchEvent) => {
      if (d || e.touches.length !== 1) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.closest("[data-no-drag]")) return;
      const row = t.closest<HTMLElement>("[data-row-key]");
      const touch = e.changedTouches[0];
      if (!row || !touch || !box.contains(row)) return;
      d = { key: row.dataset.rowKey!, from: -1, to: -1, pid: -1, touchId: touch.identifier, touch: true, active: false, startX: touch.clientX, startY: touch.clientY, startScroll: box.scrollTop, y: touch.clientY, timer: null, rows: [], h: 0, raf: 0 };
      // The grip is explicitly marked touch-action:none and can start immediately. Anywhere else,
      // wait briefly so normal finger scrolling remains natural; after the hold, movement reorders.
      if (t.closest("[data-drag-handle]")) activate();
      else d.timer = setTimeout(() => {
        if (!d || d.active) return;
        if (allowReorder) {
          activate();
          return;
        }
        const key = d.key;
        cleanup();
        swallowClick = true;
        swallowContextMenu = true;
        setTimeout(() => { swallowClick = false; swallowContextMenu = false; }, 1000);
        longPressCb.current?.(key);
      }, TOUCH_HOLD_MS);
    };
    const touchMove = (e: TouchEvent) => {
      if (!d?.touch || d.touchId === null) return;
      const touch = Array.from(e.touches).find((t) => t.identifier === d!.touchId);
      if (!touch) return;
      d.y = touch.clientY;
      if (!d.active) {
        const dx = touch.clientX - d.startX;
        const dy = touch.clientY - d.startY;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > TOUCH_SLOP) cleanup();
        return;
      }
      if (e.cancelable) e.preventDefault();
      place();
    };
    const touchEnd = (e: TouchEvent) => {
      if (!d?.touch || d.touchId === null || !Array.from(e.changedTouches).some((t) => t.identifier === d!.touchId)) return;
      const was = d.active;
      const { from, to } = d;
      cleanup();
      if (was) {
        swallowClick = true;
        setTimeout(() => (swallowClick = false), 0);
        if (from !== to && from >= 0) cb.current(from, to);
      }
    };
    const touchCancel = (e: TouchEvent) => {
      if (d?.touch && d.touchId !== null && Array.from(e.changedTouches).some((t) => t.identifier === d!.touchId)) cleanup();
    };

    const click = (e: MouseEvent) => {
      if (swallowClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const ctx = (e: Event) => {
      if ((d && d.touch) || swallowContextMenu) {
        e.preventDefault(); // use the app's row menu, not the browser menu
      }
    };

    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", cancel);
    box.addEventListener("touchstart", touchStart, { passive: true });
    box.addEventListener("touchmove", touchMove, { passive: false });
    box.addEventListener("touchend", touchEnd);
    box.addEventListener("touchcancel", touchCancel);
    box.addEventListener("click", click, true);
    box.addEventListener("contextmenu", ctx);
    return () => {
      cleanup();
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", cancel);
      box.removeEventListener("touchstart", touchStart);
      box.removeEventListener("touchmove", touchMove);
      box.removeEventListener("touchend", touchEnd);
      box.removeEventListener("touchcancel", touchCancel);
      box.removeEventListener("click", click, true);
      box.removeEventListener("contextmenu", ctx);
    };
  }, [ref, enabled, rebind, allowReorder]);
}
