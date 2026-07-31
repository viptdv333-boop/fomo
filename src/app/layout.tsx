import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n/client";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";
import PWARegister from "@/components/PWARegister";
import YandexMetrika from "@/components/YandexMetrika";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import CookieBanner from "@/components/CookieBanner";
import { prisma } from "@/lib/prisma";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const SITE_URL = "https://fomo.spot";
const OG_IMAGE = "/logo-fomo.png";

// Keyword-led title/description. Russian search engines weight the leading
// words of <title> heavily, so the brand goes last.
const DEFAULT_TITLE = "Торговые идеи и аналитика фондового рынка — FOMO";
const DEFAULT_DESCRIPTION =
  "Торговые идеи и прогнозы от трейдеров: акции, фьючерсы МосБиржи, криптовалюта, форекс. Технический анализ, сигналы, подписки на авторов. Публикуйте свои идеи.";

// Yandex.Webmaster site ownership. Duplicated as /public/yandex_<code>.html
// so either verification method works.
const YANDEX_VERIFICATION = "a48bd2f2875b90f7";

export async function generateMetadata(): Promise<Metadata> {
  let settings: {
    metaTitle?: string;
    metaDescription?: string | null;
    faviconUrl?: string | null;
  } | null = null;
  try {
    settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
  } catch {
    // DB unreachable — fall through to defaults
  }
  const favicon = settings?.faviconUrl || OG_IMAGE;
  const title = settings?.metaTitle || DEFAULT_TITLE;
  const description = settings?.metaDescription || DEFAULT_DESCRIPTION;

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: "%s — FOMO",
    },
    description,
    applicationName: "FOMO",
    keywords: [
      // RU — mid/low frequency, the ones that actually convert
      "торговые идеи",
      "торговые идеи мосбиржа",
      "инвестиционные идеи",
      "аналитика фондового рынка",
      "прогнозы по акциям",
      "технический анализ акций",
      "торговые сигналы",
      "фьючерсы МосБиржи",
      "трейдинг",
      "инвестиции в акции",
      "подписка на трейдера",
      "социальная сеть для трейдеров",
      "прогноз индекса МосБиржи",
      "криптовалюта аналитика",
      // EN
      "trading ideas",
      "stock market analysis",
      "trading signals",
      "social trading network",
    ],
    verification: {
      yandex: YANDEX_VERIFICATION,
    },
    authors: [{ name: "FOMO" }],
    creator: "FOMO",
    publisher: "FOMO",
    // NOTE: no `alternates.canonical` here — Next merges root metadata into
    // every child page, so a global canonical would tag /feed, /channels, etc.
    // as duplicates of the home page. Each route sets its own canonical.
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: favicon,
    },
    openGraph: {
      type: "website",
      siteName: "FOMO",
      title,
      description,
      // No `url` here — Next merges root metadata into child pages, so a
      // global og:url would tag every route as sharing the same URL.
      locale: "ru_RU",
      alternateLocale: ["en_US", "zh_CN"],
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: "FOMO — Find Opportunities, Make Outcomes",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "FOMO",
    },
  };
}

async function getHeaderCode(): Promise<string | null> {
  try {
    const settings = await prisma.siteSettings.findUnique({ where: { id: "singleton" } });
    return settings?.headerCode || null;
  } catch {
    return null;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerCode = await getHeaderCode();

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('fomo-theme')==='dark'||(!localStorage.getItem('fomo-theme')&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        {headerCode && (
          <div dangerouslySetInnerHTML={{ __html: headerCode }} />
        )}
      </head>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        <ThemeProvider>
          <I18nProvider>
            <SiteSettingsInjector />
            <PWARegister />
            <YandexMetrika />
            <GoogleAnalytics />
            {children}
            <CookieBanner />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
