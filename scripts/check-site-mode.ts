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
  terminalNeedsLogin,
  siteHost,
  siteMode,
  siteUrl,
} from "../src/lib/site-mode";
import { EVENTS, EVENT_GROUPS, eventsForSite, groupLabelKey, groupsForSite } from "../src/lib/notification-events";
import { MAIN_APP_TABS, TERMINAL_APP_TABS } from "../src/lib/app-ui";
import { safeLink } from "../src/lib/fcm";
import { TERMINAL_ROBOTS_DISALLOW, TERMINAL_SITEMAP_ROUTES, terminalRobotsTxt, terminalVerification } from "../src/lib/terminal-seo";
import { FOMO_COMMUNITY_URL, TtlCache, boardUrl, cleanTicker, ideaUrl, normalizeIdeas, pickInstrumentId } from "../src/lib/fomo-ideas";
import { checkedAt, checkedLabel, tradingViewPlans } from "../src/lib/terminal-compare";
import { TERMINAL_FAQ_KEYS } from "../src/lib/terminal-faq";
import termsite from "../src/lib/i18n/dict/termsite";
import termlegal from "../src/lib/i18n/dict/termlegal";
import { TERMINAL_LEGAL_DATE, legalKeys, splitPlaceholders, terminalContactEmail } from "../src/lib/terminal-legal";
import { readFileSync } from "node:fs";

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
const PAGES_OPEN = ["/", "/login", "/register", "/forgot-password", "/terminal", "/profile", "/calculator", "/calculator/", "/privacy", "/terms", "/admin", "/admin/users", "/admin/broadcast", "/admin/site-settings", "/terminal/"];
const PAGES_CLOSED = [
  "/feed", "/feed/btc", "/ideas/5", "/ideas/new", "/chat", "/chat/sber", "/messages", "/channels", "/channels/create", "/authors", "/authors/x", "/calculatorx",
  "/payments", "/subscriptions", "/rooms/1", "/rooms/join/abc", "/instruments", "/instruments/btc", "/profile/u1", "/help", "/share", "/share-target", "/design-preview",
  "/dev-notifications", "/clip-test", "/admin/ideas", "/admin/chat", "/admin/users/1", "/terminalx", "/calendarx", "/terminal/features", "/calendar", "/calendar/x", "/profilex", "/..%2Ffeed",
];
const API_OPEN = [
  "/api/auth/session", "/api/auth/csrf", "/api/auth/register", "/api/auth/send-code", "/api/auth/reset-password", "/api/auth/change-password", "/api/terminal/alerts", "/api/terminal/userdata", "/api/terminal/watchlist",
  "/api/terminal/alerts/abc", "/api/calendar/reminders", "/api/economic-calendar", "/api/klines", "/api/quote", "/api/quotes", "/api/market-search", "/api/contracts", "/api/orderbook", "/api/orderflow",
  "/api/algopack/status", "/api/futures/spec", "/api/news", "/api/notifications", "/api/notifications/unread-by-type", "/api/notification-settings", "/api/notification-settings/channels/email/start", "/api/notification-settings/webhooks/telegram",
  "/api/push/subscribe", "/api/push/fcm", "/api/push/beacon", "/api/telegram/account", "/api/me/locale", "/api/fomo-ideas", "/api/languages", "/api/site-settings", "/api/version", "/api/upload", "/api/upload/favicon",
  "/api/users", "/api/users/u1", "/api/admin/stats", "/api/admin/broadcast", "/api/admin/broadcast/users", "/api/admin/site-settings", "/api/captcha", "/api/socketio",
];
const API_CLOSED = [
  "/api/ideas", "/api/ideas/1/comments", "/api/chat/messages", "/api/messages/conversations", "/api/channels", "/api/authors", "/api/payments", "/api/subscriptions", "/api/yukassa/webhook", "/api/rooms",
  "/api/users/u1/finances", "/api/users/u1/tariffs", "/api/users/u1/follow", "/api/users/online", "/api/users/by-fomo-id/x", "/api/instruments", "/api/instruments/search", "/api/assets", "/api/categories",
  "/api/exchanges", "/api/watchlist", "/api/feed/mutes", "/api/bot/ideas", "/api/contacts", "/api/stats/public", "/api/admin/chat", "/api/admin/ideas/moderate", "/api/admin/languages", "/api/admin/rating",
  "/api/notifications/unread-by-idea", "/api/notifications/unread-by-idea/", "/api/sandbox/account", "/api/reports", "/api/payment-methods", "/api/fmp-stats", "/api/crypto-stats", "/api/unknown-new-route", "/api", "/api/", "/api/../ideas",
];
eq("pages: every example is open on the terminal site", PAGES_OPEN.filter((p) => !routeAllowed("terminal", p, false)), []);
eq("pages: every example is closed on the terminal site", PAGES_CLOSED.filter((p) => routeAllowed("terminal", p, false)), []);
eq("api: every example is open on the terminal site", API_OPEN.filter((p) => !routeAllowed("terminal", p, true)), []);
eq("api: every example is closed on the terminal site", API_CLOSED.filter((p) => routeAllowed("terminal", p, true)), []);
eq("api: the path alone decides (isApi flag false, /api prefix)", [routeAllowed("terminal", "/api/ideas", false), routeAllowed("terminal", "/api/klines", false)], [false, true]);
eq("main site: everything is allowed", [...PAGES_CLOSED, ...API_CLOSED, "/feed"].filter((p) => !routeAllowed("main", p, p.startsWith("/api"))), []);
eq("query strings and trailing slashes are ignored", [routeAllowed("terminal", "/terminal?x=1", false), routeAllowed("terminal", "/feed?x=1", false), routeAllowed("terminal", "/terminal/", false)], [true, false, true]);
eq("closed pages go to the terminal, closed admin sections to /admin", [closedRouteRedirect("/feed"), closedRouteRedirect("/admin/ideas"), closedRouteRedirect("/chat")], ["/terminal", "/admin", "/terminal"]);
eq("the standalone /calendar redirects to the terminal with its calendar tab open", [closedRouteRedirect("/calendar"), closedRouteRedirect("/calendar/x"), routeAllowed("terminal", "/calendar", false)], ["/terminal?panel=calendar", "/terminal?panel=calendar", false]);
eq("main site keeps /calendar and /terminal/features", [routeAllowed("main", "/calendar", false), routeAllowed("main", "/terminal/features", false)], [true, true]);

