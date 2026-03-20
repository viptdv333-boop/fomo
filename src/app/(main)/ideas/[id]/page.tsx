"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import UnifiedPaymentModal from "@/components/shared/UnifiedPaymentModal";

interface IdeaDetail {
  id: string;
  title: string;
  preview: string;
  content?: string;
  isPaid: boolean;
  price: number | null;
  locked?: boolean;
  attachments?: unknown;
  createdAt: string;
  author: {
    id: string;
    displayName: string;
    rating: number;
    avatarUrl: string | null;
    subscriptionPrice: number | null;
  };
  instruments: { id: string; name: string; slug: string }[];
  voteScore: number;
  userVote: number | null;
}

export default function IdeaPage() {
  const params = useParams();
  const { data: session } = useSession();
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);

  async function loadIdea() {
    const res = await fetch(`/api/ideas/${params.id}`);
    if (res.ok) setIdea(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadIdea(); }, [params.id]);

  async function handleVote(value: number) {
    if (!session) return;
    await fetch(`/api/ideas/${params.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    loadIdea();
  }

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Загрузка...</div>;
  if (!idea) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">Идея не найдена</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-300 font-bold text-lg overflow-hidden">
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
              className="font-medium text-lg hover:text-green-600 dark:text-gray-100 dark:hover:text-green-400"
            >
              {idea.author.displayName}
            </Link>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Рейтинг: {Number(idea.author.rating).toFixed(1)} ·{" "}
              {new Date(idea.createdAt).toLocaleDateString("ru", {
                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">{idea.title}</h1>
          {session?.user?.id === idea.author.id && (
            <Link href={`/ideas/${idea.id}/edit`} className="text-sm text-green-600 hover:text-green-800 font-medium">
              Редактировать
            </Link>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {idea.instruments.map((inst) => (
            <Link
              key={inst.id}
              href={`/instruments/${inst.slug}`}
              className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition"
            >
              #{inst.name}
            </Link>
          ))}
        </div>

        <div className="text-gray-600 dark:text-gray-400 mb-6 whitespace-pre-wrap">{idea.preview}</div>

        {idea.locked ? (
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Полный контент доступен после оплаты
            </p>
            <div className="flex gap-3 justify-center">
              {idea.price && (
                <button
                  onClick={() => setShowPayModal(true)}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition"
                >
                  Купить за {idea.price} ₽
                </button>
              )}
            </div>
          </div>
        ) : idea.content ? (
          <>
            <div className="border-t dark:border-gray-700 pt-6 whitespace-pre-wrap dark:text-gray-100">{idea.content}</div>
            {idea.attachments && (idea.attachments as any[]).length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(idea.attachments as any[]).map((att: any, i: number) =>
                  att.url.endsWith(".mp4") || att.url.endsWith(".webm") ? (
                    <video key={i} src={att.url} controls className="rounded-lg w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={att.url} alt={att.name} className="rounded-lg w-full" />
                  )
                )}
              </div>
            )}
          </>
        ) : null}

        {session && (
          <div className="flex items-center gap-2 mt-6 pt-4 border-t dark:border-gray-700">
            <button
              onClick={() => handleVote(1)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                idea.userVote === 1
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-green-600"
              }`}
            >
              ▲ Нравится
            </button>
            <span className={`text-lg font-bold ${
              idea.voteScore > 0 ? "text-green-600" : idea.voteScore < 0 ? "text-red-600" : "text-gray-400"
            }`}>
              {idea.voteScore}
            </span>
            <button
              onClick={() => handleVote(-1)}
              className={`px-3 py-1.5 rounded-lg text-sm transition ${
                idea.userVote === -1
                  ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-red-600"
              }`}
            >
              ▼ Не нравится
            </button>
          </div>
        )}
      </div>

      {/* Unified payment modal */}
      {showPayModal && idea.isPaid && idea.price && (
        <UnifiedPaymentModal
          purpose={{
            type: "idea",
            ideaId: idea.id,
            ideaTitle: idea.title,
            price: idea.price,
            authorId: idea.author.id,
            authorName: idea.author.displayName,
          }}
          onClose={() => setShowPayModal(false)}
          onSuccess={() => loadIdea()}
        />
      )}
    </div>
  );
}
