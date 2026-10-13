"use client";

import { useEffect, useState } from "react";
import { isLocale } from "@/lib/i18n/locale-url";
import { switchLocale, useT } from "@/lib/i18n/client";
import AppSheet from "./chat/AppSheet";

/** The three site languages under their own names: what the app shows before /api/languages answers (and when it cannot). */
export const APP_LANGS = [
  { code: "ru", name: "Русский" },
  { code: "en", name: "English" },
  { code: "cn", name: "中文" },
];

let cached: typeof APP_LANGS | null = null;

/** The languages the picker offers: the enabled ones of /api/languages (only codes the site knows), the three native names meanwhile. */
export function useAppLanguages() {
  const [langs, setLangs] = useState(cached ?? APP_LANGS);
  useEffect(() => {
    if (cached) return;
    let alive = true;
    fetch("/api/languages")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !Array.isArray(d)) return;
        const list = d.filter((l: { code?: string }) => isLocale(l?.code)).map((l: { code: string; name: string }) => ({ code: l.code, name: l.name }));
        if (list.length > 1) {
          cached = list;
          setLangs(list);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return langs;
}

/** Name of the current language for the «Язык» row. */
export function useLanguageName(): string {
  const { locale } = useT();
  const langs = useAppLanguages();
  return langs.find((l) => l.code === locale)?.name || APP_LANGS.find((l) => l.code === locale)?.name || locale;
}

/**
 * The «Язык / Language» bottom sheet: the three languages with a check at the current one. A pick does what the site's switcher does (switchLocale: the
 * NEXT_LOCALE cookie, the account's saved locale, the /en · /zh address of the page), which reloads the page in the new language: the dictionary of a language
 * is a separate script of the document head, and the screens the tab host keeps mounted are rebuilt with it. `to`: where a guest lands (the guest «Профиль» tab
 * is behind the sign-in on the server, so a reload of it would end on the login page).
 */
export function LanguageSheet({ onClose, to }: { onClose: () => void; to?: string }) {
  const { t, locale } = useT();
  const langs = useAppLanguages();
  return (
    <AppSheet
      title={t("appprof.language")}
      onClose={onClose}
      doneLabel={t("appui.chat.done")}
      sections={[
        {
          key: "lang",
          rows: langs.map((l) => ({
            key: l.code,
            label: l.name,
            check: l.code === locale,
            onClick: () => {
              if (l.code === locale) return onClose();
              switchLocale(l.code, to);
            },
          })),
        },
      ]}
    />
  );
}
