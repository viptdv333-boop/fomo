import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /channels,
// /en/channels and /zh/channels (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("channels", "/channels");
}

export default function ChannelsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
