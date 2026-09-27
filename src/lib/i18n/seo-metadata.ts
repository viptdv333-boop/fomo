import type { Metadata } from "next";
import { getT } from "./server";
import { LOCALES, OG_LOCALE, SITE_URL, localizedPath, seoAlternates, type Locale } from "./locale-url";

/** og:locale for the current language plus og:locale:alternate for the other two. */
export function ogLocales(locale: Locale) {
  return {
    locale: OG_LOCALE[locale],
    alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
  };
}

/** Absolute URL of `path` (no locale prefix) in `locale`; home has no trailing slash. */
export function absoluteUrl(locale: Locale, path: string): string {
  const p = localizedPath(locale, path);
  return p === "/" ? SITE_URL : `${SITE_URL}${p}`;
}

/** seo.*.keywords entries are comma-separated lists. */
export function keywordList(s: string): string[] {
  return s
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Indexable section page: title, description, keywords, canonical + hreflang,
 * OpenGraph and Twitter, all from seo.<section>.{title,description,keywords}.
 */
export async function sectionMetadata(section: string, path: string): Promise<Metadata> {
  const { locale, t } = await getT();
  const title = t(`seo.${section}.title`);
  const description = t(`seo.${section}.description`);
  const alternates = seoAlternates(locale, path);
  return {
    title,
    description,
    keywords: keywordList(t(`seo.${section}.keywords`)),
    alternates,
    openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) },
    twitter: { title, description },
  };
}

/** noindex account area: localized title only, plus canonical/hreflang. */
export async function privateMetadata(section: string, path: string): Promise<Metadata> {
  const { locale, t } = await getT();
  return {
    title: t(`seo.${section}.title`),
    alternates: seoAlternates(locale, path),
    robots: { index: false, follow: false },
  };
}
