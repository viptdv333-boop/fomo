import Link from "next/link";
import { getT } from "@/lib/i18n/server";

/** Footer of the terminal site: copyright and the two legal pages. The main site uses Footer.tsx. */
export default async function TerminalFooter() {
  const { t } = await getT();
  return (
    <footer data-app-hide className="h-10 flex items-center justify-center gap-4 px-4 bg-white dark:bg-gray-900 shrink-0 text-xs text-gray-400 dark:text-gray-600">
      <span>Copyright © Neurotrader 2026</span>
      <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
        {t("common.footer.privacy")}
      </Link>
      <Link href="/terms" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
        {t("common.footer.terms")}
      </Link>
    </footer>
  );
}
