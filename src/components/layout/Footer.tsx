import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { isPageHidden } from "@/lib/hidden-pages";
import { localizedPath } from "@/lib/i18n/locale-url";

export default async function Footer() {
  const { t, locale } = await getT();
  const terminalShown = !(await isPageHidden("terminal"));
  return (
    <footer className="h-12 flex items-center px-4 bg-white dark:bg-gray-900 shrink-0 gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <div className="w-[60px] h-[28px] overflow-hidden relative shrink-0">
        <img src="/logo-fomo-sm.webp" width={480} height={320} alt="FOMO" className="absolute w-full h-auto" style={{ top: '-18%' }} />
      </div>
      <div className="flex-1 flex items-center justify-center gap-4 text-xs text-gray-400 dark:text-gray-600">
        <span>Copyright © Neurotrader 2026</span>
        <Link href="/help" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          {t("common.footer.howTo")}
        </Link>
        {terminalShown && (
          <Link href={localizedPath(locale, "/terminal/features")} className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
            {t("tf.more")}
          </Link>
        )}
        <Link href="/privacy" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          {t("common.footer.privacy")}
        </Link>
        <Link href="/terms" className="hover:text-gray-600 dark:hover:text-gray-400 transition hidden sm:inline">
          {t("common.footer.terms")}
        </Link>
      </div>
      <div className="w-[60px] shrink-0" />
    </footer>
  );
}
