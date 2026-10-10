/* The service worker's cache POLICY (public/sw-cache-rules.js): what is cached, how long, under which key, what is never stored.
   Pure logic only (the worker's fetch handling itself is covered by the browser demonstration in the task notes).
   Run: npx tsx scripts/check-sw-cache.ts   (exit code 1 on a failed assertion) */
import { chunkUrlsFromHtml, chunkUrlsFromRuntime, runtimeUrl, storableResources } from "../src/lib/offline/assets";
import { warmupBlocker, warmupUrls, WARMUP_EVERY_MS } from "../src/lib/offline/warmup";

export {}; // a module: the other check scripts declare the same top-level names, and `next build` type-checks them all together
// eslint-disable-next-line @typescript-eslint/no-require-imports
const R = require("../public/sw-cache-rules.js") as any;

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

// --- static files
eq("_next/static -> static", R.assetKind("/_next/static/chunks/app/page-abc.js"), "static");
eq("fonts of next -> static", R.assetKind("/_next/static/media/inter.woff2"), "static");
eq("icons / images / landing -> static", [R.assetKind("/icons/a.png"), R.assetKind("/icons-terminal/a.png"), R.assetKind("/images/x.webp"), R.assetKind("/landing/hero.jpg")], ["static", "static", "static", "static"]);
eq("fixed logo -> static", [R.assetKind("/logo-fomo-sm.webp"), R.assetKind("/icon-192.png")], ["static", "static"]);
eq("uploads -> media (per-user cache)", [R.assetKind("/uploads/messages/a.png"), R.assetKind("/uploads")], ["media", "media"]);
eq("not an asset: pages, api, sw, the apk", [R.assetKind("/feed"), R.assetKind("/api/ideas"), R.assetKind("/sw.js"), R.assetKind("/app/dl/FOMO.apk"), R.assetKind("/uploadsx/a.png")], [null, null, null, null, null]);

// --- pages
eq("tab roots: cached, a day instant window", ["/feed", "/chat", "/channels", "/authors", "/calendar", "/terminal", "/profile", "/messages"].map((p) => R.pagePolicy(p)), Array(8).fill({ cache: true, fresh: DAY, root: true }));
eq("language prefix is ignored", [R.pagePolicy("/en/feed").root, R.pagePolicy("/zh/chat").root], [true, true]);
eq("trailing slash", R.pagePolicy("/feed/").root, true);
eq("content pages: short instant window", [R.pagePolicy("/ideas/abc"), R.pagePolicy("/authors/bob"), R.pagePolicy("/channels/xyz")], [{ cache: true, fresh: 2 * MIN, root: false }, { cache: true, fresh: 2 * MIN, root: false }, { cache: true, fresh: 2 * MIN, root: false }]);
eq("never stored: sign-in, admin, payments, invitations, downloads, forms", ["/login", "/register", "/forgot-password", "/admin", "/admin/users", "/payments", "/share-target", "/rooms/join/tok", "/app/dl/FOMO.apk", "/ideas/new", "/channels/create", "/channels/edit/5", "/en/login"].map((p) => R.pagePolicy(p).cache), Array(13).fill(false));
eq("the landing root is never stored (redirect for users)", R.pagePolicy("/").cache, false);
eq("a room page is a tab root (chat section)", R.pagePolicy("/rooms").root, true);
eq("home redirect: signed-in user, root -> feed", R.homeTarget("/", { uid: "u1", locale: "ru", home: "/feed" }), "/feed");
eq("home redirect keeps the language", [R.homeTarget("/en", { uid: "u1", locale: "en", home: "/feed" }), R.homeTarget("/", { uid: "u1", locale: "cn", home: "/terminal" })], ["/en/feed", "/zh/terminal"]);
eq("home redirect: guest / other path -> none", [R.homeTarget("/", { uid: "" }), R.homeTarget("/", null), R.homeTarget("/feed", { uid: "u1" })], [null, null, null]);
eq("offline stand-ins: with and without the prefix", [R.pageFallbackPaths("/feed", "en"), R.pageFallbackPaths("/en/feed", "ru")], [["/en/feed"], ["/feed"]]);

