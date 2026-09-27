import type { Metadata } from "next";
import { privateMetadata } from "@/lib/i18n/seo-metadata";

// Own-account pages. Public author pages live under /authors/{fomoId} and are
// the ones that belong in the index. See the note in src/app/robots.txt/route.ts
// on why these are noindex rather than robots.txt-blocked.
export function generateMetadata(): Promise<Metadata> {
  return privateMetadata("profile", "/profile");
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children;
}
