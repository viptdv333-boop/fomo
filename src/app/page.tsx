import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import TerminalLanding from "@/components/landing/TerminalLanding";
import { isTerminalSite } from "@/lib/site-mode";
import { terminalLandingJsonLd, terminalPageMetadata } from "@/lib/terminal-seo";
import PwaBanners from "@/components/layout/PwaBanners";
import { getT } from "@/lib/i18n/server";
import { HTML_LANG, SITE_URL, seoAlternates, type Locale } from "@/lib/i18n/locale-url";
import { absoluteUrl, ogLocales } from "@/lib/i18n/seo-metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // terminal.fomo.spot: absolute title, canonical + hreflang, OG image and Twitter card (src/lib/terminal-seo.ts)
  if (isTerminalSite()) return terminalPageMetadata("/", "termsite.title", "termsite.description", true);
  const { locale, t } = await getT();
  const title = t("seo.site.title");
  const description = t("seo.site.description");
  const alternates = seoAlternates(locale, "/");
  return {
    title,
    description,
    alternates,
    openGraph: { title, description, url: alternates.canonical, ...ogLocales(locale) },
  };
}

// Organization + WebSite markup. The SearchAction enables a sitelinks
// search box in Google and feeds Yandex's site-structure data.
function buildJsonLd(locale: Locale, t: (key: string) => string) {
  const home = absoluteUrl(locale, "/");
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "FOMO",
        alternateName: "FOMO — Find Opportunities, Make Outcomes",
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/logo-fomo.png`,
        },
        description: t("seo.org.description"),
        areaServed: "RU",
        knowsLanguage: ["ru", "en", "zh"],
      },
      {
        "@type": "WebSite",
        // One WebSite node per language version, each pointing at its own home.
        "@id": `${home}/#website`,
        url: home,
        name: "FOMO",
        description: t("seo.website.description"),
        inLanguage: locale === "ru" ? "ru-RU" : HTML_LANG[locale],
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${absoluteUrl(locale, "/feed")}?search={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export default async function HomePage() {
  const session = await auth();
  const { locale, t } = await getT();

  if (isTerminalSite()) {
    // Logged-in users go straight to the terminal; guests see the terminal landing page
    if (session?.user) redirect("/terminal");
    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(terminalLandingJsonLd(locale, t)).replace(/</g, "\\u003c") }}
        />
        <PwaBanners />
        <TerminalLanding />
      </>
    );
  }

  const jsonLd = buildJsonLd(locale, t);

  // Logged-in users go straight to feed
  if (session?.user) {
    redirect("/feed");
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <PwaBanners />
      <LandingPage />
    </>
  );
}
