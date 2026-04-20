"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  rating: number;
  role?: string;
  ideasCount: number;
  subscribersCount: number;
  bio: string | null;
  createdAt: string;
}

type SortField = "rating" | "ideasCount" | "subscribersCount" | "createdAt";

const AVATAR_COLORS = [
  "bg-green-600", "bg-teal-600", "bg-emerald-600", "bg-cyan-600",
  "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-indigo-600",
];

function hashColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}


function AuthorAvatar({ author }: { author: Author }) {
  const color = hashColor(author.id);
  return (
    <div className={`w-16 h-16 rounded-full ${color} flex items-center justify-center text-white font-bold text-xl overflow-hidden shrink-0`}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (author.displayName || "?")[0]
      )}
    </div>
  );
}

export default function AuthorsPage() {
  const { t } = useT();
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [ideasFilter, setIdeasFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "paragraph" | "cards">("paragraph");

  useEffect(() => {
    fetch("/api/authors")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setAuthors(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortField(field); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let result = authors.filter((a) => {
      if (ratingFilter !== "all" && Number(a.rating) < parseFloat(ratingFilter)) return false;
      if (ideasFilter !== "all" && a.ideasCount < parseInt(ideasFilter)) return false;
      return true;
    });

    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "rating": va = Number(a.rating); vb = Number(b.rating); break;
        case "ideasCount": va = a.ideasCount; vb = b.ideasCount; break;
        case "subscribersCount": va = a.subscribersCount; vb = b.subscribersCount; break;
        case "createdAt": va = new Date(a.createdAt).getTime(); vb = new Date(b.createdAt).getTime(); break;
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [authors, ratingFilter, ideasFilter, sortField, sortDir]);

  const pillClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
      active
        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  const hasActiveFilters = ratingFilter !== "all" || ideasFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">{t("authors.title")}</h1>
      </div>

      {/* Filter bar — inline pills like Feed */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <button onClick={() => handleSort("rating")} className={pillClass(sortField === "rating")}>
          {t("authors.rating")} {sortField === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button onClick={() => handleSort("createdAt")} className={pillClass(sortField === "createdAt")}>
          {t("authors.byDate")} {sortField === "createdAt" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button onClick={() => handleSort("subscribersCount")} className={pillClass(sortField === "subscribersCount")}>
          {t("authors.popularity")} {sortField === "subscribersCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>

        {([] as { label: string; value: string }[]).map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRatingFilter(ratingFilter === opt.value ? "all" : opt.value)}
            className={pillClass(ratingFilter === opt.value)}
          >
            {opt.label}
          </button>
        ))}

        {/* Ideas filter removed */}

        {hasActiveFilters && (
          <button
            onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); }}
            className="text-xs text-gray-400 hover:text-red-500 transition ml-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* View mode — right side */}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button onClick={() => setViewMode("paragraph")} className={`p-1.5 rounded transition ${viewMode === "paragraph" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`} title="Абзац">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" x2="17" y1="8" y2="8"/><line x1="7" x2="13" y1="12" y2="12"/></svg>
          </button>
          <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition ${viewMode === "list" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`} title="Список">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
          </button>
          <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded transition ${viewMode === "cards" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`} title="Карточки">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        </div>
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {filtered.length === authors.length
            ? `${t("channels.totalCount")} ${authors.length}`
            : `${t("channels.foundCount")} ${filtered.length} / ${authors.length}`}
        </p>
      )}

      {/* Top 4: Owner + Top 3 authors */}
      {!loading && authors.length >= 3 && (() => {
        const owner = authors.find(a => a.role === "OWNER");
        const top3 = [...authors].filter(a => a.role !== "OWNER").sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, 3);
        const podium = owner ? [owner, ...top3] : top3;
        const labels = owner ? [t("top.owner"), t("top.1"), t("top.2"), t("top.3")] : [t("top.1"), t("top.2"), t("top.3")];

        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {podium.map((author, i) => (
              <Link key={author.id} href={`/profile/${author.id}`}
                className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 transition hover:shadow-md">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-green-600 bg-green-50 dark:bg-green-900/20">{labels[i]}</span>
                <div className="flex items-center gap-3">
                  <AuthorAvatar author={author} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
                    {author.fomoId && <div className="text-xs text-gray-400">#{author.fomoId}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>⭐ {Number(author.rating).toFixed(1)}</span>
                  <span>{author.ideasCount} {t("authors.ideasShort")}</span>
                  <span>👥 {author.subscribersCount}</span>
                </div>
              </Link>
            ))}
          </div>
        );
      })()}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">{"\uD83D\uDC64"}</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {hasActiveFilters ? "Авторы не найдены" : "Авторов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? t("authors.changeFilters") : t("authors.empty")}
          </p>
          {hasActiveFilters && (
            <button onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); }} className="mt-3 text-sm text-green-600 hover:underline">
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <>
        {viewMode === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((author) => {
              return (
                <Link key={author.id} href={`/profile/${author.id}`} className="bg-white dark:bg-gray-900 rounded-2xl shadow hover:shadow-lg transition-shadow p-5 flex flex-col items-center text-center">
                  <AuthorAvatar author={author} />
                  <div className="flex items-center gap-1.5 mt-3 mb-0.5">
                    <span className="font-semibold text-base text-gray-900 dark:text-gray-100">{author.displayName}</span>
                  </div>
                  {author.fomoId && <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">#{author.fomoId}</div>}
                  <div className="grid grid-cols-3 gap-3 w-full mt-2 pt-3 border-t border-gray-100 dark:border-gray-800/30">
                    <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">⭐{Number(author.rating).toFixed(1)}</div><div className="text-[10px] text-gray-400">{t("authors.rating")}</div></div>
                    <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{author.ideasCount}</div><div className="text-[10px] text-gray-400">{t("authors.ideasLabel")}</div></div>
                    <div><div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{author.subscribersCount}</div><div className="text-[10px] text-gray-400">{t("authors.subscribers")}</div></div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : viewMode === "list" ? (
          /* Compact list — like Feed minimal */
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow">
            {filtered.map((author) => {
              const color = hashColor(author.id);
              return (
                <Link key={author.id} href={`/profile/${author.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b border-gray-100 dark:border-gray-800/30 last:border-b-0">
                  <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm overflow-hidden shrink-0`}>
                    {author.avatarUrl ? <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" /> : (author.displayName || "?")[0]}
                  </div>
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{author.displayName}</span>
                  <div className="flex-1" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">⭐ {Number(author.rating).toFixed(1)}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{author.ideasCount} {t("authors.ideasShort")}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">👥 {author.subscribersCount}</span>
                </Link>
              );
            })}
          </div>
        ) : (
          /* Paragraph — full card view (default) */
          <div className="flex flex-col gap-4">
            {filtered.map((author) => {
              return (
                <Link key={author.id} href={`/profile/${author.id}`}
                  className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg hover:shadow-xl transition-shadow px-5 py-4 flex items-center gap-3">
                  <AuthorAvatar author={author} />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate block">{author.displayName}</span>
                    {author.fomoId && <div className="text-xs text-gray-400 dark:text-gray-500">#{author.fomoId}</div>}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs text-gray-500">
                    <span>{Number(author.rating).toFixed(1)}</span>
                    <span>{author.ideasCount} {t("authors.ideasShort")}</span>
                    <span className="hidden sm:inline">{author.subscribersCount} {t("authors.subscribers")}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        </>
      )}
    </div>
  );
}
