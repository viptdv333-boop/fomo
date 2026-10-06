"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { prefKey } from "@/lib/notification-events";
import type { QuietState, SettingsResponse } from "@/lib/notify-settings-types";
import type { NotifApi } from "./api";
import type { Cell, SaveState } from "./PrefMatrix";

/**
 * State machine behind «Настройки уведомлений»: the settings, the optimistic overrides (debounced PATCH with rollback), the reset and
 * the quiet-hours save. Shared by the site's NotificationSettings and the app UI's screen so both behave the same way.
 */
export function useNotifSettings(api: NotifApi) {
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

  /** Quiet hours: the server's answer replaces only the `quiet` part of what is on screen. */
  const saveQuiet = useCallback(async (q: QuietState) => {
    const fresh = await apiRef.current.patch({ quiet: q });
    setData((d) => (d ? { ...d, quiet: fresh.quiet } : fresh));
  }, []);

  // Don't lose a pending edit when the screen is left.
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

  return { data, loadError, overrides, saveState, reload, onSetCells, onReset, saveQuiet };
}
