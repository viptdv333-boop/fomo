"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import type { UnreadMap } from "@/lib/app-unread";

/**
 * Unread comments / new posts per idea and per channel (GET /api/notifications/unread-by-idea) for the red counts on channel rows, post cards,
 * board cards and «Мои идеи». One shared store: every card that asks for the numbers uses the same request. Refreshed on the socket's
 * new_notification, on `fomo:unread-changed` (an idea was opened and marked its notifications read), when the app comes back to the
 * foreground and every minute while a screen shows them.
 */
const EMPTY: UnreadMap = { byIdea: {}, byChannel: {}, first: null, board: { n: 0, first: null } };
let state: UnreadMap = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let lastAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l();
}

/** Fetches the numbers (at most one request in flight, at most one per 2 s unless `force`). */
export function refreshUnread(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && Date.now() - lastAt < 2000) return Promise.resolve();
  inflight = (async () => {
    try {
      const r = await fetch("/api/notifications/unread-by-idea", { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as Partial<UnreadMap>;
        const next: UnreadMap = { byIdea: j.byIdea ?? {}, byChannel: j.byChannel ?? {}, first: j.first ?? null, board: j.board ?? { n: 0, first: null } };
        // the same numbers again (a silent refresh when a screen comes back): nobody re-renders, with 50 cards on the board that is the difference
        const changed = !loaded || JSON.stringify(next) !== JSON.stringify(state);
        loaded = true;
        if (changed) {
          state = next;
          emit();
        }
      }
    } catch {
      /* offline: the old numbers stay */
    }
    lastAt = Date.now();
    inflight = null;
  })();
  return inflight;
}

function refreshSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void refreshUnread(true), 500);
}

/** Forget the numbers (sign-out / another account). */
function reset() {
  state = EMPTY;
  loaded = false;
  lastAt = 0;
  emit();
}

let users = 0;
let attachedFor: string | null = null;
let detach: (() => void) | null = null;

function attach(userId: string) {
  const iv = setInterval(() => {
    if (!document.hidden) void refreshUnread(true);
  }, 60_000);
  const onVis = () => document.visibilityState === "visible" && void refreshUnread();
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("fomo:unread-changed", refreshSoon);
  let socket: ReturnType<typeof getSocket> | null = null;
  try {
    socket = getSocket(userId);
    socket.on("new_notification", refreshSoon);
  } catch {
    /* no socket: the timer and the events still work */
  }
  return () => {
    clearInterval(iv);
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("fomo:unread-changed", refreshSoon);
    try {
      socket?.off("new_notification", refreshSoon);
    } catch {
      /* ignore */
    }
  };
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The numbers for the signed-in user; empty for a guest. `enabled` = false does not even ask (screens that never show them). */
export function useUnreadByIdea(enabled = true): UnreadMap & { loaded: boolean } {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const snap = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const isLoaded = useSyncExternalStore(subscribe, () => loaded, () => false);
  useEffect(() => {
    if (!enabled || !userId) return;
    users++;
    if (attachedFor !== userId) {
      detach?.();
      reset();
      attachedFor = userId;
      detach = attach(userId);
    }
    void refreshUnread();
    return () => {
      users--;
      if (users <= 0) {
        users = 0;
        detach?.();
        detach = null;
        attachedFor = null;
      }
    };
  }, [enabled, userId]);
  return enabled && userId ? { ...snap, loaded: isLoaded } : { ...EMPTY, loaded: false };
}
