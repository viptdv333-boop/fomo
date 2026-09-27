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

const WEEK = "public, max-age=604800, stale-while-revalidate=86400";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId(),
  },
  experimental: {
    // One 14 KB stylesheet blocked first paint for a whole round trip to Moscow.
    inlineCss: true,
  },
  async headers() {
    // Files in /public get max-age=0 by default; sw.js is left alone so app updates are never stuck.
    return ["/icons/:path*", "/images/:path*", "/logo-fomo-sm.webp", "/logo-fomo.png", "/icon-192.png", "/icon-512.png", "/logo-bimi.svg"].map(
      (source) => ({ source, headers: [{ key: "Cache-Control", value: WEEK }] })
    );
  },
};

export default withNextIntl(nextConfig);