// --- keys
eq("volatile params dropped, rest sorted", R.normalizedSearch("?b=2&_rsc=x&a=1&t=99&peek=1"), "?a=1&b=2");
eq("no params", [R.normalizedSearch(""), R.normalizedSearch("?"), R.normalizedSearch("?_rsc=1")], ["", "", ""]);
eq("api key", R.cacheKey("https://x", "api", "/api/ideas", "?limit=50&page=1"), "https://x/api/ideas?limit=50&page=1");
eq("api key is order independent", R.cacheKey("https://x", "api", "/api/ideas", "?page=1&limit=50"), R.cacheKey("https://x", "api", "/api/ideas", "?limit=50&page=1"));
eq("a DM thread looked at with peek=1 shares the key of the real read", R.cacheKey("https://x", "api", "/api/messages/conversations/c1/messages", "?peek=1"), R.cacheKey("https://x", "api", "/api/messages/conversations/c1/messages", ""));
eq("page / rsc / rsc-prefetch never collide", new Set([R.cacheKey("https://x", "page", "/feed", ""), R.cacheKey("https://x", "rsc", "/feed", "?_rsc=1"), R.cacheKey("https://x", "rsc-prefetch", "/feed", "")]).size, 3);
eq("rsc key ignores _rsc", R.cacheKey("https://x", "rsc", "/feed", "?_rsc=abc"), R.cacheKey("https://x", "rsc", "/feed", "?_rsc=zzz"));

// --- api allowlist
const allowed = [
  "/api/ideas", "/api/ideas/abc", "/api/ideas/abc/comments", "/api/ideas/authors", "/api/categories", "/api/instruments", "/api/instruments/btc", "/api/instruments/btc/related",
  "/api/channels", "/api/channels/t1/chat", "/api/authors", "/api/users/u1", "/api/users/by-fomo-id/bob", "/api/users/u1/followers", "/api/subscriptions",
  "/api/chat/rooms", "/api/chat/messages", "/api/rooms", "/api/rooms/r1", "/api/messages/conversations", "/api/messages/conversations/c1/messages", "/api/contacts",
  "/api/notifications", "/api/economic-calendar", "/api/languages", "/api/site-settings", "/api/chat/favorites", "/api/chat/notify", "/api/assets",
];
eq("allowlisted reads are cacheable", allowed.filter((p) => !R.apiPolicy(p).cache), []);
const denied = [
  "/api/auth/session", "/api/auth/csrf", "/api/auth/signout", "/api/csrf", "/api/session",
  "/api/payments", "/api/payments/p1", "/api/yukassa/create", "/api/payment-methods", "/api/upload", "/api/upload/favicon", "/api/push/subscribe", "/api/push/beacon",
  "/api/admin/users", "/api/bot/ideas", "/api/version", "/api/socketio",
  "/api/klines", "/api/quote", "/api/quotes", "/api/orderbook", "/api/orderflow", "/api/market-search", "/api/futures/spec", "/api/contracts", "/api/algopack/x", "/api/sandbox/orders", "/api/terminal/alerts", "/api/fmp-stats", "/api/crypto-stats",
  "/api/users/u1/finances", "/api/users/u1/payment-links", "/api/users/u1/tariffs/t1/subscribers", "/api/users/online", "/api/users/dm-enabled",
  "/api/instruments/btc/moex", "/api/instruments/btc/contracts",
  "/api/chat/unread", "/api/chat/badge", "/api/chat/previews", "/api/notifications/unread-by-idea", "/api/notifications/unread-by-type",
  "/api/reports", "/api/me/locale", "/api/captcha", "/api/telegram/account", "/api/notification-settings",
  "/api/something/new", "/api/ideas/abc/vote", "/api/ideas/comments/reactions",
];
eq("denied or unknown reads are never cached", denied.filter((p) => R.apiPolicy(p).cache), []);
eq("live-ish lists have no instant window", ["/api/chat/messages", "/api/messages/conversations/c1/messages", "/api/notifications", "/api/ideas/abc/comments"].map((p) => R.apiPolicy(p).fresh), [0, 0, 0, 0]);
eq("slow-changing lists have one", [R.apiPolicy("/api/categories").fresh > 0, R.apiPolicy("/api/ideas").fresh > 0, R.apiPolicy("/api/languages").fresh >= DAY], [true, true, true]);

