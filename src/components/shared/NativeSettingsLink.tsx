"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { canOpenNativeSettings, openNativeSettings } from "@/lib/native-app";

/** True only inside the Android app build that has the native settings screen. Starts false so the server HTML and the first client render agree. */
export function useNativeSettingsAvailable(): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    setAvailable(canOpenNativeSettings());
  }, []);
  return available;
}

interface Props {
  className?: string;
  onNavigate?: () => void;
}

/**
 * «Настройки приложения» entry of the profile menu. Renders nothing in a browser or PWA (and in app builds without the
 * native settings screen); inside the Android app it opens that screen (FomoApp.openSettings).
 */
export default function NativeSettingsLink({ className, onNavigate }: Props) {
  const { t } = useT();
  const available = useNativeSettingsAvailable();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        openNativeSettings();
      }}
      className={className || "flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 w-full text-left"}
    >
      {!className && (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
      )}
      {t("app.settings")}
    </button>
  );
}
