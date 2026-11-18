"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/client";
import { stripLocale, type Locale } from "@/lib/i18n/locale-url";
import { backHrefFor, type BackTarget } from "@/lib/app-back";
import AppIcon from "./AppIcon";
import { hostNavigate } from "./tabhost/store";

/**
 * The generic «‹ Назад» of the app UI. It does exactly what the Android hardware button does: window.FomoBack() (AppBackHandler: closes a sheet, else one step back
 * in the in-app history, else the logical parent of the screen, src/lib/app-back.ts). It only falls back to the parent itself when FomoBack is not there.
 */
export default function AppBackButton({ target, variant }: { target: BackTarget; variant: "header" | "bar" }) {
  const { t, locale } = useT();
  const router = useRouter();
  const label = t("common.back");
  const onClick = () => {
    const fb = (window as unknown as { FomoBack?: () => boolean }).FomoBack;
    if (fb && fb()) return;
    const loc = (stripLocale(window.location.pathname).locale ?? locale) as Locale;
    const href = backHrefFor(target.href, loc, window.location.search);
    if (!hostNavigate(href, "replace")) router.replace(href);
  };
  return (
    <button type="button" className="app-back" data-variant={variant} data-app-back onClick={onClick} aria-label={label}>
      <AppIcon name="chevL" size={24} stroke={2} />
      <span className="app-back-label">{label}</span>
    </button>
  );
}
