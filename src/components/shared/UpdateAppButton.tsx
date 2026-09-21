"use client";

import { forceUpdate } from "@/lib/force-update";

// Always-visible manual fix for "I still see the old bug": unlike
// InstallAppButton it also shows inside the installed app.
export default function UpdateAppButton({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  return (
    <button
      onClick={() => {
        onNavigate?.();
        forceUpdate();
      }}
      title="Сбросить кэш и загрузить последнюю версию"
      className={className || "flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"}
    >
      🔄 Обновить приложение
    </button>
  );
}
