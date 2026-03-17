"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface ChatRoomInfo {
  id: string;
  name: string;
  isGeneral: boolean;
  isArchived: boolean;
  isClosed: boolean;
  instrumentSlug: string | null;
  categoryId: string | null;
  categoryName: string | null;
  messagesCount: number;
  membersCount: number;
}

interface CategoryGroup {
  id: string;
  name: string;
  rooms: ChatRoomInfo[];
}

interface Props {
  currentSlug?: string;
  currentRoomId?: string;
  onSelectRoom?: (room: { id: string; name: string; isClosed: boolean; isArchived: boolean }) => void;
}

export default function ChatSidebar({ currentSlug, currentRoomId, onSelectRoom }: Props) {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [rooms, setRooms] = useState<ChatRoomInfo[]>([]);
  const [archivedRooms, setArchivedRooms] = useState<ChatRoomInfo[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-chat-favorites") || "[]"); } catch { return []; }
    }
    return [];
  });
  const [tab, setTab] = useState<"chats" | "archive">("chats");

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const [res, resArchive] = await Promise.all([
        fetch("/api/chat/rooms"),
        fetch("/api/chat/rooms?archived=true"),
      ]);
      if (res.ok) {
        const data = await res.json();
        const active = data.filter((r: ChatRoomInfo) => !r.isArchived);
        setRooms(active);
        // Auto-expand category containing current room
        if (currentSlug) {
          const current = active.find((r: ChatRoomInfo) => r.instrumentSlug === currentSlug);
          if (current?.categoryId) {
            setExpanded(new Set([current.categoryId]));
          }
        }
      }
      if (resArchive.ok) {
        const data = await resArchive.json();
        setArchivedRooms(data.filter((r: ChatRoomInfo) => r.isArchived));
      }
    } catch {}
  }

  function toggleExpand(catId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function toggleFavorite(roomId: string) {
    setFavorites((prev) => {
      const next = prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId];
      localStorage.setItem("fomo-chat-favorites", JSON.stringify(next));
      return next;
    });
  }

  async function unarchiveRoom(roomId: string) {
    try {
      const res = await fetch("/api/chat/rooms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, action: "unarchive" }),
      });
      if (res.ok) {
        loadRooms();
      }
    } catch {}
  }

  // Group rooms by category
  const generalRoom = rooms.find((r) => r.isGeneral);
  const instrumentRooms = rooms.filter((r) => !r.isGeneral);
  const categories: CategoryGroup[] = [];
  const catMap = new Map<string, CategoryGroup>();

  for (const room of instrumentRooms) {
    const catId = room.categoryId || "other";
    const catName = room.categoryName || "Другое";
    if (!catMap.has(catId)) {
      const group = { id: catId, name: catName, rooms: [] };
      catMap.set(catId, group);
      categories.push(group);
    }
    catMap.get(catId)!.rooms.push(room);
  }

  const favoriteRooms = rooms.filter((r) => favorites.includes(r.id));
  const totalMessages = rooms.reduce((sum, r) => sum + r.messagesCount, 0);
  const totalMembers = rooms.reduce((sum, r) => sum + r.membersCount, 0);

  function isActive(room: ChatRoomInfo) {
    if (currentRoomId) return room.id === currentRoomId;
    if (room.isGeneral && !currentSlug) return true;
    return room.instrumentSlug === currentSlug;
  }

  function getRoomHref(room: ChatRoomInfo) {
    if (room.isGeneral) return "/chat";
    if (room.instrumentSlug) return `/chat/${room.instrumentSlug}`;
    return "/chat";
  }

  function renderRoom(room: ChatRoomInfo, indent = false) {
    const active = isActive(room);
    const isFav = favorites.includes(room.id);

    const cls = `flex items-center gap-1 ${indent ? "pl-5 pr-1" : "px-2"} py-1.5 rounded-lg text-sm transition ${
      active
        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
    }`;

    const inner = (
      <>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(room.id); }}
          className={`shrink-0 text-base leading-none transition-colors ${
            isFav ? "text-yellow-400 hover:text-yellow-500" : "text-yellow-300 dark:text-yellow-700 hover:text-yellow-400"
          }`}
          title={isFav ? "Убрать из избранного" : "В избранное"}
        >
          {isFav ? "★" : "☆"}
        </button>
        <span className="flex-1 truncate">
          {room.name}
          {room.isClosed && <span className="ml-1 text-[10px]">🔒</span>}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">({room.membersCount})</span>
      </>
    );

    return (
      <div key={room.id}>
        {onSelectRoom ? (
          <button
            onClick={() => onSelectRoom({ id: room.id, name: room.name, isClosed: room.isClosed, isArchived: room.isArchived })}
            className={`w-full text-left ${cls}`}
          >
            {inner}
          </button>
        ) : (
          <Link href={getRoomHref(room)} className={cls}>
            {inner}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 flex flex-col overflow-hidden">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow flex-1 flex flex-col overflow-hidden">
        {/* Stats bar - prominent */}
        <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-b dark:border-gray-700 shrink-0">
          <div className="flex justify-between text-xs">
            <div className="text-center">
              <div className="font-bold text-blue-700 dark:text-blue-300">{rooms.length}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">тем</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-blue-700 dark:text-blue-300">{totalMembers}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">участников</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-blue-700 dark:text-blue-300">{totalMessages}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">сообщений</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700 shrink-0">
          <button
            onClick={() => setTab("chats")}
            className={`flex-1 py-2 text-xs font-medium transition ${
              tab === "chats"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            }`}
          >
            Чаты
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`flex-1 py-2 text-xs font-medium transition ${
              tab === "archive"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            }`}
          >
            Архив {archivedRooms.length > 0 && `(${archivedRooms.length})`}
          </button>
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {tab === "chats" ? (
            <>
              {/* Favorites section */}
              {favoriteRooms.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[10px] uppercase tracking-wider text-yellow-600 dark:text-yellow-500 font-bold px-2 mb-1 flex items-center gap-1">
                    <span>★</span> Избранные
                  </h4>
                  <div className="space-y-0.5">
                    {favoriteRooms.map((r) => renderRoom(r))}
                  </div>
                  <div className="border-b dark:border-gray-800 my-2" />
                </div>
              )}

              {/* General chat */}
              {generalRoom && renderRoom(generalRoom)}

              {/* Categories with rooms */}
              {categories.map((cat) => {
                const isExp = expanded.has(cat.id);
                const catMemberCount = cat.rooms.reduce((sum, r) => sum + r.membersCount, 0);
                const hasActiveRoom = cat.rooms.some(isActive);

                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        hasActiveRoom
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span className="flex items-center gap-1">
                        <span className="text-xs">{isExp ? "▾" : "▸"}</span>
                        {cat.name}
                      </span>
                      <span className="text-[10px] text-gray-400 font-normal">
                        {cat.rooms.length} · ({catMemberCount})
                      </span>
                    </button>
                    {isExp && (
                      <div className="space-y-0.5">
                        {cat.rooms.map((r) => renderRoom(r, true))}
                      </div>
                    )}
                  </div>
                );
              })}

              {rooms.length === 0 && (
                <div className="text-xs text-gray-400 text-center py-4">Загрузка...</div>
              )}
            </>
          ) : (
            <div className="space-y-0.5">
              {archivedRooms.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  Нет архивных чатов
                </div>
              ) : (
                archivedRooms.map((r) => (
                  <div key={r.id} className="flex items-center gap-1">
                    <div className="flex-1 min-w-0">{renderRoom(r)}</div>
                    {isAdmin && (
                      <button
                        onClick={() => unarchiveRoom(r.id)}
                        className="shrink-0 p-1 rounded text-xs text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition"
                        title="Разархивировать"
                      >
                        📤
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
