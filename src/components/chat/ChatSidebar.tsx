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
  const [search, setSearch] = useState("");

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

  // Filter rooms by search query
  const searchLower = search.toLowerCase().trim();
  function matchesSearch(room: ChatRoomInfo) {
    if (!searchLower) return true;
    return room.name.toLowerCase().includes(searchLower);
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

  // Generate a fake "new messages" count for demo badge display
  // In production, replace with real unread counts
  function getUnreadCount(room: ChatRoomInfo): number {
    if (room.messagesCount > 50) return Math.floor(Math.random() * 15) + 1;
    return 0;
  }

  // Stable unread counts (memoized per render via map)
  const [unreadMap] = useState<Map<string, number>>(() => new Map());

  function getStableUnread(room: ChatRoomInfo): number {
    if (!unreadMap.has(room.id)) {
      // For demo purposes; replace with real unread data
      unreadMap.set(room.id, room.messagesCount > 50 ? Math.floor(Math.random() * 12) + 1 : 0);
    }
    return unreadMap.get(room.id) || 0;
  }

  function getRoomDescription(room: ChatRoomInfo): string {
    if (room.isGeneral) return "Общий чат для всех участников";
    if (room.categoryName) return `${room.categoryName} — обсуждение`;
    return "Чат комнаты";
  }

  function getRoomIcon(room: ChatRoomInfo): string | null {
    if (room.isClosed) return "lock";
    if (room.isGeneral) return "pin";
    if (room.name.toLowerCase().includes("vip")) return "vip";
    return null;
  }

  function renderRoom(room: ChatRoomInfo) {
    if (!matchesSearch(room)) return null;

    const active = isActive(room);
    const isFav = favorites.includes(room.id);
    const unread = getStableUnread(room);
    const icon = getRoomIcon(room);
    const description = getRoomDescription(room);

    const content = (
      <div
        className={`
          relative px-4 py-3 transition-all duration-200 cursor-pointer
          ${active
            ? "bg-green-50 dark:bg-green-900/20 border-l-[3px] border-l-green-500"
            : "border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50 hover:translate-x-[2px]"
          }
        `}
      >
        {/* Top row: room name + icons */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(room.id); }}
            className={`shrink-0 text-sm leading-none transition-colors ${
              isFav ? "text-green-500 hover:text-green-600" : "text-gray-300 dark:text-gray-600 hover:text-green-400"
            }`}
            title={isFav ? "Убрать из избранного" : "В избранное"}
          >
            {isFav ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            )}
          </button>
          <span className={`flex-1 truncate font-semibold text-sm ${
            active ? "text-green-700 dark:text-green-300" : "text-gray-800 dark:text-gray-200"
          }`}>
            {room.name}
          </span>
          {icon === "lock" && (
            <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          )}
          {icon === "pin" && (
            <svg className="w-3.5 h-3.5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a2 2 0 114 0v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
          )}
          {icon === "vip" && (
            <span className="shrink-0 text-xs font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1.5 py-0.5 rounded">
              VIP
            </span>
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate pl-6">
          {description}
        </p>

        {/* Bottom row: members + badge */}
        <div className="flex items-center justify-between mt-1.5 pl-6">
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {room.membersCount}
          </span>
          {unread > 0 && !active && (
            <span className="bg-red-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full leading-tight">
              {unread} {unread === 1 ? "новое" : unread < 5 ? "новых" : "новых"}
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
        {/* Divider */}
        <div className="mx-4 border-b border-gray-100 dark:border-gray-800" />
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 flex flex-col overflow-hidden">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 flex-1 flex flex-col overflow-hidden">

        {/* Header: title */}
        <div className="px-4 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            Болталка
          </h2>
        </div>

        {/* Search input */}
        <div className="px-4 pb-3 shrink-0">
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Поиск чатов..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 transition"
            />
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 pb-2 shrink-0">
          <div className="flex justify-between text-xs px-1">
            <div className="text-center">
              <div className="font-bold text-green-600 dark:text-green-400">{rooms.length}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">тем</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-green-600 dark:text-green-400">{totalMembers}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">участников</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-green-600 dark:text-green-400">{totalMessages}</div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">сообщений</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
          <button
            onClick={() => setTab("chats")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === "chats"
                ? "text-green-600 dark:text-green-400 border-b-2 border-green-500"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Чаты
          </button>
          <button
            onClick={() => setTab("archive")}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              tab === "archive"
                ? "text-green-600 dark:text-green-400 border-b-2 border-green-500"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            Архив {archivedRooms.length > 0 && `(${archivedRooms.length})`}
          </button>
        </div>

        {/* Room list */}
        <div className="flex-1 overflow-y-auto">
          {tab === "chats" ? (
            <>
              {/* Favorites section */}
              {favoriteRooms.length > 0 && (
                <div>
                  <h4 className="text-[10px] uppercase tracking-wider text-green-600 dark:text-green-400 font-bold px-4 pt-3 pb-1 flex items-center gap-1.5">
                    <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    Избранные
                  </h4>
                  {favoriteRooms.map((r) => renderRoom(r))}
                  <div className="mx-4 border-b-2 border-gray-100 dark:border-gray-800 my-1" />
                </div>
              )}

              {/* General chat */}
              {generalRoom && renderRoom(generalRoom)}

              {/* Categories with rooms */}
              {categories.map((cat) => {
                const isExp = expanded.has(cat.id);
                const catMemberCount = cat.rooms.reduce((sum, r) => sum + r.membersCount, 0);
                const hasActiveRoom = cat.rooms.some(isActive);
                const visibleRooms = cat.rooms.filter(matchesSearch);
                if (searchLower && visibleRooms.length === 0) return null;

                return (
                  <div key={cat.id}>
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold transition-colors ${
                        hasActiveRoom
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <svg
                          className={`w-3 h-3 transition-transform duration-200 ${isExp ? "rotate-90" : ""}`}
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        {cat.name}
                      </span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">
                        {cat.rooms.length} &middot; {catMemberCount}
                      </span>
                    </button>
                    {(isExp || !!searchLower) && (
                      <div>
                        {cat.rooms.map((r) => renderRoom(r))}
                      </div>
                    )}
                  </div>
                );
              })}

              {rooms.length === 0 && (
                <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  Загрузка...
                </div>
              )}

              {searchLower && rooms.length > 0 && rooms.filter(matchesSearch).length === 0 && (
                <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  Ничего не найдено
                </div>
              )}
            </>
          ) : (
            <div>
              {archivedRooms.length === 0 ? (
                <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  Нет архивных чатов
                </div>
              ) : (
                archivedRooms.map((r) => (
                  <div key={r.id} className="flex items-center">
                    <div className="flex-1 min-w-0">{renderRoom(r)}</div>
                    {isAdmin && (
                      <button
                        onClick={() => unarchiveRoom(r.id)}
                        className="shrink-0 mr-3 p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                        title="Разархивировать"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
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
