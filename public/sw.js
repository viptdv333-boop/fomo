// FOMO service worker — bump CACHE version to force clients to drop old assets.
const CACHE = "fomo-v2";
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

self.addEventListener("push", (event) => {
  let data = { title: "FOMO", body: "" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "FOMO", {
      body: data.body || "",
      icon: "/logo-fomo.png",
      badge: "/logo-fomo.png",
      data: { url: data.url || "/" },
    })
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