// --- login gate of the terminal site (the middleware redirects a guest to /login?callbackUrl=...) ------------------------------
eq("gate: the terminal and its sub-pages need a login", ["/terminal", "/terminal/", "/terminal/anything", "/terminal?symbol=SBER", "/calendar", "/calendar/x"].filter((p) => !terminalNeedsLogin(p)), []);
eq("gate: the risk calculator needs a login like the terminal", ["/calculator", "/calculator/", "/calculator?ticker=Si"].filter((p) => !terminalNeedsLogin(p)), []);
eq("gate: the landing, legal pages and the sign-in screens stay public", ["/", "/privacy", "/terms", "/login", "/register", "/forgot-password", "/terminalx", "/calendarx"].filter((p) => terminalNeedsLogin(p)), []);

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
eq("dock: main has 8 tabs", MAIN_APP_TABS.map((t) => t.id), ["feed", "terminal", "chat", "calendar", "channels", "authors", "settings", "me"]);
eq("dock: terminal has 3 tabs (no calendar tab: the calendar is inside the terminal)", TERMINAL_APP_TABS.map((t) => t.id), ["terminal", "settings", "me"]);
eq("dock: the terminal dock has no /calendar", TERMINAL_APP_TABS.some((t) => t.href === "/calendar" || t.match.includes("/calendar")), false);
eq("dock: the terminal dock has no board, chat or channels", TERMINAL_APP_TABS.some((t) => t.href === "/feed" || t.href === "/chat" || t.href === "/channels"), false);

