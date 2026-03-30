import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "FOMO — Find Opportunities, Make Outcomes",
  description: "Платформа для публикации и обсуждения торговых идей",
};

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
          <SiteSettingsInjector />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
