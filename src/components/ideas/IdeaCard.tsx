"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import UnifiedPaymentModal from "@/components/shared/UnifiedPaymentModal";

interface IdeaCardProps {
  idea: {
    id: string;
    title: string;
    preview: string;
    isPaid: boolean;
    price: number | null;
    acceptDonations?: boolean;
    createdAt: string;
    author: {
      id: string;
      displayName: string;
      fomoId?: string | null;
      rating: number;
      avatarUrl: string | null;
      donationCard?: string | null;
    };
    instruments: { id: string; name: string; slug: string }[];
    voteScore: number;
    userVote: number | null;
  };
  onVote?: () => void;
  compact?: boolean;
  minimal?: boolean;
}

export default function IdeaCard({ idea, onVote, compact, minimal }: IdeaCardProps) {
  const { data: session } = useSession();
  const [showDonateModal, setShowDonateModal] = useState(false);

  async function handleVote(value: number) {
    if (!session) return;
    await fetch(`/api/ideas/${idea.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    onVote?.();
  }

  const dateStr = new Date(idea.createdAt).toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
  });

  // Minimal list view
  if (minimal) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs shrink-0">
          {idea.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={idea.author.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            idea.author.displayName[0]
          )}
        </div>
        <Link href={`/ideas/${idea.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm dark:text-gray-100 truncate">{idea.title}</span>
            {idea.isPaid && (
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-[10px] font-medium shrink-0">
                {idea.price} P
              </span>
            )}
          </div>
        </Link>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{idea.author.displayName}</span>
        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{dateStr}</span>
        <span className={`text-xs font-medium min-w-[2rem] text-center shrink-0 ${
          idea.voteScore > 0 ? "text-green-600" : idea.voteScore < 0 ? "text-red-600" : "text-gray-400"
        }`}>
          {idea.voteScore > 0 ? "+" : ""}{idea.voteScore}
        </span>
      </div>
    );
  }

  // Compact card view
  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 hover:shadow-md transition flex flex-col h-full">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-xs overflow-hidden shrink-0">
            {idea.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={idea.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              idea.author.displayName[0]
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{idea.author.displayName}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">{dateStr}</span>
        </div>
        <Link href={`/ideas/${idea.id}`}>
          <h3 className="font-semibold text-sm mb-1.5 dark:text-gray-100 hover:text-blue-600 transition line-clamp-2">
            {idea.title}
          </h3>
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 flex-1">{idea.preview}</p>
        <div className="flex items-center justify-between mt-auto">
          <div className="flex gap-1 flex-wrap">
            {idea.instruments.slice(0, 2).map((inst) => (
              <span key={inst.id} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-[10px]">
                {inst.name}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {idea.isPaid && (
              <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-[10px] font-medium">
                {idea.price} P
              </span>
            )}
            <span className={`text-xs font-medium ${
              idea.voteScore > 0 ? "text-green-600" : idea.voteScore < 0 ? "text-red-600" : "text-gray-400"
            }`}>
              {idea.voteScore > 0 ? "+" : ""}{idea.voteScore}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Default paragraph view
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold overflow-hidden">
            {idea.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={idea.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              idea.author.displayName[0]
            )}
          </div>
          <div>
            <Link
              href={`/profile/${idea.author.id}`}
              className="font-medium hover:text-blue-600 dark:text-gray-100 transition"
            >
              {idea.author.displayName}
            </Link>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              {idea.author.fomoId && <span className="font-mono">#{idea.author.fomoId}</span>}
              <span>Рейтинг: {Number(idea.author.rating).toFixed(1)}</span>
              <span>.</span>
              <span>{new Date(idea.createdAt).toLocaleDateString("ru", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}</span>
            </div>
          </div>
        </div>
        {idea.isPaid && (
          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
            {idea.price} P
          </span>
        )}
      </div>

      <div className="flex items-start justify-between">
        <Link href={`/ideas/${idea.id}`}>
          <h2 className="text-lg font-semibold mb-2 dark:text-gray-100 hover:text-blue-600 transition">
            {idea.title}
          </h2>
        </Link>
        {session?.user?.id === idea.author.id && (
          <Link href={`/ideas/${idea.id}/edit`} className="text-gray-400 hover:text-blue-600 text-sm ml-2 shrink-0" title="Редактировать">
            ✎
          </Link>
        )}
      </div>

      <p className="text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">{idea.preview}</p>

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 flex-wrap">
          {idea.instruments.map((inst) => (
            <Link
              key={inst.id}
              href={`/instruments/${inst.slug}`}
              className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
            >
              {inst.name}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Donate button */}
          {!idea.isPaid && idea.acceptDonations && session && session.user?.id !== idea.author.id && (
            <button
              onClick={() => setShowDonateModal(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/50 transition"
              title="Отправить донат"
            >
              💰 Донат
            </button>
          )}

          {session && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleVote(1)}
                className={`px-2 py-1 rounded text-sm transition ${
                  idea.userVote === 1 ? "bg-green-100 text-green-700" : "text-gray-400 hover:text-green-600"
                }`}
              >
                ▲
              </button>
              <span className={`text-sm font-medium min-w-[2rem] text-center ${
                idea.voteScore > 0 ? "text-green-600" : idea.voteScore < 0 ? "text-red-600" : "text-gray-400"
              }`}>
                {idea.voteScore}
              </span>
              <button
                onClick={() => handleVote(-1)}
                className={`px-2 py-1 rounded text-sm transition ${
                  idea.userVote === -1 ? "bg-red-100 text-red-700" : "text-gray-400 hover:text-red-600"
                }`}
              >
                ▼
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Donate modal */}
      {showDonateModal && (
        <UnifiedPaymentModal
          purpose={{
            type: "donation",
            authorId: idea.author.id,
            authorName: idea.author.displayName,
            donationCard: idea.author.donationCard,
          }}
          onClose={() => setShowDonateModal(false)}
        />
      )}
    </div>
  );
}
