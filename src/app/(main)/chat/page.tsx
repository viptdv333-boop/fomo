"use client";

import { useEffect, useState } from "react";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

export default function ChatPage() {
  const [currentRoom, setCurrentRoom] = useState<{ id: string; name: string; isClosed: boolean }>({
    id: "general",
    name: "Общий чат",
    isClosed: false,
  });

  useEffect(() => {
    // Hide footer and fix height for chat page (same approach as messenger)
    const footer = document.querySelector("footer");
    const main = document.querySelector("main.max-w-7xl") as HTMLElement;
    if (footer) footer.style.display = "none";
    if (main) {
      main.style.paddingTop = "0.5rem";
      main.style.paddingBottom = "0";
      main.style.overflow = "hidden";
    }
    return () => {
      if (footer) footer.style.display = "";
      if (main) {
        main.style.paddingTop = "";
        main.style.paddingBottom = "";
        main.style.overflow = "";
      }
    };
  }, []);

  return (
    <AuthGuard>
      <div className="flex gap-4" style={{ height: "calc(100dvh - 5.5rem)" }}>
        <ChatSidebar
          currentRoomId={currentRoom.id}
          onSelectRoom={(room) => setCurrentRoom(room)}
        />
        <div className="flex-1 min-h-0">
          <ChatRoom
            roomId={currentRoom.id}
            roomName={currentRoom.name}
            isClosed={currentRoom.isClosed}
          />
        </div>
      </div>
    </AuthGuard>
  );
}
