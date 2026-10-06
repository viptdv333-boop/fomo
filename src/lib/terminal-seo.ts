// SEO of the terminal site (terminal.fomo.spot, SITE_MODE=terminal). Server-side helpers; the main site never calls them.
// Pieces: page metadata with a real OG image, search-engine verification tags from the environment, the JSON-LD graph of the landing.

import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { HTML_LANG, seoAlternates, type Locale } from "@/lib/i18n/locale-url";
import { ogLocales } from "@/lib/i18n/seo-metadata";
import { absoluteUrl as siteAbsoluteUrl, siteUrl } from "@/lib/site-mode";
import { TERMINAL_FAQ_KEYS } from "@/lib/terminal-faq";
import { DL_FILES, availablePlatforms, dlInfoFor } from "@/lib/downloads";

/** 1200x630 JPEG made from the terminal screenshots (public/landing/terminal/og.jpg). */
export const TERMINAL_OG_IMAGE = "/landing/terminal/og.jpg";

/** lastmod of the pages whose text changes only with a release (landing, legal pages); bump it when the copy changes. */
export const TERMINAL_STATIC_LASTMOD = "2026-10-06";

/**
 * Search-engine ownership tags, read at RUN time (not inlined at build): GOOGLE_SITE_VERIFICATION and YANDEX_VERIFICATION hold
 * the content of the meta tag, empty = no tag. Terminal mode only (fomo.spot keeps its own verification in layout.tsx).
 */
export function terminalVerification(env: Record<string, string | undefined> = process.env): Metadata["verification"] | undefined {
  const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "");
  const google = clean(env.GOOGLE_SITE_VERIFICATION);
  const yandex = clean(env.YANDEX_VERIFICATION);
  if (!google && !yandex) return undefined;
  return { ...(google ? { google } : {}), ...(yandex ? { yandex } : {}) };
}

/** Title / description / canonical + hreflang / OpenGraph / Twitter of an indexable page of the terminal site. `titleKey` / `descKey` are dictionary keys. */
export async function terminalPageMetadata(path: string, titleKey: string, descKey: string, absoluteTitle = false): Promise<Metadata> {
  const { locale, t } = await getT();
  const title = t(titleKey);
  const description = t(descKey);
  const alternates = seoAlternates(locale, path);
  const image = { url: TERMINAL_OG_IMAGE, width: 1200, height: 630, alt: "FOMO Terminal" };
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates,
    openGraph: { type: "website", siteName: "FOMO Terminal", title, description, url: alternates.canonical, ...ogLocales(locale), images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [TERMINAL_OG_IMAGE] },
  };
}

/** WebSite + Organization + SoftwareApplication + FAQPage of the landing, in the language of the request. */
export function terminalLandingJsonLd(locale: Locale, t: (key: string) => string) {
  const origin = siteUrl();
  const home = seoAlternates(locale, "/").canonical;
  const inLanguage = locale === "ru" ? "ru-RU" : HTML_LANG[locale];
  const downloads = availablePlatforms("terminal", dlInfoFor("terminal"))
    .map((p) => (p === "android" || p === "windows" || p === "macos" ? DL_FILES.terminal[p]?.path : undefined))
    .filter((p): p is string => !!p)
    .map((p) => siteAbsoluteUrl(p));
  const operatingSystem = ["Web", ...availablePlatforms("terminal", dlInfoFor("terminal")).filter((p) => p === "android" || p === "windows" || p === "macos").map((p) => (p === "android" ? "Android" : p === "windows" ? "Windows" : "macOS"))].join(", ");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "FOMO Terminal",
        url: origin,
        logo: { "@type": "ImageObject", url: `${origin}/icons-terminal/icon-512.png` },
        description: t("termsite.org.description"),
        knowsLanguage: ["ru", "en", "zh"],
      },
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: "FOMO Terminal",
        description: t("termsite.description"),
        inLanguage,
        publisher: { "@id": `${origin}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${origin}/#app`,
        name: "FOMO Terminal",
        url: home,
        description: t("termsite.description"),
        applicationCategory: "FinanceApplication",
        operatingSystem,
        ...(downloads.length ? { downloadUrl: downloads.length === 1 ? downloads[0] : downloads } : {}),
        image: `${origin}/landing/terminal/og.jpg`,
        inLanguage: ["ru", "en", "zh"],
        offers: [
          { "@type": "Offer", price: "0", priceCurrency: "RUB", availability: "https://schema.org/InStock" },
          { "@type": "Offer", price: "0", priceCurrency: "USD", availability: "https://schema.org/InStock" },
        ],
      },
      {
        "@type": "FAQPage",
        "@id": `${home}#faq`,
        inLanguage,
        mainEntity: TERMINAL_FAQ_KEYS.map(({ q, a }) => ({
          "@type": "Question",
          name: t(q),
          acceptedAnswer: { "@type": "Answer", text: t(a) },
        })),
      },
    ],
  };
}
