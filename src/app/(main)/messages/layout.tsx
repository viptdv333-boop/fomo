import type { Metadata } from "next";
import { privateMetadata } from "@/lib/i18n/seo-metadata";

// Auth-gated area with no search value. Google crawled /messages logged out,
// saw the same shell as every other route and filed it as "duplicate, canonical
// not selected" — noindex is what drops it from the report for good.
export function generateMetadata(): Promise<Metadata> {
  return privateMetadata("messages", "/messages");
}

export default function MessagesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
