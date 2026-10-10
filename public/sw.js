// FOMO service worker.
//  * push notifications and the Web Share Target (as before),
//  * offline-first reading: build files cache-first, pages / RSC payloads and an ALLOWLIST of read-only /api answers stale-while-revalidate
//    (the policy itself lives in sw-cache-rules.js and is unit-tested: scripts/check-sw-cache.ts),
//  * the write queue's Background Sync hook (sw-outbox-core.js, scripts/check-outbox.ts).
// Per-user safety: pages / api / media caches are stamped with the user id they were stored for, served only to the same user and wiped when the
// signed-in user changes or signs out. Bump VERSION in sw-cache-rules.js to drop every old cache.
importScripts("/sw-cache-rules.js", "/sw-outbox-core.js");

const R = self.FomoSwRules;
const O = self.FomoOutboxCore;
const SHARE_CACHE = R.SHARE_CACHE;
const PRECACHE = ["/offline.html", "/logo-fomo-sm.webp", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(R.CACHES.static).then((cache) => cache.addAll(PRECACHE)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !R.KEEP.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// state: who is signed in, language, switch, newest release seen (persisted in the meta cache)
// ---------------------------------------------------------------------------------------------------------------------------

const DEFAULT_STATE = { uid: "", locale: "ru", home: "/feed", enabled: true, build: "", lastWrite: 0 };
let statePromise = null;
let generation = 0; // bumped by every purge: a response that started before it must not be stored after it

function getState() {
  if (!statePromise) {
    statePromise = (async () => {
      try {
        const cache = await caches.open(R.CACHES.meta);
        const res = await cache.match(R.META_URL);
        if (res) return Object.assign({}, DEFAULT_STATE, await res.json());
      } catch (e) {}
      return Object.assign({}, DEFAULT_STATE);
    })();
  }
  return statePromise;
}
async function saveState(patch) {
  const st = await getState();
  for (const k in patch) if (patch[k] !== undefined) st[k] = patch[k];
  try {
    const cache = await caches.open(R.CACHES.meta);
    await cache.put(R.META_URL, new Response(JSON.stringify(st), { headers: { "Content-Type": "application/json" } }));
  } catch (e) {}
  return st;
}

async function broadcast(msg) {
  const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of list) c.postMessage(msg);
}

// ---------------------------------------------------------------------------------------------------------------------------
// outbox storage (the same IndexedDB the page uses)
// ---------------------------------------------------------------------------------------------------------------------------

let outboxStore = null;
function outbox() {
  if (!outboxStore) outboxStore = O.openStore(self.indexedDB);
  return outboxStore;
}

async function purgeOutbox(opts) {
  const store = outbox();
  if (!store) return;
  try {
    const ids = O.purgeIds(await store.getAll(), opts);
    for (const id of ids) await store.del(id);
  } catch (e) {}
}

/** Wipes everything stored for a user. outboxOpts: { all: true } | { keepUid } | null (leave the queue alone) */
async function purgeUserData(outboxOpts) {
  generation++;
  await Promise.all(R.USER_CACHES.map((name) => caches.delete(name).catch(() => false)));
  if (outboxOpts) await purgeOutbox(outboxOpts);
}

/** The signed-in user as the server / the page reports it. */
async function applyIdentity(uid, extra) {
  const st = await getState();
  const ch = R.identityChange(st.uid, uid);
  if (ch.changed) {
    // another account (or none) on this device: nothing stored for the old one may be shown. The write queue keeps the OLD user's unsent
    // items only while nobody else is signed in (a session that just expired); a different user removes them.
    await purgeUserData(uid ? { keepUid: uid } : null);
  }
  await saveState(Object.assign({}, extra || {}, { uid }));
  return ch;
}

self.addEventListener("message", (event) => {
  const d = event.data;
  if (!d || typeof d.type !== "string") return;
  const reply = (payload) => {
    try {
      if (event.ports && event.ports[0]) event.ports[0].postMessage(payload);
    } catch (e) {}
  };
  event.waitUntil(
    (async () => {
      if (d.type === "fomo-identity") {
        // The page only ever announces a REAL user id: «guest» is learned from the session endpoint itself (see handleSession), never from a
        // page that may simply have been unable to reach it while offline.
        if (typeof d.uid === "string" && d.uid) {
          await applyIdentity(d.uid, {
            locale: typeof d.locale === "string" ? d.locale : undefined,
            home: typeof d.home === "string" && d.home.charAt(0) === "/" ? d.home : undefined,
          });
        }
        reply({ ok: true });
      } else if (d.type === "fomo-config") {
        const on = d.enabled !== false;
        await saveState({ enabled: on });
        if (!on) await purgeUserData(null);
        reply({ ok: true });
      } else if (d.type === "fomo-purge") {
        // sign-out / «Очистить сохранённые данные»
        await purgeUserData(d.outbox === true ? { all: true } : null);
        if (d.signOut) await saveState({ uid: "" });
        reply({ ok: true });
      } else if (d.type === "fomo-wrote") {
        await saveState({ lastWrite: Date.now() });
        reply({ ok: true });
      } else if (d.type === "fomo-stats") {
        const out = { caches: {}, usage: 0, quota: 0, state: await getState() };
        for (const name of R.USER_CACHES.concat([R.CACHES.static])) {
          try {
            const c = await caches.open(name);
            out.caches[name] = (await c.keys()).length;
          } catch (e) {}
        }
        try {
          const est = await navigator.storage.estimate();
          out.usage = est.usage || 0;
          out.quota = est.quota || 0;
        } catch (e) {}
        reply(out);
      }
    })()
  );
});

// ---------------------------------------------------------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------------------------------------------------------

function header(res, name) {
  return res.headers.get(name) || "";
}

/** A copy of a response with our stamps (when, for whom, which release). Content-Encoding / Length are dropped: the body is stored decoded. */
async function stamped(res, st) {
  const body = await res.blob();
  const h = new Headers(res.headers);
  h.delete("content-encoding");
  h.delete("content-length");
  h.delete("vary");
  h.set("x-fomo-cached-at", String(Date.now()));
  h.set("x-fomo-uid", st.uid || "");
  if (!h.get("x-fomo-build")) h.set("x-fomo-build", st.build || "");
  return new Response(body, { status: 200, statusText: "OK", headers: h });
}

function withHeader(res, name, value) {
  const h = new Headers(res.headers);
  h.set(name, value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function trim(cacheName, max) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    const drop = R.trimPlan(keys.length, max);
    for (let i = 0; i < drop; i++) await cache.delete(keys[i]);
  } catch (e) {}
}

async function noteBuild(res) {
  const b = res.headers.get("x-fomo-build");
  if (!b) return;
  const st = await getState();
  if (st.build === b) return;
  const had = st.build;
  await saveState({ build: b });
  if (had) await broadcast({ type: "fomo-build", build: b });
}

/** the stored copy, if it is for the signed-in user: { res, age, mismatch, writtenBeforeWrite } */
async function lookup(cache, key, st) {
  const res = await cache.match(new Request(key), { ignoreVary: true });
  if (!res) return null;
  if (header(res, "x-fomo-uid") !== (st.uid || "")) return null; // stored for somebody else / for a guest
  const at = Number(header(res, "x-fomo-cached-at") || 0);
  const built = header(res, "x-fomo-build");
  return { res, age: Date.now() - at, mismatch: !!(built && st.build && built !== st.build), writtenBeforeWrite: at < (st.lastWrite || 0) };
}

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(null), ms));
}

