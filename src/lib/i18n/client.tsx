"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { DICTIONARIES } from "./dictionaries";

interface I18nContext {
  locale: string;
  t: (key: string) => string;
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

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState("ru");

  useEffect(() => {
    const saved = getCookie("NEXT_LOCALE");
    if (saved && DICTIONARIES[saved]) setLocaleState(saved);
  }, []);

  function t(key: string): string {
    const dict = DICTIONARIES[locale] || DICTIONARIES.ru;
    return dict[key] || DICTIONARIES.ru[key] || key;
  }

  function setLocale(code: string) {
    document.cookie = `NEXT_LOCALE=${code};path=/;max-age=31536000`;
    setLocaleState(code);
  }

  return <Ctx.Provider value={{ locale, t, setLocale }}>{children}</Ctx.Provider>;
}

export function useT() {
  return useContext(Ctx);
}
