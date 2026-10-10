import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";

// Localized title/description/keywords + canonical and hreflang for /calculator,
// /en/calculator and /zh/calculator (copy lives in src/lib/i18n/dict/seo.ts).
// terminal.fomo.spot: the calculator sits behind the login (a tool of the terminal), so it is not indexed there.
export async function generateMetadata(): Promise<Metadata> {
  const meta = await sectionMetadata("calculator", "/calculator");
  return isTerminalSite() ? { title: meta.title, robots: { index: false, follow: false } } : meta;
}

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
