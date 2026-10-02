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
    // "Share → FOMO" from the screenshot preview or the gallery: the service worker keeps the file and the chat
    // opens with it attached as a draft (src/lib/clipboard-files.ts consumeSharedFile).
    ...({
      share_target: {
        action: "/share-target",
        method: "POST",
        enctype: "multipart/form-data",
        params: {
          title: "title",
          text: "text",
          files: [
            {
              name: "file",
              accept: ["image/*", "video/mp4", "video/webm", "application/pdf", "text/plain", ".docx", ".doc"],
            },
          ],
        },
      },
    } as object),
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
