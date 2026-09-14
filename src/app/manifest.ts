import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FOMO — Торговые идеи",
    short_name: "FOMO",
    description:
      "Платформа для публикации и обсуждения торговых идей. Аналитика, прогнозы, подписки на трейдеров.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    lang: "ru",
    dir: "ltr",
    categories: ["finance", "business", "news"],
    // These declared sizes previously all pointed at logo-fomo.png itself —
    // the wide 1536x1024 banner logo, not actually 192x192 or 512x512 at
    // all. Browsers mostly tolerate that for install icons (auto-scaling
    // fills the gap), but Android's push-notification badge renderer is
    // strict about square input, and a mismatched source there can silently
    // fail after the JS Promise has already resolved. icon-192.png/
    // icon-512.png are real renders of the same logo at those sizes.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
