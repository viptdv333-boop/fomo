"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
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

// Only the current language's dictionary reaches the browser, and not inside the HTML: the root layout puts a <script src="/i18n/<locale>-<hash>.js">
// (long-cached, kept by the service worker) in <head>, which sets self.__FOMO_I18N[locale] before React hydrates. On the server the dictionary is read
// straight from the module (the require below is cut out of the browser bundle: `typeof window` is a constant there). The `messages` prop is only a
// fallback for callers that pass the dictionary themselves. Changing language reloads the page, so the dictionary never has to swap client-side.
type Messages = Record<string, string>;
function readDict(locale: string, fallback?: Messages): Messages | null {
  if (typeof window === "undefined") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const all = require("./dictionaries").DICTIONARIES as Record<string, Messages>;
    return fallback ?? all[locale] ?? null;
  }
  const g = (window as unknown as { __FOMO_I18N?: Record<string, Messages> }).__FOMO_I18N;
  return g?.[locale] ?? fallback ?? null;
}

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: ReactNode;
  locale: string;
  messages?: Messages;
}) {
  const [dict, setDict] = useState<Messages | null>(() => readDict(locale, messages));

  useEffect(() => {
    // the script did not load (blocked, a failed request): fetch it once more, the texts appear when it arrives
    if (dict) return;
    const el = document.createElement("script");
    el.src = `/i18n/${locale}.js`;
    el.onload = () => setDict(readDict(locale, messages));
    document.head.appendChild(el);
    return () => el.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dict, locale]);

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
        let s = dict?.[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
        return s;
      },
      setLocale: switchLocale,
    }),
    [locale, dict]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
