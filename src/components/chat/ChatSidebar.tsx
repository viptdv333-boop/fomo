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
  ticker: string | null;
  instrumentType: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  exchangeName: string | null;
  exchangeSlug: string | null;
  exchangeShort: string | null;
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

  // Pinned & favorites (localStorage)
  const [pinnedRooms, setPinnedRooms] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-pinned-rooms") || "[]"); } catch { return []; }
    }
    return [];
  });
  const [favoriteRooms, setFavoriteRooms] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("fomo-favorite-rooms") || "[]"); } catch { return []; }
    }
    return [];
  });

  function togglePin(roomId: string) {
    const next = pinnedRooms.includes(roomId)
      ? pinnedRooms.filter((id) => id !== roomId)
      : pinnedRooms.length >= 5 ? pinnedRooms : [...pinnedRooms, roomId];
    setPinnedRooms(next);
    localStorage.setItem("fomo-pinned-rooms", JSON.stringify(next));
  }

  function toggleFavorite(roomId: string) {
    const next = favoriteRooms.includes(roomId)
      ? favoriteRooms.filter((id) => id !== roomId)
      : [...favoriteRooms, roomId];
    setFavoriteRooms(next);
    localStorage.setItem("fomo-favorite-rooms", JSON.stringify(next));
  }

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

  // Room context menu
  const [roomMenu, setRoomMenu] = useState<{ roomId: string; x: number; y: number } | null>(null);

  // Tree: track which sections are OPEN (default: all closed except active room's branch)
  const [openExchanges, setOpenExchanges] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [treeInitialized, setTreeInitialized] = useState(false);

  // Auto-open the branch of the active room
  useEffect(() => {
    if (treeInitialized || rooms.length === 0) return;
    const activeRoom = rooms.find(r => isActive(r));
    if (activeRoom) {
      // Determine which theme group this room belongs to
      const themeKey =
        activeRoom.instrumentType === "stock" && activeRoom.exchangeSlug === "moex" ? "ru-stocks" :
        activeRoom.instrumentType === "stock" && (activeRoom.exchangeSlug === "nyse" || activeRoom.exchangeSlug === "cme") ? "us-stocks" :
        activeRoom.instrumentType === "crypto" || (activeRoom.categorySlug || "").includes("crypto") ? "crypto" :
        activeRoom.instrumentType === "currency" || (activeRoom.categorySlug || "").includes("currency") ? "currencies" :
        (activeRoom.categorySlug || "").includes("index") || (activeRoom.categorySlug || "").includes("spot-ind") ? "indices" :
        (activeRoom.name || "").toLowerCase().match(/золот|серебр|платин|палладий|медь|gold|silver|copper/) ? "metals" :
        (activeRoom.categorySlug || "").includes("commodity") || (activeRoom.categorySlug || "").includes("spot-commodity") ? "commodities" :
        activeRoom.exchangeSlug || "other";
      setOpenExchanges(new Set([themeKey]));
    }
    setTreeInitialized(true);
  }, [rooms, treeInitialized]);

  function toggleExchange(slug: string) {
    setOpenExchanges(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug); else next.add(slug);
      return next;
    });
  }
  function toggleCategory(key: string) {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const searchLower = search.toLowerCase().trim();
  const filteredRooms = rooms
    .filter((r) => {
      if (!searchLower) return true;
      return r.name.toLowerCase().includes(searchLower);
    })
    .sort((a, b) => {
      // Pinned first, then favorites, then rest
      const aPin = pinnedRooms.includes(a.id) ? 0 : 1;
      const bPin = pinnedRooms.includes(b.id) ? 0 : 1;
      if (aPin !== bPin) return aPin - bPin;
      const aFav = favoriteRooms.includes(a.id) ? 0 : 1;
      const bFav = favoriteRooms.includes(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return 0;
    });

  function renderRoom(room: ChatRoomInfo) {
    const active = isActive(room);
    const unread = getStableUnread(room);
    const description = getRoomDescription(room);
    const isPinned = pinnedRooms.includes(room.id);
    const isFav = favoriteRooms.includes(room.id);

    const content = (
      <div
        className={`
          px-4 py-3 transition-all duration-200 cursor-pointer
          ${active
            ? "bg-green-50 dark:bg-green-900/20 border-l-[3px] border-l-green-500"
            : "border-l-[3px] border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
          }
        `}
        onContextMenu={(e) => { e.preventDefault(); setRoomMenu({ roomId: room.id, x: e.clientX, y: e.clientY }); }}
      >
        {/* Room name + icons */}
        <div className="flex items-center gap-2">
          {isPinned && <span className="text-gray-400 text-[10px] shrink-0">📌</span>}
          {isFav && <span className="text-amber-400 shrink-0 text-xs">★</span>}
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

        {/* Room list — General chat + thematic categories with instrument rooms inside */}
        <div className="flex-1 overflow-y-auto" onClick={() => setRoomMenu(null)}>
          {rooms.length === 0 ? (
            <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">Загрузка...</div>
          ) : (
            <>
              {/* General chat */}
              {filteredRooms.filter(r => r.isGeneral).map(room => renderRoom(room))}

              {/* Thematic groups with instrument rooms inside */}
              {(() => {
                const instrumentRooms = filteredRooms.filter(r => !r.isGeneral && r.instrumentSlug);

                const themes: { key: string; label: string; emoji: string; match: (r: ChatRoomInfo) => boolean }[] = [
                  { key: "ru-stocks", label: "РФ Акции", emoji: "🇷🇺", match: r => r.instrumentType === "stock" && r.exchangeSlug === "moex" },
                  { key: "us-stocks", label: "США Акции", emoji: "🇺🇸", match: r => r.instrumentType === "stock" && (r.exchangeSlug === "nyse" || r.exchangeSlug === "cme") },
                  { key: "metals", label: "Металлы", emoji: "🥇", match: r => {
                    const kw = ["золот", "серебр", "платин", "палладий", "медь", "gold", "silver", "platinum", "palladium", "copper"];
                    return kw.some(k => (r.name || "").toLowerCase().includes(k));
                  }},
                  { key: "commodities", label: "Сырьё", emoji: "🛢️", match: r => {
                    if (r.instrumentType !== "futures" && r.instrumentType !== "spot") return false;
                    return (r.categorySlug || "").includes("commodit") || (r.categorySlug || "").includes("spot-commodit");
                  }},
                  { key: "indices", label: "Индексы", emoji: "📊", match: r => (r.categorySlug || "").includes("index") || (r.categorySlug || "").includes("spot-ind") },
                  { key: "currencies", label: "Валюты", emoji: "💱", match: r => r.instrumentType === "currency" || (r.categorySlug || "").includes("currency") },
                  { key: "crypto", label: "Крипта", emoji: "₿", match: r => r.instrumentType === "crypto" || (r.categorySlug || "").includes("crypto") },
                  { key: "other", label: "Другие", emoji: "🌏", match: () => true },
                ];

                const assigned = new Set<string>();
                const groups: { key: string; label: string; emoji: string; rooms: ChatRoomInfo[] }[] = [];

                for (const theme of themes) {
                  const matching = instrumentRooms.filter(r => !assigned.has(r.id) && theme.match(r));
                  if (matching.length > 0) {
                    groups.push({ ...theme, rooms: matching });
                    matching.forEach(r => assigned.add(r.id));
                  }
                }

                // Clean display name: Russian, no tickers/exchanges
                // Map ALL instrument names to clean chat topic names
                // Multiple instruments → same topic = deduplicated to one entry
                const nameMap: Record<string, string> = {
                  // Нефть — все варианты → "Нефть"
                  "Нефть Brent": "Нефть", "Brent Crude": "Нефть", "ICE Brent": "Нефть",
                  "WTI Crude Oil": "Нефть", "Brent": "Нефть", "WTI": "Нефть",
                  // Газ
                  "Природный газ": "Газ", "Natural Gas": "Газ",
                  // Газойль → Дизель (или скрыть)
                  "ICE Gasoil": "Газ",
                  // Металлы
                  "Gold": "Золото", "Silver": "Серебро", "Copper": "Медь", "Platinum": "Платина",
                  // Зерновые
                  "Corn": "Кукуруза", "Wheat": "Пшеница", "Soybean": "Соя",
                  // Индексы — латиница, без перевода
                  "E-mini S&P 500": "S&P 500", "S&P 500": "S&P 500",
                  "E-mini Nasdaq 100": "Nasdaq 100", "NASDAQ 100": "Nasdaq 100",
                  "E-mini Dow Jones": "Dow Jones", "E-mini Russell 2000": "Russell 2000",
                  "Hang Seng": "Hang Seng", "Hang Seng Index Futures": "Hang Seng",
                  "HS China Enterprises Futures": "HSCEI",
                  "DAX 40": "DAX 40", "FTSE 100": "FTSE 100", "Nikkei 225": "Nikkei 225",
                  "IMOEX": "Индекс MOEX", "Индекс МосБиржи": "Индекс MOEX", "Индекс РТС": "РТС",
                  // Валюты — только 3 пары
                  "Доллар/Рубль": "Рубль/Доллар", "Euro FX": "Евро/Доллар",
                  "Евро/Рубль": "Евро/Доллар", "Юань/Рубль": "Рубль/Юань",
                  "Japanese Yen": "Рубль/Доллар", "US Dollar Index": "Рубль/Доллар",
                };
                // Keyword-based mapping: if name contains keyword → use mapped name
                const keywordMap: [RegExp, string][] = [
                  // Нефть — всё в одну тему
                  [/brent|wti|crude|нефть/i, "Нефть"],
                  // Газ
                  [/газ|gas|gasoil/i, "Газ"],
                  // Металлы
                  [/золот|gold/i, "Золото"], [/серебр|silver/i, "Серебро"],
                  [/медь|copper/i, "Медь"], [/платин|platinum/i, "Платина"],
                  [/палладий|palladium/i, "Палладий"],
                  // Зерновые
                  [/кукуруз|corn/i, "Кукуруза"], [/пшениц|wheat/i, "Пшеница"],
                  [/соя|soy/i, "Соя"], [/сахар|sugar/i, "Сахар"], [/какао|cocoa/i, "Какао"],
                  // Индексы
                  [/s&p|s\&p|spx|spyf|snp/i, "S&P 500"], [/nasdaq|nasd/i, "Nasdaq 100"],
                  [/dow\s*jones|ym\b/i, "Dow Jones"], [/russell/i, "Russell 2000"],
                  [/hang\s*seng|hsi\b/i, "Hang Seng"], [/hscei|china.*enterpr/i, "HSCEI"],
                  [/dax/i, "DAX 40"], [/ftse/i, "FTSE 100"], [/nikkei/i, "Nikkei 225"],
                  [/мосбирж|imoex|индекс moex/i, "Индекс MOEX"], [/ртс|rts\b/i, "РТС"],
                  // Валюты — только 3
                  [/доллар.*рубл|рубл.*доллар|si\b|usd.*rub/i, "Рубль/Доллар"],
                  [/юань.*рубл|рубл.*юань|cr\b|cny.*rub/i, "Рубль/Юань"],
                  [/евро.*долл|euro.*fx|eur.*usd|6e\b/i, "Евро/Доллар"],
                  [/евро.*рубл|рубл.*евро|eu\b/i, "Евро/Доллар"],
                  [/japan|yen|6j\b/i, "Рубль/Доллар"], // merge into existing
                  [/dollar.*index|dx\b/i, "Рубль/Доллар"], // merge into existing
                ];

                const simpleName = (name: string) => {
                  const cleaned = name.replace(/\s*\([^)]*\)\s*/g, "").trim();
                  // Try exact match first
                  if (nameMap[cleaned]) return nameMap[cleaned];
                  if (nameMap[name]) return nameMap[name];
                  // Try keyword match
                  for (const [re, mapped] of keywordMap) {
                    if (re.test(name)) return mapped;
                  }
                  // Fallback
                  return cleaned
                    .replace(/\s+фьючерс\s*/gi, "")
                    .replace(/\s+futures?\s*/gi, "")
                    .replace(/\s*plc\s*/gi, "")
                    .replace(/^ICE\s+/i, "")
                    .replace(/^E-mini\s+/i, "")
                    .trim();
                };

                // Deduplicate: if multiple rooms have the same clean name, keep only one
                const dedup = (rooms: ChatRoomInfo[]) => {
                  const seen = new Map<string, ChatRoomInfo>();
                  for (const r of rooms) {
                    const clean = simpleName(r.name).toLowerCase();
                    if (!seen.has(clean)) seen.set(clean, r);
                  }
                  return [...seen.values()];
                };

                return groups.map(group => {
                  const isOpen = openExchanges.has(group.key);
                  const uniqueRooms = dedup(group.rooms);
                  return (
                    <div key={group.key}>
                      <button
                        onClick={() => toggleExchange(group.key)}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"
                      >
                        <svg className={`w-3 h-3 transition-transform text-gray-400 ${isOpen ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                          <path d="M6 4l8 6-8 6V4z" />
                        </svg>
                        <span>{group.emoji}</span>
                        <span>{group.label}</span>
                        <span className="ml-auto text-[10px] text-gray-400 font-normal">{uniqueRooms.length}</span>
                      </button>
                      {isOpen && uniqueRooms.map(room => {
                        const active = isActive(room);
                        return (
                          <Link
                            key={room.id}
                            href={getRoomHref(room)}
                            onContextMenu={(e) => { e.preventDefault(); setRoomMenu({ roomId: room.id, x: e.clientX, y: e.clientY }); }}
                            className={`block pl-10 pr-4 py-2 text-sm transition truncate ${
                              active
                                ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 font-medium border-l-2 border-green-500"
                                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800/50 border-l-2 border-transparent"
                            }`}
                          >
                            {simpleName(room.name)}
                          </Link>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </>
          )}
        </div>

        {/* Room context menu */}
        {roomMenu && (
          <div
            className="fixed inset-0 z-50"
            onClick={() => setRoomMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setRoomMenu(null); }}
          >
            <div
              className="absolute bg-white dark:bg-gray-800 rounded-xl shadow-lg py-1 w-44 z-50"
              style={{ left: roomMenu.x, top: roomMenu.y }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => { togglePin(roomMenu.roomId); setRoomMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
              >
                {pinnedRooms.includes(roomMenu.roomId) ? "📌 Открепить" : "📌 Закрепить"}
              </button>
              <button
                onClick={() => { toggleFavorite(roomMenu.roomId); setRoomMenu(null); }}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 dark:text-gray-200"
              >
                {favoriteRooms.includes(roomMenu.roomId) ? "★ Убрать из избранного" : "☆ В избранное"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
