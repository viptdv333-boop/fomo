"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";
import { useT } from "@/lib/i18n/client";

function ChatPageInner() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");

  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; isClosed: boolean; isArchived: boolean }>({
    id: roomParam || "general",
    name: roomParam ? "..." : "",
    isClosed: false,
    isArchived: false,
  });
  const [showSidebar, setShowSidebar] = useState(!roomParam); // mobile: show sidebar by default if no room selected

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

  function handleSelectRoom(room: { id: string; name: string; isClosed: boolean; isArchived: boolean }) {
    setCurrentRoom(room);
    setShowSidebar(false); // mobile: hide sidebar, show chat
  }

  return (
    <AuthGuard>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-1 mb-3 shrink-0">
          <button className="px-5 py-2 rounded-lg text-sm font-medium bg-green-600 text-white">
            💬 {t("nav.chat")}
          </button>
          <Link href="/messages"
            className="px-5 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
            ✉️ {t("chat.personal")}
          </Link>
        </div>

        {/* Content — responsive: on mobile show either sidebar OR chat */}
        <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
          {/* Sidebar: always visible on desktop, toggled on mobile */}
          <div className={`${showSidebar ? "flex" : "hidden"} md:flex`}>
            <ChatSidebar currentRoomId={currentRoom.id} onSelectRoom={handleSelectRoom} />
          </div>
          {/* Chat: always visible on desktop, toggled on mobile */}
          <div className={`${showSidebar ? "hidden" : "flex"} md:flex flex-1 min-h-0 flex-col`}>
            {/* Mobile back button */}
            <button onClick={() => setShowSidebar(true)} className="md:hidden flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-2 hover:text-green-600">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
              {currentRoom.name}
            </button>
            <ChatRoom roomId={currentRoom.id} roomName={currentRoom.name} isClosed={currentRoom.isClosed} isArchived={currentRoom.isArchived} />
          </div>
        </div>
      </div>
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
