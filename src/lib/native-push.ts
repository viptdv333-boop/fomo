"use client";

import { isNativeApp, nativeBridge, nativePushToken } from "@/lib/native-app";

// Registers / removes this device's FCM token (Android app) for the signed-in user via /api/push/fcm.
// Fail-soft everywhere: a missing token, an old API or a network error must never disturb the page.

const KEY = "fomo-fcm-registered"; // "<userId>:<token>@<timestamp>"
const REFRESH_MS = 24 * 60 * 60 * 1000;

function remembered(): { id: string; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const i = raw.lastIndexOf("@");
    return { id: raw.slice(0, i), at: Number(raw.slice(i + 1)) || 0 };
  } catch {
    return null;
  }
}

function remember(id: string) {
  try {
    localStorage.setItem(KEY, `${id}@${Date.now()}`);
  } catch {}
}

/** POSTs the token (once per user+token per day). `token` defaults to the one the app currently holds. */
export async function registerNativePush(userId: string, token?: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  const t = token ?? nativePushToken();
  if (!t) return false;
  const id = `${userId}:${t}`;
  const last = remembered();
  if (last && last.id === id && Date.now() - last.at < REFRESH_MS) return true;
  let version = "";
  try {
    version = nativeBridge()?.appVersion?.() ?? "";
  } catch {}
  try {
    const res = await fetch("/api/push/fcm", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: t, deviceName: (navigator.userAgent.match(/\(Linux; Android [^;]*; ([^)]*)\)/)?.[1] ?? "").slice(0, 80) || undefined, appVersion: version.slice(0, 40) || undefined }),
    });
    if (res.ok) remember(id);
    return res.ok;
  } catch {
    return false;
  }
}

/** Called right before signing out so a shared phone stops receiving the previous account's notifications. Never rejects. */
export async function unregisterNativePush(): Promise<void> {
  if (!isNativeApp()) return;
  const t = nativePushToken();
  if (!t) return;
  try {
    await Promise.race([
      fetch("/api/push/fcm", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
        keepalive: true,
      }),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    localStorage.removeItem(KEY);
  } catch {}
}
