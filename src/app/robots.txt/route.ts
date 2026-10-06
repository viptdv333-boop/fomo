// Hand-rolled robots.txt route handler instead of Next's robots.ts, because
// MetadataRoute.Robots cannot express Yandex's Clean-param directive.
import { isTerminalSite, siteUrl } from "@/lib/site-mode";
import { terminalRobotsTxt } from "@/lib/terminal-seo";

// https://fomo.spot on the main site, https://terminal.fomo.spot on the terminal instance (NEXT_PUBLIC_SITE_URL / SITE_MODE)
const BASE = siteUrl();

// Functional areas with no search value. Written without a trailing slash on
// purpose: "/messages/" only blocked the subtree, so Googlebot crawled the bare
// /messages anyway.
//
// The account and auth areas (/profile, /messages, /payments, /subscriptions,
// /login, /register, /forgot-password) are NOT listed here on purpose. Google
// already discovered them, and a robots.txt block would stop it reading the
// noindex those routes now send — leaving them stuck in the report. Blocked
// crawling and noindex are mutually exclusive; noindex is what actually removes
// a URL Google already knows about.
const DISALLOW = [
  "/api/",
  "/admin",
  "/ideas/new",
  "/ideas/*/edit",
  "/channels/create",
  "/channels/edit",
  "/design-preview",
  "/*?*page=",
];

// The same functional areas under the /en and /zh language prefixes (the
// middleware rewrites /en/admin etc. to the same pages). The language roots
// themselves (/en, /zh) stay crawlable — they are listed in the sitemap.
const LOCALE_PREFIXES = ["/en", "/zh"];
const LOCALIZED_DISALLOW = DISALLOW.filter((p) => !p.startsWith("/api/") && !p.startsWith("/*")).flatMap((p) =>
  LOCALE_PREFIXES.map((prefix) => `${prefix}${p}`),
);

// Tracking parameters Yandex should strip before deduplicating URLs.
const CLEAN_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "yclid",
  "ymclid",
  "gclid",
  "fbclid",
  "from",
  "ref",
  "referrer",
];

function block(userAgent: string): string {
  return [`User-agent: ${userAgent}`, "Allow: /", ...[...DISALLOW, ...LOCALIZED_DISALLOW].map((p) => `Disallow: ${p}`)].join("\n");
}

export function GET(): Response {
  // terminal.fomo.spot: the landing and the legal pages are open, the terminal / calendar / account pages / API are not
  if (isTerminalSite()) {
    return new Response(terminalRobotsTxt(BASE), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  const body = [
    block("*"),
    "",
    block("Yandex"),
    `Clean-param: ${CLEAN_PARAMS.join("&")}`,
    "",
    block("Googlebot"),
    "",
    `Host: ${BASE}`,
    `Sitemap: ${BASE}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
