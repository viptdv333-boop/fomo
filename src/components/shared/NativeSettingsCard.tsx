"use client";

import { useT } from "@/lib/i18n/client";
import { openNativeSettings } from "@/lib/native-app";
import { useNativeSettingsAvailable } from "./NativeSettingsLink";

/**
 * Top of Profile → «Настройки уведомлений», Android app only: sound / vibration / importance of notifications are
 * per-channel system settings and the app lock lives there too, so point the owner at the native screen.
 * Renders nothing in a browser or PWA.
 */
export default function NativeSettingsCard() {
  const { t } = useT();
  const available = useNativeSettingsAvailable();
  if (!available) return null;
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-900/50 dark:bg-green-950/30"
      data-testid="native-settings-card"
    >
      <div className="min-w-0 flex-1 basis-56">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t("app.settings.cardTitle")}</h3>
        <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">{t("app.settings.cardDesc")}</p>
      </div>
      <button
        type="button"
        onClick={() => openNativeSettings()}
        className="shrink-0 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
      >
        {t("app.settings.open")}
      </button>
    </section>
  );
}
