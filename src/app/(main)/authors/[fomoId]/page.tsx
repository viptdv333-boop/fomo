"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import IdeaCard from "@/components/ideas/IdeaCard";
import { useT } from "@/lib/i18n/client";

interface Author {
  id: string;
  displayName: string;
  fomoId: string | null;
  bio: string | null;
  avatarUrl: string | null;
  rating: number;
  specializations: string[];
  _count?: { followers: number; ideas: number };
}

const SPEC_LABELS: Record<string, string> = {
  trader: "Трейдер", analyst: "Аналитик", investor: "Инвестор",
  scalper: "Скальпер", algotrader: "Алготрейдер",
};

export default function AuthorPage() {
  const { t } = useT();
  const params = useParams();
  const fomoId = params.fomoId as string;

  const [author, setAuthor] = useState<Author | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fomoId) return;

    // Find user by fomoId
    fetch(`/api/users/by-fomo-id/${fomoId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((user) => {
        if (!user) { setLoading(false); return; }
        setAuthor(user);

        // Load author's ideas
        fetch(`/api/ideas?authorId=${user.id}&limit=50`)
          .then((r) => r.json())
          .then((data) => setIdeas(data.ideas || data || []))
          .catch(() => {});

        // Load author's channels
        fetch(`/api/channels?authorId=${user.id}`)
          .then((r) => r.json())
          .then((data) => setChannels(Array.isArray(data) ? data : []))
          .catch(() => {});

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [fomoId]);

  if (loading) return <div className="text-gray-400 py-12 text-center">...</div>;
  if (!author) return <div className="text-gray-400 py-12 text-center">{t("authors.notFound")}</div>;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Author header */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 mb-6">
        <div className="flex items-start gap-4">
          {author.avatarUrl ? (
            <img src={author.avatarUrl} alt="" className="w-20 h-20 rounded-full object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 text-2xl font-bold">
              {author.displayName?.[0] || "?"}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-bold dark:text-gray-100">{author.displayName}</h1>
            {author.fomoId && (
              <p className="text-sm text-gray-400">#{author.fomoId}</p>
            )}
            {author.bio && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">{author.bio}</p>
            )}
            {author.specializations?.length > 0 && (
              <div className="flex gap-2 mt-2">
                {author.specializations.map((s) => (
                  <span key={s} className="text-xs px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 rounded">
                    {SPEC_LABELS[s] || s}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-4 mt-3 text-sm text-gray-500">
              {author._count && (
                <>
                  <span>{author._count.ideas} идей</span>
                  <span>{author._count.followers} {t("channels.subscribers")}</span>
                </>
              )}
              <span>Рейтинг: {author.rating?.toFixed(1) || "0"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Author's channels */}
      {channels.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold dark:text-gray-100 mb-3">{t("nav.channels")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {channels.map((ch: any) => (
              <Link key={ch.id} href={`/channels/${ch.id}`}
                className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 hover:shadow-md transition">
                <div className="font-medium text-sm dark:text-gray-100">{ch.name}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {ch._count?.subscriptions || 0} {t("channels.subscribers")} · {ch.price > 0 ? `${ch.price} ₽` : t("feed.free")}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Author's ideas */}
      <div>
        <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">{t("authors.ideasLabel")}</h2>
        {ideas.length > 0 ? (
          <div className="space-y-4">
            {ideas.map((idea: any) => (
              <IdeaCard key={idea.id} idea={idea} onVote={() => {}} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 text-center text-gray-400">
            {t("authors.empty")}
          </div>
        )}
      </div>
    </div>
  );
}
