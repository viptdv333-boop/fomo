import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /feed,
// /en/feed and /zh/feed (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("feed", "/feed");
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
