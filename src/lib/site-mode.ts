// Site mode: the same codebase serves two sites.
//   main     (default, nothing set)  - https://fomo.spot, the social site: board of ideas, chat, channels, terminal ...
//   terminal (SITE_MODE=terminal)    - https://terminal.fomo.spot: a separate INSTANCE (own database, own users, own cookies)
//                                      with the terminal, the calendar, notifications and the profile only.
//
// Two variables, set to the same value on the terminal instance:
//   SITE_MODE=terminal               - runtime, read by the server (custom server, API routes, dispatcher, metadata)
//   NEXT_PUBLIC_SITE_MODE=terminal   - build time, inlined into the client bundle and the edge middleware
// Unset = "main": fomo.spot behaves exactly as before. Pure module (no Node, no React, no Next imports): it is used from the
// edge middleware, client components, the custom server and scripts/check-site-mode.ts.
// Check: npx tsx scripts/check-site-mode.ts

export type SiteMode = "main" | "terminal";

/** "terminal" only for the exact value (case-insensitive); anything else, including nothing, is "main". */
export function parseSiteMode(v: string | undefined | null): SiteMode {
  return (v ?? "").trim().toLowerCase() === "terminal" ? "terminal" : "main";
}

/**
 * The mode of this process. The literal `process.env.NEXT_PUBLIC_SITE_MODE` is replaced at build time (client, middleware,
 * server bundles); SITE_MODE is read at run time on the server only. Either one switches the mode on.
 */
export function siteMode(): SiteMode {
  return parseSiteMode(process.env.NEXT_PUBLIC_SITE_MODE) === "terminal" || parseSiteMode(process.env.SITE_MODE) === "terminal" ? "terminal" : "main";
}

export function isTerminalSite(): boolean {
  return siteMode() === "terminal";
}

const MAIN_URL = "https://fomo.spot";
const TERMINAL_URL = "https://terminal.fomo.spot";

function trimSlash(u: string): string {
  return u.replace(/\/+$/, "");
}

