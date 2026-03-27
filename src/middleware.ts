import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user as any;

  // Admin routes require ADMIN role
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    if (!user || (user.role !== "ADMIN" && user.role !== "OWNER")) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Protected page routes that require APPROVED status (auth required)
  // Feed, idea detail pages, and instrument pages are PUBLIC (readable without login)
  // Chat, messages pages handle auth themselves (show popup instead of redirect)
  const protectedPages = ["/ideas/new", "/subscriptions", "/profile", "/payments"];
  const isProtectedPage = protectedPages.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (isProtectedPage) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (user.status !== "APPROVED") {
      return NextResponse.redirect(new URL("/login", req.url));
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

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/ideas/new",
    "/chat/:path*",
    "/subscriptions/:path*",
    "/profile",
    "/profile/:path*",
    "/api/ideas/:path*",
    "/api/payments/:path*",
    "/api/subscriptions/:path*",
    "/api/chat/:path*",
    "/api/users/:path*",
    "/messages/:path*",
    "/payments/:path*",
    "/api/messages/:path*",
    "/api/contacts/:path*",
    "/api/upload/:path*",
  ],
};
