"use client";

import { useEffect } from "react";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

export default function ChatPage() {
  useEffect(() => {
    // Hide footer and fix height for chat page
    const footer = document.querySelector("footer");
    const main = document.querySelector("main");
    if (footer) footer.style.display = "none";
    if (main) {
      main.style.paddingBottom = "0";
      main.style.overflow = "hidden";
    }
    return () => {
      if (footer) footer.style.display = "";
      if (main) {
        main.style.paddingBottom = "";
        main.style.overflow = "";
      }
    };
  }, []);

  return (
    <AuthGuard>
      <div className="flex gap-4" style={{ height: "calc(100dvh - 4.5rem)" }}>
        <ChatSidebar />
        <div className="flex-1 min-h-0">
          <ChatRoom roomId="general" roomName="Общий чат" />
        </div>
      </div>
    </AuthGuard>
  );
}
