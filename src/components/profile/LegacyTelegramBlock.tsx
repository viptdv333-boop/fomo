"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import TelegramBotSettings from "@/components/profile/TelegramBotSettings";

/**
 * The pre-"Настройки уведомлений" Telegram connection (TelegramAccount, paid-channel
 * forwarding). New users connect their bot in the Telegram card itself, so this
 * collapsed block is rendered ONLY for users who still have a legacy account —
 * it lets them keep managing or remove it.
 */
export default function LegacyTelegramBlock() {
  const { t } = useT();
  const [has, setHas] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/telegram/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d?.connected) setHas(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!has) return null;
  return (
    <details className="group rounded-lg border border-dashed border-gray-200 p-2 text-xs dark:border-gray-700">
      <summary className="cursor-pointer select-none font-medium text-gray-600 dark:text-gray-300">{t("ns.tg.own.title")}</summary>
      <p className="mt-2 text-gray-500 dark:text-gray-400">{t("ns.tg.own.desc")}</p>
      <div className="mt-2">
        <TelegramBotSettings />
      </div>
    </details>
  );
}
