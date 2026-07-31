"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "fomo-cookie-consent";

/**
 * Informational cookie notice, not a consent gate.
 *
 * GA4 and Yandex.Metrika load unconditionally on every page — this banner
 * discloses that rather than blocking it behind an "Accept" click, which is
 * the common and accepted pattern on Russian sites under 152-FZ. A hard gate
 * (nothing loads until consent) is closer to GDPR practice but throws away
 * the first-visit analytics signal for every new user; if the requirement
 * changes, this component's "onAccept" is exactly where a gate would hook in.
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // Storage unavailable (private mode, blocked) — don't nag on every load.
    }
  }, []);

  function accept() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore — the banner just reappears next visit, not a big deal.
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="pointer-events-auto max-w-3xl mx-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-[13px] text-gray-600 dark:text-gray-400 flex-1">
          Сайт использует файлы cookie для входа в аккаунт и анализа посещаемости. Продолжая
          пользоваться FOMO, вы соглашаетесь с{" "}
          <Link href="/privacy" className="text-green-600 hover:underline">
            Политикой обработки персональных данных
          </Link>
          .
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-4 py-2 rounded-lg bg-green-600 text-white text-[13px] font-medium hover:bg-green-700 transition"
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
