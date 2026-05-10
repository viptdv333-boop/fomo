import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = "https://fomo.spot";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
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
          "/channels/create",
          "/design-preview",
        ],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
