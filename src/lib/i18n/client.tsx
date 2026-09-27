"use client";

import { createContext, useContext, useEffect, useMemo, ReactNode } from "react";
import { isLocale, localizedPath, stripLocale } from "./locale-url";

/**
 * Changes the site language: cookie, the user's saved locale (notifications,
 * push and Telegram are written in it), and the /en · /zh URL of the page.
 */
export function switchLocale(code: string) {
  if (!isLocale(code)) return;
  document.cookie = `NEXT_LOCALE=${code};path=/;max-age=31536000;samesite=lax`;
  fetch("/api/me/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale: code }),
    keepalive: true,
  }).catch(() => {});
  const { path } = stripLocale(window.location.pathname);
  window.location.assign(localizedPath(code, path) + window.location.search + window.location.hash);
}

interface I18nContext {
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (code: string) => void;
}

const Ctx = createContext<I18nContext>({
  locale: "ru",
  t: (k) => k,
  setLocale: () => {},
});

// Only the current language's dictionary reaches the browser (passed from the
// root layout); shipping all three cost ~280 KB of JS on every page. Changing
// language reloads the page, so the dictionary never has to swap client-side.
export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: ReactNode;
  locale: string;
  messages: Record<string, string>;
}) {
  useEffect(() => {
    // Users who chose a language before it was stored on the account.
    try {
      if (sessionStorage.getItem("locale-synced") !== locale) {
        sessionStorage.setItem("locale-synced", locale);
        fetch("/api/me/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale }),
        }).catch(() => {});
      }
    } catch {}
  }, [locale]);

  const value = useMemo<I18nContext>(
    () => ({
      locale,
      t: (key, vars) => {
        let s = messages[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
      },
      setLocale: switchLocale,
    }),
    [locale, messages]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
