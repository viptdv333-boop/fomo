"use client";

import { switchLocale, useT } from "@/lib/i18n/client";
import { useAppUi } from "@/components/app/useAppUi";

const LANGS = [
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
  { code: "cn", name: "中文" },
];

/**
 * Language choice on the sign-in / sign-up screens of the app UI (the Android and Windows apps): a guest there has no header and no «Профиль» tab yet,
 * and the screens sit outside the app's own stylesheet, so it is three plain buttons. A pick does what the site's switcher does (switchLocale).
 * Renders nothing outside the app UI.
 */
export default function AuthLangSwitch() {
  const on = useAppUi();
  const { locale } = useT();
  if (!on) return null;
  return (
    <div className="flex justify-center gap-1 mb-3" role="group" aria-label="Language" data-auth-lang>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          aria-pressed={l.code === locale}
          onClick={() => l.code !== locale && switchLocale(l.code)}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
            l.code === locale
              ? "bg-green-600 text-white"
              : "bg-white text-gray-600 border border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-700"
          }`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}