// --- sign-in / sign-out detection
eq("session path", [R.isSessionPath("/api/auth/session"), R.isSessionPath("/api/auth/csrf")], [true, false]);
eq("account changes", [R.isAuthChange("POST", "/api/auth/signout"), R.isAuthChange("POST", "/api/auth/callback/credentials"), R.isAuthChange("GET", "/api/auth/callback/google"), R.isAuthChange("GET", "/api/auth/session"), R.isAuthChange("GET", "/api/auth/signin"), R.isAuthChange("POST", "/api/auth/signin/credentials")], [true, true, true, false, false, true]);
eq("sign-out vs sign-in", [R.isSignOut("/api/auth/signout"), R.isSignOut("/api/auth/callback/credentials")], [true, false]);
eq("uid from a session answer", [R.uidFromSession({ user: { id: "u1", name: "x" } }), R.uidFromSession({}), R.uidFromSession(null), R.uidFromSession({ user: {} }), R.uidFromSession({ user: { id: 5 } })], ["u1", "", "", "", ""]);
eq("identity change", [R.identityChange("", "u1"), R.identityChange("u1", "u1"), R.identityChange("u1", "u2"), R.identityChange("u1", "")], [{ changed: true, toGuest: false, toUser: true }, { changed: false, toGuest: false, toUser: true }, { changed: true, toGuest: false, toUser: true }, { changed: true, toGuest: true, toUser: false }]);

// --- what is done with a stored copy
eq("no copy -> network", [R.storedAction(null, DAY, false), R.storedAction(undefined, DAY, false)], ["network", "network"]);
eq("young copy -> stale-while-revalidate", R.storedAction(10 * MIN, DAY, false), "stale");
eq("copy older than the instant window -> network first", R.storedAction(2 * DAY, DAY, false), "network-first");
eq("zero window -> always network first", R.storedAction(1000, 0, false), "network-first");
eq("another release rendered it -> network first even if young", R.storedAction(1000, DAY, true), "network-first");
eq("older than a week is never served", [R.storedAction(8 * DAY, 30 * DAY, false), R.storedAction(7 * DAY + 1, DAY, false)], ["network", "network"]);
eq("clock skew (negative age) is not trusted", R.storedAction(-5, DAY, false), "network");

// --- what is worth storing
const ok = (kind: string, status: number, type = "basic", redirected = false, cc = "", ct = "application/json", len = "") => R.cacheableAnswer(kind, status, type, redirected, cc, ct, len);
eq("json 200 is stored", ok("api", 200), true);
eq("errors / redirects / opaque are not", [ok("api", 404), ok("api", 500), ok("api", 200, "basic", true), ok("api", 200, "opaque"), ok("page", 307)], [false, false, false, false, false]);
eq("Cache-Control: no-store on an API answer is honoured", [ok("api", 200, "basic", false, "no-store"), ok("api", 200, "basic", false, "private, no-cache, no-store"), ok("api", 200, "basic", false, "public, s-maxage=60")], [false, false, true]);
eq("pages are no-store by Next's default for dynamic rendering: stored anyway (purged per user)", ok("page", 200, "basic", false, "private, no-cache, no-store, max-age=0, must-revalidate", "text/html; charset=utf-8"), true);
eq("an API answer that is not json is not stored", ok("api", 200, "basic", false, "", "text/html"), false);
eq("a page that is not html / flight is not stored", [ok("page", 200, "basic", false, "", "application/json"), ok("page", 200, "basic", false, "", "text/x-component")], [false, true]);
eq("size limits", [ok("api", 200, "basic", false, "", "application/json", "2000000"), ok("api", 200, "basic", false, "", "application/json", "100000"), ok("media", 200, "basic", false, "", "image/png", "9000000")], [false, true, false]);

