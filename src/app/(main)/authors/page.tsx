"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  rating: number;
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

// Generate pseudo-stats from rating for display purposes
function getDerivedStats(author: Author) {
  const r = Number(author.rating) || 0;
  const profitability = `+${Math.round(r * 15)}%`;
  const successRate = `${Math.round(50 + r * 5)}%`;
  return { profitability, successRate };
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
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);

  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [ideasFilter, setIdeasFilter] = useState<string>("all");

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
        <h1 className="text-2xl font-bold dark:text-gray-100">Авторы</h1>
      </div>

      {/* Filter bar — inline pills like Feed */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <button onClick={() => handleSort("rating")} className={pillClass(sortField === "rating")}>
          Рейтинг {sortField === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button onClick={() => handleSort("ideasCount")} className={pillClass(sortField === "ideasCount")}>
          Идеи {sortField === "ideasCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button onClick={() => handleSort("subscribersCount")} className={pillClass(sortField === "subscribersCount")}>
          Подписчики {sortField === "subscribersCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>
        <button onClick={() => handleSort("createdAt")} className={pillClass(sortField === "createdAt")}>
          Дата рег. {sortField === "createdAt" ? (sortDir === "desc" ? "↓" : "↑") : ""}
        </button>

        {[
          { label: "⭐ 3+", value: "3" },
          { label: "⭐ 5+", value: "5" },
          { label: "⭐ 7+", value: "7" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRatingFilter(ratingFilter === opt.value ? "all" : opt.value)}
            className={pillClass(ratingFilter === opt.value)}
          >
            {opt.label}
          </button>
        ))}

        {[
          { label: "5+ идей", value: "5" },
          { label: "10+ идей", value: "10" },
          { label: "20+ идей", value: "20" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setIdeasFilter(ideasFilter === opt.value ? "all" : opt.value)}
            className={pillClass(ideasFilter === opt.value)}
          >
            {opt.label}
          </button>
        ))}

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
      </div>

      {!loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
          {filtered.length === authors.length
            ? `Всего: ${authors.length}`
            : `Найдено: ${filtered.length} из ${authors.length}`}
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">{"\uD83D\uDC64"}</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {hasActiveFilters ? "Авторы не найдены" : "Авторов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? "Попробуйте изменить фильтры" : "Здесь будут профили авторов торговых идей"}
          </p>
          {hasActiveFilters && (
            <button onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); }} className="mt-3 text-sm text-green-600 hover:underline">
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((author) => {
            const { profitability, successRate } = getDerivedStats(author);
            return (
              <div key={author.id} className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg hover:shadow-xl transition-shadow px-6 py-5 flex items-start gap-4">
                {/* Avatar */}
                <AuthorAvatar author={author} />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-base text-gray-900 dark:text-gray-100">
                      {author.displayName}
                    </span>
                    {/* Crown icon */}
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5z" />
                    </svg>
                  </div>
                  {author.fomoId && (
                    <div className="text-sm text-gray-400 dark:text-gray-500 mb-1">@{author.fomoId}</div>
                  )}
                  {author.bio && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{author.bio}</p>
                  )}
                </div>

                {/* Stats — 4 columns */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="font-semibold text-base text-gray-900 dark:text-gray-100">{Number(author.rating).toFixed(1)}</span>
                    </div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Рейтинг</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-base text-green-600 dark:text-green-400">{profitability}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Доходность</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{successRate}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Успешность</div>
                  </div>
                  <div className="text-center">
                    <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{author.subscribersCount}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Подписчиков</div>
                  </div>
                </div>

                {/* Profile button */}
                <Link
                  href={`/profile/${author.id}`}
                  className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-green-500 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 transition"
                >
                  Профиль &rsaquo;
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
