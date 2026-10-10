/* FOMO service worker: the PURE cache policy (what may be stored, for how long, under which key). No caches / fetch / clients here,
   so scripts/check-sw-cache.ts can run it in node. Loaded by public/sw.js with importScripts() (global `FomoSwRules`).
   Run the check:  npx tsx scripts/check-sw-cache.ts

   Privacy rule of thumb: anything user specific is cached only in the "pages", "api" and "media" caches, which are wiped when the signed-in
   user changes or signs out (sw.js purgeUserData). The "static" cache holds only build files and fixed images that are the same for everybody. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.FomoSwRules = api;
})(typeof self !== "undefined" ? self : this, function () {
  var VERSION = "v7";
  var CACHES = {
    static: "fomo-static-" + VERSION,
    pages: "fomo-pages-" + VERSION,
    api: "fomo-api-" + VERSION,
    media: "fomo-media-" + VERSION,
    meta: "fomo-meta-" + VERSION,
  };
  /** caches wiped on a user change / sign-out / «Очистить сохранённые данные» */
  var USER_CACHES = [CACHES.pages, CACHES.api, CACHES.media];
  var SHARE_CACHE = "fomo-share"; // Web Share Target hand-over, owned by sw.js, never touched by the purge
  var KEEP = [CACHES.static, CACHES.pages, CACHES.api, CACHES.media, CACHES.meta, SHARE_CACHE];

  var MIN = 60 * 1000;
  var HOUR = 60 * MIN;
  var DAY = 24 * HOUR;
  var MAX_AGE = 7 * DAY; // nothing older than a week is ever served
  var MAX_ENTRIES = { static: 800, pages: 80, api: 250, media: 200 };
  var MAX_BODY = { api: 1500000, page: 2500000, media: 3000000, static: 6000000 };
  /** how long the network may take before a stored copy is used instead (the request keeps running and refreshes the copy) */
  var NET_TIMEOUT = { page: 4000, api: 3000 };

  var META_URL = "/__fomo__/meta";
  var PAGE_PREFIX = "/__fomo__/page";
  var RSC_PREFIX = "/__fomo__/rsc";

  var OFFLINE_TEXT = { ru: "Нет сети", en: "No connection", cn: "无网络" };

  function stripLocale(pathname) {
    var m = /^\/(en|zh)(?=\/|$)(.*)$/.exec(pathname || "");
    return m ? { prefix: m[1], path: m[2] || "/" } : { prefix: "", path: pathname || "/" };
  }
  function localized(locale, path) {
    var p = locale === "en" ? "en" : locale === "cn" || locale === "zh" ? "zh" : "";
    var clean = path.charAt(0) === "/" ? path : "/" + path;
    if (!p) return clean;
    return clean === "/" ? "/" + p : "/" + p + clean;
  }
  function startsUnder(path, prefix) {
    return path === prefix || path.indexOf(prefix + "/") === 0;
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // static files: cache-first
  // ---------------------------------------------------------------------------------------------------------------------------

  var STATIC_PREFIXES = ["/_next/static/", "/i18n/", "/icons/", "/icons-terminal/", "/images/", "/landing/"];
  var STATIC_FILES = ["/icon-192.png", "/icon-512.png", "/logo-fomo.png", "/logo-fomo-sm.webp", "/logo-bimi.svg", "/favicon.ico", "/offline.html"];

  /** "static" (build files, fixed images), "media" (user uploads), or null */
  function assetKind(pathname) {
    if (startsUnder(pathname, "/uploads")) return "media";
    for (var i = 0; i < STATIC_PREFIXES.length; i++) if (pathname.indexOf(STATIC_PREFIXES[i]) === 0) return "static";
    return STATIC_FILES.indexOf(pathname) >= 0 ? "static" : null;
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // pages (navigations and RSC payloads)
  // ---------------------------------------------------------------------------------------------------------------------------

  /** Pages never stored: sign-in screens, the admin panel, payments, invitations, forms that only make sense online, downloads. */
  var PAGE_DENY = ["/login", "/register", "/forgot-password", "/reset-password", "/admin", "/payments", "/share-target", "/rooms/join", "/app", "/ideas/new", "/channels/create", "/channels/edit", "/design-preview", "/dev-notifications", "/api"];
  /** The roots of the dock sections: a client-side shell whose data comes from /api, so a copy up to a day old is a perfectly good shell. */
  var TAB_ROOTS = ["/feed", "/terminal", "/chat", "/calendar", "/channels", "/authors", "/profile", "/messages", "/subscriptions", "/instruments", "/rooms", "/calculator"];

  /**
   * { cache, fresh, root } for a page path: `fresh` is how long a stored copy is served instantly (and refreshed in the background);
   * after that the network is asked first (with a timeout) and the copy is only the fallback. Content pages (an idea, an author) carry
   * server rendered text, so their instant window is short.
   */
  function pagePolicy(pathname) {
    var s = stripLocale(pathname);
    var path = s.path.length > 1 ? s.path.replace(/\/+$/, "") : s.path;
    for (var i = 0; i < PAGE_DENY.length; i++) if (startsUnder(path, PAGE_DENY[i])) return { cache: false, fresh: 0, root: false };
    if (path === "/") return { cache: false, fresh: 0, root: false }; // the landing / redirect to the feed, see homeTarget()
    for (var j = 0; j < TAB_ROOTS.length; j++) {
      if (path === TAB_ROOTS[j]) return { cache: true, fresh: DAY, root: true };
    }
    return { cache: true, fresh: 2 * MIN, root: false };
  }

  /** "/" (and "/en", "/zh") of a signed-in user: where the app really lives. null when not signed in. marker = { uid, locale, home } */
  function homeTarget(pathname, marker) {
    var s = stripLocale(pathname);
    if (s.path !== "/" || !marker || !marker.uid) return null;
    return localized(marker.locale || s.prefix || "ru", marker.home || "/feed");
  }

  /** Candidates for an offline navigation that has no stored copy under its exact URL: with / without the language prefix. */
  function pageFallbackPaths(pathname, locale) {
    var s = stripLocale(pathname);
    var out = [];
    var loc = localized(locale || "ru", s.path);
    if (loc !== pathname) out.push(loc);
    if (s.path !== pathname && out.indexOf(s.path) < 0) out.push(s.path);
    return out;
  }

  var VOLATILE = { _: 1, t: 1, ts: 1, _t: 1, nocache: 1, cb: 1, _rsc: 1, peek: 1 }; // peek=1: the warm-up looks at a DM thread without marking it read: same stored answer
  function normalizedSearch(search) {
    if (!search || search === "?") return "";
    var parts = search.replace(/^\?/, "").split("&").filter(function (p) {
      if (!p) return false;
      var k = p.split("=")[0];
      return !VOLATILE[k];
    });
    parts.sort();
    return parts.length ? "?" + parts.join("&") : "";
  }
  /** Synthetic cache key (an absolute URL under the site's origin). kind: "page" | "rsc" | "rsc-prefetch" | "api" | "asset" */
  function cacheKey(origin, kind, pathname, search) {
    var ns = normalizedSearch(search);
    if (kind === "page") return origin + PAGE_PREFIX + pathname + ns;
    if (kind === "rsc") return origin + RSC_PREFIX + "/n" + pathname + ns;
    if (kind === "rsc-prefetch") return origin + RSC_PREFIX + "/p" + pathname + ns;
    return origin + pathname + ns;
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // /api: allowlist of read endpoints that are safe to show stale
  // ---------------------------------------------------------------------------------------------------------------------------

  /** Never cached, whatever the allowlist says (auth, money, uploads, push, admin, bots, live market data ...). */
  var API_DENY = /^\/api\/(auth|csrf|session|payments?|yukassa|upload|push|admin|bot|version|socketio|klines|quotes?|orderbook|orderflow|market-search|futures|fmp-stats|crypto-stats|algopack|contracts|sandbox|captcha|terminal|telegram|notification-settings|payment-methods|reports|me)(\/|$)/;
  var API_DENY_DEEP = /^\/api\/(users\/(online|dm-enabled)$|users\/[^/]+\/(finances|payment-links|tariffs\/[^/]+\/subscribers)|instruments\/[^/]+\/(moex|contracts)|chat\/(badge|unread|previews)|notifications\/unread-by-)/;

  // [pattern, instant window]. `fresh` 0 = always network first (live-ish), a stored copy only answers when the network is gone or slow.
  var API_ALLOW = [
    // the board
    [/^\/api\/ideas$/, 2 * MIN],
    [/^\/api\/ideas\/authors$/, 10 * MIN],
    [/^\/api\/ideas\/[^/]+$/, 2 * MIN],
    [/^\/api\/ideas\/[^/]+\/comments$/, 0],
    [/^\/api\/categories$/, 30 * MIN],
    [/^\/api\/instruments$/, 10 * MIN],
    [/^\/api\/instruments\/[^/]+$/, 10 * MIN],
    [/^\/api\/instruments\/[^/]+\/related$/, 10 * MIN],
    [/^\/api\/assets(\/[^/]+)?$/, 30 * MIN],
    [/^\/api\/feed\/mutes$/, 0],
    // channels and authors
    [/^\/api\/channels$/, 2 * MIN],
    [/^\/api\/channels\/[^/]+\/chat$/, 0],
    [/^\/api\/authors$/, 5 * MIN],
    [/^\/api\/subscriptions$/, 2 * MIN],
    [/^\/api\/users\/by-fomo-id\/[^/]+$/, 5 * MIN],
    [/^\/api\/users\/[^/]+$/, 5 * MIN],
    [/^\/api\/users\/[^/]+\/(followers|education)$/, 5 * MIN],
    [/^\/api\/users\/[^/]+\/tariffs$/, 5 * MIN],
    [/^\/api\/watchlist$/, 2 * MIN],
    // chat and messages
    [/^\/api\/chat\/rooms$/, 0],
    [/^\/api\/chat\/messages$/, 0],
    [/^\/api\/chat\/favorites$/, 0],
    [/^\/api\/chat\/notify$/, 0],
    [/^\/api\/chat\/read$/, 0],
    [/^\/api\/rooms$/, 0],
    [/^\/api\/rooms\/[^/]+$/, 0],
    [/^\/api\/messages\/conversations$/, 0],
    [/^\/api\/messages\/conversations\/[^/]+\/messages$/, 0],
    [/^\/api\/contacts$/, 2 * MIN],
    // bell, calendar, texts
    [/^\/api\/notifications$/, 0],
    [/^\/api\/economic-calendar$/, 5 * MIN],
    [/^\/api\/languages$/, DAY],
    [/^\/api\/site-settings$/, 10 * MIN],
    [/^\/api\/stats\/public$/, 10 * MIN],
    [/^\/api\/news$/, 5 * MIN],
  ];

  /** { cache, fresh } for a GET /api path, or { cache:false } */
  function apiPolicy(pathname) {
    if (API_DENY.test(pathname) || API_DENY_DEEP.test(pathname)) return { cache: false, fresh: 0 };
    for (var i = 0; i < API_ALLOW.length; i++) if (API_ALLOW[i][0].test(pathname)) return { cache: true, fresh: API_ALLOW[i][1] };
    return { cache: false, fresh: 0 };
  }

  /** The next-auth session endpoint: network first, the last answer is kept only as the OFFLINE session of the signed-in user. */
  function isSessionPath(pathname) {
    return pathname === "/api/auth/session";
  }
  /** Requests that mean "the account changes": sign-in (callback / credentials), sign-out. The user caches are wiped. */
  function isAuthChange(method, pathname) {
    if (!/^\/api\/auth\/(callback|signin|signout)(\/|$)/.test(pathname)) return false;
    return method !== "GET" || /\/callback\//.test(pathname);
  }
  function isSignOut(pathname) {
    return /^\/api\/auth\/signout(\/|$)/.test(pathname);
  }

  // ---------------------------------------------------------------------------------------------------------------------------
  // decisions
  // ---------------------------------------------------------------------------------------------------------------------------

  /**
   * What to do with a stored copy: "stale" = answer from it now and refresh in the background, "network-first" = ask the network
   * (timeout, then the copy), "network" = nothing usable stored.
   * ageMs: age of the copy or null; fresh: instant window; buildMismatch: the copy was rendered by another release than the server runs.
   */
  function storedAction(ageMs, fresh, buildMismatch) {
    if (ageMs === null || ageMs === undefined || ageMs < 0 || ageMs > MAX_AGE) return "network";
    if (buildMismatch) return "network-first";
    return ageMs <= fresh ? "stale" : "network-first";
  }

  /** Is this answer worth storing? kind: "api" | "page" | "media" | "static". `cc` = Cache-Control header of the answer. */
  function cacheableAnswer(kind, status, type, redirected, cc, contentType, length) {
    if (status !== 200 || redirected || type === "opaque" || type === "opaqueredirect" || type === "error") return false;
    cc = (cc || "").toLowerCase();
    // an API answer that says no-store is a route that opted out (unread counters, reminders ...): honoured. Pages are no-store by
    // Next's own default for dynamic rendering, so for pages only `private` user data is handled by the purge, not by this flag.
    if ((kind === "api" || kind === "media" || kind === "static") && /no-store/.test(cc)) return false;
    if (kind === "api" && !/json/i.test(contentType || "")) return false;
    if (kind === "page" && !/text\/html|x-component/i.test(contentType || "")) return false;
    var limit = MAX_BODY[kind] || MAX_BODY.api;
    if (length && Number(length) > limit) return false;
    return true;
  }

  /** The id inside a /api/auth/session answer: "" for a guest / an empty object / junk. */
  function uidFromSession(json) {
    try {
      var u = json && json.user;
      return u && typeof u.id === "string" ? u.id : "";
    } catch (e) {
      return "";
    }
  }

  /** What the marker says should happen when the page announces itself / a session answer arrives. */
  function identityChange(prevUid, nextUid) {
    var a = prevUid || "";
    var b = nextUid || "";
    return { changed: a !== b, toGuest: !!a && !b, toUser: !!b };
  }

  function offlineMessage(locale) {
    return OFFLINE_TEXT[locale] || OFFLINE_TEXT.ru;
  }

  /** Keys to delete (oldest first) so that at most `max` remain. keys come in insertion order. */
  function trimPlan(count, max) {
    return count > max ? count - max : 0;
  }

  return {
    VERSION: VERSION,
    CACHES: CACHES,
    USER_CACHES: USER_CACHES,
    SHARE_CACHE: SHARE_CACHE,
    KEEP: KEEP,
    MAX_AGE: MAX_AGE,
    MAX_ENTRIES: MAX_ENTRIES,
    NET_TIMEOUT: NET_TIMEOUT,
    META_URL: META_URL,
    PAGE_PREFIX: PAGE_PREFIX,
    RSC_PREFIX: RSC_PREFIX,
    stripLocale: stripLocale,
    localized: localized,
    assetKind: assetKind,
    pagePolicy: pagePolicy,
    homeTarget: homeTarget,
    pageFallbackPaths: pageFallbackPaths,
    normalizedSearch: normalizedSearch,
    cacheKey: cacheKey,
    apiPolicy: apiPolicy,
    isSessionPath: isSessionPath,
    isAuthChange: isAuthChange,
    isSignOut: isSignOut,
    storedAction: storedAction,
    cacheableAnswer: cacheableAnswer,
    uidFromSession: uidFromSession,
    identityChange: identityChange,
    offlineMessage: offlineMessage,
    trimPlan: trimPlan,
  };
});
