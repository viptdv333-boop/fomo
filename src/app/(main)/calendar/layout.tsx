import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";
import { terminalPageMetadata } from "@/lib/terminal-seo";

// Localized title/description/keywords + canonical and hreflang for /calendar, /en/calendar and /zh/calendar
// (copy lives in src/lib/i18n/dict/econcal.ts as seo.calendar.*).
export function generateMetadata(): Promise<Metadata> {
  // terminal.fomo.spot: its own copy (termsite.seo.calendar.*), canonical, hreflang and OG image
  if (isTerminalSite()) return terminalPageMetadata("/calendar", "termsite.seo.calendar.title", "termsite.seo.calendar.description");
  return sectionMetadata("calendar", "/calendar");
}

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
