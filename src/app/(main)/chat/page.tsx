"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import DMSidebar from "@/components/chat/DMSidebar";
import DMChat from "@/components/chat/DMChat";
import AuthGuard from "@/components/layout/AuthGuard";

interface Conversation {
  id: string;
  otherUser: { id: string; displayName: string; avatarUrl: string | null } | null;
  lastMessage: { text: string; createdAt: string; senderId: string } | null;
  unread: boolean;
  updatedAt: string;
}

function ChatPageInner() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");
  const dmParam = searchParams.get("dm");

  const [tab, setTab] = useState<"chat" | "dm">(dmParam ? "dm" : "chat");

  // Public chat state
  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; isClosed: boolean; isArchived: boolean }>({
    id: roomParam || "general",
    name: roomParam ? "..." : "Общий чат",
    isClosed: false,
    isArchived: false,
  });

  // DM state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(dmParam || null);
  const [showNewDmSearch, setShowNewDmSearch] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmSearchResults, setDmSearchResults] = useState<{ id: string; displayName: string; avatarUrl: string | null }[]>([]);

  useEffect(() => {
    if (roomParam && roomParam !== "general") {
      fetch("/api/chat/rooms")
        .then((r) => r.json())
        .then((rooms: any[]) => {
          const found = rooms.find((r: any) => r.id === roomParam);
          if (found) setCurrentRoom({ id: found.id, name: found.name, isClosed: found.isClosed || false, isArchived: found.isArchived || false });
        })
        .catch(() => {});
    }
  }, [roomParam]);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/messages/conversations");
    if (res.ok) setConversations(await res.json());
  }, []);

  useEffect(() => {
    if (tab === "dm") {
      loadConversations().then(() => {
        const startWith = searchParams.get("startWith");
        if (startWith && session?.user?.id && startWith !== session.user.id) {
          startDmConversation(startWith);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loadConversations]);

  // New DM search
  useEffect(() => {
    if (dmSearch.length < 2) { setDmSearchResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/broadcast/users?q=${encodeURIComponent(dmSearch)}`);
      if (res.ok) setDmSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(t);
  }, [dmSearch]);

  async function startDmConversation(userId: string) {
    const res = await fetch("/api/messages/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      setActiveConvId(data.id);
      setShowNewDmSearch(false);
      setDmSearch("");
      setDmSearchResults([]);
      await loadConversations();
    }
  }

  const activeConv = conversations.find((c) => c.id === activeConvId);
  const activeOther = activeConv?.otherUser || null;

  return (
    <AuthGuard>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 mb-3 shrink-0">
          <button onClick={() => setTab("chat")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              tab === "chat" ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border dark:border-gray-700"
            }`}>
            💬 Болталка
          </button>
          <button onClick={() => setTab("dm")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition ${
              tab === "dm" ? "bg-green-600 text-white" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border dark:border-gray-700"
            }`}>
            ✉️ Личные
          </button>
        </div>

        {/* Content */}
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {tab === "chat" ? (
            <>
              <ChatSidebar currentRoomId={currentRoom.id} onSelectRoom={(room) => setCurrentRoom(room)} />
              <div className="flex-1 min-h-0">
                <ChatRoom roomId={currentRoom.id} roomName={currentRoom.name} isClosed={currentRoom.isClosed} isArchived={currentRoom.isArchived} />
              </div>
            </>
          ) : (
            <>
              <DMSidebar
                activeConvId={activeConvId}
                conversations={conversations}
                onSelect={(conv) => setActiveConvId(conv.id)}
                onNewChat={() => setShowNewDmSearch(true)}
              />
              <div className="flex-1 min-h-0">
                {activeConvId && activeOther ? (
                  <DMChat conversationId={activeConvId} otherUserName={activeOther.displayName} otherUserAvatar={activeOther.avatarUrl} />
                ) : (
                  <div className="flex items-center justify-center h-full bg-white dark:bg-gray-900 rounded-xl shadow">
                    <div className="text-center text-gray-400">
                      <div className="text-4xl mb-3">✉️</div>
                      <p className="text-sm">Выберите диалог или начните новый</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* New DM search modal */}
      {showNewDmSearch && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowNewDmSearch(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Новый диалог</h3>
            <input type="text" value={dmSearch} onChange={(e) => setDmSearch(e.target.value)} autoFocus
              placeholder="Поиск по имени..."
              className="w-full px-4 py-2.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 mb-3" />
            <div className="max-h-60 overflow-y-auto space-y-1">
              {dmSearchResults.filter((u) => u.id !== session?.user?.id).map((u) => (
                <button key={u.id} onClick={() => startDmConversation(u.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white font-bold text-xs overflow-hidden">
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" /> : u.displayName[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.displayName}</span>
                </button>
              ))}
              {dmSearch.length >= 2 && dmSearchResults.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-400">Никого не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-12 text-center">Загрузка...</div>}>
      <ChatPageInner />
    </Suspense>
  );
}
