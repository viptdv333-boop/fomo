"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";

export default function InstrumentChatPage() {
  const params = useParams();
  const [currentRoom, setCurrentRoom] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
    <div className="flex gap-6">
      <ChatSidebar currentSlug={params.slug as string} />
      <div className="flex-1">
        {currentRoom ? (
          <ChatRoom roomId={currentRoom.id} roomName={currentRoom.name} />
        ) : (
          <div className="text-gray-500 text-center py-12">
            Загрузка чата...
          </div>
        )}
      </div>
    </div>
  );
}