// --- terminal SEO: search-engine verification from the environment, comparison data, landing copy ---------------------------
eq("seo: no verification variables -> no tags", [terminalVerification({}), terminalVerification({ GOOGLE_SITE_VERIFICATION: " ", YANDEX_VERIFICATION: "" })], [undefined, undefined]);
eq("seo: google only", terminalVerification({ GOOGLE_SITE_VERIFICATION: "abc" }), { google: "abc" });
eq("seo: both, quotes and spaces trimmed", terminalVerification({ GOOGLE_SITE_VERIFICATION: " \"abc\" ", YANDEX_VERIFICATION: "1f2e" }), { google: "abc", yandex: "1f2e" });
eq("compare: checkedAt is an ISO date and the label is built from it", [/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(checkedAt), checkedLabel("ru", "2026-10-06"), checkedLabel("en", "2026-10-06"), checkedLabel("cn", "2026-10-06")], [true, "октябрь 2026", "October 2026", "2026年10月"]);
eq("compare: plans grow with the tier", tradingViewPlans.every((p, i, a) => i === 0 || (p.indicatorsPerChart > a[i - 1].indicatorsPerChart && p.chartsPerTab > a[i - 1].chartsPerTab && p.activePriceAlerts > a[i - 1].activePriceAlerts)), true);
const faqKeys = TERMINAL_FAQ_KEYS.flatMap((k) => [k.q, k.a]);
eq("landing copy: every FAQ key exists in ru, en and cn", ["ru", "en", "cn"].map((l) => faqKeys.filter((k) => !(termsite as any)[l][k]).length), [0, 0, 0]);
eq("landing copy: ru, en and cn have the same termsite keys", [Object.keys(termsite.en).sort().join() === Object.keys(termsite.ru).sort().join(), Object.keys(termsite.cn).sort().join() === Object.keys(termsite.ru).sort().join()], [true, true]);

// --- terminal SEO contents: sitemap, robots, copy -------------------------------------------------------------------------------
eq("sitemap (terminal): the landing and the legal pages only", TERMINAL_SITEMAP_ROUTES.map((r) => r.path), ["/", "/privacy", "/terms"]);
const robots = terminalRobotsTxt("https://terminal.fomo.spot");
const robotsLines = robots.split("\n");
eq(
  "robots (terminal): allows / and disallows the app, the account pages and the API (also under /en and /zh)",
  ["Allow: /", ...["/terminal", "/calendar", "/login", "/register", "/profile", "/admin", "/api", "/en/terminal", "/zh/calendar"].map((p) => `Disallow: ${p}`)].filter((l) => !robotsLines.includes(l)),
  [],
);
eq("robots (terminal): names the sitemap, the landing itself is not blocked", [robots.includes("Sitemap: https://terminal.fomo.spot/sitemap.xml"), robotsLines.includes("Disallow: /"), TERMINAL_ROBOTS_DISALLOW.includes("/privacy")], [true, false, false]);

const LANGS = ["ru", "en", "cn"] as const;
const copy = (l: (typeof LANGS)[number]) => (termsite as unknown as Record<string, Record<string, string>>)[l];
const FREE_RE = /бесплатн|\bfree\b|免费/i;
eq("copy: no free / бесплатно / 免费 anywhere in the terminal-site copy (ru, en, cn)", LANGS.flatMap((l) => Object.entries(copy(l)).filter(([, v]) => FREE_RE.test(v)).map(([k]) => `${l}:${k}`)), []);
eq(
  "copy: the dropped keys are gone (free strip, pill, comparison, no-registration link, calendar page meta, landing invitation)",
  LANGS.flatMap((l) => Object.keys(copy(l)).filter((k) => /^termsite\.(free\.|hero\.free|cmp\.|try$|seo\.calendar|invite\.)/.test(k))),
  [],
);
const NO_LOGIN_RE = /без регистрации|без входа|демо|(^|\D)5 минут|without signing|demo|no sign|无需注册|演示|(^|\D)5 分钟/i;
eq("copy: nothing says the terminal opens without registration / has a demo", LANGS.flatMap((l) => Object.entries(copy(l)).filter(([, v]) => NO_LOGIN_RE.test(v)).map(([k]) => `${l}:${k}`)), []);
const nymexKeys = ["termsite.description", "termsite.keywords", "termsite.welcome", "termsite.c1.d", "termsite.faq.a2", "termsite.faq.a4", "termsite.org.description", "termsite.seo.terminal.description"];
eq("copy: NYMEX is named in description / keywords / hero / «Что внутри» / FAQ / org in ru, en and cn", LANGS.flatMap((l) => nymexKeys.filter((k) => !/NYMEX/.test(copy(l)[k])).map((k) => `${l}:${k}`)), []);
eq(
  "copy: the FAQ answer about delay does not promise real time for the world futures",
  LANGS.filter((l) => /real[- ]time is guaranteed|гарантирует(ся)? реальное время(?!\s*не)/i.test(copy(l)["termsite.faq.a4"])),
  [],
);
const cardKeys = ["termsite.community", "termsite.community.sub", "termsite.ideas.title", "termsite.ideas.empty", "termsite.ideas.open", "termsite.ideas.all"];
eq("copy: the community card / «Идеи FOMO» texts exist in every language", LANGS.flatMap((l) => cardKeys.filter((k) => !copy(l)[k]).map((k) => `${l}:${k}`)), []);

