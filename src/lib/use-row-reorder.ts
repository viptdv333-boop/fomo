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
  touch: boolean;
  active: boolean;
  startY: number;
  startScroll: number;
  y: number;
  timer: ReturnType<typeof setTimeout> | null;
  rows: HTMLElement[];
  h: number;
  raf: number;
}

export function useRowReorder(ref: RefObject<HTMLElement | null>, enabled: boolean, onReorder: (from: number, to: number) => void, rebind?: unknown) {
  const cb = useRef(onReorder);
  cb.current = onReorder;

  useEffect(() => {
    const box = ref.current;
    if (!box || !enabled) return;
    let d: Drag | null = null;
    let swallowClick = false;

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
      try {
        box.setPointerCapture(d.pid);
      } catch {}
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
      try {
        box.releasePointerCapture(d.pid);
      } catch {}
      d = null;
    };

    const down = (e: PointerEvent) => {
      if (d || (e.pointerType === "mouse" && e.button !== 0)) return;
      const t = e.target as HTMLElement | null;
      if (!t || t.closest("[data-no-drag]")) return;
      const row = t.closest<HTMLElement>("[data-row-key]");
      if (!row || !box.contains(row)) return;
      const touch = e.pointerType !== "mouse";
      d = { key: row.dataset.rowKey!, from: -1, to: -1, pid: e.pointerId, touch, active: false, startY: e.clientY, startScroll: box.scrollTop, y: e.clientY, timer: null, rows: [], h: 0, raf: 0 };
      if (touch) d.timer = setTimeout(activate, TOUCH_HOLD_MS);
    };

    const move = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.pid) return;
      d.y = e.clientY;
      if (!d.active) {
        const slop = d.touch ? TOUCH_SLOP : MOUSE_SLOP;
        if (Math.abs(e.clientY - d.startY) > slop) {
          if (d.touch) cleanup(); // a finger that moved before the hold: it is a scroll
          else activate();
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

    // a finger that is dragging a row must not scroll the page / the list
    const touchMove = (e: TouchEvent) => {
      if (d && d.active && e.cancelable) e.preventDefault();
    };
    const click = (e: MouseEvent) => {
      if (swallowClick) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    const ctx = (e: Event) => {
      if (d && d.touch) e.preventDefault(); // the long press must not open the context menu
    };

    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", cancel);
    box.addEventListener("touchmove", touchMove, { passive: false });
    box.addEventListener("click", click, true);
    box.addEventListener("contextmenu", ctx);
    return () => {
      cleanup();
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", cancel);
      box.removeEventListener("touchmove", touchMove);
      box.removeEventListener("click", click, true);
      box.removeEventListener("contextmenu", ctx);
    };
  }, [ref, enabled, rebind]);
}
