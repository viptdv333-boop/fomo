"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { prefKey } from "@/lib/notification-events";
import type { SettingsResponse } from "@/lib/notify-settings-types";
import LegacyTelegramBlock from "@/components/profile/LegacyTelegramBlock";
import { realApi, type NotifApi } from "./notifications/api";
import ChannelCards from "./notifications/ChannelCards";
import PrefMatrix, { type Cell, type SaveState } from "./notifications/PrefMatrix";
import QuietHours from "./notifications/QuietHours";
import TerminalNotifyCard from "./notifications/TerminalNotifyCard";

/**
 * Profile → «Уведомления»: channel cards (connect / status / test), the
 * event × channel preference matrix (optimistic, debounced PATCH with rollback)
 * and quiet hours. `api` is injectable for the dev preview page.
 */
export default function NotificationSettings({ api = realApi, showOwnBot = true }: { api?: NotifApi; showOwnBot?: boolean }) {
  const { t } = useT();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // `confirmed` = what the server has; `pending` = changes not yet sent.
  const confirmed = useRef<Record<string, boolean>>({});
  const pending = useRef<Map<string, Cell>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const apiRef = useRef(api);
  apiRef.current = api;

  const apply = useCallback((s: SettingsResponse) => {
    setData(s);
    confirmed.current = s.overrides;
    // Keep not-yet-sent edits visible on top of the fresh server state.
    const merged = { ...s.overrides };
    for (const [k, c] of pending.current) merged[k] = c.enabled;
    setOverrides(merged);
  }, []);

  const reload = useCallback(async () => {
    try {
      apply(await apiRef.current.load());
      setLoadError(false);
    } catch {
      setLoadError((prev) => prev || true);
    }
  }, [apply]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current.size === 0) return;
    inFlight.current = true;
    const batch = [...pending.current.values()];
    pending.current.clear();
    setSaveState("saving");
    try {
      const fresh = await apiRef.current.patch({ prefs: batch.map((c) => ({ event: c.event, channel: c.channel, enabled: c.enabled })) });
      confirmed.current = fresh.overrides;
      setData(fresh);
      setSaveState("saved");
    } catch {
      // Roll the switches back to what the server really has (plus edits made meanwhile).
      const back = { ...confirmed.current };
      for (const [k, c] of pending.current) back[k] = c.enabled;
      setOverrides(back);
      setSaveState("error");
    } finally {
      inFlight.current = false;
      if (pending.current.size > 0) timer.current = setTimeout(() => void flush(), 300);
    }
  }, []);

  const onSetCells = useCallback(
    (cells: Cell[]) => {
      if (cells.length === 0) return;
      setOverrides((o) => {
        const next = { ...o };
        for (const c of cells) next[prefKey(c.event, c.channel)] = c.enabled;
        return next;
      });
      for (const c of cells) pending.current.set(prefKey(c.event, c.channel), c);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 600);
    },
    [flush]
  );

  const onReset = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current.clear();
    const before = confirmed.current;
    setOverrides({});
    setSaveState("saving");
    try {
      apply(await apiRef.current.patch({ reset: true }));
      setSaveState("saved");
    } catch {
      setOverrides(before);
      setSaveState("error");
    }
  }, [apply]);

  // Don't lose a pending edit when the tab is left.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current.size > 0) {
        const batch = [...pending.current.values()].map((c) => ({ event: c.event, channel: c.channel, enabled: c.enabled }));
        void apiRef.current.patch({ prefs: batch }).catch(() => {});
      }
    },
    []
  );

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
      <ChannelCards data={data} api={api} reload={reload} ownBot={showOwnBot ? <LegacyTelegramBlock /> : null} />
      <PrefMatrix data={data} overrides={overrides} onSetCells={onSetCells} onReset={onReset} saveState={saveState} />
      <TerminalNotifyCard />
      <QuietHours
        value={data.quiet}
        onSave={async (q) => {
          const fresh = await apiRef.current.patch({ quiet: q });
          setData((d) => (d ? { ...d, quiet: fresh.quiet } : fresh));
        }}
      />
    </div>
  );
}
