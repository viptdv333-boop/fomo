"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface SubItem {
  id: string;
  type: "paid" | "free";
  tariffId: string | null;
  telegramNotify: boolean;
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
  price: number;
  description: string | null;
  durationDays?: number;
  avatarUrl?: string | null;
  subscriberCount?: number;
}

interface FollowerItem {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  rating: number;
  followedAt: string;
}

interface ChannelSubscriberItem {
  id: string;
  subscriberId: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  monthlyPrice: number;
  status: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export default function SubscriptionsPage() {
  const { t } = useT();
  const { data: session } = useSession();
  const user = session?.user as any;
  const [subs, setSubs] = useState<SubItem[]>([]);
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [followers, setFollowers] = useState<FollowerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"channels" | "subscriptions" | "followers">("channels");
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [channelSubscribers, setChannelSubscribers] = useState<Record<string, ChannelSubscriberItem[]>>({});
  const [subscribersLoading, setSubscribersLoading] = useState<string | null>(null);
  const [telegramVerified, setTelegramVerified] = useState(false);
  const [telegramBusyId, setTelegramBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      fetch("/api/subscriptions").then((r) => r.json()),
      fetch(`/api/users/${user.id}/tariffs`).then((r) => r.json()).catch(() => []),
      fetch(`/api/users/${user.id}/followers`).then((r) => r.json()).catch(() => []),
      fetch("/api/telegram/account").then((r) => r.json()).catch(() => null),
    ]).then(([subsData, channelsData, followersData, telegramData]) => {
      setSubs(Array.isArray(subsData) ? subsData : []);
      setChannels(Array.isArray(channelsData) ? channelsData : []);
      setFollowers(Array.isArray(followersData) ? followersData : []);
      setTelegramVerified(Boolean(telegramData?.verified));
      setLoading(false);
    });
  }, [user?.id]);

  async function toggleTelegram(sub: SubItem) {
    if (!sub.tariffId) return;
    if (!telegramVerified && !sub.telegramNotify) {
      alert("Сначала подключите и подтвердите Telegram-бота в профиле");
      return;
    }
    setTelegramBusyId(sub.id);
    const enabled = !sub.telegramNotify;
    try {
      const res = await fetch(`/api/subscriptions/${sub.id}/telegram`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Не удалось изменить настройку");
        return;
      }
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, telegramNotify: enabled } : s)));
    } finally {
      setTelegramBusyId(null);
    }
  }

  async function toggleChannelSubscribers(channelId: string) {
    if (expandedChannelId === channelId) {
      setExpandedChannelId(null);
      return;
    }
    setExpandedChannelId(channelId);
    if (!channelSubscribers[channelId] && user?.id) {
      setSubscribersLoading(channelId);
      const res = await fetch(`/api/users/${user.id}/tariffs/${channelId}/subscribers`);
      const data = await res.json().catch(() => []);
      setChannelSubscribers((prev) => ({ ...prev, [channelId]: Array.isArray(data) ? data : [] }));
      setSubscribersLoading(null);
    }
  }

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;

  const authorSubs = subs.filter((s) => s.type === "free");
  const channelSubs = subs.filter((s) => s.type === "paid");

  return (
    <div className="max-w-2xl w-full mx-auto">
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">{t("subs.title")}</h1>

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
          {t("subs.myChannels")}
        </button>
        <button
          onClick={() => setTab("subscriptions")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "subscriptions"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          {t("subs.mySubscriptions")} {subs.length > 0 && <span className="ml-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full">{subs.length}</span>}
        </button>
        <button
          onClick={() => setTab("followers")}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition ${
            tab === "followers"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          }`}
        >
          {t("subs.myFollowers")} {followers.length > 0 && <span className="ml-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full">{followers.length}</span>}
        </button>
      </div>

      {/* Channels tab */}
      {tab === "channels" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("subs.createToMonetize")}
            </p>
            <Link
              href="/channels/create"
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition shrink-0 ml-4"
            >
              {t("channels.create")}
            </Link>
          </div>

          {channels.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl shadow">
              <div className="text-4xl mb-3">📺</div>
              <p className="text-gray-500 dark:text-gray-400">{t("subs.noChannels")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {channels.map((ch) => (
                <div key={ch.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4">
                  <div className="flex items-center justify-between gap-3">
                    <Link href={`/channels/${ch.id}`} className="min-w-0 group flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold overflow-hidden shrink-0">
                        {ch.avatarUrl ? (
                          <img src={ch.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          ch.name[0]?.toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium dark:text-gray-100 group-hover:text-green-600 transition">{ch.name}</div>
                        <div className="text-sm text-green-600 font-semibold mt-0.5">
                          {Number(ch.price)} ₽ / {ch.durationDays || 30} дн.
                        </div>
                        {ch.description && (
                          <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{ch.description}</div>
                        )}
                      </div>
                    </Link>
                    <Link
                      href={`/channels/edit/${ch.id}`}
                      className="text-sm text-green-600 dark:text-green-400 hover:underline shrink-0"
                    >
                      {t("subs.settings")}
                    </Link>
                  </div>

                  <button
                    onClick={() => toggleChannelSubscribers(ch.id)}
                    className="mt-3 text-sm text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 flex items-center gap-1"
                  >
                    <svg className={`w-3.5 h-3.5 transition-transform ${expandedChannelId === ch.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {t("subs.channelSubscribers")}
                    {typeof ch.subscriberCount === "number" && (
                      <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">{ch.subscriberCount}</span>
                    )}
                  </button>

                  {expandedChannelId === ch.id && (
                    <div className="mt-3 border-t dark:border-gray-800 pt-3 space-y-2">
                      {subscribersLoading === ch.id ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500">Загрузка...</p>
                      ) : (channelSubscribers[ch.id]?.length || 0) === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500">{t("subs.noChannelSubscribers")}</p>
                      ) : (
                        channelSubscribers[ch.id].map((s) => (
                          <div key={s.id} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold overflow-hidden shrink-0 text-xs">
                              {s.avatarUrl ? (
                                <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                s.displayName[0]?.toUpperCase()
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <Link href={`/profile/${s.subscriberId}`} className="text-sm font-medium hover:text-green-600 dark:text-gray-100">
                                {s.displayName}
                              </Link>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {s.isActive
                                  ? `${t("subs.subscriberUntil")} ${new Date(s.endDate).toLocaleDateString("ru")}`
                                  : t("subs.subscriberInactive")}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
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
              {t("subs.authors")}
            </h2>
            {authorSubs.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
                <p className="text-gray-400 dark:text-gray-500 text-sm">{t("subs.noAuthorSubs")}</p>
                <Link href="/authors" className="text-green-600 dark:text-green-400 hover:underline text-sm mt-2 inline-block">
                  {t("subs.findAuthors")}
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
                        {t("idea.rating")} {Number(sub.author.rating).toFixed(1)}
                      </div>
                    </div>
                    <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0">
                      {t("channels.unsubscribe")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Channels section (paid subscriptions) */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
              {t("nav.channels")}
            </h2>
            {channelSubs.length === 0 ? (
              <div className="text-center py-8 bg-white dark:bg-gray-900 rounded-xl shadow">
                <p className="text-gray-400 dark:text-gray-500 text-sm">{t("subs.noChannelSubs")}</p>
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
                    <label
                      className="flex items-center gap-1.5 shrink-0 text-xs text-gray-500 dark:text-gray-400 cursor-pointer"
                      title={telegramVerified ? "Пересылать сообщения канала в Telegram" : "Сначала подключите бота в профиле"}
                    >
                      <input
                        type="checkbox"
                        checked={sub.telegramNotify}
                        disabled={telegramBusyId === sub.id}
                        onChange={() => toggleTelegram(sub)}
                        className="w-3.5 h-3.5 text-green-600 rounded focus:ring-green-500 disabled:opacity-50"
                      />
                      Telegram
                    </label>
                    <button className="text-sm text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 shrink-0">
                      {t("channels.unsubscribe")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Followers tab */}
      {tab === "followers" && (
        <div>
          {followers.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl shadow">
              <p className="text-gray-500 dark:text-gray-400">{t("subs.noFollowers")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {followers.map((f) => (
                <div key={f.id} className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold overflow-hidden shrink-0">
                    {f.avatarUrl ? (
                      <img src={f.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      f.displayName[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/profile/${f.id}`}
                      className="font-medium hover:text-green-600 dark:text-gray-100"
                    >
                      {f.displayName}
                    </Link>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t("subs.followedSince")} {new Date(f.followedAt).toLocaleDateString("ru")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
