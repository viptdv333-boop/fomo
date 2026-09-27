import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /authors,
// /en/authors and /zh/authors (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("authors", "/authors");
}

export default function AuthorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
