// Hand-rolled robots.txt route handler instead of Next's robots.ts, because
// MetadataRoute.Robots cannot express Yandex's Clean-param directive.
const BASE = "https://fomo.spot";

// Private / functional areas that must never reach the index.
const DISALLOW = [
  "/api/",
  "/admin/",
  "/login",
  "/register",
  "/forgot-password",
  "/profile",
  "/profile/",
  "/messages/",
  "/payments/",
  "/subscriptions/",
  "/ideas/new",
  "/ideas/*/edit",
  "/channels/create",
  "/channels/edit/",
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
