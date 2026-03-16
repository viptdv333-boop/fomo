"use client";

import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

export default function ChatPage() {
  return (
    <AuthGuard>
      <div className="flex gap-6">
        <ChatSidebar />
        <div className="flex-1">
          <ChatRoom roomId="general" roomName="Общий чат" />
        </div>
      </div>
    </AuthGuard>
  );
}
