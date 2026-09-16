"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import BuySubscriptionModal from "@/components/profile/BuySubscriptionModal";
import ChannelDiscussion from "@/components/channels/ChannelDiscussion";
import ShareButtons from "@/components/shared/ShareButtons";
import { useT } from "@/lib/i18n/client";

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
}

interface IdeaData {
  id: string;
  title: string;
  preview: string;
  isPaid: boolean;
  price: number | null;
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
  const [subscribers, setSubscribers] = useState<SubscriberData[]>([]);
  const [subscribersLoading, setSubscribersLoading] = useState(false);

  const openSubscribers = useCallback(async () => {
    if (!channel) return;
    setShowSubscribers(true);
    setSubscribersLoading(true);
    const res = await fetch(`/api/users/${channel.author.id}/tariffs/${channel.id}/subscribers`);
    if (res.ok) setSubscribers(await res.json());
    setSubscribersLoading(false);
  }, [channel]);

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

    // Check subscription
    if (session?.user?.id && !owner) {
      fetch("/api/subscriptions")
        .then((r) => r.json())
        .then((subs) => {
          if (Array.isArray(subs)) {
            // Подписка на ЭТОТ канал или старая подписка на автора без тарифа
            // (13.09.2026: подписки теперь по каналам, а не на автора целиком).
            const hasSub = subs.some(
              (s: { type: string; tariffId?: string | null; author: { id: string } }) =>
                s.author.id === channel.author.id && s.type === "paid" &&
                (!s.tariffId || s.tariffId === channel.id)
            );
            setIsSubscribed(hasSub);
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
          {isOwner && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">Это ваш канал</span>
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
                  <div className="absolute top-3 right-3 z-10 flex items-center gap-3 bg-white/90 dark:bg-gray-900/90 rounded-lg px-2 py-1">
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
                    className={`block bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 hover:shadow-md transition select-none ${isOwner ? "pr-32" : ""}`}
                    onCopy={(e) => e.preventDefault()}
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{idea.title}</h3>
                      </div>
                      {idea.price && (
                        <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded shrink-0">
                          {Number(idea.price)} ₽
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                      <span>{new Date(idea.createdAt).toLocaleDateString("ru-RU")}</span>
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
                        <span>{new Date(idea.createdAt).toLocaleDateString("ru-RU")}</span>
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
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