// --- «Идеи FOMO»: the server proxy to fomo.spot, pure parts ---------------------------------------------------------------------
eq(
  "ideas: ticker validation (^[A-Za-z0-9._-]{1,20}$)",
  [cleanTicker("SBER"), cleanTicker(" BR-12.3_x "), cleanTicker(""), cleanTicker("a b"), cleanTicker("../x"), cleanTicker("x".repeat(21)), cleanTicker("S&B"), cleanTicker(5)],
  ["SBER", "BR-12.3_x", null, null, null, null, null, null],
);
eq("ideas: idea url scheme of the main site", ideaUrl("abc123"), "https://fomo.spot/ideas/abc123");
eq(
  "ideas: board link carries the instrument and utm",
  [boardUrl("id1"), boardUrl(null), boardUrl("bad id!")],
  ["https://fomo.spot/feed?instrumentId=id1&utm_source=terminal&utm_medium=ideas", "https://fomo.spot/feed?utm_source=terminal&utm_medium=ideas", "https://fomo.spot/feed?utm_source=terminal&utm_medium=ideas"],
);
eq("ideas: community link is fomo.spot with utm", FOMO_COMMUNITY_URL, "https://fomo.spot/?utm_source=terminal&utm_medium=app");
const raw = {
  data: [
    { id: "i1", title: "  Нефть\n Brent: прогноз ", voteScore: 7, createdAt: "2026-10-05T04:11:50.472Z", author: { displayName: "Михаил" } },
    { id: "../evil", title: "bad id" },
    { id: "i2", title: "", voteScore: 1 },
    { id: "i3", title: "x".repeat(300), voteScore: "9", author: null },
  ],
  total: 19,
};
const norm = normalizeIdeas(raw, 5);
eq(
  "ideas: normalised answer (ids checked, empty titles dropped, titles cut, likes numeric)",
  [norm.count, norm.ideas.map((i) => [i.id, i.title.length <= 140, i.author, i.likes, i.url])],
  [19, [["i1", true, "Михаил", 7, "https://fomo.spot/ideas/i1"], ["i3", true, "", 0, "https://fomo.spot/ideas/i3"]]],
);
eq("ideas: the title is whitespace-normalised", norm.ideas[0].title, "Нефть Brent: прогноз");
eq("ideas: junk answers give no ideas and never throw", [normalizeIdeas(null), normalizeIdeas("x"), normalizeIdeas({ data: "no" }), normalizeIdeas({ data: [null, 5] })], [{ count: 0, ideas: [] }, { count: 0, ideas: [] }, { count: 0, ideas: [] }, { count: 0, ideas: [] }]);
eq("ideas: the limit is respected", normalizeIdeas({ data: Array.from({ length: 9 }, (_, i) => ({ id: `a${i}`, title: "t" })), total: 9 }, 5).ideas.length, 5);
eq(
  "ideas: board instrument = exact ticker, first spelling that has one",
  [pickInstrumentId(["SBER"], [[{ id: "x1", ticker: "SBERP" }, { id: "x2", ticker: "sber" }]]), pickInstrumentId(["BZUSD", "BR"], [[], [{ id: "br1", ticker: "BR" }]]), pickInstrumentId(["ZZZ"], [[{ id: "y", ticker: "ZZ" }]]), pickInstrumentId(["A"], [null])],
  ["x2", "br1", null, null],
);
const ttl = new TtlCache<number>(2);
ttl.set("a", 1, 1000, 0);
ttl.set("b", 2, 1000, 0);
ttl.set("c", 3, 1000, 0);
eq("ideas: the cache keeps entries until the ttl and caps its size (oldest first)", [ttl.get("a", 10), ttl.get("b", 10), ttl.get("c", 10), ttl.get("c", 1000), ttl.size], [undefined, 2, 3, undefined, 1]);

