"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getSocket } from "@/lib/socket";
import { groupAssets, type AssetItem, type CategoryGroup, type FavoriteRoom, type PrivateRoom, type RoomPreview } from "@/lib/app-chat";

const POLL_MS = 20_000;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export interface RoomsData {
  loaded: boolean;
  failed: boolean;
  categories: CategoryGroup[];
  privateRooms: PrivateRoom[];
  favorites: FavoriteRoom[];
  unread: Record<string, number>;
  generalRoomId: string | null;
  notify: Set<string>;
  previews: Record<string, RoomPreview>;
  reload: () => void;
  reloadPrivate: () => void;
  toggleFavorite: (room: FavoriteRoom) => void;
  toggleNotify: (roomId: string) => void;
  /** a room's name / closed flag by id, from what the list already loaded (null when the list does not know it) */
  findRoom: (roomId: string, generalName: string) => { name: string; isClosed: boolean; isArchived: boolean; isPrivate: boolean; tile: string } | null;
}

/**
 * Everything the Болталка list shows, loaded from the same endpoints as the site's chat sidebar (assets with their rooms, private groups,
 * favourites, unread counters, bells) plus /api/chat/previews for the last message of each room. Kept fresh by polling, the
 * `chat:room-read` event of an opened room, and the tab becoming visible again.
 */
export function useAppRooms(otherName: string): RoomsData {
  const { data: session } = useSession();
  const uid = session?.user?.id;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [privateRooms, setPrivateRooms] = useState<PrivateRoom[]>([]);
  const [favorites, setFavorites] = useState<FavoriteRoom[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [generalRoomId, setGeneralRoomId] = useState<string | null>(null);
  const [notify, setNotify] = useState<Set<string>>(new Set());
  const [previews, setPreviews] = useState<Record<string, RoomPreview>>({});
  const other = useRef(otherName);
  other.current = otherName;

  const loadLive = useCallback(async () => {
    const [u, p] = await Promise.all([
      getJson<{ counts?: Record<string, number>; generalRoomId?: string | null }>("/api/chat/unread"),
      getJson<{ previews?: Record<string, RoomPreview> }>("/api/chat/previews"),
    ]);
    if (u?.counts) setUnread(u.counts);
    if (u?.generalRoomId) setGeneralRoomId(u.generalRoomId);
    if (p?.previews) setPreviews(p.previews);
  }, []);
  const loadPrivate = useCallback(async () => {
    const r = await getJson<PrivateRoom[]>("/api/rooms");
    if (Array.isArray(r)) setPrivateRooms(r);
  }, []);
  const loadFavNotify = useCallback(async () => {
    const [f, n] = await Promise.all([getJson<FavoriteRoom[]>("/api/chat/favorites"), getJson<{ roomIds?: string[] }>("/api/chat/notify")]);
    if (Array.isArray(f)) setFavorites(f);
    if (n?.roomIds) setNotify(new Set(n.roomIds));
  }, []);
  const loadAssets = useCallback(async () => {
    const a = await getJson<AssetItem[]>("/api/assets");
    if (Array.isArray(a)) setCategories(groupAssets(a, other.current));
    else setFailed(true);
  }, []);

  const reload = useCallback(() => {
    void Promise.all([loadLive(), loadPrivate(), loadFavNotify()]);
  }, [loadLive, loadPrivate, loadFavNotify]);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    void Promise.all([loadAssets(), loadLive(), loadPrivate(), loadFavNotify()]).then(() => alive && setLoaded(true));
    const iv = setInterval(() => {
      if (!document.hidden) void loadLive();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void loadLive();
    const onRead = (e: Event) => {
      const roomId = (e as CustomEvent<{ roomId: string }>).detail?.roomId;
      if (roomId) setUnread((prev) => (prev[roomId] ? { ...prev, [roomId]: 0 } : prev));
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("chat:room-read", onRead);
    return () => {
      alive = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("chat:room-read", onRead);
    };
  }, [uid, loadAssets, loadLive, loadPrivate, loadFavNotify]);

  const favRef = useRef(favorites);
  favRef.current = favorites;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;

  const toggleFavorite = useCallback((room: FavoriteRoom) => {
    const has = favRef.current.some((f) => f.roomId === room.roomId);
    setFavorites((prev) => (has ? prev.filter((f) => f.roomId !== room.roomId) : [room, ...prev]));
    const req = has
      ? fetch(`/api/chat/favorites?roomId=${encodeURIComponent(room.roomId)}`, { method: "DELETE" })
      : fetch("/api/chat/favorites", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId: room.roomId }) });
    req
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() => setFavorites((prev) => (has ? [room, ...prev] : prev.filter((f) => f.roomId !== room.roomId))));
  }, []);

  const toggleNotify = useCallback((roomId: string) => {
    const enabled = !notifyRef.current.has(roomId);
    setNotify((prev) => {
      const next = new Set(prev);
      if (enabled) next.add(roomId);
      else next.delete(roomId);
      return next;
    });
    fetch("/api/chat/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId, enabled }) })
      .then((r) => {
        if (!r.ok) throw new Error();
      })
      .catch(() =>
        // the server never got it: roll the bell back
        setNotify((cur) => {
          const back = new Set(cur);
          if (enabled) back.delete(roomId);
          else back.add(roomId);
          return back;
        }),
      );
  }, []);

  const findRoom = useCallback<RoomsData["findRoom"]>(
    (roomId, generalName) => {
      if (roomId === "general" || roomId === generalRoomId) return { name: generalName, isClosed: false, isArchived: false, isPrivate: false, tile: "\u{1F4AC}" };
      for (const c of categories) {
        const a = c.assets.find((x) => x.chatRoom?.id === roomId);
        if (a?.chatRoom) return { name: a.name, isClosed: !!a.chatRoom.isClosed, isArchived: !!a.chatRoom.isArchived, isPrivate: false, tile: "" };
      }
      const p = privateRooms.find((r) => r.id === roomId);
      if (p) return { name: p.name, isClosed: false, isArchived: false, isPrivate: true, tile: "\u{1F512}" };
      return null;
    },
    [categories, privateRooms, generalRoomId],
  );

  return { loaded, failed, categories, privateRooms, favorites, unread, generalRoomId, notify, previews, reload, reloadPrivate: loadPrivate, toggleFavorite, toggleNotify, findRoom };
}

