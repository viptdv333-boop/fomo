"use client";

import { useT } from "@/lib/i18n/client";
import LegacyTelegramBlock from "@/components/profile/LegacyTelegramBlock";
import NativeSettingsCard from "@/components/shared/NativeSettingsCard";
import { realApi, type NotifApi } from "./notifications/api";
import ChannelCards from "./notifications/ChannelCards";
import PrefMatrix from "./notifications/PrefMatrix";
import { useNotifSettings } from "./notifications/useNotifSettings";
import QuietHours from "./notifications/QuietHours";
import TerminalNotifyCard from "./notifications/TerminalNotifyCard";

/**
 * Profile → «Уведомления»: channel cards (connect / status / test), the
 * event × channel preference matrix (optimistic, debounced PATCH with rollback)
 * and quiet hours. `api` is injectable for the dev preview page.
 */
export default function NotificationSettings({ api = realApi, showOwnBot = true }: { api?: NotifApi; showOwnBot?: boolean }) {
  const { t } = useT();
  const { data, loadError, overrides, saveState, reload, onSetCells, onReset, saveQuiet } = useNotifSettings(api);

  if (!data) {
    return (
      <div className="rounded-xl bg-white p-6 text-center text-sm text-gray-500 shadow dark:bg-gray-900 dark:text-gray-400" aria-busy={!loadError}>
        {loadError ? (
          <>
            <p className="mb-3 text-red-500">{t("ns.loadFailed")}</p>
            <button type="button" onClick={() => void reload()} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700">
              {t("ns.retry")}
            </button>
          </>
        ) : (
          t("ns.loading")
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold dark:text-gray-100">{t("ns.title")}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t("ns.subtitle")}</p>
      </div>
      <NativeSettingsCard />
      <ChannelCards data={data} api={api} reload={reload} ownBot={showOwnBot ? <LegacyTelegramBlock /> : null} />
      <PrefMatrix data={data} overrides={overrides} onSetCells={onSetCells} onReset={onReset} saveState={saveState} />
      <TerminalNotifyCard />
      <QuietHours value={data.quiet} onSave={saveQuiet} />
    </div>
  );
}
