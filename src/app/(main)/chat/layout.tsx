import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /chat,
// /en/chat and /zh/chat (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("chat", "/chat");
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
