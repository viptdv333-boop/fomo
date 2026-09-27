"use client";

import { forceUpdate } from "@/lib/force-update";
import { useT } from "@/lib/i18n/client";

// Always-visible manual fix for "I still see the old bug": unlike
// InstallAppButton it also shows inside the installed app.
export default function UpdateAppButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { t } = useT();
  return (
    <button
      onClick={() => {
        onNavigate?.();
        forceUpdate();
      }}
      title={t("common.updateApp.hint")}
      className={className || "flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"}
    >
      🔄 {t("common.updateApp.button")}
    </button>
  );
}
