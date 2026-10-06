"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { buildSubIndex, pendingChannelIds, type AuthorItem, type ChannelItem, type SubIndex } from "@/lib/app-channels";

/* The lists are kept between screens: opening a channel and coming back shows the list at once, then refreshes it. */
let channelsCache: ChannelItem[] | null = null;
let authorsCache: AuthorItem[] | null = null;

export function useChannelList(enabled = true) {
  const [items, setItems] = useState<ChannelItem[] | null>(channelsCache);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/channels", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j)) {
        channelsCache = j;
        setItems(j);
        setFailed(false);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setItems((cur) => cur ?? []);
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);
  return { items, loaded: items !== null, failed, reload };
}

export function useAuthorList(enabled = true) {
  const [items, setItems] = useState<AuthorItem[] | null>(authorsCache);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/authors", { cache: "no-store" });
      const j = await r.json();
      if (Array.isArray(j)) {
        authorsCache = j;
        setItems(j);
        setFailed(false);
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
    setItems((cur) => cur ?? []);
  }, []);
  useEffect(() => {
    if (enabled) void reload();
  }, [reload, enabled]);
  return { items, loaded: items !== null, failed, reload };
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
  return { myId: uid as string | undefined, loggedIn: !!uid, authLoading: status === "loading", index, setIndex, pending, loaded, reload };
}
