"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getSocket } from "@/lib/socket";
import {
  INBOX_CACHE_PREFIX,
  INBOX_PAGE,
  autoReadIds,
  buildCache,
  countUnread,
  markRowsRead,
  mergeRows,
  parseCache,
  parseRows,
  type InboxRow,
} from "@/lib/notif-inbox";

/** After a change of the unread numbers the dock badges (useTabBadges) and the Профиль row reload. */
export function announceUnreadChanged() {
  try {
    window.dispatchEvent(new Event("fomo:unread-changed"));
  } catch {
    /* no window */
  }
}

/** Marks rows read on the server; resolves false when the request failed. */
async function patch(body: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return r.ok;
  } catch {
    return false;
  }
}

function readCache(userId: string) {
  try {
    return parseCache(localStorage.getItem(INBOX_CACHE_PREFIX + userId));
  } catch {
    return null;
  }
}
function writeCache(userId: string, rows: readonly InboxRow[], unread: number) {
  try {
    localStorage.setItem(INBOX_CACHE_PREFIX + userId, buildCache(rows, unread));
  } catch {
    /* private mode / quota: the list simply is not kept */
  }
}

/** Seconds the rows stay on screen before the ones without an item to open are marked read. */
const AUTO_READ_MS = 1200;

export type InboxStatus = "loading" | "ready" | "error";

/**
 * State of the «Уведомления» list: first page (50), «Показать ещё» (keyset cursor), refresh, per-row and «Прочитать все» reads, the copy kept on the
 * device (the list opens at once and still shows the last loaded rows with no network).
 *
 * Reading: the rows that light the Профиль tab (new_follower, payment, system ... see autoReadIds) are marked read by themselves once they have been
 * on screen for a moment; `seen` keeps them highlighted for the rest of this visit so the user can still tell which were new. Everything else is read
 * by opening it (`readOne`) or by «Прочитать все».
 */
