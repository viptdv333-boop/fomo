"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { isNativeApp, nativePushToken, onNativePushToken, requestNativeNotifications } from "@/lib/native-app";
import { registerNativePush } from "@/lib/native-push";

const ASKED_KEY = "fomo-notif-asked";

/**
 * Android app only (renders nothing): after sign-in it asks for the notification permission once (Android 13+) and
 * registers the device's Firebase token with the account. In a normal browser it does nothing at all.
 */
export default function NativePushRegistrar() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  useEffect(() => {
    if (status !== "authenticated" || !userId || !isNativeApp()) return;
    try {
      if (!localStorage.getItem(ASKED_KEY)) {
        localStorage.setItem(ASKED_KEY, "1");
        requestNativeNotifications();
      }
    } catch {}
    const t = nativePushToken();
    if (t) void registerNativePush(userId, t);
    // the token can arrive later (first Firebase fetch) or rotate
    return onNativePushToken((token) => void registerNativePush(userId, token));
  }, [status, userId]);

  return null;
}
