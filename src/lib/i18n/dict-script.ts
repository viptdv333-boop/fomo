// The dictionary of the current language as a static, long-cached script (/i18n/<locale>-<hash>.js) instead of a prop that Next serialises into the
// HTML of every page (~280 KB of the ~680 KB document). The script sets self.__FOMO_I18N[locale]; I18nProvider reads it before hydration.
// Server only. The route is src/app/i18n/[file]/route.ts; the service worker keeps /i18n/ cache-first (public/sw-cache-rules.js).
import { createHash } from "crypto";
import { DICTIONARIES } from "./dictionaries";

interface Built {
  body: string;
  hash: string;
}
const built = new Map<string, Built>();

function build(locale: string): Built | null {
  const dict = DICTIONARIES[locale];
  if (!dict) return null;
  let b = built.get(locale);
  if (!b) {
    // JSON.parse of a string literal parses about twice as fast as the same data as an object literal
    const body = `self.__FOMO_I18N=self.__FOMO_I18N||{};self.__FOMO_I18N[${JSON.stringify(locale)}]=JSON.parse(${JSON.stringify(JSON.stringify(dict))});`;
    b = { body, hash: createHash("sha1").update(body).digest("hex").slice(0, 10) };
    built.set(locale, b);
  }
  return b;
}

/** Address of the script of a language; changes with the content, so it can be cached for a year. */
export function dictScriptUrl(locale: string): string {
  const b = build(locale);
  return b ? `/i18n/${locale}-${b.hash}.js` : `/i18n/${locale}.js`;
}

/** { body, hash } for a requested file name ("ru-1a2b3c4d5e.js" / "ru.js"), or null. */
export function dictScriptFor(file: string): { body: string; hash: string } | null {
  const m = /^(ru|en|cn)(?:-[a-f0-9]{6,16})?\.js$/.exec(file);
  return m ? build(m[1]) : null;
}
