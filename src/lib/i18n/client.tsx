"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { DICTIONARIES, translate } from "./dictionaries";
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

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`${name}=(\\w+)`));
  return match ? match[1] : null;
}

export function I18nProvider({ children, initialLocale = "ru" }: { children: ReactNode; initialLocale?: string }) {
  const [locale, setLocaleState] = useState(DICTIONARIES[initialLocale] ? initialLocale : "ru");

  useEffect(() => {
    const saved = getCookie("NEXT_LOCALE");
    if (saved && DICTIONARIES[saved] && saved !== locale) setLocaleState(saved);
    // Users who chose a language before it was stored on the account.
    try {
      const current = saved && DICTIONARIES[saved] ? saved : locale;
      if (sessionStorage.getItem("locale-synced") !== current) {
        sessionStorage.setItem("locale-synced", current);
        fetch("/api/me/locale", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: current }),
        }).catch(() => {});
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function t(key: string, vars?: Record<string, string | number>): string {
    return translate(locale, key, vars);
  }

  function setLocale(code: string) {
    switchLocale(code);
    setLocaleState(code);
  }

  return <Ctx.Provider value={{ locale, t, setLocale }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
