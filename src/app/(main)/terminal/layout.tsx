import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPageHidden } from "@/lib/hidden-pages";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /terminal,
// /en/terminal and /zh/terminal (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("terminal", "/terminal");
}

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  // Switched off in Admin → Site settings: the page is closed, so nothing polls quotes for it.
  if (await isPageHidden("terminal")) {
    const session = await auth();
    if (!session?.user || !isAdmin(session.user)) notFound();
  }
  return <>{children}</>;
}
