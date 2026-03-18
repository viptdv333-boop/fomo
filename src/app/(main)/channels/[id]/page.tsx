"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import BuySubscriptionModal from "@/components/profile/BuySubscriptionModal";
import ShareButtons from "@/components/shared/ShareButtons";

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

export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const channelId = params.id as string;

  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [otherTariffs, setOtherTariffs] = useState<ChannelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    // Fetch all channels and find this one
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data: ChannelData[]) => {
        const found = data.find((ch) => ch.id === channelId);
        if (found) {
          setChannel(found);
          // Find other tariffs by same author
          const others = data.filter(
            (ch) => ch.author.id === found.author.id && ch.id !== found.id
          );
          setOtherTariffs(others);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [channelId]);

  // Check subscription status
  useEffect(() => {
    if (!session?.user?.id || !channel) return;
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
  }, [session, channel]);

  if (loading) {
    return (
      <div className="text-center py-16 text-gray-500 dark:text-gray-400">
        Загрузка...
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">📡</div>
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
          Канал не найден
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Возможно, канал был удалён или ссылка некорректна.
        </p>
        <button
          onClick={() => router.push("/channels")}
          className="text-blue-600 hover:underline text-sm"
        >
          ← Вернуться к каналам
        </button>
      </div>
    );
  }

  const isOwner = session?.user?.id === channel.author.id;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back */}
      <button
        onClick={() => router.push("/channels")}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 inline-flex items-center gap-1"
      >
        ← Все каналы
      </button>

      {/* Channel header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-6 mb-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xl overflow-hidden shrink-0">
            {channel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channel.author.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              channel.author.displayName[0]
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {channel.name}{" "}
              <span className="text-sm font-normal text-gray-400">
                ({channel.id.slice(0, 8)})
              </span>
            </h1>

            <Link
              href={`/profile/${channel.author.id}`}
              className="text-sm text-blue-600 hover:underline"
            >
              {channel.author.displayName}
            </Link>

            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span>⭐ {channel.author.rating.toFixed(1)}</span>
              <span>👥 {channel.subscribersCount} подписчиков</span>
            </div>
          </div>

          {/* Share */}
          <ShareButtons
            url={`https://fomo.broker/channels/${channel.id}`}
            text={`${channel.name} — канал на FOMO`}
          />
        </div>

        {channel.description && (
          <p className="text-gray-600 dark:text-gray-400 mt-4 text-sm leading-relaxed">
            {channel.description}
          </p>
        )}

        {/* Price info */}
        <div className="mt-4 flex items-center gap-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-4 py-2">
            <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
              {channel.price} ₽
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">
              / {channel.durationDays} дн.
            </span>
          </div>

          {!isOwner && !isSubscribed && (
            <button
              onClick={() => setShowBuyModal(true)}
              className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              Купить подписку
            </button>
          )}

          {isSubscribed && (
            <span className="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 px-4 py-2 rounded-lg text-sm font-medium">
              ✓ Вы подписаны
            </span>
          )}

          {isOwner && (
            <span className="text-sm text-gray-400">Это ваш канал</span>
          )}
        </div>
      </div>

      {/* Other tariffs by same author */}
      {otherTariffs.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Другие каналы автора
          </h2>
          <div className="space-y-2">
            {otherTariffs.map((t) => (
              <Link
                key={t.id}
                href={`/channels/${t.id}`}
                className="flex items-center justify-between p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
              >
                <div>
                  <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                    {t.name}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">
                    ({t.id.slice(0, 8)})
                  </span>
                </div>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  {t.price} ₽ / {t.durationDays} дн.
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Author link */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-6">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Об авторе
        </h2>
        <Link
          href={`/profile/${channel.author.id}`}
          className="flex items-center gap-3 p-3 rounded-lg border dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
        >
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold overflow-hidden shrink-0">
            {channel.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={channel.author.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              channel.author.displayName[0]
            )}
          </div>
          <div>
            <div className="font-medium text-gray-900 dark:text-gray-100">
              {channel.author.displayName}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Рейтинг: {channel.author.rating.toFixed(1)} ⭐
            </div>
          </div>
          <span className="ml-auto text-blue-600 text-sm">Профиль →</span>
        </Link>
      </div>

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
