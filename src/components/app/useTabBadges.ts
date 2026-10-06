"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { tabBadgeCounts, tabForNotifType, type TabCounts } from "@/lib/app-badges";
import { useChatBadge } from "@/components/layout/useChatBadge";
import type { AppTabId } from "@/lib/app-ui";

const NOTIF_TABS: AppTabId[] = ["feed", "terminal", "calendar", "channels", "chat"];

/**
 * Unread numbers of the dock's red badges per tab. Notification counts come from /api/notifications/unread-by-type (polled, refreshed on
 * the socket's new_notification, on room reads and on `fomo:unread-changed`); the chat tab also folds in the chat badge (max, see
 * tabBadgeCounts). `activeTab`: the tab whose screen is open; its notifications are marked read after a short moment on it
 * (the bell with the notification list is not shown in the app UI, so a badge would otherwise never clear).
 */
export function useTabBadges(activeTab: AppTabId | null = null): TabCounts {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const chat = useChatBadge();
  const [byType, setByType] = useState<Record<string, number>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications/unread-by-type", { cache: "no-store" });
      if (r.ok) setByType(((await r.json()).byType as Record<string, number>) ?? {});
    } catch {}
  }, []);
  const reloadSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 600);
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    load();
    const iv = setInterval(() => {
      if (!document.hidden) load();
    }, 60_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("fomo:unread-changed", reloadSoon);
    window.addEventListener("chat:room-read", reloadSoon);
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket(userId);
      socket.on("new_notification", reloadSoon);
    } catch {}
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("fomo:unread-changed", reloadSoon);
      window.removeEventListener("chat:room-read", reloadSoon);
      try {
        socket?.off("new_notification", reloadSoon);
      } catch {}
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId, load, reloadSoon]);

  const counts = useMemo(() => tabBadgeCounts(byType, chat), [byType, chat]);

  // being on a tab = having seen what its badge counts
  const pending = activeTab && NOTIF_TABS.includes(activeTab) ? activeTab : null;
  const hasUnread = pending ? Object.keys(byType).some((t) => (byType[t] ?? 0) > 0 && tabForNotifType(t) === pending) : false;
  useEffect(() => {
    if (!userId || !pending || !hasUnread) return;
    const id = setTimeout(async () => {
      try {
        const r = await fetch("/api/notifications", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab: pending }),
        });
        if (r.ok) await load();
      } catch {}
    }, 1500);
    return () => clearTimeout(id);
  }, [userId, pending, hasUnread, load]);

  return counts;
}
