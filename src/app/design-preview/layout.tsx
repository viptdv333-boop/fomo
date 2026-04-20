import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FOMO — design preview",
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Google Fonts: Playfair Display (headlines), Crimson Pro (body), IBM Plex Mono (tickers) */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;0,900;1,500&family=Crimson+Pro:ital,wght@0,400;0,600;1,400&family=IBM+Plex+Mono:wght@400;600&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
