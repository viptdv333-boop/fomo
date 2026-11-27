"use client";

import { useEffect, useRef, useState } from "react";

const ARM_DISTANCE = 62;

/** Pull down at the top of a mobile admin page to reload its current data. */
export default function AdminPullToRefresh({ children }: { children: React.ReactNode }) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    if (!mobile.matches) return;

    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 1 || window.scrollY > 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, button, a, [data-no-pull-refresh]")) return;
      const touch = event.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      const origin = start.current;
      if (!origin || event.touches.length !== 1 || window.scrollY > 0) return;
      const touch = event.touches[0];
      const dx = touch.clientX - origin.x;
      const dy = touch.clientY - origin.y;
      if (Math.abs(dx) > Math.abs(dy) || dy <= 0) {
        start.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      if (dy > 4) event.preventDefault();
      pullRef.current = Math.min(ARM_DISTANCE + 14, dy * 0.55);
      setPull(pullRef.current);
    };

    const onEnd = () => {
      start.current = null;
      const shouldRefresh = pullRef.current >= ARM_DISTANCE;
      pullRef.current = 0;
      setPull(0);
      if (shouldRefresh) {
        setRefreshing(true);
        window.location.reload();
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <>
      {children}
      {(pull > 0 || refreshing) && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-lg"
          style={{ transform: `translate(-50%, ${Math.min(pull, ARM_DISTANCE + 14)}px)` }}
        >
          <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Обновление…" : pull >= ARM_DISTANCE ? "Отпустите для обновления" : "Потяните вниз для обновления"}
        </div>
      )}
    </>
  );
}
