"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import IdeaCard from "@/components/ideas/IdeaCard";
import { useT } from "@/lib/i18n/client";

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  category: { name: string; slug: string } | null;
}

interface Channel {
  id: string;
  name: string;
  description: string | null;
  price: number;
  author: { id: string; displayName: string; avatarUrl: string | null; fomoId: string | null };
  _count: { subscriptions: number };
}

export default function FeedByInstrumentPage() {
  const { t } = useT();
  const params = useParams();
  const slug = params.slug as string;

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [ideas, setIdeas] = useState<any[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    // Load instrument info by slug
    fetch(`/api/instruments?search=${slug}&limit=1`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        const found = list.find((i: any) => i.slug === slug);
        if (found) setInstrument(found);
      })
      .catch(() => {});

    // Load ideas by instrument slug
    fetch(`/api/ideas?instrumentSlug=${slug}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        setIdeas(data.ideas || data || []);
      })
      .catch(() => {});

    // Load channels that have this instrument in tags
    fetch(`/api/channels?instrumentSlug=${slug}`)
      .then((r) => r.json())
      .then((data) => {
        setChannels(Array.isArray(data) ? data : []);
      })
      .catch(() => {});

    setLoading(false);
  }, [slug]);

  const displayName = instrument?.name || slug;
  const ticker = instrument?.ticker || slug.toUpperCase();
  const category = instrument?.category;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        {category && (
          <div className="text-sm text-gray-400 mb-1">
            <Link href="/feed" className="hover:text-green-600">{t("feed.title")}</Link>
            {" / "}
            <span>{category.name}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <span className="text-3xl font-bold text-green-600 dark:text-green-400">#{ticker}</span>
          <h1 className="text-2xl font-bold dark:text-gray-100">{displayName}</h1>
        </div>
      </div>

      {/* Channels with this instrument */}
      {channels.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold dark:text-gray-100 mb-3">{t("nav.channels")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {channels.map((ch) => (
              <Link key={ch.id} href={`/channels/${ch.id}`}
                className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 hover:shadow-md transition">
                <div className="flex items-center gap-3">
                  {ch.author.avatarUrl ? (
                    <img src={ch.author.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 font-bold">
                      {ch.author.displayName?.[0] || "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm dark:text-gray-100 truncate">{ch.name}</div>
                    <div className="text-xs text-gray-400">{ch.author.displayName} · {ch._count.subscriptions} подписчиков</div>
                  </div>
                  <span className="text-xs font-medium text-green-600">
                    {ch.price > 0 ? `${ch.price} ₽` : "Бесплатный"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Ideas */}
      <div>
        <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">
{t("authors.ideasLabel")} #{ticker}
          {ideas.length > 0 && <span className="text-sm font-normal text-gray-400 ml-2">{ideas.length}</span>}
        </h2>
        {loading ? (
          <div className="text-gray-400 py-8 text-center">...</div>
        ) : ideas.length > 0 ? (
          <div className="space-y-4">
            {ideas.map((idea: any) => (
              <IdeaCard key={idea.id} idea={idea} onVote={() => {}} />
            ))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8 text-center">
            <p className="text-gray-400 dark:text-gray-500 mb-3">{t("feed.noIdeas")} #{ticker}</p>
            <Link href={`/ideas/new?instrumentSlug=${slug}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
              {t("channels.publish")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
