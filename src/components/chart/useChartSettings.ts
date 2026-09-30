"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadLocalSettings, normalizeSettings, saveLocalSettings, type ChartSettings } from "@/lib/chart/settings";
import { listUserData, saveUserData } from "@/lib/chart/userdata";

export interface ChartSettingsApi {
  settings: ChartSettings;
  /** True once the local copy is read (the account copy may still replace it a moment later). */
  ready: boolean;
  /** Change settings; the result is applied at once, saved locally and (debounced) on the account. */
  update: (fn: (s: ChartSettings) => ChartSettings) => void;
  /** Replace everything (preset, template, reset). */
  replace: (next: ChartSettings) => void;
}

/** Chart settings that follow the user: localStorage first (no flicker), then the account copy when it is newer. */
export function useChartSettings(): ChartSettingsApi {
  // the chart is client-only, so the saved copy can be read straight away (no flash of the default look)
  const [settings, setSettings] = useState<ChartSettings>(() => (typeof window === "undefined" ? DEFAULT_SETTINGS : loadLocalSettings()));
  const [ready, setReady] = useState(false);
  const ref = useRef<ChartSettings>(settings);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(false);

  const push = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      dirty.current = false;
      void saveUserData("chart_settings", "default", ref.current);
    }, 900);
  }, []);

  const apply = useCallback(
    (next: ChartSettings) => {
      next = { ...next, at: Date.now() };
      ref.current = next;
      setSettings(next);
      saveLocalSettings(next);
      dirty.current = true;
      push();
    },
    [push]
  );

  useEffect(() => {
    const local = loadLocalSettings();
    ref.current = local;
    setSettings(local);
    setReady(true);
    let cancelled = false;
    listUserData("chart_settings", "default").then((items) => {
      if (cancelled || dirty.current) return;
      const it = items[0];
      if (!it) {
        // first sync of a device that already has local settings
        if (local.at > 0) void saveUserData("chart_settings", "default", local);
        return;
      }
      const remote = normalizeSettings(it.data);
      if (remote.at > ref.current.at) {
        ref.current = remote;
        setSettings(remote);
        saveLocalSettings(remote);
      } else if (ref.current.at > remote.at) {
        void saveUserData("chart_settings", "default", ref.current);
      }
    });
    const flush = () => {
      if (!dirty.current) return;
      dirty.current = false;
      clearTimeout(timer.current);
      void saveUserData("chart_settings", "default", ref.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  const update = useCallback((fn: (s: ChartSettings) => ChartSettings) => apply(fn(ref.current)), [apply]);
  const replace = useCallback((next: ChartSettings) => apply(next), [apply]);

  return { settings, ready, update, replace };
}
