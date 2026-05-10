import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n/client";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";
import { prisma } from "@/lib/prisma";

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
  const favicon = settings?.faviconUrl || "/logo-fomo.png";
  return {
    title: settings?.metaTitle || "FOMO — Find Opportunities, Make Outcomes",
    description: settings?.metaDescription || "Платформа для публикации и обсуждения торговых идей",
    icons: {
      icon: favicon,
      shortcut: favicon,
      apple: favicon,
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
