"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { closeIosSteps, isIosStepsOpen, isIOSNonSafari, subscribePwaInstall } from "@/lib/pwa-install";

// Mounted once in the root layout; opened via openIosSteps() from any
// "Установить приложение" button, including ones inside menus.
export default function IosInstallModal() {
  const [open, setOpen] = useState(false);
  const { t } = useT();

  useEffect(() => {
    setOpen(isIosStepsOpen());
    return subscribePwaInstall(() => setOpen(isIosStepsOpen()));
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" onClick={closeIosSteps}>
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">{t("common.ios.title")}</h3>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>{t("common.ios.step1")}</li>
          <li>{t("common.ios.step2")}</li>
          <li>{t("common.ios.step3")}</li>
          <li>{t("common.ios.step4")}</li>
        </ol>
        {isIOSNonSafari() && (
          <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
            {t("common.ios.notSafari")}
          </p>
        )}
        <button
          onClick={closeIosSteps}
          className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          {t("common.cookie.ok")}
        </button>
      </div>
    </div>
  );
}
