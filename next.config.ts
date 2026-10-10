import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { execFileSync } from "child_process";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Build identifier baked into the client bundle (NEXT_PUBLIC_BUILD_ID) and
// compared against /api/version, so an already-open app can tell that the
// server has been redeployed and offer a refresh. The deploy is
// `git pull && npm run build`, so HEAD's short hash is stable per release.
function buildId(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "dev";
  } catch {
    return "dev";
  }
}

const BUILD_ID = buildId();
const WEEK = "public, max-age=604800, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  // Deploys build into another folder (NEXT_DIST_DIR=.next-build) and swap it in afterwards: a
  // build into the live .next wipes the files the running server still serves, so open pages hit
  // chunk-load errors for the length of the build. The running server always uses ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  experimental: {
    // One 14 KB stylesheet blocked first paint for a whole round trip to Moscow.
    inlineCss: true,
    // Tab switches: Next's own client cache keeps a visited section's payload for 30 s (dynamic) / 3 min (static) instead of 0 / 5 min, so
    // flipping between two tabs does not refetch it every time. (The service worker adds the offline copy, see public/sw.js.)
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    // Files in /public get max-age=0 by default; sw.js is left alone so app updates are never stuck.
    const cached = ["/icons/:path*", "/icons-terminal/:path*", "/images/:path*", "/logo-fomo-sm.webp", "/logo-fomo.png", "/icon-192.png", "/icon-512.png", "/logo-bimi.svg"].map(
      (source) => ({ source, headers: [{ key: "Cache-Control", value: WEEK }] })
    );
    // Which release produced an answer: the service worker stamps its stored pages with it and compares it with the newest one it has seen,
    // so a copy rendered by an older release is never served as «instant» (public/sw.js, sw-cache-rules.js).
    return [...cached, { source: "/:path*", headers: [{ key: "X-Fomo-Build", value: BUILD_ID }] }];
  },
};

export default withNextIntl(nextConfig);
