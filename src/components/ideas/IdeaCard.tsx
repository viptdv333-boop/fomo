"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

interface IdeaCardProps {
  idea: {
    id: string;
    title: string;
    preview: string;
    isPaid: boolean;
    price: number | null;
    createdAt: string;
    author: {
      id: string;
      displayName: string;
      rating: number;
      avatarUrl: string | null;
    };
    instruments: { id: string; name: string; slug: string }[];
    voteScore: number;
    userVote: number | null;
  };
  onVote?: () => void;
}

export default function IdeaCard({ idea, onVote }: IdeaCardProps) {
  const { data: session } = useSession();

  async function handleVote(value: number) {
    if (!session) return;
    await fetch(`/api/ideas/${idea.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    onVote?.();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
            {idea.author.displayName[0]}
          </div>
          <div>
            <Link
              href={`/profile/${idea.author.id}`}
              className="font-medium hover:text-blue-600 dark:text-gray-100 transition"
            >
              {idea.author.displayName}
            </Link>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span>Рейтинг: {Number(idea.author.rating).toFixed(1)}</span>
              <span>·</span>
              <span>
                {new Date(idea.createdAt).toLocaleDateString("ru", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>
        {idea.isPaid && (
          <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs font-medium">
            {idea.price} ₽
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
          <Link
            href={`/ideas/${idea.id}/edit`}
            className="text-gray-400 hover:text-blue-600 text-sm ml-2 shrink-0"
            title="Редактировать"
          >
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
              href={`/feed?instrumentId=${inst.id}`}
              className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-900/50 transition"
            >
              {inst.name}
            </Link>
          ))}
        </div>

        {session && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleVote(1)}
              className={`px-2 py-1 rounded text-sm transition ${
                idea.userVote === 1
                  ? "bg-green-100 text-green-700"
                  : "text-gray-400 hover:text-green-600"
              }`}
            >
              ▲
            </button>
            <span
              className={`text-sm font-medium min-w-[2rem] text-center ${
                idea.voteScore > 0
                  ? "text-green-600"
                  : idea.voteScore < 0
                  ? "text-red-600"
                  : "text-gray-400"
              }`}
            >
              {idea.voteScore}
            </span>
            <button
              onClick={() => handleVote(-1)}
              className={`px-2 py-1 rounded text-sm transition ${
                idea.userVote === -1
                  ? "bg-red-100 text-red-700"
                  : "text-gray-400 hover:text-red-600"
              }`}
            >
              ▼
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
