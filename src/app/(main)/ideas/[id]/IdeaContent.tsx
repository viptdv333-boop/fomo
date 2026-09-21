"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import UnifiedPaymentModal from "@/components/shared/UnifiedPaymentModal";
import NewBadge, { isRecentlyPublished, ArchivedBadge } from "@/components/shared/NewBadge";
import ShareButtons from "@/components/shared/ShareButtons";
import ImageLightbox from "@/components/shared/ImageLightbox";
import Watermark from "@/components/shared/Watermark";
import InstrumentLogo from "@/components/instruments/InstrumentLogo";
import IdeaComments from "@/components/ideas/IdeaComments";
import { useT } from "@/lib/i18n/client";

interface IdeaDetail {
  id: string;
  title: string;
  preview: string;
  content?: string;
  isPaid: boolean;
  price: number | null;
  acceptDonations?: boolean;
  /** Пост закрытого канала (13.09.2026) — открывается подпиской на канал. */
  channel?: { id: string; name: string } | null;
  locked?: boolean;
  /** Только для платной идеи без канала: первые ~200 символов контента. */
  previewText?: string | null;
  /** Ещё до ~400 символов, показываются размытыми для эффекта блюра. */
  blurText?: string | null;
  attachments?: unknown;
  viewCount?: number;
  createdAt: string;
  moderationStatus?: string;
  author: {
    id: string;
    displayName: string;
    rating: number;
    avatarUrl: string | null;
    subscriptionPrice: number | null;
    donationCard?: string | null;
    sbpQrUrl?: string | null;
  };
  instruments: { id: string; name: string; slug: string; asset?: { slug: string; name: string } | null }[];
  voteScore: number;
  userVote: number | null;
}

