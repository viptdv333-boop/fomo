import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n/client";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";
import { prisma } from "@/lib/prisma";

const SITE_URL = "https://fomo.spot";
const OG_IMAGE = "/logo-fomo.png";

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
  const title = settings?.metaTitle || "FOMO — Find Opportunities, Make Outcomes";
  const description =
    settings?.metaDescription ||
    "Торговые идеи и аналитика от профессиональных трейдеров. Читайте прогнозы, публикуйте свои идеи, подписывайтесь на авторов.";

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: "%s — FOMO",
    },
    description,
    applicationName: "FOMO",
    keywords: [
      "торговые идеи",
      "аналитика рынка",
      "трейдинг",
      "прогнозы акций",
      "фьючерсы MOEX",
      "крипта",
      "инвестиции",
      "подписки на трейдеров",
      "FOMO",
      "trading ideas",
      "market analysis",
    ],
    authors: [{ name: "FOMO" }],
    creator: "FOMO",
    publisher: "FOMO",
    alternates: {
      canonical: SITE_URL,
      languages: {
        ru: SITE_URL,
        en: SITE_URL,
        "zh-CN": SITE_URL,
        "x-default": SITE_URL,
      },
    },
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
      url: SITE_URL,
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
            {children}
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
