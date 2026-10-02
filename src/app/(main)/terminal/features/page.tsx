import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { HTML_LANG, SITE_URL, localizedPath, seoAlternates } from "@/lib/i18n/locale-url";
import { keywordList, ogLocales, absoluteUrl } from "@/lib/i18n/seo-metadata";

const FEATURES = Array.from({ length: 12 }, (_, i) => i + 1);
const FAQ = [1, 2, 3, 4, 5, 6];

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getT();
  const alternates = seoAlternates(locale, "/terminal/features");
  return {
    title: t("tf.title"),
    description: t("tf.description"),
    keywords: keywordList(t("tf.keywords")),
    alternates,
    openGraph: { url: alternates.canonical, title: t("tf.title"), description: t("tf.description"), ...ogLocales(locale) },
  };
}

export default async function TerminalFeaturesPage() {
  const { locale, t } = await getT();
  const terminalHref = localizedPath(locale, "/terminal");
  const pageUrl = absoluteUrl(locale, "/terminal/features");

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "FOMO Terminal",
      url: absoluteUrl(locale, "/terminal"),
      applicationCategory: "FinanceApplication",
      operatingSystem: "Web, Android (PWA)",
      inLanguage: HTML_LANG[locale],
      description: t("tf.description"),
      offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
      featureList: FEATURES.map((n) => t(`tf.f${n}.t`)),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: HTML_LANG[locale],
      mainEntity: FAQ.map((n) => ({ "@type": "Question", name: t(`tf.q${n}`), acceptedAnswer: { "@type": "Answer", text: t(`tf.a${n}`) } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "FOMO", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: t("tf.breadcrumbTerminal"), item: absoluteUrl(locale, "/terminal") },
        { "@type": "ListItem", position: 3, name: t("tf.breadcrumbHere"), item: pageUrl },
      ],
    },
  ];

  return (
    <article className="max-w-3xl mx-auto w-full px-4 py-8 text-gray-800 dark:text-gray-200">
      {jsonLd.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\\u003c") }} />
      ))}
      <h1 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">{t("tf.h1")}</h1>
      <p className="text-[16px] leading-relaxed mb-6">{t("tf.lead")}</p>
      <Link href={terminalHref} className="inline-block px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
        {t("tf.cta")}
      </Link>

      <h2 className="text-2xl font-bold mt-12 mb-5 text-gray-900 dark:text-gray-100">{t("tf.featuresTitle")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((n) => (
          <section key={n} className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4">
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">{t(`tf.f${n}.t`)}</h3>
            <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">{t(`tf.f${n}.d`)}</p>
          </section>
        ))}
      </div>

      <h2 className="text-2xl font-bold mt-12 mb-5 text-gray-900 dark:text-gray-100">{t("tf.faqTitle")}</h2>
      <div className="space-y-5">
        {FAQ.map((n) => (
          <section key={n}>
            <h3 className="font-semibold mb-1 text-gray-900 dark:text-gray-100">{t(`tf.q${n}`)}</h3>
            <p className="text-[15px] leading-relaxed text-gray-700 dark:text-gray-300">{t(`tf.a${n}`)}</p>
          </section>
        ))}
      </div>

      <div className="mt-10 flex items-center gap-4">
        <Link href={terminalHref} className="inline-block px-6 py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold transition">
          {t("tf.cta")}
        </Link>
      </div>
      <p className="mt-8 text-xs text-gray-400">{t("tf.disclaimer")}</p>
    </article>
  );
}
