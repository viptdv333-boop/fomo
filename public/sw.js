// FOMO service worker — bump CACHE version to force clients to drop old assets.
const CACHE = "fomo-v3";
const PRECACHE = ["/", "/logo-fomo.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

function reportPush(stage, detail) {
  return fetch("/api/push/beacon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage, detail }),
  }).catch(() => {});
}

self.addEventListener("push", (event) => {
  // Diagnostic beacon: fires the instant the browser hands the SW a push
  // event, before any parsing/display is attempted — lets the server tell
  // "push never reached this device" apart from "it arrived but showing it
  // failed", which is otherwise invisible from outside the browser.
  event.waitUntil(reportPush("received", event.data ? "has-data" : "no-data"));

  let data = { title: "FOMO", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration
      .showNotification(data.title || "FOMO", {
        body: data.body || "",
        // The old icon/badge (logo-fomo.png, 1536x1024 — the wide banner
        // logo, not an icon) resolved fine as a JS Promise but is exactly
        // the shape Android's badge renderer is strict about: it expects a
        // small square it can force through a monochrome alpha mask, and a
        // large non-square source can make that step fail *after* the
        // Promise has already settled — invisible to any JS-side check,
        // including a beacon that only watches the Promise. icon-192.png is
        // a real 192x192 render of the same logo; badge is dropped rather
        // than guessed at, since Android already falls back to the app's
        // own launcher icon when it's absent.
        icon: "/icon-192.png",
        vibrate: [200, 100, 200],
        requireInteraction: false,
        data: { url: data.url || "/" },
      })
      .then(() => reportPush("shown"))
      .catch((err) => reportPush("error", String(err)))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = clientsList.find((c) => new URL(c.url).pathname === new URL(url, self.location.origin).pathname);
      if (existing) return existing.focus();
      const matchingOrigin = clientsList.find((c) => c.url.startsWith(self.location.origin));
      if (matchingOrigin) {
        await matchingOrigin.focus();
        return matchingOrigin.navigate(url);
      }
      return self.clients.openWindow(url);
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never touch APIs, Server Actions data, or auth callbacks.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/_next/image")
  ) {
    return;
  }

  // Cache-first for immutable build assets and static media.
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    /\.(png|jpe?g|svg|webp|gif|ico|woff2?|ttf|otf|css|js)$/i.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch (err) {
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Network-first for HTML navigations; fall back to cached copy or the
  // cached home page if the client is offline.
  const accept = request.headers.get("accept") || "";
  if (request.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE);
            cache.put(request, res.clone()).catch(() => {});
          }
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(request);
          return cached || (await cache.match("/")) || Response.error();
        }
      })()
    );
  }
});
