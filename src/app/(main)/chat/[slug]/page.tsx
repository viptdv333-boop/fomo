"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";

export default function InstrumentChatPage() {
  const params = useParams();
  const [currentRoom, setCurrentRoom] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Hide footer and fix height (same approach as messenger)
  useEffect(() => {
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

  useEffect(() => {
    fetch("/api/instruments")
      .then((r) => r.json())
      .then((instruments) => {
        const inst = instruments.find((i: any) => i.slug === params.slug);
        if (inst?.chatRoom?.id) {
          setCurrentRoom({ id: inst.chatRoom.id, name: inst.name });
        }
      });
  }, [params.slug]);

  return (
    <AuthGuard>
      <div className="flex gap-4" style={{ height: "calc(100dvh - 5.5rem)" }}>
        <ChatSidebar currentSlug={params.slug as string} />
        <div className="flex-1 min-h-0">
          {currentRoom ? (
            <ChatRoom roomId={currentRoom.id} roomName={currentRoom.name} />
          ) : (
            <div className="text-gray-500 text-center py-12">
              Загрузка чата...
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
