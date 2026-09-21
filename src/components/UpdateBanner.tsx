"use client";

import { useEffect, useState } from "react";
import { forceUpdate } from "@/lib/force-update";

const CHECK_EVERY_MS = 5 * 60 * 1000;

// Tells an already-open app (typically an installed PWA that is never fully
// closed) that a newer release is live, and updates it in one tap.
export default function UpdateBanner() {
  const [outdated, setOutdated] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const mine = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!mine || mine === "dev") return;

    let stopped = false;
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = await res.json();
        if (!stopped && id && id !== mine) setOutdated(true);
      } catch {
        // Offline or server restarting — try again next time.
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!outdated) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[60] bg-white dark:bg-gray-900 border border-green-600 rounded-xl shadow-lg p-3 flex items-center gap-3">
      <span className="text-sm text-gray-800 dark:text-gray-100 flex-1">Вышла новая версия FOMO</span>
      <button
        onClick={() => {
          setBusy(true);
          forceUpdate();
        }}
        disabled={busy}
        className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-60"
      >
        {busy ? "…" : "Обновить"}
      </button>
    </div>
  );
}
