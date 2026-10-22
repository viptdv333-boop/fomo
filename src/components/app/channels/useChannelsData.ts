"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { buildSubIndex, pendingChannelIds, type AuthorItem, type ChannelItem, type SubIndex } from "@/lib/app-channels";
import { CHANNELS_CHANGED_EVENT, useChannelsChanged } from "@/lib/channels-invalidate";

/* The lists are kept between screens: opening a channel and coming back shows the list at once, then refreshes it. */
let channelsCache: ChannelItem[] | null = null;
let authorsCache: AuthorItem[] | null = null;

/* Something changed (a write by this user, or the service worker found its copy differs from the server): what is kept in memory is no longer
   trustworthy. Mounted screens keep showing it until their own re-read lands (no flicker); a screen mounted LATER starts from the network. */
if (typeof window !== "undefined") {
  window.addEventListener(CHANNELS_CHANGED_EVENT, () => {
    channelsCache = null;
    authorsCache = null;
  });
}

/** How long after an answer that came from the service worker's copy the list is read once more (the worker refreshes its copy meanwhile). */
const FROM_COPY_RECHECK_MS = 1500;

/**
 * A list read from `url` that stays in step with the server:
 *  * first paint = what is kept in memory, else the service worker's copy (instant) - never an empty state while a copy exists;
 *  * then a silent re-read with cache:"no-store" (network first) replaces it when the data differ, without a flicker (same data = no render);
 *  * the same re-read runs when the channels changed (event), the app is shown again / focused / back online (throttled);
 *  * an answer that still came from the worker's copy is checked once more a moment later;
 *  * answers are applied in the order the requests were MADE (a late older answer never overwrites a newer one).
 */
function useRevalidatingList<T>(url: string, enabled: boolean, read: () => T[] | null, keep: (v: T[]) => void) {
  const [items, setItems] = useState<T[] | null>(read);
  const [failed, setFailed] = useState(false);
  const shown = useRef(items !== null);
  shown.current = items !== null;
  const seq = useRef(0);
  const applied = useRef(0);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (fresh: boolean, again = true) => {
      const mine = ++seq.current;
      try {
        const r = await fetch(url, fresh ? { cache: "no-store" } : undefined);
        const j = await r.json();
        if (mine < applied.current) return; // an answer to a newer request is already on screen
        if (Array.isArray(j)) {
          applied.current = mine;
          keep(j as T[]);
          setItems((cur) => (cur && JSON.stringify(cur) === JSON.stringify(j) ? cur : (j as T[])));
          setFailed(false);
          if (again && r.headers.get("x-fomo-from-cache")) {
            if (recheck.current) clearTimeout(recheck.current);
            recheck.current = setTimeout(() => void load(true, false), FROM_COPY_RECHECK_MS);
          }
          return;
        }
        setFailed(true);
      } catch {
        setFailed(true);
      }
      setItems((cur) => cur ?? []);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url],
  );
  // shown (again): with something on screen the read goes to the network at once; without, the worker's copy may answer first
  const reload = useCallback(() => load(shown.current), [load]);
  useEffect(() => {
    if (enabled) void reload();
    return () => {
      if (recheck.current) clearTimeout(recheck.current);
    };
  }, [reload, enabled]);
  useChannelsChanged(() => void load(true), enabled);
  return { items, loaded: items !== null, failed, reload };
}

export function useChannelList(enabled = true) {
  return useRevalidatingList<ChannelItem>("/api/channels", enabled, () => channelsCache, (v) => (channelsCache = v));
}

export function useAuthorList(enabled = true) {
  return useRevalidatingList<AuthorItem>("/api/authors", enabled, () => authorsCache, (v) => (authorsCache = v));
}

const EMPTY: SubIndex = { paidByChannel: new Map(), paidByAuthor: new Map(), paidAuthorIds: new Set(), follows: new Set(), subByChannel: new Map() };

/** The viewer's subscriptions (paid / free) and the payments waiting for an author's confirmation. Empty for a guest. */
export function useMySubs() {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [index, setIndex] = useState<SubIndex>(EMPTY);
  const [pending, setPending] = useState<Set<string>>(() => new Set());
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const [s, p] = await Promise.all([fetch("/api/subscriptions", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])), fetch("/api/payments?role=buyer", { cache: "no-store" }).then((r) => (r.ok ? r.json() : []))]);
      setIndex(buildSubIndex(s));
      setPending(pendingChannelIds(p));
    } catch {
      /* the lists stay without statuses */
    }
    setLoaded(true);
  }, [uid]);
  useEffect(() => {
    if (status === "loading") return;
    if (!uid) {
      setIndex(EMPTY);
      setPending(new Set());
      setLoaded(true);
      return;
    }
    void reload();
  }, [uid, status, reload]);
  // a payment / subscription / plan changed, or the app is back: statuses are read again (the network first: «Подписан» must never be a stale copy)
  useChannelsChanged(() => void reload(), !!uid);
  return { myId: uid as string | undefined, loggedIn: !!uid, authLoading: status === "loading", index, setIndex, pending, loaded, reload };
}