export function useNotifInbox(userId: string | undefined) {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [status, setStatus] = useState<InboxStatus>("loading");
  const [stale, setStale] = useState(false); // showing the device copy, the last request failed
  const [refreshing, setRefreshing] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const alive = useRef(true);
  const rowsRef = useRef<InboxRow[]>([]);
  const sent = useRef<Set<string>>(new Set());
  const gen = useRef(0); // a newer load makes an older answer irrelevant

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  /** The first page. `silent`: a background reload (a new notification arrived): no spinner, no error screen. */
  const load = useCallback(
    async (silent = false) => {
      if (!userId) return;
      const my = ++gen.current;
      if (!silent) setRefreshing(true);
      try {
        const r = await fetch(`/api/notifications?inbox=1&limit=${INBOX_PAGE}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const j = (await r.json()) as { notifications?: unknown; unreadCount?: unknown; nextCursor?: unknown };
        if (!alive.current || my !== gen.current) return;
        const page = parseRows(j.notifications);
        const unreadCount = typeof j.unreadCount === "number" ? j.unreadCount : countUnread(page);
        // rows older than the first page that were loaded before stay in the list; the page itself is the truth for its own rows
        const oldest = page.length ? page[page.length - 1].createdAt : null;
        const kept = oldest && silent ? rowsRef.current.filter((x) => x.createdAt < oldest) : [];
        const next = mergeRows(kept, page);
        // a row the page lists as unread but we marked read a moment ago (the request is on its way) is not turned back
        const doneNow = sent.current;
        const reconciled = next.map((x) => (!x.isRead && doneNow.has(x.id) ? { ...x, isRead: true } : x));
        setRows(reconciled);
        setUnread(unreadCount);
        if (!silent || kept.length === 0) setCursor(typeof j.nextCursor === "string" ? j.nextCursor : null);
        setStale(false);
        setStatus("ready");
        setMoreError(false);
        writeCache(userId, reconciled, unreadCount);
      } catch {
        if (!alive.current || my !== gen.current) return;
        if (rowsRef.current.length > 0) setStale(true);
        else if (!silent) setStatus("error");
      } finally {
        if (alive.current && my === gen.current) setRefreshing(false);
      }
    },
    [userId],
  );

  // open: the device copy at once, then the real list
  useEffect(() => {
    if (!userId) return;
    const c = readCache(userId);
    if (c && c.rows.length > 0) {
      setRows(c.rows);
      setUnread(c.unread);
      setStatus("ready");
      setStale(true);
    }
    void load(false);
  }, [userId, load]);

  // a new notification, the app brought back to the front, a read somewhere else: the list follows
  useEffect(() => {
    if (!userId) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void load(true), 500);
    };
    const onVis = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVis);
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket(userId);
      socket.on("new_notification", soon);
    } catch {
      /* no socket: the refresh button and the next open reload */
    }
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
      try {
        socket?.off("new_notification", soon);
      } catch {
        /* gone */
      }
    };
  }, [userId, load]);

  const loadMore = useCallback(async () => {
    if (!userId || !cursor || moreBusy) return;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const r = await fetch(`/api/notifications?inbox=1&limit=${INBOX_PAGE}&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const j = (await r.json()) as { notifications?: unknown; nextCursor?: unknown };
      if (!alive.current) return;
      setRows((cur) => mergeRows(cur, parseRows(j.notifications)));
      setCursor(typeof j.nextCursor === "string" ? j.nextCursor : null);
    } catch {
      if (alive.current) setMoreError(true);
    } finally {
      if (alive.current) setMoreBusy(false);
    }
  }, [userId, cursor, moreBusy]);

  /** Marks these rows read here at once and on the server; `keepLit` keeps them highlighted for this visit. */
  const commitRead = useCallback(
    async (ids: string[], keepLit: boolean) => {
      if (ids.length === 0) return;
      const set = new Set(ids);
      const was = rowsRef.current.filter((x) => !x.isRead && set.has(x.id)).length;
      if (keepLit) setFresh((cur) => new Set([...cur, ...ids]));
      setRows((cur) => markRowsRead(cur, set));
      setUnread((n) => Math.max(0, n - was));
      for (const id of ids) sent.current.add(id);
      const ok = await patch({ ids });
      if (!alive.current) return;
      if (ok) announceUnreadChanged();
      else for (const id of ids) sent.current.delete(id); // the next load / pass tries again
    },
    [],
  );

  // the rows that have no item to be opened in are read once they have been on screen for a moment
  useEffect(() => {
    if (status !== "ready" || stale) return;
    const ids = autoReadIds(rows, sent.current);
    if (ids.length === 0) return;
    const id = setTimeout(() => void commitRead(ids, true), AUTO_READ_MS);
    return () => clearTimeout(id);
  }, [rows, status, stale, commitRead]);

  /** A tap on a row: this row is read. */
  const readOne = useCallback(
    (id: string) => {
      const row = rowsRef.current.find((x) => x.id === id);
      if (!row || row.isRead) return;
      void commitRead([id], true);
    },
    [commitRead],
  );

  /** «Прочитать все». */
  const readAll = useCallback(async () => {
    const lit = rowsRef.current.filter((x) => !x.isRead).map((x) => x.id);
    setFresh((cur) => new Set([...cur, ...lit]));
    setRows((cur) => markRowsRead(cur, "all"));
    setUnread(0);
    const ok = await patch({ markAllRead: true });
    if (!alive.current) return;
    if (ok) {
      announceUnreadChanged();
      if (userId) writeCache(userId, markRowsRead(rowsRef.current, "all"), 0);
    } else void load(true); // not saved: show what the server has
  }, [load, userId]);

  return { rows, unread, status, stale, refreshing, moreBusy, moreError, hasMore: cursor !== null, fresh, reload: () => load(false), loadMore, readOne, readAll };
}

/**
 * The number on the «Уведомления» row of the Профиль list: unread notifications of the list (GET /api/notifications?countOnly=1). Reloads when the
 * numbers change anywhere (a read in the list, the dock) and when a notification arrives.
 */
export function useInboxUnread(userId: string | undefined): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!userId) {
      setN(0);
      return;
    }
    let dead = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const r = await fetch("/api/notifications?countOnly=1", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { unreadCount?: unknown };
        if (!dead && typeof j.unreadCount === "number") setN(Math.max(0, Math.floor(j.unreadCount)));
      } catch {
        /* offline: the last number stays */
      }
    };
    const soon = () => {
      if (t) clearTimeout(t);
      t = setTimeout(load, 500);
    };
    void load();
    const iv = setInterval(() => {
      if (!document.hidden) void load();
    }, 60_000);
    const onVis = () => document.visibilityState === "visible" && soon();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("fomo:unread-changed", soon);
    let socket: ReturnType<typeof getSocket> | null = null;
    try {
      socket = getSocket(userId);
      socket.on("new_notification", soon);
    } catch {
      /* no socket */
    }
    return () => {
      dead = true;
      if (t) clearTimeout(t);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("fomo:unread-changed", soon);
      try {
        socket?.off("new_notification", soon);
      } catch {
        /* gone */
      }
    };
  }, [userId]);
  return n;
}
