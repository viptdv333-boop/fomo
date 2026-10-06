import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPageHidden } from "@/lib/hidden-pages";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";
import { terminalPageMetadata } from "@/lib/terminal-seo";
import { getT } from "@/lib/i18n/server";
import { localizedPath } from "@/lib/i18n/locale-url";
import Link from "next/link";

// Localized title/description/keywords + canonical and hreflang for /terminal,
// /en/terminal and /zh/terminal (copy lives in src/lib/i18n/dict/seo.ts).
export function generateMetadata(): Promise<Metadata> {
  // terminal.fomo.spot: its own copy (termsite.seo.terminal.*), canonical, hreflang and OG image
  if (isTerminalSite()) return terminalPageMetadata("/terminal", "termsite.seo.terminal.title", "termsite.seo.terminal.description");
  return sectionMetadata("terminal", "/terminal");
}

export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  // Switched off in Admin → Site settings: the page is closed, so nothing polls quotes for it.
  if (await isPageHidden("terminal")) {
    const session = await auth();
    if (!session?.user || !isAdmin(session.user)) notFound();
  }
  const { locale, t } = await getT();
  return (
    <>
      {children}
      <nav className="sr-only" aria-label={t("tf.more")}>
        <p>{t("tf.lead")}</p>
        <Link href={localizedPath(locale, "/terminal/features")}>{t("tf.more")}</Link>
      </nav>
    </>
  );
}
