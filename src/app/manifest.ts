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
    icons: [
      { src: "/logo-fomo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo-fomo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo-fomo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
