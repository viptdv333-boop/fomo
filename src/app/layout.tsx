import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n/client";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";
import PWARegister from "@/components/PWARegister";
import UpdateBanner from "@/components/UpdateBanner";
import IosInstallModal from "@/components/shared/IosInstallModal";
import YandexMetrika from "@/components/YandexMetrika";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import CookieBanner from "@/components/CookieBanner";
import { prisma } from "@/lib/prisma";
import { getLocale, getT } from "@/lib/i18n/server";
import { keywordList, ogLocales } from "@/lib/i18n/seo-metadata";
import { HTML_LANG } from "@/lib/i18n/locale-url";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { APP_UI_BOOT_SCRIPT } from "@/lib/native-app";
import { brandName, isTerminalSite, siteUrl } from "@/lib/site-mode";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// terminal.fomo.spot (SITE_MODE=terminal): own title, icons and no Yandex verification; the main site is unchanged.
const TERMINAL = isTerminalSite();
const SITE_URL = siteUrl();
const OG_IMAGE = TERMINAL ? "/icons-terminal/og.png" : "/logo-fomo.png";
const BRAND = brandName();
const TERMINAL_ICONS = { icon: "/icons-terminal/icon-192.png", shortcut: "/icons-terminal/icon-192.png", apple: "/icons-terminal/apple-touch-icon.png" };

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
  const { locale, t } = await getT();
  const favicon = settings?.faviconUrl || OG_IMAGE;
  // Keyword-led title/description (seo.site.* in src/lib/i18n/dict/seo.ts).
  // Russian search engines weight the leading words of <title> heavily, so the
  // brand goes last. The admin-editable overrides are written in Russian, so
  // they only replace the Russian defaults; /en and /zh always get their own copy.
  // Terminal instance: the admin-editable title / description are not used (a fresh database holds the main site's generic
  // defaults, which would replace the terminal copy).
  const title = TERMINAL ? t("termsite.title") : (locale === "ru" && settings?.metaTitle) || t("seo.site.title");
  const description = TERMINAL ? t("termsite.description") : (locale === "ru" && settings?.metaDescription) || t("seo.site.description");

  return {
    metadataBase: new URL(SITE_URL),
    title: {
      default: title,
      template: `%s — ${BRAND}`,
    },
    description,
    applicationName: BRAND,
    keywords: keywordList(t(TERMINAL ? "termsite.keywords" : "seo.site.keywords")),
    // Yandex.Webmaster ownership belongs to fomo.spot only
    ...(TERMINAL ? {} : { verification: { yandex: YANDEX_VERIFICATION } }),
    authors: [{ name: "FOMO" }],
    creator: "FOMO",
    publisher: "FOMO",
    // NOTE: no `alternates.canonical` here — Next merges root metadata into
    // every child page, so a global canonical would tag /feed, /channels, etc.
    // as duplicates of the home page. Each route sets its own canonical.
    icons: TERMINAL
      ? { ...TERMINAL_ICONS, icon: settings?.faviconUrl || TERMINAL_ICONS.icon }
      : {
          icon: favicon,
          shortcut: favicon,
          apple: favicon,
        },
    openGraph: {
      type: "website",
      siteName: BRAND,
      title,
      description,
      // No `url` here — Next merges root metadata into child pages, so a
      // global og:url would tag every route as sharing the same URL.
      ...ogLocales(locale),
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: TERMINAL ? "FOMO Terminal" : "FOMO — Find Opportunities, Make Outcomes",
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
      title: BRAND,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={HTML_LANG[locale]} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('fomo-theme')==='dark'||(!localStorage.getItem('fomo-theme')&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        {/* app-only UI switch (Android app or ?appui=1 preview): only adds the class "app-ui" to <html>, see src/lib/native-app.ts */}
        <script dangerouslySetInnerHTML={{ __html: APP_UI_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 antialiased">
        <ThemeProvider>
          <I18nProvider locale={locale} messages={DICTIONARIES[locale]}>
            <SiteSettingsInjector />
            <PWARegister />
            <UpdateBanner />
            <IosInstallModal />
            {/* the counters belong to fomo.spot: the terminal instance would write its visits (and Webvisor) into them */}
            {!TERMINAL && <YandexMetrika />}
            {!TERMINAL && <GoogleAnalytics />}
            {children}
            <CookieBanner />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
