import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import SiteSettingsInjector from "@/components/layout/SiteSettingsInjector";

export const metadata: Metadata = {
  title: "FOMO — Find Opportunities, Make Outcomes",
  description: "Платформа для публикации и обсуждения торговых идей",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('fomo-theme')==='dark'||(!localStorage.getItem('fomo-theme')&&matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
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