/* ---------- personal conversations ---------- */

export interface DmUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  dmEnabled?: boolean;
}
export interface Conversation {
  id: string;
  updatedAt: string;
  otherUser: DmUser | null;
  lastMessage: { id: string; text: string; createdAt: string; senderId: string } | null;
  unread: boolean;
  unreadCount?: number;
}

export interface DmsData {
  loaded: boolean;
  conversations: Conversation[];
  online: Set<string>;
  reload: () => Promise<void>;
}

/** The «Личные» list: the site's /api/messages/conversations, refreshed on new DMs (socket), the `fomo:unread-changed` event, visibility and a timer. */
export function useAppDms(): DmsData {
  const { data: session } = useSession();
  const uid = session?.user?.id;
  const [loaded, setLoaded] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [online, setOnline] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    const r = await getJson<Conversation[]>("/api/messages/conversations");
    if (Array.isArray(r)) setConversations(r);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!uid) return;
    void reload();
    void getJson<string[]>("/api/users/online").then((ids) => Array.isArray(ids) && setOnline(new Set(ids)));
    const iv = setInterval(() => {
      if (!document.hidden) void reload();
    }, POLL_MS);
    const onVis = () => document.visibilityState === "visible" && void reload();
    const onChanged = () => void reload();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("fomo:unread-changed", onChanged);
    let socket: ReturnType<typeof getSocket> | null = null;
    const up = (id: string) => setOnline((p) => new Set(p).add(id));
    const down = (id: string) =>
      setOnline((p) => {
        const n = new Set(p);
        n.delete(id);
        return n;
      });
    try {
      socket = getSocket(uid);
      socket.on("new_dm", onChanged);
      socket.on("user_online", up);
      socket.on("user_offline", down);
    } catch {
      /* realtime is optional: the timer still refreshes the list */
    }
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("fomo:unread-changed", onChanged);
      try {
        socket?.off("new_dm", onChanged);
        socket?.off("user_online", up);
        socket?.off("user_offline", down);
      } catch {
        /* ignore */
      }
    };
  }, [uid, reload]);

  return { loaded, conversations, online, reload };
}
