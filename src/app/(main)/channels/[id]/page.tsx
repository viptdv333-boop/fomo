"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import BuySubscriptionModal from "@/components/profile/BuySubscriptionModal";
import ChannelDiscussion from "@/components/channels/ChannelDiscussion";
import ShareButtons from "@/components/shared/ShareButtons";
import Watermark from "@/components/shared/Watermark";
import { useT } from "@/lib/i18n/client";
import { formatMessageTime } from "@/lib/format-message-time";

interface ChannelData {
  id: string;
  slug: string | null;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  subscribersCount: number;
  avatarUrl?: string | null;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    rating: number;
  };
  authorTelegramNotify?: boolean;
}

interface IdeaData {
  id: string;
  title: string;
  preview: string;
  /** Только для тех, кому пост открыт: вход/стоп/тейк лежат здесь. */
  content?: string;
  isPaid: boolean;
  price: number | null;
  isPinned?: boolean;
  createdAt: string;
  voteScore: number;
  instruments: { id: string; name: string; slug: string }[];
}

interface SubscriberData {
  id: string;
  subscriberId: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  isActive: boolean;
  endDate: string;
}

export default function ChannelPage() {
  const { t } = useT();
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [otherTariffs, setOtherTariffs] = useState<ChannelData[]>([]);
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [ideasLoading, setIdeasLoading] = useState(true);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showSubscribers, setShowSubscribers] = useState(false);
  const [addDays, setAddDays] = useState("30");
  const [extending, setExtending] = useState(false);
  const [subscribers, setSubscribers] = useState<SubscriberData[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);
  const [telegramVerified, setTelegramVerified] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  // The viewer's own subscription to this channel (for their Telegram toggle).
  const [mySub, setMySub] = useState<{ id: string; tariffId: string | null; telegramNotify: boolean } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [candQuery, setCandQuery] = useState("");
  const [candidates, setCandidates] = useState<{ id: string; displayName: string; fomoId: string | null; avatarUrl: string | null }[]>([]);
  const [candLoading, setCandLoading] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Site users the owner can add for free (debounced search while the picker is open).
  useEffect(() => {
    if (!showAdd || !channel) return;
    let cancelled = false;
    setCandLoading(true);
    const timer = setTimeout(async () => {
      const res = await fetch(
        `/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers/candidates?q=${encodeURIComponent(candQuery)}`
      );
      if (!cancelled) {
        setCandidates(res.ok ? await res.json() : []);
        setCandLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showAdd, candQuery, channel]);

  async function addMember() {
    if (!channel || !pickedId) return;
    const days = Number(addDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      alert("Укажите число дней от 1 до 3650");
      return;
    }
    setExtending(true);
    try {
      const res = await fetch(`/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: pickedId, days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Не удалось добавить участника");
        return;
      }
      setShowAdd(false);
      setPickedId(null);
      setCandQuery("");
      await openSubscribers();
    } finally {
      setExtending(false);
    }
  }

  const openSubscribers = useCallback(async () => {
    if (!channel) return;
    setShowSubscribers(true);
    setSubscribersLoading(true);
    const res = await fetch(`/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`);
    if (res.ok) setSubscribers(await res.json());
    setSubscribersLoading(false);
  }, [channel]);

  async function toggleAuthorTelegram() {
    if (!channel) return;
    if (!telegramVerified && !channel.authorTelegramNotify) {
      alert("Сначала подключите и подтвердите Telegram-бота в профиле");
      return;
    }
    const enabled = !channel.authorTelegramNotify;
    setTelegramBusy(true);
    try {
      const res = await fetch(`/api/channels/${channel.id}/telegram`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Не удалось изменить настройку");
        return;
      }
      setChannel((prev) => (prev ? { ...prev, authorTelegramNotify: enabled } : prev));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function toggleMyTelegram() {
    if (!mySub) return;
    if (!telegramVerified && !mySub.telegramNotify) {
      alert("Сначала подключите и подтвердите Telegram-бота в профиле");
      return;
    }
    const enabled = !mySub.telegramNotify;
    setTelegramBusy(true);
    try {
      const res = await fetch(`/api/subscriptions/${mySub.id}/telegram`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Не удалось изменить настройку");
        return;
      }
      setMySub({ ...mySub, telegramNotify: enabled });
    } finally {
      setTelegramBusy(false);
    }
  }

  // No subscriptionId → every currently-active subscriber of this channel.
  async function grantDays(subscriptionId?: string) {
    if (!channel) return;
    const days = Number(addDays);
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      alert("Укажите число дней от 1 до 3650");
      return;
    }
    if (!subscriptionId && !confirm(`Добавить ${days} дн. всем активным подписчикам (${subscribers.filter((s) => s.isActive).length})?`)) return;
    setExtending(true);
    try {
      const res = await fetch(`/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days, subscriptionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Не удалось добавить дни");
        return;
      }
      await openSubscribers();
    } finally {
      setExtending(false);
    }
  }

  async function removeSubscriber(subscriptionId: string, name: string) {
    if (!channel) return;
    if (!confirm(`Удалить «${name}» из канала? Доступ закроется сразу, деньги не возвращаются.`)) return;
    setExtending(true);
    try {
      const res = await fetch(`/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Не удалось удалить подписчика");
        return;
      }
      await openSubscribers();
    } finally {
      setExtending(false);
    }
  }

  function daysLeft(endDate: string) {
    const ms = new Date(endDate).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  }

  const deleteIdea = useCallback(async (id: string) => {
    if (!confirm("Удалить идею безвозвратно?")) return;
    setDeletingId(id);
    const res = await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    if (res.ok) {
      setIdeas((prev) => prev.filter((i) => i.id !== id));
    } else {
      alert("Не удалось удалить идею");
    }
    setDeletingId(null);
  }, []);

  const [pinningId, setPinningId] = useState<string | null>(null);
  const togglePin = useCallback(async (id: string, next: boolean) => {
    setPinningId(id);
    const res = await fetch(`/api/ideas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: next }),
    });
    if (res.ok) {
      // Same order the API returns: pinned first, most recently pinned on top.
      setIdeas((prev) =>
        [...prev.map((i) => (i.id === id ? { ...i, isPinned: next } : i))].sort((a, b) =>
          a.isPinned === b.isPinned ? 0 : a.isPinned ? -1 : 1
        )
      );
    } else {
      alert("Не удалось закрепить пост");
    }
    setPinningId(null);
  }, []);

  // Load channel data
  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data: ChannelData[]) => {
        const found = data.find((ch) => ch.id === channelId || ch.slug === channelId);
        if (found) {
          setChannel(found);
          const others = data.filter(
            (ch) => ch.author.id === found.author.id && ch.id !== found.id
          );
          setOtherTariffs(others);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  // Check subscription & load ideas when channel loaded
  useEffect(() => {
    if (!channel) return;

    const owner = session?.user?.id === channel.author.id;
    setIsOwner(owner);

    if (session?.user?.id) {
      fetch("/api/telegram/account")
        .then((r) => r.json())
        .then((data) => setTelegramVerified(Boolean(data?.verified)))
        .catch(() => {});
    }

    // Check subscription
    if (session?.user?.id && !owner) {
      fetch("/api/subscriptions")
        .then((r) => r.json())
        .then((subs) => {
          if (Array.isArray(subs)) {
            // Подписка на ЭТОТ канал или старая подписка на автора без тарифа
            // (13.09.2026: подписки теперь по каналам, а не на автора целиком).
            const mine = subs.find(
              (s: { type: string; tariffId?: string | null; author: { id: string } }) =>
                s.author.id === channel.author.id && s.type === "paid" &&
                (!s.tariffId || s.tariffId === channel.id)
            );
            setIsSubscribed(Boolean(mine));
            setMySub(mine ? { id: mine.id, tariffId: mine.tariffId ?? null, telegramNotify: Boolean(mine.telegramNotify) } : null);
          }
        })
        .catch(() => {});
    }

    // Посты этого канала + старые платные идеи автора без канала (13.09.2026)
    fetch(`/api/ideas?channelId=${channel.id}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        const list = data.data || data.ideas || (Array.isArray(data) ? data : []);
        setIdeas(list);
      })
      .catch(() => {})
      .finally(() => setIdeasLoading(false));
  }, [channel, session]);

  const canView = isOwner || isSubscribed;

  const handleBuyFromLock = useCallback(() => {
    setShowBuyModal(true);
  }, []);

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        ...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📡</div>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {t("channels.notFound")}
        </h2>
        <button
          onClick={() => router.push("/channels")}
          className="text-green-600 hover:underline text-sm"
        >
          {t("channels.backToChannels")}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl w-full mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push("/channels")}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 inline-flex items-center gap-1"
      >
        {t("channels.allChannels")}
      </button>

      {/* Channel header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-6 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-xl overflow-hidden shrink-0">
            {channel.avatarUrl || channel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.avatarUrl || channel.author.avatarUrl!} alt="" className="w-full h-full object-cover" />
            ) : (
              (channel.author.displayName || "?")[0]
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {channel.name}
            </h1>
            <Link href={`/profile/${channel.author.id}`} className="text-sm text-green-600 hover:underline">
              {channel.author.displayName}
            </Link>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span>⭐ {Number(channel.author.rating).toFixed(1)}</span>
              {isOwner ? (
                <button onClick={openSubscribers} className="hover:text-green-600 dark:hover:text-green-400 hover:underline">
                  👥 {channel.subscribersCount} {t("channels.subscribers")}
                </button>
              ) : (
                <span>👥 {channel.subscribersCount} {t("channels.subscribers")}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                ID <span className="font-mono text-green-600 dark:text-green-400">{channel.slug || channel.id.slice(0, 8)}</span>
                {" · "}
                <span className="font-mono text-green-600 dark:text-green-400">fomo.spot/channels/{channel.slug || channel.id}</span>
              </p>
              <ShareButtons url={`https://fomo.spot/channels/${channel.slug || channel.id}`} text={`${channel.name} — канал на FOMO`} />
            </div>
          </div>
        </div>

        {channel.description && (
          <p className="text-gray-600 dark:text-gray-400 mt-4 text-sm leading-relaxed">{channel.description}</p>
        )}

        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg px-4 py-2">
            <span className="text-lg font-bold text-green-600 dark:text-green-400">{channel.price} ₽</span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">/ {channel.durationDays} дн.</span>
          </div>

          {!isOwner && !isSubscribed && (
            <button
              onClick={() => setShowBuyModal(true)}
              className="bg-green-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 transition"
            >
              {t("channels.buySubscription")}
            </button>
          )}
          {isSubscribed && (
            <span className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-4 py-2 rounded-lg text-sm font-medium">
              ✓ Вы подписаны
            </span>
          )}
          {isSubscribed && mySub?.tariffId && (
            <div className="flex items-center gap-2">
              <label
                className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300 cursor-pointer"
                title="Получать сетапы и сообщения канала в свой Telegram-бот"
              >
                <input
                  type="checkbox"
                  checked={mySub.telegramNotify}
                  disabled={telegramBusy}
                  onChange={toggleMyTelegram}
                  className="w-4 h-4 text-green-600 rounded focus:ring-green-500 disabled:opacity-50"
                />
                ✈️ Получать в Telegram
              </label>
              {!telegramVerified && (
                <Link href="/profile" className="text-xs text-green-600 hover:underline">
                  Подключить бота
                </Link>
              )}
            </div>
          )}
          {isOwner && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Это ваш канал</span>
              <label
                className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer"
                title={telegramVerified ? "Получать копию сетапов и сообщений канала в свой Telegram" : "Сначала подключите бота в профиле"}
              >
                <input
                  type="checkbox"
                  checked={Boolean(channel.authorTelegramNotify)}
                  disabled={telegramBusy}
                  onChange={toggleAuthorTelegram}
                  className="w-3.5 h-3.5 text-green-600 rounded focus:ring-green-500 disabled:opacity-50"
                />
                Telegram
              </label>
              <Link
                href={`/channels/edit/${channel.id}`}
                className="text-sm text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition flex items-center gap-1"
                title="Настройки канала"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Настройки
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Ideas section */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {t("channels.publications")}
            {ideas.length > 0 && <span className="text-sm font-normal text-gray-400 ml-2">{ideas.length}</span>}
          </h2>
          {isOwner && (
            <Link href={`/ideas/new?channelId=${channel.id}`}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
              {t("channels.publish")}
            </Link>
          )}
        </div>

        {ideasLoading ? (
          <div className="text-center py-8 text-gray-400">...</div>
        ) : ideas.length === 0 ? (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-8 text-center">
            <p className="text-gray-500 dark:text-gray-400 text-sm">{t("channels.noPublications")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ideas.map((idea) => (
              <div key={idea.id} className="relative">
                {isOwner && (
                  // In-flow toolbar, not an overlay: an absolutely-positioned
                  // top-right box needed permanent padding reserved on every
                  // line of the card to avoid it, which on a narrow phone left
                  // almost no width for the post text (wrapped to ~1 word/line).
                  <div className="flex items-center justify-end gap-3 mb-1.5 px-1">
                    <button
                      onClick={() => togglePin(idea.id, !idea.isPinned)}
                      disabled={pinningId === idea.id}
                      className={`text-xs font-medium disabled:opacity-50 ${idea.isPinned ? "text-amber-600 hover:text-amber-800" : "text-gray-400 hover:text-amber-600"}`}
                      title={idea.isPinned ? "Открепить" : "Закрепить наверху канала"}
                    >
                      {pinningId === idea.id ? "..." : idea.isPinned ? "📌 Открепить" : "📌 Закрепить"}
                    </button>
                    <Link
                      href={`/ideas/${idea.id}/edit`}
                      className="text-xs text-green-600 hover:text-green-800 font-medium"
                    >
                      {t("common.edit")}
                    </Link>
                    <button
                      onClick={() => deleteIdea(idea.id)}
                      disabled={deletingId === idea.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                    >
                      {deletingId === idea.id ? "..." : t("common.delete")}
                    </button>
                  </div>
                )}
                {canView ? (
                  /* Unlocked idea card */
                  <Link
                    href={`/ideas/${idea.id}`}
                    className={`relative block bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 hover:shadow-md transition select-none ${
                      idea.isPinned ? "ring-1 ring-amber-400/60" : ""
                    }`}
                    onCopy={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <Watermark variant="card" />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        {idea.isPinned && (
                          <span className="shrink-0 text-[10px] font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded" title="Закреплено владельцем канала">
                            📌 Закреплено
                          </span>
                        )}
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{idea.title}</h3>
                      </div>
                      {idea.price && (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded shrink-0">
                          {Number(idea.price)} ₽
                        </span>
                      )}
                    </div>
                    {/* Вход / стоп / тейк прямо на карточке, без раскрытия */}
                    {idea.content ? (
                      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line line-clamp-10">
                        {idea.content}
                      </p>
                    ) : (
                      idea.preview && (
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{idea.preview}</p>
                      )
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{formatMessageTime(idea.createdAt)}</span>
                      {idea.instruments.length > 0 && (
                        <span>{idea.instruments.map((i) => i.name).join(", ")}</span>
                      )}
                      <span>👍 {idea.voteScore}</span>
                    </div>
                  </Link>
                ) : (
                  /* Locked/blurred idea card */
                  <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 relative overflow-hidden">
                    <div className="filter blur-sm select-none pointer-events-none">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{idea.title}</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{idea.preview}</p>
                        </div>
                        {idea.price && (
                          <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded shrink-0">
                            {Number(idea.price)} ₽
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                        <span>{formatMessageTime(idea.createdAt)}</span>
                        {idea.instruments.length > 0 && (
                          <span>{idea.instruments.map((i) => i.name).join(", ")}</span>
                        )}
                        <span>👍 {idea.voteScore}</span>
                      </div>
                    </div>
                    {/* Lock overlay */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 dark:bg-gray-900/60">
                      <div className="text-3xl mb-2">🔒</div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t("channels.availableBySubscription")}</p>
                      <button
                        onClick={handleBuyFromLock}
                        className="bg-green-600 text-white px-4 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition"
                      >
                        {t("channels.buySubscription")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Other tariffs by same author */}
      {otherTariffs.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            {t("channels.otherAuthor")}
          </h2>
          <div className="space-y-2">
            {otherTariffs.map((t) => (
              <Link
                key={t.id}
                href={`/channels/${t.id}`}
                className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{t.name}</span>
                </div>
                <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                  {t.price} ₽ / {t.durationDays} дн.
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Author link removed — clickable in header */}

      {/* Channel discussion */}
      {session?.user && (
        <div className="mt-6">
          <ChannelDiscussion tariffId={channel.id} />
        </div>
      )}

      {/* Buy modal */}
      {showBuyModal && (
        <BuySubscriptionModal
          authorId={channel.author.id}
          authorName={channel.author.displayName}
          onClose={() => setShowBuyModal(false)}
        />
      )}

      {/* Subscribers modal (owner only) */}
      {showSubscribers && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSubscribers(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-full max-w-md max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b dark:border-gray-800 flex items-center justify-between shrink-0">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">{t("channels.subscribers")}</h3>
              <button onClick={() => setShowSubscribers(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-3 border-b dark:border-gray-800 shrink-0 flex items-center gap-2 text-sm">
              <span className="text-gray-500 dark:text-gray-400">Добавить дней:</span>
              <input
                type="number"
                min={1}
                max={3650}
                value={addDays}
                onChange={(e) => setAddDays(e.target.value)}
                className="w-20 px-2 py-1 border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                onClick={() => grantDays()}
                disabled={extending}
                className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Всем активным
              </button>
              <button
                onClick={() => { setShowAdd((v) => !v); setPickedId(null); setCandQuery(""); }}
                className="ml-auto px-3 py-1 border border-green-600 text-green-600 rounded-lg hover:bg-green-600 hover:text-white transition"
              >
                {showAdd ? "Назад" : "+ Добавить участника"}
              </button>
            </div>
            {showAdd ? (
              <div className="flex flex-col min-h-0">
                <div className="p-3 border-b dark:border-gray-800 shrink-0">
                  <input
                    type="text"
                    value={candQuery}
                    onChange={(e) => setCandQuery(e.target.value)}
                    placeholder="Поиск по имени или ID"
                    className="w-full px-3 py-1.5 text-sm border dark:border-gray-700 rounded-lg dark:bg-gray-800 dark:text-gray-100"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Выберите пользователя — он получит доступ к каналу на {addDays || 0} дн. без оплаты.
                  </p>
                </div>
                <div className="overflow-y-auto p-2 flex-1">
                  {candLoading ? (
                    <div className="text-sm text-gray-400 text-center py-8">...</div>
                  ) : candidates.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-8">Никого не найдено</div>
                  ) : (
                    candidates.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => setPickedId(u.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition ${
                          pickedId === u.id
                            ? "bg-green-50 dark:bg-green-900/30 ring-1 ring-green-600"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-300 font-bold text-sm overflow-hidden shrink-0">
                          {u.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            u.displayName[0]
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.displayName}</div>
                          {u.fomoId && <div className="text-xs text-gray-400 font-mono">#{u.fomoId}</div>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
                <div className="p-3 border-t dark:border-gray-800 shrink-0">
                  <button
                    onClick={addMember}
                    disabled={!pickedId || extending}
                    className="w-full px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    Добавить
                  </button>
                </div>
              </div>
            ) : (
            <div className="overflow-y-auto p-2">
              {subscribersLoading ? (
                <div className="text-sm text-gray-400 text-center py-8">...</div>
              ) : subscribers.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-8">{t("subs.noChannelSubscribers")}</div>
              ) : (
                subscribers.map((s) => (
                  <Link
                    key={s.id}
                    href={`/profile/${s.subscriberId}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  >
                    <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-300 font-bold text-sm overflow-hidden shrink-0">
                      {s.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        s.displayName[0]
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{s.displayName}</div>
                      {s.isActive ? (
                        <div className="text-xs text-gray-400">
                          {t("subs.subscriberUntil")} {new Date(s.endDate).toLocaleDateString("ru-RU")} ({daysLeft(s.endDate)} дн.)
                        </div>
                      ) : (
                        <div className="text-xs text-red-400">{t("subs.subscriberInactive")}</div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); grantDays(s.id); }}
                      disabled={extending}
                      title={`Добавить ${addDays || 0} дн. этому подписчику`}
                      className="shrink-0 px-2 py-1 text-xs rounded-lg border border-green-600 text-green-600 hover:bg-green-600 hover:text-white transition disabled:opacity-50"
                    >
                      +{addDays || 0} дн.
                    </button>
                    {s.isActive && (
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeSubscriber(s.id, s.displayName); }}
                        disabled={extending}
                        title="Удалить из канала"
                        className="shrink-0 px-2 py-1 text-xs rounded-lg border border-red-500 text-red-500 hover:bg-red-500 hover:text-white transition disabled:opacity-50"
                      >
                        Удалить
                      </button>
                    )}
                  </Link>
                ))
              )}
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
