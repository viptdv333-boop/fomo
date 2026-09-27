import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /instruments,
// /en/instruments and /zh/instruments (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("instruments", "/instruments");
}

export default function InstrumentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
