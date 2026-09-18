"use client";

import { useEffect, useState } from "react";
import { isStandalone, isIOS, canPromptInstall, subscribePwaInstall, triggerInstall } from "@/lib/pwa-install";

interface Props {
  className?: string;
  variant?: "solid" | "menuItem";
  onNavigate?: () => void;
}

/// A persistent, always-discoverable install entry point — unlike the
/// transient beforeinstallprompt banner (only shown once per week, only
/// while Chrome/Edge happens to offer it), this can be placed anywhere and
/// works even after that moment has passed: it re-triggers the saved native
/// prompt on Android, or shows manual steps on iOS (which has no install API).
export default function InstallAppButton({ className, variant = "solid", onNavigate }: Props) {
  const [standalone, setStandalone] = useState(true); // assume installed until checked, to avoid a flash
  const [canPrompt, setCanPrompt] = useState(false);
  const [showIosSteps, setShowIosSteps] = useState(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setCanPrompt(canPromptInstall());
    return subscribePwaInstall(() => {
      setStandalone(isStandalone());
      setCanPrompt(canPromptInstall());
    });
  }, []);

  if (standalone) return null;

  async function handleClick() {
    onNavigate?.();
    if (canPrompt) {
      await triggerInstall();
      return;
    }
    if (isIOS()) {
      setShowIosSteps(true);
      return;
    }
    alert(
      "Установка доступна в Chrome/Edge на Android или компьютере — иконка появится в адресной строке. На iPhone используйте \"Поделиться\" → \"На экран «Домой»\" в Safari."
    );
  }

  const label = "📲 Установить приложение";

  return (
    <>
      {variant === "menuItem" ? (
        <button
          onClick={handleClick}
          className={className || "flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"}
        >
          {label}
        </button>
      ) : (
        <button
          onClick={handleClick}
          className={className || "px-5 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition"}
        >
          {label}
        </button>
      )}

      {showIosSteps && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowIosSteps(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Установка на iPhone/iPad</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
              <li>Откройте fomo.spot в Safari</li>
              <li>Нажмите кнопку «Поделиться» (квадрат со стрелкой вверх)</li>
              <li>Выберите «На экран «Домой»»</li>
            </ol>
            <button
              onClick={() => setShowIosSteps(false)}
              className="mt-4 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
