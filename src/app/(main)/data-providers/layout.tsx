import type { Metadata } from "next";
import { privateMetadata } from "@/lib/i18n/seo-metadata";

// Own-account page (the user's market-data keys): noindex.
export function generateMetadata(): Promise<Metadata> {
  return privateMetadata("dataproviders", "/data-providers");
}

export default function DataProvidersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
