"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ChatRoom from "@/components/chat/ChatRoom";
import ShareButtons from "@/components/shared/ShareButtons";

interface RoomMeta {
  id: string;
  name: string;
  description: string | null;
  isClosed: boolean;
  isArchived: boolean;
  membersCount: number;
  isOwner: boolean;
  inviteToken?: string;
}

const SITE_URL = "https://fomo.spot";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [room, setRoom] = useState<RoomMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"denied" | "notfound" | null>(null);
  const [showLink, setShowLink] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/rooms/${roomId}`)
      .then(async (r) => {
        if (r.status === 403) { setError("denied"); return; }
        if (!r.ok) { setError("notfound"); return; }
        setRoom(await r.json());
      })
      .catch(() => setError("notfound"))
      .finally(() => setLoading(false));
  }, [roomId]);

  async function handleDelete() {
    if (!room || !confirm("Удалить комнату вместе со всей историей сообщений? Это необратимо.")) return;
    await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
    router.push("/profile?tab=rooms");
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500 dark:text-gray-400">Загрузка...</div>;
  }

  if (error === "denied") {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-semibold mb-2 dark:text-gray-100">Нет доступа</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Эта комната закрыта — попросите у владельца ссылку-приглашение.
        </p>
        <Link href="/profile?tab=rooms" className="text-green-600 hover:underline text-sm">
          К моим комнатам
        </Link>
      </div>
    );
  }

  if (error === "notfound" || !room) {
    return (
      <div className="max-w-md mx-auto text-center py-16">
        <h1 className="text-lg font-semibold mb-2 dark:text-gray-100">Комната не найдена</h1>
        <Link href="/profile?tab=rooms" className="text-green-600 hover:underline text-sm">
          К моим комнатам
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 truncate">{room.name}</h1>
          {room.description && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{room.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-0.5">👥 {room.membersCount} участников</p>
        </div>
        {room.isOwner && (
          <div className="flex items-center gap-2 shrink-0">
            {room.inviteToken && (
              <button
                onClick={() => setShowLink(!showLink)}
                className="text-xs px-3 py-1.5 rounded-md border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition"
              >
                Ссылка
              </button>
            )}
            <button
              onClick={handleDelete}
              className="text-xs px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition"
            >
              Удалить
            </button>
          </div>
        )}
      </div>

      {room.isOwner && room.inviteToken && showLink && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4">
          <ShareButtons
            url={`${SITE_URL}/rooms/join/${room.inviteToken}`}
            text={`Приглашаю в комнату «${room.name}» на FOMO`}
          />
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 overflow-hidden" style={{ height: "70vh" }}>
        <ChatRoom roomId={room.id} roomName={room.name} isClosed={room.isClosed} isArchived={room.isArchived} />
      </div>
    </div>
  );
}
