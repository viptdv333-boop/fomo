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

  // Load channel data
  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data: ChannelData[]) => {
        const found = data.find((ch) => ch.id === channelId);
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
            const hasSub = subs.some(
              (s: { type: string; author: { id: string } }) =>
                s.author.id === channel.author.id && s.type === "paid"
            );
            setIsSubscribed(hasSub);
          }
        })
        .catch(() => {});
    }

    // Load author's paid ideas
    fetch(`/api/ideas?authorId=${channel.author.id}&isPaid=true&limit=50`)
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
    <div className="max-w-3xl mx-auto">
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
            {channel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={channel.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              (channel.author.displayName || "?")[0]
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {channel.name}{" "}
              <span className="text-sm font-normal text-gray-400">({channel.id.slice(0, 8)})</span>
            </h1>
            <Link href={`/profile/${channel.author.id}`} className="text-sm text-green-600 hover:underline">
              {channel.author.displayName}
            </Link>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span>⭐ {Number(channel.author.rating).toFixed(1)}</span>
              <span>👥 {channel.subscribersCount} {t("channels.subscribers")}</span>
            </div>
          </div>

          <ShareButtons url={`https://fomo.broker/channels/${channel.id}`} text={`${channel.name} — канал на FOMO`} />
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
          {isOwner && <span className="text-sm text-gray-400">Это ваш канал</span>}
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
                {canView ? (
                  /* Unlocked idea card */
                  <Link
                    href={`/ideas/${idea.id}`}
                    className="block bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 hover:shadow-md transition"
                  >
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
                  <span className="text-xs text-gray-400 ml-1">({t.id.slice(0, 8)})</span>
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
    </div>
  );
}
