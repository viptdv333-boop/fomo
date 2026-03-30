"use client";

import { useState } from "react";

interface Conversation {
  id: string;
  otherUser: { id: string; displayName: string; avatarUrl: string | null } | null;
  lastMessage: { text: string; createdAt: string; senderId: string } | null;
  unread: boolean;
  updatedAt: string;
}

interface Props {
  activeConvId: string | null;
  onSelect: (conv: Conversation) => void;
  onNewChat: () => void;
  conversations: Conversation[];
}

export default function DMSidebar({ activeConvId, onSelect, onNewChat, conversations }: Props) {
  const [search, setSearch] = useState("");

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    return c.otherUser?.displayName?.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="w-80 shrink-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
      <div className="px-4 pt-4 pb-2 shrink-0">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Личные</h2>
      </div>

      <div className="px-4 pb-3 shrink-0">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Поиск..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg placeholder-gray-400 dark:placeholder-gray-500 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500" />
        </div>
      </div>

      <button onClick={onNewChat}
        className="mx-4 mb-3 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
        + Начать новый чат
      </button>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-400">Нет диалогов</div>
        ) : filtered.map((conv) => {
          const other = conv.otherUser || { id: "", displayName: "Удалённый", avatarUrl: null };
          const active = conv.id === activeConvId;
          return (
            <button key={conv.id} onClick={() => onSelect(conv)}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition border-l-2 ${
                active
                  ? "bg-green-50 dark:bg-green-900/20 border-green-500"
                  : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}>
              <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden">
                {other.avatarUrl ? (
                  <img src={other.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  other.displayName[0]?.toUpperCase() || "?"
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline">
                  <span className={`font-semibold text-sm truncate ${conv.unread ? "text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}>
                    {other.displayName}
                  </span>
                  {conv.lastMessage && (
                    <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                      {new Date(conv.lastMessage.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                {conv.lastMessage && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{conv.lastMessage.text}</p>
                )}
              </div>
              {conv.unread && (
                <div className="w-2.5 h-2.5 bg-green-500 rounded-full shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
