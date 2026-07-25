// Hand-rolled robots.txt route handler instead of Next's robots.ts, because
// MetadataRoute.Robots cannot express Yandex's Clean-param directive.
const BASE = "https://fomo.spot";

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
  return [`User-agent: ${userAgent}`, "Allow: /", ...DISALLOW.map((p) => `Disallow: ${p}`)].join("\n");
}

export function GET(): Response {
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
