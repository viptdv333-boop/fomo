"use client";

import Script from "next/script";

const MEASUREMENT_ID = "G-Q8S28FMD9K";

/**
 * No manual route tracker here, unlike YandexMetrika: GA4's enhanced
 * measurement already fires page_view on browser history changes, so App Router
 * navigations are counted. Adding an explicit page_view on top would double
 * every navigation.
 */
export default function GoogleAnalytics() {
  return (
    <>
      <Script
        id="ga-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`}
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
