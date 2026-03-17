"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ChatRoomInfo {
  id: string;
  name: string;
  isGeneral: boolean;
  isArchived: boolean;
  isClosed: boolean;
  instrumentSlug: string | null;
  messagesCount: number;
  membersCount: number;
}

interface Props {
  currentSlug?: string;
  currentRoomId?: string;
  onSelectRoom?: (room: { id: string; name: string; isClosed: boolean }) => void;
}

export default function ChatSidebar({ currentSlug, currentRoomId, onSelectRoom }: Props) {
  const [rooms, setRooms] = useState<ChatRoomInfo[]>([]);
  const [archivedRooms, setArchivedRooms] = useState<ChatRoomInfo[]>([]);
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
        setRooms(data.filter((r: ChatRoomInfo) => !r.isArchived));
      }
      if (resArchive.ok) {
        const data = await resArchive.json();
        setArchivedRooms(data.filter((r: ChatRoomInfo) => r.isArchived));
      }
    } catch {}
  }

  function toggleFavorite(roomId: string) {
    setFavorites((prev) => {
      const next = prev.includes(roomId) ? prev.filter((id) => id !== roomId) : [...prev, roomId];
      localStorage.setItem("fomo-chat-favorites", JSON.stringify(next));
      return next;
    });
  }

  const favoriteRooms = rooms.filter((r) => favorites.includes(r.id));
  const regularRooms = rooms.filter((r) => !favorites.includes(r.id));
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

  function renderRoom(room: ChatRoomInfo) {
    const active = isActive(room);
    const isFav = favorites.includes(room.id);

    const content = (
      <>
        <span className="flex-1 truncate">
          {room.name}
          {room.isClosed && <span className="ml-1 text-[10px] text-red-400">🔒</span>}
        </span>
        <span className="text-[10px] text-gray-400 shrink-0">({room.membersCount})</span>
      </>
    );

    const className = `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition ${
      active
        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
    }`;

    return (
      <div key={room.id} className="group relative">
        {onSelectRoom ? (
          <button
            onClick={() => onSelectRoom({ id: room.id, name: room.name, isClosed: room.isClosed })}
            className={`w-full text-left ${className}`}
          >
            {content}
          </button>
        ) : (
          <Link href={getRoomHref(room)} className={className}>
            {content}
          </Link>
        )}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(room.id); }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 text-xs transition ${
            isFav ? "text-yellow-500 opacity-100" : "text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100"
          } hover:text-yellow-500`}
          title={isFav ? "Убрать из избранного" : "В избранное"}
        >
          {isFav ? "★" : "☆"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 shrink-0 flex flex-col overflow-hidden">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow flex-1 flex flex-col overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b dark:border-gray-700 shrink-0">
          <button
            onClick={() => setTab("chats")}
            className={`flex-1 py-2.5 text-xs font-medium transition ${
              tab === "chats"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            }`}
          >
            Чаты
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`flex-1 py-2.5 text-xs font-medium transition ${
              tab === "archive"
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
            }`}
          >
            Архив {archivedRooms.length > 0 && `(${archivedRooms.length})`}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {tab === "chats" ? (
            <>
              {favoriteRooms.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-[10px] uppercase tracking-wider text-yellow-600 dark:text-yellow-500 font-semibold px-2 mb-1">
                    ★ Избранные
                  </h4>
                  <div className="space-y-0.5">{favoriteRooms.map(renderRoom)}</div>
                </div>
              )}
              <div>
                {favoriteRooms.length > 0 && (
                  <h4 className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-semibold px-2 mb-1">
                    Все чаты
                  </h4>
                )}
                <div className="space-y-0.5">
                  {rooms.length === 0 ? (
                    <div className="text-xs text-gray-400 text-center py-4">Загрузка...</div>
                  ) : (
                    regularRooms.map(renderRoom)
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-0.5">
              {archivedRooms.length === 0 ? (
                <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  Нет архивных чатов
                </div>
              ) : (
                archivedRooms.map(renderRoom)
              )}
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="border-t dark:border-gray-700 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl shrink-0">
          <div className="flex justify-between text-[10px] text-gray-500 dark:text-gray-400">
            <span>Тем: <span className="font-medium text-gray-700 dark:text-gray-300">{rooms.length}</span></span>
            <span>Участников: <span className="font-medium text-gray-700 dark:text-gray-300">{totalMembers}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