/**
 * Public origin of this site without a trailing slash.
 * NEXT_PUBLIC_SITE_URL wins. Without it: the terminal instance takes NEXTAUTH_URL (server only) and then
 * https://terminal.fomo.spot; the main site stays on https://fomo.spot (it never looked at NEXTAUTH_URL for links or SEO).
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit && explicit.trim()) return trimSlash(explicit.trim());
  if (isTerminalSite()) {
    const auth = process.env.NEXTAUTH_URL;
    return trimSlash(auth && auth.trim() ? auth.trim() : TERMINAL_URL);
  }
  return MAIN_URL;
}

/** "/terminal" -> "https://terminal.fomo.spot/terminal"; absolute URLs are returned as they are. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? siteUrl() : siteUrl() + p;
}

/** "terminal.fomo.spot" / "fomo.spot": the visible host of this site (footer links, "open fomo.spot" hints). */
export function siteHost(): string {
  try {
    return new URL(siteUrl()).host;
  } catch {
    return siteUrl().replace(/^https?:\/\//i, "");
  }
}

/** Product name in e-mails, titles and the app shell: "FOMO" or "FOMO Terminal". */
export function brandName(): string {
  return isTerminalSite() ? "FOMO Terminal" : "FOMO";
}

/** Where a signed-in visitor lands and where closed pages are redirected to. */
export function homePath(mode: SiteMode = siteMode()): string {
  return mode === "terminal" ? "/terminal" : "/feed";
}

// ---------------------------------------------------------------------------
// Authentication cookies
// ---------------------------------------------------------------------------

export interface AuthCookieConfig {
  /** names of the next-auth cookies, with the browser prefixes already applied */
  sessionToken: string;
  callbackUrl: string;
  csrfToken: string;
  pkceCodeVerifier: string;
  state: string;
  nonce: string;
  /** whether the cookies carry the Secure attribute and the __Secure- / __Host- prefixes */
  secure: boolean;
}

/** Cookie name prefix of the instance: AUTH_COOKIE_PREFIX, else "terminal" in terminal mode, else "" (next-auth defaults). */
export function authCookiePrefix(mode: SiteMode, env: Record<string, string | undefined> = process.env): string {
  const custom = (env.AUTH_COOKIE_PREFIX ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (custom) return custom;
  return mode === "terminal" ? "terminal" : "";
}

/**
 * Names of the session cookies of an instance, or null when the next-auth defaults ("authjs.session-token" ...) apply, which
 * is the main site: nothing changes there. A prefixed instance never reads or accepts another instance's cookie (the JWT salt
 * is the cookie name, the secret is AUTH_SECRET of the instance), and none of them carries a Domain attribute: host-only.
 *   https: __Secure-terminal.session-token, __Secure-terminal.callback-url, __Host-terminal.csrf-token ...
 *   http (local development): terminal.session-token ...
 */
export function authCookieNames(
  mode: SiteMode,
  secure: boolean,
  env: Record<string, string | undefined> = process.env,
): AuthCookieConfig | null {
  const prefix = authCookiePrefix(mode, env);
  if (!prefix) return null;
  const sec = secure ? "__Secure-" : "";
  const host = secure ? "__Host-" : "";
  return {
    sessionToken: `${sec}${prefix}.session-token`,
    callbackUrl: `${sec}${prefix}.callback-url`,
    csrfToken: `${host}${prefix}.csrf-token`,
    pkceCodeVerifier: `${sec}${prefix}.pkce.code_verifier`,
    state: `${sec}${prefix}.state`,
    nonce: `${sec}${prefix}.nonce`,
    secure,
  };
}

/** Do the session cookies of this instance carry the Secure flag? Decided by the public URL (https), like next-auth does by request. */
export function authCookiesSecure(env: Record<string, string | undefined> = process.env): boolean {
  const u = env.AUTH_URL || env.NEXTAUTH_URL || env.NEXT_PUBLIC_SITE_URL || "";
  return u.trim().toLowerCase().startsWith("https://");
}

// ---------------------------------------------------------------------------
// Route allowlist of the terminal instance
// ---------------------------------------------------------------------------

/** Pages (path without the language prefix) open on the terminal site. Everything else is closed by default. */
const TERMINAL_PAGES_EXACT = [
  "/",
  "/login",
  "/register",
  "/forgot-password",
  "/profile",
  "/privacy",
  "/terms",
  // the instance owner manages users here (ADMIN / OWNER only, the middleware checks the role); not linked from the navigation
  "/admin",
  "/admin/users",
  "/admin/broadcast",
  "/admin/site-settings",
];
const TERMINAL_PAGES_PREFIX = ["/terminal", "/calendar"];

/** API groups (first segment after /api) open on the terminal site. */
const TERMINAL_API_PREFIX = [
  "auth", // next-auth, register, send-code, reset-password, change-email, change-password
  "captcha",
  "terminal", // alerts, userdata, watchlist
  "calendar", // reminders
  "economic-calendar",
  "klines",
  "quote",
  "quotes",
  "market-search",
  "contracts",
  "orderbook",
  "orderflow",
  "algopack",
  "news",
  "notifications",
  "notification-settings", // channels, preferences, bot webhooks
  "push", // web push + FCM tokens
  "telegram", // own-bot flow of the notification settings
  "me", // /api/me/locale
  "languages",
  "site-settings",
  "version",
  "upload", // avatar, admin favicon
  "socketio", // price stream / bell
];
/** Admin API (needs ADMIN / OWNER, checked by the middleware and the routes) limited to what the instance owner needs. */
const TERMINAL_ADMIN_API = ["stats", "broadcast", "site-settings"];

function underPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + "/");
}

/**
 * Is `pathname` (WITHOUT the language prefix, no query) served in this mode? The main site serves everything. The terminal
 * site is an allowlist: a page or an API that is not listed here does not exist there (pages redirect to /terminal, APIs 404).
 */
export function routeAllowed(mode: SiteMode, pathname: string, isApi: boolean): boolean {
  if (mode !== "terminal") return true;
  let p = (pathname || "/").split(/[?#]/)[0];
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p.includes("..") || p.includes("\\")) return false;
  if (isApi || p === "/api" || p.startsWith("/api/")) {
    const rest = p.replace(/^\/api\/?/, "");
    const seg = rest.split("/").filter(Boolean);
    if (seg.length === 0) return false;
    if (seg[0] === "admin") return seg.length >= 2 && TERMINAL_ADMIN_API.includes(seg[1]);
    if (seg[0] === "users") {
      // the own profile (GET / PATCH /api/users/<id>) and the admin user list; no finances, tariffs, follows, education ...
      return seg.length <= 2 && seg[1] !== "online" && seg[1] !== "dm-enabled" && seg[1] !== "by-fomo-id";
    }
    return TERMINAL_API_PREFIX.includes(seg[0]);
  }
  if (TERMINAL_PAGES_EXACT.includes(p)) return true;
  return TERMINAL_PAGES_PREFIX.some((x) => underPrefix(p, x));
}

/** Where a closed page is sent: closed admin sections go back to /admin, everything else to the terminal. */
export function closedRouteRedirect(pathname: string): string {
  return underPrefix(pathname, "/admin") ? "/admin" : "/terminal";
}
