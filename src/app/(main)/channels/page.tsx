"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  subscribersCount: number;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    rating: number;
  };
}

export default function ChannelsPage() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setChannels(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Каналы</h1>
        {session && (
          <Link
            href="/channels/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Создать канал
          </Link>
        )}
      </div>

      <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
        Платные каналы авторов с эксклюзивным контентом, аналитикой и торговыми идеями.
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : channels.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📡</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Каналов пока нет</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Здесь будут платные каналы авторов с эксклюзивной аналитикой, торговыми сигналами и закрытыми идеями. Создайте свой канал первым!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((ch) => (
            <Link
              key={ch.id}
              href={`/channels/${ch.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5 border dark:border-gray-800"
            >
              <div className="flex items-center gap-3 mb-3">
                {ch.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ch.author.avatarUrl} alt="" className="w-10 h-10 rounded-full" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">
                    {ch.author.displayName[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{ch.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{ch.author.displayName}</div>
                </div>
              </div>
              {ch.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{ch.description}</p>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{ch.price} ₽ / {ch.durationDays} дн.</span>
                <span className="text-gray-400">{ch.subscribersCount} подписчиков</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
