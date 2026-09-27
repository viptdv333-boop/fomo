import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /calculator,
// /en/calculator and /zh/calculator (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("calculator", "/calculator");
}

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