function offlineJson(st) {
  return new Response(JSON.stringify({ error: R.offlineMessage(st.locale), offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Fomo-Offline": "1" },
  });
}

async function offlinePage() {
  const cache = await caches.open(R.CACHES.static);
  const res = await cache.match("/offline.html");
  if (!res) return Response.error();
  return new Response(res.body, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

// ---------------------------------------------------------------------------------------------------------------------------
// stale-while-revalidate for pages (HTML navigations, RSC payloads) and /api reads
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * kind: "page" | "rsc" | "api". Returns a Response, or null when there is neither network nor a stored copy (the caller picks the fallback).
 * Stored copy fresh      -> answered at once, refreshed in the background (stale-while-revalidate)
 * stored copy older / the release changed / a write happened since -> the network first (timeout), the copy only as the fallback
 * nothing stored         -> the network
 */
async function swr(event, req, key, pol, st, kind) {
  const cacheName = kind === "api" ? R.CACHES.api : R.CACHES.pages;
  const cache = await caches.open(cacheName);
  const hit = await lookup(cache, key, st);
  const action = hit ? R.storedAction(hit.age, hit.writtenBeforeWrite ? 0 : pol.fresh, hit.mismatch) : "network";
  const gen0 = generation;
  const type = kind === "api" ? "api" : "page";

  const fetchAndStore = async () => {
    const res = await fetch(req);
    event.waitUntil(noteBuild(res.clone()).catch(() => {}));
    if (gen0 === generation && R.cacheableAnswer(type, res.status, res.type, res.redirected, header(res, "cache-control"), header(res, "content-type"), header(res, "content-length"))) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          try {
            const stored = await stamped(copy, st);
            if (gen0 !== generation) return;
            await cache.put(new Request(key), stored);
            if (Math.random() < 0.15) await trim(cacheName, kind === "api" ? R.MAX_ENTRIES.api : R.MAX_ENTRIES.pages);
          } catch (e) {}
        })()
      );
    }
    return res;
  };

  if (action === "stale") {
    event.waitUntil(fetchAndStore().then((r) => r.arrayBuffer()).catch(() => {}));
    return withHeader(hit.res, "x-fomo-from-cache", "1");
  }
  if (action === "network-first") {
    const net = fetchAndStore();
    const first = await Promise.race([net.then((r) => r, () => "error"), timeout(kind === "api" ? R.NET_TIMEOUT.api : R.NET_TIMEOUT.page)]);
    if (first && first !== "error") {
      if (first.status >= 500 && hit) return withHeader(hit.res, "x-fomo-from-cache", "1");
      return first;
    }
    // timeout or no network: the stored copy; a slow request goes on and refreshes it
    event.waitUntil(net.then((r) => r.arrayBuffer()).catch(() => {}));
    return withHeader(hit.res, "x-fomo-from-cache", "1");
  }
  try {
    return await fetchAndStore();
  } catch (e) {
    return null;
  }
}

