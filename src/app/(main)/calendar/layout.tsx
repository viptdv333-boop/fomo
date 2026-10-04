import type { Metadata } from "next";
import { sectionMetadata } from "@/lib/i18n/seo-metadata";

// Localized title/description/keywords + canonical and hreflang for /calendar, /en/calendar and /zh/calendar
// (copy lives in src/lib/i18n/dict/econcal.ts as seo.calendar.*).
export function generateMetadata(): Promise<Metadata> {
  return sectionMetadata("calendar", "/calendar");
}

export default function CalendarLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
