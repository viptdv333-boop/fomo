"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ShareButtons from "@/components/shared/ShareButtons";
import CreateRoomModal from "@/components/chat/CreateRoomModal";

interface Room {
  id: string;
  name: string;
  description: string | null;
  membersCount: number;
  isOwner: boolean;
  inviteToken?: string;
}

const SITE_URL = "https://fomo.spot";

export default function RoomsTab() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [openLinkFor, setOpenLinkFor] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function loadRooms() {
    setLoading(true);
    fetch("/api/rooms")
      .then((r) => r.json())
      .then((data) => setRooms(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRooms();
  }, []);

  async function handleLeave(roomId: string) {
    if (!confirm("Выйти из приватной группы?")) return;
    setBusyId(roomId);
    await fetch(`/api/rooms/${roomId}/leave`, { method: "POST" });
    setBusyId(null);
    loadRooms();
  }

  async function handleDelete(roomId: string) {
    if (!confirm("Удалить приватную группу вместе со всей историей сообщений? Это необратимо.")) return;
    setBusyId(roomId);
    await fetch(`/api/rooms/${roomId}`, { method: "DELETE" });
    setBusyId(null);
    loadRooms();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Мои приватные группы
        </h3>
        <button
          onClick={() => setShowCreate(true)}
          className="text-sm text-green-600 hover:text-green-800 transition"
        >
          + Новая группа
        </button>
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Закрытая приватная группа для общения — бесплатно, вход только по ссылке-приглашению, как в
        приватном чате. Создать может любой пользователь.
      </p>

      {showCreate && (
        <CreateRoomModal
          onClose={() => setShowCreate(false)}
          onCreated={(room) => {
            setShowCreate(false);
            loadRooms();
            setOpenLinkFor(room.id);
          }}
        />
      )}

      {loading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          У вас пока нет приватных групп — ни своих, ни тех, куда вас пригласили.
        </p>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div
              key={room.id}
              className="bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <Link href={`/rooms/${room.id}`} className="min-w-0 group flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium dark:text-gray-100 group-hover:text-green-600 transition truncate">
                      {room.name}
                    </span>
                    {room.isOwner && (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                        владелец
                      </span>
                    )}
                  </div>
                  {room.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                      {room.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">👥 {room.membersCount}</p>
                </Link>

                <div className="flex items-center gap-2 shrink-0">
                  {room.isOwner && room.inviteToken && (
                    <button
                      onClick={() => setOpenLinkFor(openLinkFor === room.id ? null : room.id)}
                      className="text-xs px-3 py-1.5 rounded-md border border-green-300 dark:border-green-700 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition"
                    >
                      Ссылка
                    </button>
                  )}
                  {room.isOwner ? (
                    <button
                      onClick={() => handleDelete(room.id)}
                      disabled={busyId === room.id}
                      className="text-xs px-3 py-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-50"
                    >
                      Удалить
                    </button>
                  ) : (
                    <button
                      onClick={() => handleLeave(room.id)}
                      disabled={busyId === room.id}
                      className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      Выйти
                    </button>
                  )}
                </div>
              </div>

              {room.isOwner && room.inviteToken && openLinkFor === room.id && (
                <div className="mt-3 pt-3 border-t dark:border-gray-700">
                  <ShareButtons
                    url={`${SITE_URL}/rooms/join/${room.inviteToken}`}
                    text={`Приглашаю в приватную группу «${room.name}» на FOMO`}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