async function handleSession(event) {
  const req = event.request;
  const st0 = await getState();
  if (!st0.enabled) return fetch(req);
  const cache = await caches.open(R.CACHES.api);
  const key = new URL(req.url).origin + "/api/auth/session";
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      event.waitUntil(
        (async () => {
          let json = null;
          try {
            json = await copy.clone().json();
          } catch (e) {}
          const uid = R.uidFromSession(json);
          await applyIdentity(uid);
          const st = await getState();
          // reopen: applyIdentity may have just deleted the api cache the handler opened above (a sign-in / another user)
          const fresh = await caches.open(R.CACHES.api);
          if (uid) await fresh.put(new Request(key), await stamped(copy, st));
          else await fresh.delete(new Request(key));
        })().catch(() => {})
      );
    }
    return res;
  } catch (e) {
    // no network: the last session of the signed-in user, so the app still knows who it is
    const hit = await lookup(cache, key, st0);
    if (hit && st0.uid) return withHeader(hit.res, "x-fomo-from-cache", "1");
    throw e;
  }
}

async function handleApi(event, url, pol) {
  const st = await getState();
  if (!st.enabled) return fetch(event.request);
  const key = R.cacheKey(url.origin, "api", url.pathname, url.search);
  const res = await swr(event, event.request, key, pol, st, "api");
  return res || offlineJson(st);
}

async function handleNavigate(event, url) {
  const req = event.request;
  const st = await getState();
  if (!st.enabled) return fetch(req).catch(() => offlinePage());
  const home = R.homeTarget(url.pathname, st);
  if (home) return Response.redirect(home, 302);
  // a reload (browser button, the app's pull-to-refresh) means «show me what is new»: from now on every stored list is older than the
  // «last write», so the page and its data come from the network first and the copy is only the fallback
  const cc = req.headers.get("cache-control") || "";
  if (req.cache === "reload" || req.cache === "no-cache" || /(^|,\s*)(no-cache|max-age=0)/.test(cc)) await saveState({ lastWrite: Date.now() });
  const pol = R.pagePolicy(url.pathname);
  if (!pol.cache) return fetch(req).catch(() => offlinePage());
  const key = R.cacheKey(url.origin, "page", url.pathname, url.search);
  const res = await swr(event, req, key, pol, st, "page");
  if (res) return res;
  // no network and no copy under this exact URL: the same page with / without the language prefix, else the small offline page
  const cache = await caches.open(R.CACHES.pages);
  for (const p of R.pageFallbackPaths(url.pathname, st.locale)) {
    const hit = await lookup(cache, R.cacheKey(url.origin, "page", p, url.search), st);
    if (hit) return withHeader(hit.res, "x-fomo-from-cache", "1");
  }
  return offlinePage();
}

function stateTreeGroup(req) {
  let tree = req.headers.get("next-router-state-tree") || "";
  try {
    tree = decodeURIComponent(tree);
  } catch (e) {}
  return /\(main\)/.test(tree) ? "main" : /\(auth\)/.test(tree) ? "auth" : "x";
}

async function handleRsc(event, url) {
  const req = event.request;
  const st = await getState();
  if (!st.enabled) return fetch(req);
  const pol = R.pagePolicy(url.pathname);
  const key = R.cacheKey(url.origin, "rsc", url.pathname, url.search) + "|" + stateTreeGroup(req);
  const res = await swr(event, req, key, pol, st, "rsc");
  return res || Response.error(); // the router then falls back to a normal page load, which the page cache answers
}

async function handleAsset(event, url, kind) {
  const req = event.request;
  const cacheName = kind === "media" ? R.CACHES.media : R.CACHES.static;
  const st = await getState();
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit && (kind === "static" || header(hit, "x-fomo-uid") === (st.uid || ""))) return hit;
  if (!st.enabled && kind === "media") return fetch(req);
  const gen0 = generation;
  const res = await fetch(req);
  if (gen0 === generation && R.cacheableAnswer(kind, res.status, res.type, res.redirected, header(res, "cache-control"), "", header(res, "content-length"))) {
    const copy = res.clone();
    event.waitUntil(
      (async () => {
        try {
          const toStore = kind === "media" ? await stamped(copy, st) : copy;
          if (gen0 !== generation) return;
          await cache.put(req, toStore);
          if (Math.random() < 0.1) await trim(cacheName, R.MAX_ENTRIES[kind]);
        } catch (e) {}
      })()
    );
  }
  return res;
}

