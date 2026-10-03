import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { isLocale, localizedPath, stripLocale, type Locale } from "@/lib/i18n/locale-url";

const LOCALE_COOKIE = "NEXT_LOCALE";
const YEAR = 60 * 60 * 24 * 365;

export default auth((req) => {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const stripped = stripLocale(req.nextUrl.pathname);
  const pathname = stripped.path;
  // The custom server runs middleware again on the rewritten path (/en/feed →
  // /feed); x-locale from the first pass marks it, otherwise the cookie
  // redirect sends it back to /en/feed forever.
  const rewrittenLocale = req.headers.get("x-locale");
  const isSecondPass = !stripped.locale && isLocale(rewrittenLocale) && rewrittenLocale !== "ru";
  const urlLocale = stripped.locale;
  const user = req.auth?.user as any;
  const cookieLocale = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale: Locale = urlLocale ?? (isLocale(cookieLocale) ? cookieLocale : "ru");
  const toLogin = () => NextResponse.redirect(new URL(localizedPath(urlLocale ?? "ru", "/login"), req.url));

  // Someone who picked English/Chinese lands on the prefixed URL, so every
  // language has its own indexable address. Crawlers carry no cookie and get
  // Russian at the root. The admin panel is Russian-only.
  if (
    !isApi &&
    !urlLocale &&
    !isSecondPass &&
    req.method === "GET" &&
    locale !== "ru" &&
    !pathname.startsWith("/admin")
  ) {
    const url = req.nextUrl.clone();
    url.pathname = localizedPath(locale, pathname);
    return NextResponse.redirect(url);
  }

  // Admin routes require ADMIN role
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return toLogin();
    }
  }

  // Protected page routes that require APPROVED status (auth required)
  // Feed, idea detail pages, and instrument pages are PUBLIC (readable without login)
  // Chat, messages pages handle auth themselves (show popup instead of redirect)
  const protectedPages = ["/ideas/new", "/subscriptions", "/profile", "/payments"];
  const isProtectedPage = protectedPages.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isProtectedPage) {
    if (!user) {
      return toLogin();
    }
    if (user.status !== "APPROVED") {
      return toLogin();
    }
  }

  // Protected API routes — only non-GET requests require auth
  const protectedApis = [
    "/api/ideas",
    "/api/payments",
    "/api/subscriptions",
    "/api/chat",
    "/api/users",
    "/api/messages",
    "/api/contacts",
    "/api/upload",
  ];
  const isProtectedApi = protectedApis.some((p) => pathname.startsWith(p));

  if (isProtectedApi && req.method !== "GET") {
    if (!user || user.status !== "APPROVED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  if (urlLocale) {
    const url = req.nextUrl.clone();
    url.pathname = pathname;
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-locale", urlLocale);
    const res = NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    if (cookieLocale !== urlLocale) {
      res.cookies.set(LOCALE_COOKIE, urlLocale, { path: "/", maxAge: YEAR, sameSite: "lax" });
    }
    return res;
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Every page (locale prefixes, auth redirects); files with an extension are skipped.
    "/((?!api|_next|.*\\..*).*)",
    "/api/admin/:path*",
    "/api/ideas/:path*",
    "/api/payments/:path*",
    "/api/subscriptions/:path*",
    "/api/chat/:path*",
    "/api/users/:path*",
    "/api/messages/:path*",
    "/api/contacts/:path*",
  ],
};
