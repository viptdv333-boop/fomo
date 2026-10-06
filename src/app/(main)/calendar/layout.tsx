import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";
import { isTerminalSite } from "@/lib/site-mode";

// Localized title/description/keywords + canonical and hreflang for /calendar, /en/calendar and /zh/calendar
// (copy lives in src/lib/i18n/dict/econcal.ts as seo.calendar.*).
export function generateMetadata(): Promise<Metadata> {
  // terminal.fomo.spot has no standalone calendar page (the middleware redirects it); never indexable there
  if (isTerminalSite()) return Promise.resolve({ robots: { index: false, follow: false } });
  return sectionMetadata("calendar", "/calendar");
}

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  // terminal.fomo.spot: the calendar is a tab of the terminal (next to the watchlist); the middleware already redirects, this is the safety net
  if (isTerminalSite()) redirect("/terminal?panel=calendar");
  return <>{children}</>;
}
