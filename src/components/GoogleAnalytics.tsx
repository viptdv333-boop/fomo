import { getLocale } from "@/lib/i18n/server";

const MEASUREMENT_ID = "G-Q8S28FMD9K";

/**
 * Rendered on the SERVER, as plain <script> tags in the <head> of the HTML document. It used to be a client component that switched
 * itself on after hydration: the gtag snippet was then missing from the HTML Google fetches, and Search Console (which verified
 * fomo.spot through this very snippet) dropped the site from the verified properties.
 *
 * Skipped for the Chinese version of the site: googletagmanager.com is blocked in mainland China, the loader hangs until it times out.
 *
 * No manual route tracker here, unlike YandexMetrika: GA4's enhanced measurement already fires page_view on browser history changes,
 * so App Router navigations are counted. Adding an explicit page_view on top would double every navigation.
 */
export default async function GoogleAnalytics() {
  if ((await getLocale()) === "cn") return null;

  return (
    <>
      <script async src={`https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`} />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${MEASUREMENT_ID}');`,
        }}
      />
    </>
  );
}
