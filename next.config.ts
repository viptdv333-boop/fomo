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

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId(),
  },
};

export default withNextIntl(nextConfig);
