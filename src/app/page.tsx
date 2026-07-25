import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

const SITE_URL = "https://fomo.spot";

export const metadata: Metadata = {
  title: "Торговые идеи и аналитика фондового рынка — FOMO",
  description:
    "Торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, сигналы, подписки на авторов. Публикуйте свои идеи.",
  alternates: { canonical: SITE_URL },
  openGraph: { url: SITE_URL },
};

// Organization + WebSite markup. The SearchAction enables a sitelinks
// search box in Google and feeds Yandex's site-structure data.
const jsonLd = {
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
      description:
        "Платформа для публикации и обсуждения торговых идей: акции, фьючерсы МосБиржи, криптовалюта, форекс.",
      areaServed: "RU",
      knowsLanguage: ["ru", "en", "zh"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "FOMO",
      description:
        "Торговые идеи и аналитика фондового рынка от профессиональных трейдеров.",
      inLanguage: "ru-RU",
      publisher: { "@id": `${SITE_URL}/#organization` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${SITE_URL}/feed?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
  ],
};

export default async function HomePage() {
  const session = await auth();

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
      <LandingPage />
    </>
  );
}
