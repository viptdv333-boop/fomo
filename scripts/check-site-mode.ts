/* Site mode (main fomo.spot / terminal terminal.fomo.spot): mode parsing, the route allowlist, auth cookie names, public URL helpers,
   the event subset of the notification matrix, the terminal dock.
   Run: npx tsx scripts/check-site-mode.ts   (exit code 1 on a failed assertion) */
import {
  absoluteUrl,
  authCookieNames,
  authCookiePrefix,
  authCookiesSecure,
  brandName,
  closedRouteRedirect,
  parseSiteMode,
  routeAllowed,
  siteHost,
  siteMode,
  siteUrl,
} from "../src/lib/site-mode";
import { EVENTS, EVENT_GROUPS, eventsForSite, groupLabelKey, groupsForSite } from "../src/lib/notification-events";
import { MAIN_APP_TABS, TERMINAL_APP_TABS } from "../src/lib/app-ui";
import { safeLink } from "../src/lib/fcm";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const ENV_KEYS = ["SITE_MODE", "NEXT_PUBLIC_SITE_MODE", "NEXT_PUBLIC_SITE_URL", "NEXTAUTH_URL", "AUTH_COOKIE_PREFIX"] as const;
function withEnv(env: Partial<Record<(typeof ENV_KEYS)[number], string>>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, env);
  try {
    fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// --- mode ---------------------------------------------------------------------------------------------------------
eq("parse: terminal / Terminal / ' terminal '", [parseSiteMode("terminal"), parseSiteMode("Terminal"), parseSiteMode(" terminal ")], ["terminal", "terminal", "terminal"]);
eq("parse: nothing, empty, junk -> main", [parseSiteMode(undefined), parseSiteMode(""), parseSiteMode("main"), parseSiteMode("term")], ["main", "main", "main", "main"]);
withEnv({}, () => eq("default (nothing set) is main", siteMode(), "main"));
withEnv({ SITE_MODE: "terminal" }, () => eq("SITE_MODE=terminal (runtime) switches it on", siteMode(), "terminal"));
withEnv({ NEXT_PUBLIC_SITE_MODE: "terminal" }, () => eq("NEXT_PUBLIC_SITE_MODE=terminal (build) switches it on", siteMode(), "terminal"));

// --- URLs ---------------------------------------------------------------------------------------------------------
withEnv({}, () => {
  eq("main: siteUrl is https://fomo.spot", siteUrl(), "https://fomo.spot");
  eq("main: absoluteUrl('/feed')", absoluteUrl("/feed"), "https://fomo.spot/feed");
  eq("main: absoluteUrl('/') has no trailing slash", absoluteUrl("/"), "https://fomo.spot");
  eq("main: host / brand", [siteHost(), brandName()], ["fomo.spot", "FOMO"]);
  eq("main: absolute input is returned as is", absoluteUrl("https://x.test/a"), "https://x.test/a");
});
withEnv({ NEXTAUTH_URL: "https://www.fomo.spot" }, () => eq("main: NEXTAUTH_URL is ignored (SEO and links stay on fomo.spot)", siteUrl(), "https://fomo.spot"));
withEnv({ NEXT_PUBLIC_SITE_URL: "https://staging.example.com/" }, () => eq("NEXT_PUBLIC_SITE_URL wins, trailing slash trimmed", siteUrl(), "https://staging.example.com"));
withEnv({ SITE_MODE: "terminal" }, () => {
  eq("terminal: default URL", siteUrl(), "https://terminal.fomo.spot");
  eq("terminal: host / brand", [siteHost(), brandName()], ["terminal.fomo.spot", "FOMO Terminal"]);
  eq("terminal: absoluteUrl('/terminal')", absoluteUrl("/terminal"), "https://terminal.fomo.spot/terminal");
});
withEnv({ SITE_MODE: "terminal", NEXTAUTH_URL: "http://localhost:3010" }, () => eq("terminal: falls back to NEXTAUTH_URL", siteUrl(), "http://localhost:3010"));
withEnv({ SITE_MODE: "terminal", NEXT_PUBLIC_SITE_URL: "https://terminal.fomo.spot", NEXTAUTH_URL: "http://localhost:3010" }, () =>
  eq("terminal: NEXT_PUBLIC_SITE_URL beats NEXTAUTH_URL", siteUrl(), "https://terminal.fomo.spot"),
);
withEnv({ SITE_MODE: "terminal" }, () => {
  eq("fcm.safeLink (terminal): own host reduced to a path", safeLink("https://terminal.fomo.spot/calendar?x=1"), "/calendar?x=1");
  eq("fcm.safeLink (terminal): the OTHER site's host is dropped", safeLink("https://fomo.spot/feed"), "");
  eq("fcm.safeLink (terminal): path and junk", [safeLink("/terminal"), safeLink("//evil.test"), safeLink("javascript:alert(1)")], ["/terminal", "", ""]);
});
withEnv({}, () => {
  eq("fcm.safeLink (main): keeps fomo.spot and www., drops the terminal host", [safeLink("https://fomo.spot/ideas/1"), safeLink("https://www.fomo.spot/"), safeLink("https://terminal.fomo.spot/x")], ["/ideas/1", "/", ""]);
});

// --- route allowlist ----------------------------------------------------------------------------------------------
const PAGES_OPEN = ["/", "/login", "/register", "/forgot-password", "/terminal", "/terminal/features", "/calendar", "/calendar/x", "/profile", "/privacy", "/terms", "/admin", "/admin/users", "/admin/broadcast", "/admin/site-settings", "/terminal/"];
const PAGES_CLOSED = [
  "/feed", "/feed/btc", "/ideas/5", "/ideas/new", "/chat", "/chat/sber", "/messages", "/channels", "/channels/create", "/authors", "/authors/x", "/calculator",
  "/payments", "/subscriptions", "/rooms/1", "/rooms/join/abc", "/instruments", "/instruments/btc", "/profile/u1", "/help", "/share", "/share-target", "/design-preview",
  "/dev-notifications", "/clip-test", "/admin/ideas", "/admin/chat", "/admin/users/1", "/terminalx", "/calendarx", "/profilex", "/..%2Ffeed",
];
const API_OPEN = [
  "/api/auth/session", "/api/auth/csrf", "/api/auth/register", "/api/auth/send-code", "/api/auth/reset-password", "/api/auth/change-password", "/api/terminal/alerts", "/api/terminal/userdata", "/api/terminal/watchlist",
  "/api/terminal/alerts/abc", "/api/calendar/reminders", "/api/economic-calendar", "/api/klines", "/api/quote", "/api/quotes", "/api/market-search", "/api/contracts", "/api/orderbook", "/api/orderflow",
  "/api/algopack/status", "/api/news", "/api/notifications", "/api/notifications/unread-by-type", "/api/notification-settings", "/api/notification-settings/channels/email/start", "/api/notification-settings/webhooks/telegram",
  "/api/push/subscribe", "/api/push/fcm", "/api/push/beacon", "/api/telegram/account", "/api/me/locale", "/api/languages", "/api/site-settings", "/api/version", "/api/upload", "/api/upload/favicon",
  "/api/users", "/api/users/u1", "/api/admin/stats", "/api/admin/broadcast", "/api/admin/broadcast/users", "/api/admin/site-settings", "/api/captcha", "/api/socketio",
];
const API_CLOSED = [
  "/api/ideas", "/api/ideas/1/comments", "/api/chat/messages", "/api/messages/conversations", "/api/channels", "/api/authors", "/api/payments", "/api/subscriptions", "/api/yukassa/webhook", "/api/rooms",
  "/api/users/u1/finances", "/api/users/u1/tariffs", "/api/users/u1/follow", "/api/users/online", "/api/users/by-fomo-id/x", "/api/instruments", "/api/instruments/search", "/api/assets", "/api/categories",
  "/api/exchanges", "/api/watchlist", "/api/feed/mutes", "/api/bot/ideas", "/api/contacts", "/api/stats/public", "/api/admin/chat", "/api/admin/ideas/moderate", "/api/admin/languages", "/api/admin/rating",
  "/api/sandbox/account", "/api/reports", "/api/payment-methods", "/api/futures/spec", "/api/fmp-stats", "/api/crypto-stats", "/api/unknown-new-route", "/api", "/api/", "/api/../ideas",
];
eq("pages: every example is open on the terminal site", PAGES_OPEN.filter((p) => !routeAllowed("terminal", p, false)), []);
eq("pages: every example is closed on the terminal site", PAGES_CLOSED.filter((p) => routeAllowed("terminal", p, false)), []);
eq("api: every example is open on the terminal site", API_OPEN.filter((p) => !routeAllowed("terminal", p, true)), []);
eq("api: every example is closed on the terminal site", API_CLOSED.filter((p) => routeAllowed("terminal", p, true)), []);
eq("api: the path alone decides (isApi flag false, /api prefix)", [routeAllowed("terminal", "/api/ideas", false), routeAllowed("terminal", "/api/klines", false)], [false, true]);
eq("main site: everything is allowed", [...PAGES_CLOSED, ...API_CLOSED, "/feed"].filter((p) => !routeAllowed("main", p, p.startsWith("/api"))), []);
eq("query strings and trailing slashes are ignored", [routeAllowed("terminal", "/terminal?x=1", false), routeAllowed("terminal", "/feed?x=1", false), routeAllowed("terminal", "/calendar/", false)], [true, false, true]);
eq("closed pages go to the terminal, closed admin sections to /admin", [closedRouteRedirect("/feed"), closedRouteRedirect("/admin/ideas"), closedRouteRedirect("/chat")], ["/terminal", "/admin", "/terminal"]);

// --- auth cookies -------------------------------------------------------------------------------------------------
eq("cookies: main site keeps the next-auth defaults (null = no override)", authCookieNames("main", true, {}), null);
eq("cookies: https terminal names", authCookieNames("terminal", true, {}), {
  sessionToken: "__Secure-terminal.session-token",
  callbackUrl: "__Secure-terminal.callback-url",
  csrfToken: "__Host-terminal.csrf-token",
  pkceCodeVerifier: "__Secure-terminal.pkce.code_verifier",
  state: "__Secure-terminal.state",
  nonce: "__Secure-terminal.nonce",
  secure: true,
});
eq("cookies: http (local development) terminal names have no prefixes", authCookieNames("terminal", false, {})?.sessionToken, "terminal.session-token");
eq("cookies: names never contain the main site's 'authjs'", Object.values(authCookieNames("terminal", true, {})!).filter((v) => typeof v === "string" && /authjs/.test(v)), []);
eq("cookies: AUTH_COOKIE_PREFIX override (sanitised)", [authCookiePrefix("terminal", { AUTH_COOKIE_PREFIX: "my site!" }), authCookiePrefix("main", { AUTH_COOKIE_PREFIX: "x1" }), authCookiePrefix("main", {})], ["mysite", "x1", ""]);
eq("cookies: a prefix on the main site is possible too", authCookieNames("main", true, { AUTH_COOKIE_PREFIX: "x1" })?.sessionToken, "__Secure-x1.session-token");
eq("cookies: secure follows the public https URL", [authCookiesSecure({ NEXTAUTH_URL: "https://terminal.fomo.spot" }), authCookiesSecure({ NEXTAUTH_URL: "http://localhost:3010" }), authCookiesSecure({})], [true, false, false]);

// --- notification matrix ------------------------------------------------------------------------------------------
eq("events: main shows all of them (the same arrays)", [eventsForSite("main") === EVENTS, groupsForSite("main") === EVENT_GROUPS], [true, true]);
eq("events: terminal shows terminal + calendar + system only", eventsForSite("terminal").map((e) => e.id), ["system", "price_alert", "line_alert", "calendar_reminder"]);
eq("events: terminal groups", groupsForSite("terminal"), ["money", "terminal"]);
eq("events: the money group is called «Система» on the terminal site only", [groupLabelKey("money", "terminal"), groupLabelKey("money", "main"), groupLabelKey("terminal", "terminal")], ["ns.group.system", "ns.group.money", "ns.group.terminal"]);

// --- dock ---------------------------------------------------------------------------------------------------------
eq("dock: main has 8 tabs", MAIN_APP_TABS.map((t) => t.id), ["feed", "terminal", "chat", "calendar", "channels", "authors", "me", "settings"]);
eq("dock: terminal has 4 tabs", TERMINAL_APP_TABS.map((t) => t.id), ["terminal", "calendar", "me", "settings"]);
eq("dock: the terminal dock has no board, chat or channels", TERMINAL_APP_TABS.some((t) => t.href === "/feed" || t.href === "/chat" || t.href === "/channels"), false);

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
