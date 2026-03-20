"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import UnifiedPaymentModal from "@/components/shared/UnifiedPaymentModal";

const AVATAR_COLORS = [
  "bg-green-600", "bg-teal-600", "bg-emerald-600", "bg-cyan-600",
  "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-indigo-600",
];

function hashColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-3 h-3 ${i <= full ? "text-yellow-500" : "text-gray-300 dark:text-gray-600"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

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

export default function IdeaCard({ idea, onVote }: IdeaCardProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(idea.userVote === 1);
  const [likeCount, setLikeCount] = useState(idea.voteScore);
  const [showDonateModal, setShowDonateModal] = useState(false);

  async function handleLike() {
    if (!session) return;
    const newValue = liked ? 0 : 1;
    setLiked(!liked);
    setLikeCount((prev) => prev + (liked ? -1 : 1));
    await fetch(`/api/ideas/${idea.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: newValue }),
    });
    onVote?.();
  }

  const dateStr = new Date(idea.createdAt).toLocaleDateString("ru", {
    day: "numeric",
    month: "short",
  });

  const avatarColor = hashColor(idea.author.id);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      {/* Top: Avatar + Author info + Price badge */}
      <div className="flex items-start gap-3 mb-3">
        <Link href={`/profile/${idea.author.id}`} className="shrink-0">
          <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-lg overflow-hidden`}>
            {idea.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={idea.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              idea.author.displayName[0]
            )}
          </div>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/profile/${idea.author.id}`} className="font-semibold text-sm dark:text-gray-100 hover:text-green-600 transition">
              {idea.author.displayName}
            </Link>
            {idea.author.fomoId && (
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">@{idea.author.fomoId}</span>
            )}
            <StarRating rating={idea.author.rating} />
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Рейтинг {Number(idea.author.rating).toFixed(1)}
          </div>
        </div>

        {/* Price badge */}
        {idea.isPaid && (
          <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold shrink-0">
            {idea.price} P
          </span>
        )}

        {/* Edit button for author */}
        {session?.user?.id === idea.author.id && (
          <Link href={`/ideas/${idea.id}/edit`} className="text-gray-300 dark:text-gray-600 hover:text-green-600 dark:hover:text-green-400 shrink-0 transition" title="Редактировать">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </Link>
        )}
      </div>

      {/* Title */}
      <Link href={`/ideas/${idea.id}`}>
        <h2 className="text-lg font-bold dark:text-gray-100 hover:text-green-600 dark:hover:text-green-400 transition mb-1.5">
          {idea.title}
        </h2>
      </Link>

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">{idea.preview}</p>

      {/* Bottom: Tags left, Meta right */}
      <div className="flex items-center justify-between gap-3">
        {/* Instrument tags */}
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {idea.instruments.map((inst) => (
            <Link
              key={inst.id}
              href={`/instruments/${inst.slug}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-[11px] font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
              {inst.name}
            </Link>
          ))}
        </div>

        {/* Meta: date, views, likes, donate */}
        <div className="flex items-center gap-3 shrink-0 text-gray-400 dark:text-gray-500">
          {/* Date */}
          <span className="flex items-center gap-1 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
            </svg>
            {dateStr}
          </span>

          {/* Donate */}
          {!idea.isPaid && idea.acceptDonations && session && session.user?.id !== idea.author.id && (
            <button
              onClick={() => setShowDonateModal(true)}
              className="text-green-500 hover:text-green-600 transition"
              title="Донат"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          )}

          {/* Heart like */}
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 text-xs transition ${
              liked ? "text-red-500" : "hover:text-red-500"
            }`}
          >
            <svg className="w-4 h-4" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            <span className="font-medium">{likeCount}</span>
          </button>
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
