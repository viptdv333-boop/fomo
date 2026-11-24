"use client";

import { useCallback, useEffect, useState } from "react";
import { DL_FILES, type DlFilePlatform } from "@/lib/downloads";
import { isDesktopApp, isNativeApp, nativeAppFeatures, nativeBridge } from "@/lib/native-app";
import { isTerminalSite } from "@/lib/site-mode";
import { forceUpdate } from "@/lib/force-update";

export interface AppUpdateStatus {
  available: boolean;
  checked: boolean;
  platform: DlFilePlatform | "web";
  version?: string;
  url?: string;
}

type Json = Record<string, unknown>;

async function readJson(path: string): Promise<Json | null> {
  try {
    const res = await fetch(`${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Json) : null;
  } catch {
    return null;
  }
}

function versionParts(value: unknown): number[] | null {
  if (typeof value !== "string" || !/^\d+(?:\.\d+){0,3}$/.test(value)) return null;
  return value.split(".").map(Number);
}

function isNewer(candidate: unknown, installed: unknown): boolean {
  const a = versionParts(candidate);
  const b = versionParts(installed);
  if (!a || !b) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const delta = (a[i] ?? 0) - (b[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return false;
}

/** Compare the currently installed shell (or web bundle) with no-cache release metadata. */
export async function checkAppUpdate(): Promise<AppUpdateStatus> {
  const terminal = isTerminalSite();
  if (isNativeApp()) {
    const current = nativeAppFeatures();
    const manifest = await readJson(terminal ? "/app/terminal-version.json" : "/app/version.json");
    const code = typeof manifest?.versionCode === "number" ? manifest.versionCode : 0;
    const version = typeof manifest?.versionName === "string" ? manifest.versionName : "";
    const url = typeof manifest?.url === "string" ? manifest.url : "";
    return { platform: "android", checked: Boolean(manifest && current), available: Boolean(current && code > current.versionCode && version && url), version, url };
  }

  if (isDesktopApp()) {
    const ua = navigator.userAgent;
    const match = ua.match(/\bFomoDesktop\/([^\s]+)/);
    const installed = match?.[1] ?? "";
    const data = await readJson("/app/dl-info.json");
    const releases = terminal && data?.terminal && typeof data.terminal === "object" ? (data.terminal as Json) : data;
    const platform = /Mac\b/.test(ua) ? "macos" : "windows";
    const release = releases?.[platform] && typeof releases[platform] === "object" ? (releases[platform] as Json) : null;
    const version = typeof release?.version === "string" ? release.version : "";
    const url = DL_FILES[terminal ? "terminal" : "main"][platform as DlFilePlatform]?.path ?? "";
    return { platform, checked: Boolean(release && installed), available: Boolean(version && isNewer(version, installed) && url), version, url };
  }

  const server = await readJson("/api/version");
  const installed = process.env.NEXT_PUBLIC_BUILD_ID || "";
  const latest = typeof server?.id === "string" ? server.id : "";
  return { platform: "web", checked: Boolean(server && latest && installed), available: Boolean(latest && installed && latest !== installed), version: latest };
}

export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  const refresh = useCallback(() => {
    void checkAppUpdate().then(setStatus);
  }, []);

  useEffect(() => {
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const update = useCallback(async (): Promise<boolean> => {
    const latest = await checkAppUpdate();
    if (!latest.checked) return false;
    if (latest.available && latest.url) {
      if (latest.platform === "android" && nativeBridge()?.openExternal) nativeBridge()?.openExternal?.(latest.url);
      else window.location.assign(latest.url);
      return true;
    }
    return forceUpdate();
  }, []);

  return { status, refresh, update };
}