// ---------------------------------------------------------------------------------------------------------------------------
// sign-in / sign-out
// ---------------------------------------------------------------------------------------------------------------------------

async function onAuthChange(pathname) {
  // the account is about to change: everything stored for the old one goes now; who is signed in is learned again from the next session answer
  await purgeUserData(R.isSignOut(pathname) ? { all: true } : null);
  await saveState({ uid: "" });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Background Sync: send the queued likes / comments / messages even if the app is closed
// ---------------------------------------------------------------------------------------------------------------------------

async function flushOutbox() {
  const store = outbox();
  const st = await getState();
  if (!store || !st.uid || !st.enabled) return;
  const run = async () => {
    const res = await O.flushOnce({
      getAll: () => store.getAll(),
      put: (it) => store.put(it),
      del: (id) => store.del(id),
      uid: st.uid,
      now: () => Date.now(),
      rnd: () => Math.random(),
      send: async (item) => {
        try {
          const r = await fetch(item.url, { method: item.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.body), credentials: "same-origin" });
          let json = null;
          try {
            json = await r.json();
          } catch (e) {}
          return { status: r.status, json };
        } catch (e) {
          return { status: 0 };
        }
      },
    });
    try {
      for (const id of O.gcIds(await store.getAll(), Date.now())) await store.del(id);
    } catch (e) {}
    await broadcast({ type: "fomo-outbox-changed" });
    return res;
  };
  let res;
  if (self.navigator && navigator.locks) res = await navigator.locks.request("fomo-outbox-flush", { ifAvailable: true }, (lock) => (lock ? run() : null));
  else res = await run();
  if (res && res.stopped === "network") throw new Error("offline"); // the browser schedules the sync again
}

self.addEventListener("sync", (event) => {
  if (event.tag === "fomo-outbox") event.waitUntil(flushOutbox());
});

// ---------------------------------------------------------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------------------------------------------------------
// fetch
// ---------------------------------------------------------------------------------------------------------------------------

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Web Share Target: keep the shared file for the chat composer, then open the chat.
  if (request.method === "POST" && url.pathname === "/share-target") {
    event.respondWith(
      (async () => {
        try {
          const fd = await request.formData();
          const file = fd.get("file");
          if (file && typeof file !== "string" && file.size) {
            const cache = await caches.open(SHARE_CACHE);
            await cache.put(
              "/__shared__",
              new Response(file, {
                headers: {
                  "Content-Type": file.type || "application/octet-stream",
                  "X-Name": encodeURIComponent(file.name || "shared"),
                  "X-Time": String(Date.now()),
                },
              })
            );
          }
        } catch (e) {}
        return Response.redirect("/share", 303);
      })()
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.method !== "GET") {
    if (R.isAuthChange(request.method, url.pathname)) event.waitUntil(onAuthChange(url.pathname));
    return;
  }

  // The app downloads (/app/dl/*.apk|exe|dmg, up to ~100 MB, opened as a navigation by <a download>) go straight to the network, as do Next's
  // own data / image endpoints and the worker scripts.
  if (
    url.pathname.startsWith("/app/dl/") ||
    url.pathname.startsWith("/_next/data/") ||
    url.pathname.startsWith("/_next/image") ||
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/sw-")
  ) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    if (R.isSessionPath(url.pathname)) {
      event.respondWith(handleSession(event));
      return;
    }
    // OAuth callbacks arrive as GET navigations
    if (R.isAuthChange("GET", url.pathname)) {
      event.waitUntil(onAuthChange(url.pathname));
      return;
    }
    const pol = R.apiPolicy(url.pathname);
    if (pol.cache) event.respondWith(handleApi(event, url, pol));
    return;
  }

  const asset = R.assetKind(url.pathname);
  if (asset) {
    if (request.headers.has("range")) return; // video / audio ranges go to the network
    event.respondWith(handleAsset(event, url, asset));
    return;
  }

  const accept = request.headers.get("accept") || "";
  if (request.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(handleNavigate(event, url));
    return;
  }

  // Next's client router asks for the RSC payload of the page it is going to ("RSC: 1"); the prefetch variant is a partial payload: not stored.
  if ((request.headers.get("rsc") === "1" || url.searchParams.has("_rsc")) && !request.headers.get("next-router-prefetch") && R.pagePolicy(url.pathname).cache) {
    event.respondWith(handleRsc(event, url));
  }
});
