"use client";

import { useEffect, useState } from "react";
import { isStandalone, isIOS, canPromptInstall, subscribePwaInstall, triggerInstall, openIosSteps } from "@/lib/pwa-install";

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
      openIosSteps();
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

    </>
  );
}
