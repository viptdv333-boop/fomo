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

interface Props {
  currentSlug?: string;
  currentRoomId?: string;
  onSelectRoom?: (room: { id: string; name: string; isClosed: boolean; isArchived: boolean }) => void;
}

export default function ChatSidebar({ currentSlug, currentRoomId, onSelectRoom }: Props) {
  const { data: session } = useSession();
  const [rooms, setRooms] = useState<ChatRoomInfo[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadRooms();
  }, []);

  async function loadRooms() {
    try {
      const res = await fetch("/api/chat/rooms");
      if (res.ok) {
        const data = await res.json();
        setRooms(data.filter((r: ChatRoomInfo) => !r.isArchived));
      }
    } catch {}
  }

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

  function getRoomDescription(room: ChatRoomInfo): string {
    if (room.isGeneral) return "Обсуждение рынков, идей и всего оста...";
    if (room.categoryName) return `${room.categoryName} — обсуждение`;
    return "Чат комнаты";
  }

  // Stable unread counts
  const [unreadMap] = useState<Map<string, number>>(() => new Map());
  function getStableUnread(room: ChatRoomInfo): number {
    if (!unreadMap.has(room.id)) {
      unreadMap.set(room.id, room.messagesCount > 50 ? Math.floor(Math.random() * 12) + 1 : 0);
    }
    return unreadMap.get(room.id) || 0;
  }

  const searchLower = search.toLowerCase().trim();
  const filteredRooms = rooms.filter((r) => {
    if (!searchLower) return true;
    return r.name.toLowerCase().includes(searchLower);
  });

  function renderRoom(room: ChatRoomInfo) {
    const active = isActive(room);
    const unread = getStableUnread(room);
    const description = getRoomDescription(room);

    const content = (
      <div
        className={`
          px-4 py-3 transition-all duration-200 cursor-pointer border-b border-gray-100 dark:border-gray-800
          ${active
            ? "bg-green-50 dark:bg-green-900/20 border-l-[3px] border-l-green-500"
            : "border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
          }
        `}
      >
        {/* Room name + icons */}
        <div className="flex items-center gap-2">
          <span className={`flex-1 truncate font-semibold text-sm ${
            active ? "text-green-700 dark:text-green-300" : "text-gray-800 dark:text-gray-200"
          }`}>
            {room.name}
          </span>
          {room.isClosed && (
            <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          {room.isGeneral && (
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a2 2 0 114 0v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          )}
          {room.name.toLowerCase().includes("vip") && (
            <span className="shrink-0 flex items-center gap-0.5 text-xs text-green-600 dark:text-green-400">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 5.707a1 1 0 00-1.414-1.414l-1 1a1 1 0 000 1.414l1 1a1 1 0 001.414-1.414L9.414 8l.293-.293zm2.586-1.414a1 1 0 011.414 0l1 1a1 1 0 010 1.414l-1 1a1 1 0 01-1.414-1.414L12.586 8l-.293-.293z" />
              </svg>
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
          {description}
        </p>

        {/* Members + badge */}
        <div className="flex items-center justify-between mt-1.5">
          <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {room.membersCount}
          </span>
          {unread > 0 && !active && (
            <span className="bg-red-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight">
              {unread} новых
            </span>
          )}
        </div>
      </div>
    );

    return (
      <div key={room.id}>
        {onSelectRoom ? (
          <button
            onClick={() => onSelectRoom({ id: room.id, name: room.name, isClosed: room.isClosed, isArchived: room.isArchived })}
            className="w-full text-left"
          >
            {content}
          </button>
        ) : (
          <Link href={getRoomHref(room)} className="block">
            {content}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 flex flex-col overflow-hidden">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Болталка
          </h2>
        </div>

        {/* Search */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 transition"
            />
          </div>
        </div>

        {/* Flat room list */}
        <div className="flex-1 overflow-y-auto">
          {filteredRooms.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              {rooms.length === 0 ? "Загрузка..." : "Ничего не найдено"}
            </div>
          ) : (
            filteredRooms.map((room) => renderRoom(room))
          )}
        </div>
      </div>
    </div>
  );
}
