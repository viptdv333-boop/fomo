"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { DM_KEYS, parseIdList } from "@/lib/app-chat";

/** Unread count of personal / болталка messages (/api/chat/badge), kept fresh by polling, visibility and socket events. */
export function useChatBadge(): number {
  const { data: session } = useSession();
  const [count, setCount] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      // conversations muted on this device do not count (the list lives in localStorage, the server cannot know it)
      let mute = "";
      try {
        mute = parseIdList(localStorage.getItem(DM_KEYS.muted)).slice(0, 100).map(encodeURIComponent).join(",");
      } catch {}
      const r = await fetch(`/api/chat/badge${mute ? `?mute=${mute}` : ""}`, { cache: "no-store" });
      if (r.ok) setCount((await r.json()).total ?? 0);
    } catch {}
  }, []);
  // a burst of socket events must not turn into a burst of requests
  const reloadSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(load, 600);
  }, [load]);

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
    const iv = setInterval(() => {
      if (!document.hidden) load();
    }, 30_000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    // reading a room or a conversation elsewhere in the app asks for a refresh
    window.addEventListener("fomo:unread-changed", reloadSoon);
    window.addEventListener("chat:room-read", reloadSoon);
    window.addEventListener("fomo:chat-prefs", reloadSoon); // a conversation was muted / unmuted
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket(session.user.id);
      socket.on("new_notification", reloadSoon);
      socket.on("new_dm", reloadSoon);
      socket.on("new_message", reloadSoon);
    } catch {}
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("fomo:unread-changed", reloadSoon);
      window.removeEventListener("chat:room-read", reloadSoon);
      window.removeEventListener("fomo:chat-prefs", reloadSoon);
      try {
        socket?.off("new_notification", reloadSoon);
        socket?.off("new_dm", reloadSoon);
        socket?.off("new_message", reloadSoon);
      } catch {}
      if (timer.current) clearTimeout(timer.current);
    };
  }, [session?.user?.id, load, reloadSoon]);

  return count;
}
