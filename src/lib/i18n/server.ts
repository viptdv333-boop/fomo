import { cookies, headers } from "next/headers";
import { translate } from "./dictionaries";
import { isLocale, seoAlternates, type Locale } from "./locale-url";

// The URL prefix (/en, /zh — passed by middleware as x-locale) wins over the
// cookie, so crawlers without cookies still get the language of the URL.
export async function getLocale(): Promise<Locale> {
  const fromUrl = (await headers()).get("x-locale");
  if (isLocale(fromUrl)) return fromUrl;
  const saved = (await cookies()).get("NEXT_LOCALE")?.value;
  return isLocale(saved) ? saved : "ru";
}

/** For Server Components and route handlers: same keys and fallback rules as useT(). */
export async function getT() {
  const locale = await getLocale();
  return { locale, t: (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars) };
}

/** Translator for a fixed locale — e.g. a notification in the recipient's language. */
export function tFor(locale: string | null | undefined) {
  const l: Locale = isLocale(locale) ? locale : "ru";
  return (key: string, vars?: Record<string, string | number>) => translate(l, key, vars);
}

/** Localized title/description + canonical/hreflang for a page, path without locale prefix. */
export async function localizedMetadata(path: string, titleKey: string, descriptionKey: string) {
  const { locale, t } = await getT();
  const title = t(titleKey);
  const description = t(descriptionKey);
  return {
    title,
    description,
    alternates: seoAlternates(locale, path),
    openGraph: { title, description, url: seoAlternates(locale, path).canonical },
  };
}
