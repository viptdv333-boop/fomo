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
          className={`w-3.5 h-3.5 ${i <= full ? "text-green-500" : "text-gray-300 dark:text-gray-600"}`}
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

export default function IdeaCard({ idea, onVote, compact, minimal }: IdeaCardProps) {
  const { data: session } = useSession();
  const [liked, setLiked] = useState(idea.userVote === 1);
  const [likeCount, setLikeCount] = useState(idea.voteScore);
  const [showDonateModal, setShowDonateModal] = useState(false);

  // Fake view count derived from idea id for display
  const viewCount = Math.abs(idea.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 400) + 50;

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

  // Minimal list view
  if (minimal) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
        <div className={`w-8 h-8 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden`}>
          {idea.author.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={idea.author.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            idea.author.displayName[0]
          )}
        </div>
        <Link href={`/ideas/${idea.id}`} className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm dark:text-gray-100 truncate">{idea.title}</span>
            {idea.isPaid && (
              <span className="px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-[10px] font-medium shrink-0">
                {idea.price} ₽
              </span>
            )}
            {idea.acceptDonations && (
              <span className="text-amber-500 shrink-0" title="Принимает донаты">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z"/></svg>
              </span>
            )}
          </div>
        </Link>
        <span className="text-xs text-gray-400 shrink-0">{idea.author.displayName}</span>
        <span className="text-xs text-gray-400 shrink-0">{dateStr}</span>
        <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {viewCount}
        </span>
        <span className={`flex items-center gap-1 text-xs shrink-0 ${likeCount > 0 ? "text-red-500" : "text-gray-400"}`}>
          <svg className="w-3.5 h-3.5" fill={likeCount > 0 ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
          </svg>
          {likeCount}
        </span>
      </div>
    );
  }

  // Compact card view
  if (compact) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 hover:shadow-md transition flex flex-col h-full">
        <div className="flex items-center gap-2 mb-2">
          <div className={`w-7 h-7 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-xs overflow-hidden shrink-0`}>
            {idea.author.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={idea.author.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              idea.author.displayName[0]
            )}
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{idea.author.displayName}</span>
          <StarRating rating={idea.author.rating} />
          {idea.acceptDonations && (
            <span className="text-amber-500 shrink-0" title="Принимает донаты">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z"/></svg>
            </span>
          )}
          {idea.isPaid && (
            <span className="ml-auto px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-[10px] font-bold shrink-0">
              {idea.price} ₽
            </span>
          )}
        </div>
        <Link href={`/ideas/${idea.id}`}>
          <h3 className="font-semibold text-sm mb-1.5 dark:text-gray-100 hover:text-green-600 transition line-clamp-2">
            {idea.title}
          </h3>
        </Link>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 flex-1">{idea.preview}</p>
        <div className="flex items-center justify-between mt-auto text-xs text-gray-400">
          <div className="flex gap-1 flex-wrap">
            {idea.instruments.slice(0, 2).map((inst) => (
              <Link key={inst.id} href={`/instruments/${inst.slug}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-[10px] hover:bg-green-100 transition">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" /></svg>
                {inst.name}
              </Link>
            ))}
          </div>
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {viewCount}
          </span>
          <button onClick={handleLike} className={`flex items-center gap-1 ${liked ? "text-red-500" : "hover:text-red-500"}`}>
            <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            {likeCount}
          </button>
        </div>
      </div>
    );
  }

  // Default paragraph view — NO border
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 hover:shadow-md transition">
      {/* Top: Avatar + Author info + Price badge */}
      <div className="flex items-center gap-3 mb-3">
        <Link href={`/profile/${idea.author.id}`} className="shrink-0">
          <div className={`w-10 h-10 rounded-full ${avatarColor} flex items-center justify-center text-white font-bold text-sm overflow-hidden`}>
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
            <span className="text-xs text-gray-400 dark:text-gray-500">&middot;</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">{Number(idea.author.rating).toFixed(1)}</span>
            <StarRating rating={idea.author.rating} />
          </div>
        </div>

        {/* Donation + Price badges */}
        <div className="flex items-center gap-2 shrink-0">
          {idea.acceptDonations && (
            <span className="text-amber-500" title="Принимает донаты">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z"/></svg>
            </span>
          )}
          {idea.isPaid && (
            <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-lg text-xs font-bold">
              {idea.price} ₽
            </span>
          )}
        </div>

        {/* Edit button */}
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
        <h2 className="text-base font-bold dark:text-gray-100 hover:text-green-600 dark:hover:text-green-400 transition mb-1">
          {idea.title}
        </h2>
      </Link>

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{idea.preview}</p>

      {/* Bottom: Tags left, Meta right */}
      <div className="flex items-center justify-between gap-3">
        {/* Instrument tags */}
        <div className="flex gap-1.5 flex-wrap min-w-0">
          {idea.instruments.map((inst) => (
            <Link
              key={inst.id}
              href={`/instruments/${inst.slug}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-[11px] font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
              {inst.name}
            </Link>
          ))}
        </div>

        {/* Meta: date, views, likes */}
        <div className="flex items-center gap-4 shrink-0 text-gray-400 dark:text-gray-500 text-xs">
          <span>{dateStr}</span>

          {/* Views */}
          <span className="flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            {viewCount}
          </span>

          {/* Heart like */}
          <button
            onClick={handleLike}
            className={`flex items-center gap-1 transition ${liked ? "text-red-500" : "hover:text-red-500"}`}
          >
            <svg className="w-3.5 h-3.5" fill={liked ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
            </svg>
            {likeCount}
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
