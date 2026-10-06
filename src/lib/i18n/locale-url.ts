// Edge-safe (used by middleware): no Node or Prisma imports here.
import { siteUrl } from "@/lib/site-mode";

/** Public origin of this site: https://fomo.spot unless NEXT_PUBLIC_SITE_URL / the terminal mode say otherwise (src/lib/site-mode.ts). */
export const SITE_URL = siteUrl();
export const LOCALES = ["ru", "en", "cn"] as const;
export type Locale = (typeof LOCALES)[number];

// Russian stays at the root so existing Yandex/Google rankings keep their URLs.
const URL_PREFIX: Record<Locale, string> = { ru: "", en: "en", cn: "zh" };
const PREFIX_TO_LOCALE: Record<string, Locale> = { en: "en", zh: "cn" };

export const HREFLANG: Record<Locale, string> = { ru: "ru", en: "en", cn: "zh-Hans" };
export const OG_LOCALE: Record<Locale, string> = { ru: "ru_RU", en: "en_US", cn: "zh_CN" };
export const HTML_LANG: Record<Locale, string> = { ru: "ru", en: "en", cn: "zh-CN" };

export function isLocale(v: string | undefined | null): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** "/en/feed" → { locale: "en", path: "/feed" }; unprefixed paths return locale null. */
export function stripLocale(pathname: string): { locale: Locale | null; path: string } {
  const m = pathname.match(/^\/(en|zh)(?=\/|$)(.*)$/);
  if (!m) return { locale: null, path: pathname || "/" };
  return { locale: PREFIX_TO_LOCALE[m[1]], path: m[2] || "/" };
}

/** ("en", "/feed") → "/en/feed"; ("ru", "/feed") → "/feed". */
export function localizedPath(locale: Locale, path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  const prefix = URL_PREFIX[locale];
  if (!prefix) return clean;
  return clean === "/" ? `/${prefix}` : `/${prefix}${clean}`;
}

/** canonical + hreflang alternates for Next.js Metadata, path without locale prefix. */
export function seoAlternates(locale: Locale, path: string) {
  const abs = (l: Locale) => `${SITE_URL}${localizedPath(l, path) === "/" ? "" : localizedPath(l, path)}`;
  return {
    canonical: abs(locale),
    languages: {
      [HREFLANG.ru]: abs("ru"),
      [HREFLANG.en]: abs("en"),
      [HREFLANG.cn]: abs("cn"),
      "x-default": abs("ru"),
    },
  };
}
