import type { Metadata } from "next";
import { isTerminalSite } from "@/lib/site-mode";
import { getT } from "@/lib/i18n/server";

// Sign-in / sign-up screens carry no search value. noindex rather than a
// robots.txt block so Google can actually read the directive and drop the URLs
// it already discovered — see src/app/robots.txt/route.ts.
// On the terminal site the pages also get a title (the main site keeps the root title).
export async function generateMetadata(): Promise<Metadata> {
  const robots = { index: false, follow: false };
  if (!isTerminalSite()) return { robots };
  const { t } = await getT();
  return { title: t("termsite.seo.auth.title"), robots };
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-3 sm:px-4">
      <div className="w-full max-w-sm sm:max-w-md">{children}</div>
    </div>
  );
}
