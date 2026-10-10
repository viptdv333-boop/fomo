"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { emptyBucket, emptyUnread, type UnreadBucket, type UnreadEntry, type UnreadMap } from "@/lib/app-unread";

/**
 * Unread comments / new posts / likes per idea and per channel (plus the two buckets that add up to the dock numbers: board, channels) (GET /api/notifications/unread-by-idea) for the red counts on channel rows, post cards,
 * board cards and «Мои идеи». One shared store: every card that asks for the numbers uses the same request. Refreshed on the socket's
 * new_notification, on `fomo:unread-changed` (an idea was opened and marked its notifications read), when the app comes back to the
 * foreground and every minute while a screen shows them.
 */
const EMPTY: UnreadMap = emptyUnread();

/** An older server answered {c, p} / {n, first} only: fill what is missing so the screens can rely on the whole shape. */
function bucketOf(b: Partial<UnreadBucket> | undefined): UnreadBucket {
  const n = b?.n ?? 0;
  const p = b?.p ?? 0;
  const l = b?.l ?? 0;
  return { ...emptyBucket(), ...b, n, p, l, total: b?.total ?? n + p + l, ideas: Array.isArray(b?.ideas) ? b.ideas : [] };
}
function entriesOf(m: Record<string, Partial<UnreadEntry>> | undefined): Record<string, UnreadEntry> {
  const out: Record<string, UnreadEntry> = {};
  for (const [k, e] of Object.entries(m ?? {})) out[k] = { c: e.c ?? 0, r: e.r ?? 0, p: e.p ?? 0, l: e.l ?? 0, ...(Array.isArray(e.ideas) ? { ideas: e.ideas } : {}) };
  return out;
}
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
        const next: UnreadMap = { byIdea: entriesOf(j.byIdea), byChannel: entriesOf(j.byChannel), first: j.first ?? null, board: bucketOf(j.board), channels: bucketOf(j.channels) };
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