// --- which build files the warm-up stores
const RUNTIME = 'r.u=e=>9829===e?"static/chunks/9829-26589a794b7c82f8.js":8381===e?"static/chunks/8381-c14609b81ad52df3.js":"static/chunks/"+(({1705:"1aed6ce5",9270:"02087626"})[e]||e)+"."+({1646:"a93085a0445ba909",1705:"3081fb2795007619",4920:"b1ada2e26b51c617",9270:"e076aecd50e558b2"})[e]+".js",r.miniCssF=e=>"static/css/"+({3582:"e4c19c25e77f3031",7252:"ccbd521fbdc6a504"})[e]+".css",r.g=function(){}';
eq("webpack runtime: spelled-out ids, the hashed map with renamed ids, the stylesheets", chunkUrlsFromRuntime(RUNTIME).sort(), [
  "/_next/static/chunks/1646.a93085a0445ba909.js",
  "/_next/static/chunks/1aed6ce5.3081fb2795007619.js",
  "/_next/static/chunks/02087626.e076aecd50e558b2.js",
  "/_next/static/chunks/4920.b1ada2e26b51c617.js",
  "/_next/static/chunks/8381-c14609b81ad52df3.js",
  "/_next/static/chunks/9829-26589a794b7c82f8.js",
  "/_next/static/css/ccbd521fbdc6a504.css",
  "/_next/static/css/e4c19c25e77f3031.css",
].sort());
const HTML = '<link rel="stylesheet" href="/_next/static/css/e4c19c25e77f3031.css"/><script src="/_next/static/chunks/webpack-057fd5dd37bf6c06.js" async></script><script>self.__next_f.push([1,"I[1,[\\"app/(main)/chat/page\\",\\"static/chunks/app/(main)/chat/page-aa11.js\\"],\\"default\\"]"])</script><img src="/images/x.webp">';
eq("html: script / link tags and the flight data's relative chunk names", chunkUrlsFromHtml(HTML).sort(), ["/_next/static/chunks/app/(main)/chat/page-aa11.js", "/_next/static/chunks/webpack-057fd5dd37bf6c06.js", "/_next/static/css/e4c19c25e77f3031.css"].sort());
eq("runtime url found among loaded resources", runtimeUrl(["http://x/_next/static/chunks/a.js", "http://x/_next/static/chunks/webpack-057fd5dd37bf6c06.js?dpl=1"]), "http://x/_next/static/chunks/webpack-057fd5dd37bf6c06.js?dpl=1");
eq("loaded resources worth storing", storableResources(["http://x/_next/static/chunks/a.js", "http://x/images/h.webp", "http://x/api/ideas", "http://y/_next/static/z.js", "http://x/logo-fomo-sm.webp"], "http://x"), ["/_next/static/chunks/a.js", "/images/h.webp", "/logo-fomo-sm.webp"]);

// --- the warm-up: when it may run, what it asks for
const base = { enabled: true, online: true, hidden: false, slow: false, last: 0, now: 10 * WARMUP_EVERY_MS, force: false };
eq("warm-up blockers", [warmupBlocker(base), warmupBlocker({ ...base, enabled: false }), warmupBlocker({ ...base, online: false }), warmupBlocker({ ...base, hidden: true }), warmupBlocker({ ...base, slow: true }), warmupBlocker({ ...base, last: base.now - 1000 }), warmupBlocker({ ...base, last: base.now - 1000, force: true }), warmupBlocker({ ...base, last: base.now - WARMUP_EVERY_MS - 1 })], ["", "off", "offline", "hidden", "slow", "recent", "", ""]);
eq("warm-up for a guest asks only public lists", warmupUrls("", "ru", "UTC", Date.UTC(2026, 9, 10)).filter((u) => /subscriptions|rooms|conversations|notifications|users\//.test(u)), []);
const signed = warmupUrls("u1", "en", "Europe/Moscow", Date.UTC(2026, 9, 10, 12));
eq("warm-up of a signed-in user: the feed's exact url first, own profile, DM list", [signed[0], signed.includes("/api/users/u1"), signed.includes("/api/messages/conversations"), signed.some((u) => /^\/api\/economic-calendar\?from=2026-10-09&to=2026-10-16&lang=en&limit=5000$/.test(u))], ["/api/ideas?limit=50&page=1", true, true, true]);
eq("warm-up never touches live market data or money", signed.filter((u) => /klines|quote|orderbook|payments|upload|\/api\/auth\//.test(u)), []);
eq("every warm-up url is a cacheable (allowlisted) read", signed.filter((u) => !R.apiPolicy(u.split("?")[0]).cache), []);

// --- misc
eq("offline message follows the language", [R.offlineMessage("ru"), R.offlineMessage("en"), R.offlineMessage("cn"), R.offlineMessage("xx")], ["Нет сети", "No connection", "无网络", "Нет сети"]);
eq("trim plan", [R.trimPlan(10, 100), R.trimPlan(105, 100), R.trimPlan(100, 100)], [0, 5, 0]);
eq("the share cache and all current caches survive the old-cache cleanup", R.KEEP.includes(R.SHARE_CACHE) && R.USER_CACHES.every((c: string) => R.KEEP.includes(c)), true);
eq("user caches do not include the static cache or the meta marker", [R.USER_CACHES.includes(R.CACHES.static), R.USER_CACHES.includes(R.CACHES.meta)], [false, false]);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
