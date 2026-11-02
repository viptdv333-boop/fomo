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
      className={
        skin.on
          ? "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-lg px-2.5 text-[13px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-100"
          : "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-[#7b7fc4] to-[#a47bb5] px-3.5 text-[13px] font-semibold text-white shadow-[0_3px_10px_rgba(110,100,170,0.45)] ring-2 ring-[#a47bb5]/30 transition hover:brightness-110"
      }
    >
      {!skin.on && (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
        </svg>
      )}
      {skin.on ? t("mac.classic") : t("mac.try")}
    </button>
  );
}