// --- terminal legal pages (/privacy, /terms): own texts about the terminal product ------------------------------------------------
const legal = (l: (typeof LANGS)[number]) => (termlegal as unknown as Record<string, Record<string, string>>)[l];
const usedLegal = [...legalKeys("privacy"), ...legalKeys("terms")];
eq("legal: every key of both pages exists (non-empty) in ru, en and cn", LANGS.flatMap((l) => usedLegal.filter((k) => !legal(l)[k]).map((k) => `${l}:${k}`)), []);
const extraLegal = ["termlegal.note", "termlegal.cookie.text", "termlegal.register.disclaimer"];
eq(
  "legal: no stray keys (every termlegal key is used by a page or is the note / cookie notice / register disclaimer)",
  LANGS.flatMap((l) => Object.keys(legal(l)).filter((k) => !usedLegal.includes(k) && !extraLegal.includes(k)).map((k) => `${l}:${k}`)),
  [],
);
eq("legal: the extra keys exist in every language (the note is empty in ru only)", LANGS.flatMap((l) => extraLegal.filter((k) => (l === "ru" && k === "termlegal.note" ? false : !legal(l)[k])).map((k) => `${l}:${k}`)), []);
// the old fomo.spot texts are about ideas, channels, paid access and settlements between users of a social platform ("subscription" of a browser for web push is fine)
const SOCIAL_RE = /идей|ideas|платн|paid|канал|channel|платформ|platform|между пользовател|between users|用户之间|付费|频道|平台|想法/i;
eq("legal: no fomo.spot ideas / channels / paid subscriptions / platform wording in the terminal legal texts (ru, en, cn)", LANGS.flatMap((l) => Object.entries(legal(l)).filter(([, v]) => SOCIAL_RE.test(v)).map(([k]) => `${l}:${k}`)), []);
eq("legal: no free / бесплатно / 免费 and no e-mail address (real or invented) in the terminal legal texts", LANGS.flatMap((l) => Object.entries(legal(l)).filter(([, v]) => FREE_RE.test(v) || /@/.test(v)).map(([k]) => `${l}:${k}`)), []);
eq(
  "legal: both pages are dated 06.10.2026 (ru dd.mm.yyyy; en / cn also carry it)",
  [TERMINAL_LEGAL_DATE, ...LANGS.flatMap((l) => ["privacy", "terms"].map((p) => legal(l)[`termlegal.${p}.effective`].includes("06.10.2026")))],
  ["06.10.2026", true, true, true, true, true, true],
);
eq(
  "legal: the risk box says «не является инвестиционной рекомендацией» in every language",
  [/Не является инвестиционной рекомендацией/.test(legal("ru")["termlegal.terms.box.title"]), /Not investment advice/.test(legal("en")["termlegal.terms.box.title"]), /不构成投资建议/.test(legal("cn")["termlegal.terms.box.title"])],
  [true, true, true],
);
eq(
  "legal: terms name NYMEX / CBOT and the 15 minutes delay; privacy names Resend, Firebase, Timeweb, age 18 and 152-FZ (ru, en, cn)",
  LANGS.flatMap((l) => {
    const join = (prefix: string) => Object.entries(legal(l)).filter(([k]) => k.startsWith(prefix)).map(([, v]) => v).join(" ");
    const terms = join("termlegal.terms.");
    const priv = join("termlegal.privacy.");
    return [/NYMEX/.test(terms) && /CBOT/.test(terms) && /15/.test(terms), /Resend/.test(priv) && /Firebase/.test(priv) && /Timeweb/.test(priv) && /18/.test(priv) && /152/.test(priv)].map((ok, i) => (ok ? "" : `${l}:${i}`));
  }).filter(Boolean),
  [],
);
eq(
  "legal: placeholders {email} / {url} of the contact paragraphs and {privacy} of terms s1.p1 are the same in ru, en, cn",
  LANGS.map((l) =>
    ["termlegal.privacy.s13.email", "termlegal.privacy.s13.form", "termlegal.terms.s13.email", "termlegal.terms.s13.form", "termlegal.terms.s1.p1"].map((k) =>
      splitPlaceholders(legal(l)[k], ["email", "url", "privacy"]).filter((x) => typeof x !== "string").map((x) => (x as { name: string }).name).join(","),
    ),
  ),
  [0, 1, 2].map(() => ["email", "url", "email", "url", "privacy"]),
);
eq(
  "legal: TERMINAL_CONTACT_EMAIL is read from the environment and validated; unset or junk = null (the page then points to the feedback form)",
  [
    terminalContactEmail({}),
    terminalContactEmail({ TERMINAL_CONTACT_EMAIL: "  " }),
    terminalContactEmail({ TERMINAL_CONTACT_EMAIL: "hello@neurotrader.dev" }),
    terminalContactEmail({ TERMINAL_CONTACT_EMAIL: '"help@fomo.spot"' }),
    terminalContactEmail({ TERMINAL_CONTACT_EMAIL: "not an email" }),
    terminalContactEmail({ TERMINAL_CONTACT_EMAIL: "a@b" }),
  ],
  [null, null, "hello@neurotrader.dev", "help@fomo.spot", null, null],
);
eq("legal: placeholders split the text around the links", splitPlaceholders("a {email} b {url}", ["email", "url"]), ["a ", { name: "email" }, " b ", { name: "url" }]);
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
eq(
  "legal: the privacy and terms pages hand over to the terminal texts only in terminal mode (metadata and body); the old fomo.spot keys stay in place",
  ["privacy", "terms"].map((p) => {
    const t = src(`src/app/(main)/${p}/page.tsx`);
    return [/if \(isTerminalSite\(\)\) return terminalLegalMetadata\(/.test(t), /if \(isTerminalSite\(\)\) return Terminal\w+Page\(\)/.test(t), t.includes(`seo.${p}.title`), t.includes(`${p}.s1.h`)];
  }),
  [[true, true, true, true], [true, true, true, true]],
);
eq(
  "legal: the terminal landing footer carries the risk line linking to /terms, in ru, en and cn",
  [/href="\/terms"[\s\S]{0,200}termsite\.footer\.risk/.test(src("src/components/landing/TerminalLanding.tsx")), ...LANGS.map((l) => /инвестиционной рекомендацией|Not investment advice|不构成投资建议/.test(copy(l)["termsite.footer.risk"] ?? ""))],
  [true, true, true, true],
);
const registerSrc = src("src/app/(auth)/register/page.tsx");
eq(
  "legal: the register page links /terms and /privacy; its disclaimer and the cookie notice switch to the terminal wording in terminal mode only",
  [
    /href="\/terms"/.test(registerSrc),
    /href="\/privacy"/.test(registerSrc),
    /isTerminalSite\(\) \? "termlegal\.register\.disclaimer" : "auth\.termsDisclaimer"/.test(registerSrc),
    /isTerminalSite\(\) \? "termlegal\.cookie\.text" : "common\.cookie\.text"/.test(src("src/components/CookieBanner.tsx")),
  ],
  [true, true, true, true],
);
eq(
  "legal: the policy says «no analytics trackers»: the layout renders Yandex.Metrika and Google Analytics outside the terminal mode only",
  [/!TERMINAL && <YandexMetrika \/>/.test(src("src/app/layout.tsx")), /!TERMINAL && <GoogleAnalytics \/>/.test(src("src/app/layout.tsx"))],
  [true, true],
);

if (fails) {
  console.log(`\n${fails} FAILED`);
  process.exit(1);
}
console.log("\nall ok");
