import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /terminal,
// /en/terminal and /zh/terminal (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("terminal", "/terminal");
}

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
