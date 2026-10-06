"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ChatRoom from "@/components/chat/ChatRoom";
import ChatSidebar from "@/components/chat/ChatSidebar";
import AuthGuard from "@/components/layout/AuthGuard";
import { useT } from "@/lib/i18n/client";
import { useAppUi } from "@/components/app/useAppUi";
import { useRouter } from "next/navigation";

export default function InstrumentChatPage() {
  const appUi = useAppUi();
  return appUi ? <AppInstrumentChat /> : <InstrumentChatSite />;
}

/** App UI: an instrument's chat is a room of the app's chat screens; look the room up and open it there. */
function AppInstrumentChat() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    fetch("/api/instruments")
      .then((r) => r.json())
      .then((instruments) => {
        const inst = instruments.find((i: any) => i.slug === params.slug);
        router.replace(inst?.chatRoom?.id ? `/chat?room=${inst.chatRoom.id}` : "/chat");
      })
      .catch(() => router.replace("/chat"));
  }, [params.slug, router]);
  return <div className="text-gray-500 text-center py-12">{t("chat2.loadingChat")}</div>;
}

function InstrumentChatSite() {
  const { t } = useT();
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
    <AuthGuard>
      <div className="flex gap-4 flex-1 min-h-0 overflow-hidden">
        <ChatSidebar currentSlug={params.slug as string} />
        <div className="flex-1 min-h-0">
          {currentRoom ? (
            <ChatRoom roomId={currentRoom.id} roomName={currentRoom.name} />
          ) : (
            <div className="text-gray-500 text-center py-12">
              {t("chat2.loadingChat")}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  );
}
