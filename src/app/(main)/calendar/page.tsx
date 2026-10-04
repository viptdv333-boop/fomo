import { getT } from "@/lib/i18n/server";
import { HTML_LANG, SITE_URL } from "@/lib/i18n/locale-url";
import { absoluteUrl } from "@/lib/i18n/seo-metadata";
import CalendarPageClient from "@/components/chart/calendar/CalendarPageClient";

export default async function CalendarPage() {
  const { locale, t } = await getT();
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: t("seo.calendar.title"),
      description: t("seo.calendar.description"),
      url: absoluteUrl(locale, "/calendar"),
      inLanguage: HTML_LANG[locale],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "FOMO", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: t("ec.title"), item: absoluteUrl(locale, "/calendar") },
      ],
    },
  ];
  return (
    <>
      {jsonLd.map((d, i) => (
        <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d).replace(/</g, "\u003c") }} />
      ))}
      {/* the calendar is a full-bleed app layer (like the terminal): the heading and lead are for readers without it and crawlers */}
      <h1 className="sr-only">{t("seo.calendar.title")}</h1>
      <p className="sr-only">{t("ec.page.lead")}</p>
      <CalendarPageClient />
    </>
  );
}
