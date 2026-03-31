"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface SubItem {
  id: string;
  type: "paid" | "free";
  monthlyPrice: number;
  startDate: string;
  endDate: string | null;
  author: {
    id: string;
    displayName: string;
    rating: number;
    avatarUrl?: string | null;
  };
}

interface ChannelItem {
  id: string;
  name: string;
  monthlyPrice: number;
  description: string | null;
  durationDays?: number;
}

export default function SubscriptionsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const [subs, setSubs] = useState<SubItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"channels" | "subscriptions">("channels");

  useEffect(() => {
    Promise.all([
      fetch("/api/subscriptions").then((r) => r.json()),
      user?.id ? fetch(`/api/users/${user.id}/tariffs`).then((r) => r.json()).catch(() => []) : Promise.resolve([]),
    ]).then(([subsData, channelsData]) => {
      setSubs(Array.isArray(subsData) ? subsData : []);
      setChannels(Array.isArray(channelsData) ? channelsData : []);
      setLoading(false);
    });
  }, [user?.id]);

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;

  const authorSubs = subs.filter((s) => s.type === "free");
  const channelSubs = subs.filter((s) => s.type === "paid");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Каналы и подписки</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab("channels")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "channels"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Мои каналы
        </button>
        <button
          onClick={() => setTab("subscriptions")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "subscriptions"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          Мои подписки {subs.length > 0 && <span className="ml-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full">{subs.length}</span>}
        </button>
      </div>

      {/* Channels tab */}
      {tab === "channels" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Создайте платный канал, чтобы монетизировать свои идеи
            </p>
            <Link
              href="/channels/create"
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0 ml-4"
            >
              + Создать канал
            </Link>
          </div>

          {channels.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl shadow">
              <div className="text-4xl mb-3">📺</div>
              <p className="text-gray-500 dark:text-gray-400">У вас пока нет каналов</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => (
                <div key={ch.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium dark:text-gray-100">{ch.name}</div>
                      <div className="text-sm text-green-600 font-semibold mt-0.5">
                        {Number(ch.monthlyPrice)} ₽ / {ch.durationDays || 30} дн.
                      </div>
                      {ch.description && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{ch.description}</div>
                      )}
                    </div>
                    <Link
                      href={`/channels/edit/${ch.id}`}
                      className="text-sm text-green-600 dark:text-green-400 hover:underline"
                    >
                      Настроить
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Subscriptions tab */}
      {tab === "subscriptions" && (
        <div className="space-y-6">
          {/* Authors section (free follows) */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Авторы
            </h2>
            {authorSubs.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
                <p className="text-gray-400 dark:text-gray-500 text-sm">Вы не подписаны ни на одного автора</p>
                <Link href="/authors" className="text-green-600 dark:text-green-400 hover:underline text-sm mt-2 inline-block">
                  Найти авторов
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {authorSubs.map((sub) => (
                  <div key={sub.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold overflow-hidden shrink-0">
                      {sub.author.avatarUrl ? (
                        <img src={sub.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        sub.author.displayName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/profile/${sub.author.id}`}
                        className="font-medium hover:text-green-600 dark:text-gray-100"
                      >
                        {sub.author.displayName}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        Рейтинг: {Number(sub.author.rating).toFixed(1)}
                      </div>
                    </div>
                    <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0">
                      Отписаться
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Channels section (paid subscriptions) */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              Каналы
            </h2>
            {channelSubs.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
                <p className="text-gray-400 dark:text-gray-500 text-sm">У вас нет платных подписок на каналы</p>
              </div>
            ) : (
              <div className="space-y-3">
                {channelSubs.map((sub) => (
                  <div key={sub.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold overflow-hidden shrink-0">
                      {sub.author.avatarUrl ? (
                        <img src={sub.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        sub.author.displayName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/profile/${sub.author.id}`}
                        className="font-medium hover:text-green-600 dark:text-gray-100"
                      >
                        {sub.author.displayName}
                      </Link>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {Number(sub.monthlyPrice)} ₽/мес
                        {sub.endDate && <> · До {new Date(sub.endDate).toLocaleDateString("ru")}</>}
                      </div>
                    </div>
                    <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0">
                      Отписаться
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
