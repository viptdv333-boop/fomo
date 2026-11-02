"use client";

import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n/locale-url";
import { useT } from "@/lib/i18n/client";
import { useMacSkin } from "@/lib/chart/mac-skin";

/** The switch between the classic and the new (macOS) look, in the site header next to the language and theme switches.
 *  Only on the pages that have the new look (terminal, calculator, profile) and only where the window can wear it. */
const PAGES = /^\/(terminal|calculator|profile)(\/|$)/;

export default function SkinSwitch() {
  const { t } = useT();
  const path = stripLocale(usePathname() || "/").path;
  const skin = useMacSkin(false);
  if (!PAGES.test(path) || !skin.canOffer) return null;
  return (
    <button
      type="button"
      onClick={() => skin.set(!skin.on)}
      title={skin.on ? t("mac.classicTip") : t("mac.tryTip")}
      className="h-8 shrink-0 rounded-lg px-2.5 text-[13px] font-medium whitespace-nowrap text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100 cursor-pointer"
    >
      {skin.on ? t("mac.classic") : t("mac.try")}
    </button>
  );
}
