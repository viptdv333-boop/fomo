"use client";

import { useEffect, useState } from "react";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

export default function ChatPage() {
  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; isClosed: boolean; isArchived: boolean }>({
    id: "general",
    name: "Общий чат",
    isClosed: false,
    isArchived: false,
  });

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
