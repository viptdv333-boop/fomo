"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

function ChatPageInner() {
  const searchParams = useSearchParams();
  const roomParam = searchParams.get("room");

  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; isClosed: boolean; isArchived: boolean }>({
    id: roomParam || "general",
    name: roomParam ? "..." : "Общий чат",
    isClosed: false,
    isArchived: false,
  });

  // Load room name if opened via ?room= param
  useEffect(() => {
    if (roomParam && roomParam !== "general") {
      fetch("/api/chat/rooms")
        .then(r => r.json())
        .then((rooms: any[]) => {
          const found = rooms.find((r: any) => r.id === roomParam);
          if (found) setCurrentRoom({ id: found.id, name: found.name, isClosed: found.isClosed || false, isArchived: found.isArchived || false });
        })
        .catch(() => {});
    }
  }, [roomParam]);

  return (
    <AuthGuard>
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        <ChatSidebar
          currentRoomId={currentRoom.id}
          onSelectRoom={(room) => setCurrentRoom(room)}
        />
        <div className="flex-1 min-h-0">
          <ChatRoom
            roomId={currentRoom.id}
            roomName={currentRoom.name}
            isClosed={currentRoom.isClosed}
            isArchived={currentRoom.isArchived}
          />
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
