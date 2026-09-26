"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const MEASUREMENT_ID = "G-Q8S28FMD9K";

// googletagmanager.com is blocked in mainland China: the loader hangs until it
// times out and slows the page down, so skip GA there.
function isChina() {
  try {
    const lang = (navigator.language || "").toLowerCase();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return lang.startsWith("zh") || /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Macau|Hong_Kong)$/.test(tz);
  } catch {
    return false;
  }
}

/**
 * No manual route tracker here, unlike YandexMetrika: GA4's enhanced
 * measurement already fires page_view on browser history changes, so App Router
 * navigations are counted. Adding an explicit page_view on top would double
 * every navigation.
 */
export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => setEnabled(!isChina()), []);
  if (!enabled) return null;

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