export default function IdeaContent() {
  const { t } = useT();
  const params = useParams();
  const { data: session } = useSession();
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [archiving, setArchiving] = useState(false);

  async function toggleArchive() {
    if (!idea) return;
    setArchiving(true);
    const next = idea.moderationStatus === "archived" ? "published" : "archived";
    const res = await fetch(`/api/ideas/${idea.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderationStatus: next }),
    });
    if (res.ok) setIdea({ ...idea, moderationStatus: next });
    setArchiving(false);
  }

  async function loadIdea() {
    const res = await fetch(`/api/ideas/${params.id}`);
    if (res.ok) setIdea(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadIdea(); }, [params.id]);

  // Register a view once per idea per browser session (survives refresh
  // for a short window). Uses sessionStorage so refreshes don't inflate
  // the counter, but a real return visit in a new tab/session counts.
  useEffect(() => {
    if (!params.id || typeof window === "undefined") return;
    const key = `idea-view:${params.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage may be disabled — best-effort dedup only.
    }
    fetch(`/api/ideas/${params.id}/view`, { method: "POST" }).catch(() => {});
  }, [params.id]);

  async function handleVote(value: number) {
    if (!session) return;
    await fetch(`/api/ideas/${params.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
    loadIdea();
  }

  if (loading) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">...</div>;
  if (!idea) return <div className="text-gray-500 dark:text-gray-400 py-12 text-center">{t("idea.notFound")}</div>;

  return (
    <div className="max-w-3xl w-full mx-auto">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1 mb-4 text-sm text-gray-500 hover:text-green-600 dark:text-gray-400 dark:hover:text-green-400"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M15 19l-7-7 7-7" />
        </svg>
        {t("common.back")}
      </button>
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow p-8 select-none"
        onCopy={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Paid-channel post: FOMO logo watermark behind the content */}
        {idea.channel && !idea.locked && <Watermark />}
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
              {t("idea.rating")} {Number(idea.author.rating).toFixed(1)} ·{" "}
              {new Date(idea.createdAt).toLocaleString("ru", {
                day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
                timeZone: "Europe/Moscow",
              })} МСК
            </div>
          </div>
        </div>

        {/* На телефоне кнопки автора уходят под заголовок: в одной строке
            они сжимали заголовок в столбик по слову. */}
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 mb-4">
          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1 basis-[16rem]">
            <h1 className="text-2xl font-bold break-words min-w-0">{idea.title}</h1>
            {isRecentlyPublished(idea.createdAt) && <NewBadge className="shrink-0" />}
            {idea.moderationStatus === "archived" && <ArchivedBadge className="shrink-0" />}
          </div>
          {session?.user?.id === idea.author.id && (
            <div className="flex items-center gap-3 shrink-0">
              <Link href={`/ideas/${idea.id}/edit`} className="text-sm text-green-600 hover:text-green-800 font-medium">
                {t("common.edit")}
              </Link>
              <button
                onClick={toggleArchive}
                disabled={archiving}
                className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium disabled:opacity-50"
              >
                {idea.moderationStatus === "archived" ? t("idea.unarchive") : t("idea.archive")}
              </button>
              <button
                onClick={async () => {
                  if (!confirm("Удалить идею безвозвратно?")) return;
                  setDeleting(true);
                  const res = await fetch(`/api/ideas/${idea.id}`, { method: "DELETE" });
                  if (res.ok) {
                    router.push("/profile?tab=ideas");
                  } else {
                    setDeleting(false);
                    alert("Не удалось удалить идею");
                  }
                }}
                disabled={deleting}
                className="text-sm text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
              >
                {deleting ? "Удаление..." : t("common.delete")}
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 mb-4">
          {idea.instruments.map((inst) => (
            <Link
              key={inst.id}
              href={`/instruments/${inst.slug}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-sm font-medium hover:bg-green-100 dark:hover:bg-green-900/50 transition"
            >
              <InstrumentLogo slug={inst.asset?.slug || inst.slug} name={inst.asset?.name || inst.name} size={16} />
              {inst.name}
            </Link>
          ))}
        </div>

        {idea.locked ? (
          idea.previewText ? (
            // Платная идея без канала: 200 символов контента + блюр-заглушка + оплата
            <div>
              <p className="whitespace-pre-wrap dark:text-gray-100 mb-1">{idea.previewText}</p>
              <div className="relative h-40 overflow-hidden -mt-1">
                {idea.blurText && (
                  <p className="whitespace-pre-wrap blur-sm select-none pointer-events-none text-gray-400 dark:text-gray-600">
                    {idea.blurText}
                  </p>
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-transparent via-white/80 dark:via-gray-900/80 to-white dark:to-gray-900">
                  <button
                    onClick={() => setShowPayModal(true)}
                    className="mt-10 bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 transition shadow-lg"
                  >
                    {t("idea.buyFor")} {idea.price} ₽
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700">
              <div className="text-4xl mb-3">🔒</div>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {t("idea.fullContentLocked")}
              </p>
              <div className="flex gap-3 justify-center">
                {idea.channel && (
                  <Link
                    href={`/channels/${idea.channel.id}`}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition"
                  >
                    Подписаться на канал «{idea.channel.name}»
                  </Link>
                )}
              </div>
            </div>
          )
        ) : idea.content ? (
          <>
            <div className="border-t dark:border-gray-700 pt-6 whitespace-pre-wrap dark:text-gray-100">{idea.content}</div>
            {idea.attachments && (idea.attachments as any[]).length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {(idea.attachments as any[]).map((att: any, i: number) =>
                  att.url.endsWith(".mp4") || att.url.endsWith(".webm") ? (
                    <video key={i} src={att.url} controls className="rounded-lg w-full" />
                  ) : (
                    <ImageLightbox key={i} src={att.url} alt={att.name} className="rounded-lg w-full" />
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
              {t("idea.like")}
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
              {t("idea.dislike")}
            </button>

            <div className="ml-auto flex items-center gap-2">
              {idea.acceptDonations &&
                session.user?.id !== idea.author.id &&
                (idea.author.donationCard || idea.author.sbpQrUrl) && (
                  <button
                    onClick={() => setShowDonateModal(true)}
                    className="px-3 py-1.5 rounded-lg text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition font-medium"
                  >
                    ☕ {t("idea.donate")}
                  </button>
                )}
              <ShareButtons url={`https://fomo.spot/ideas/${idea.id}`} text={idea.title} />
            </div>
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

      {/* Donate modal */}
      {showDonateModal && (
        <UnifiedPaymentModal
          purpose={{
            type: "donation",
            authorId: idea.author.id,
            authorName: idea.author.displayName,
            donationCard: idea.author.donationCard,
            donationQrUrl: idea.author.sbpQrUrl,
          }}
          onClose={() => setShowDonateModal(false)}
        />
      )}

      {/* Discuss — deep-links into the болталка room for the idea's instrument
          instead of a separate comment thread, so discussion lives in one
          place per instrument rather than being split across every idea. */}
      {idea && (
        <Link
          href={idea.instruments[0] ? `/chat/${idea.instruments[0].slug}` : "/chat"}
          className="mt-4 flex items-center justify-center gap-2 bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 text-green-600 dark:text-green-400 font-medium hover:bg-green-50 dark:hover:bg-green-900/20 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.17 0-2.29-.2-3.31-.56L3 21l1.56-4.69C3.57 15.09 3 13.6 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {t("idea.discussInChat")}
        </Link>
      )}

      {/* Comments */}
      {idea && <IdeaComments ideaId={idea.id} />}
    </div>
  );
}
