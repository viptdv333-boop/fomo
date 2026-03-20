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

function AuthorAvatar({ author }: { author: Author }) {
  return (
    <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 dark:text-green-400 font-bold text-xl overflow-hidden shrink-0">
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

  // Filters
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

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      active
        ? "bg-green-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  const hasActiveFilters = ratingFilter !== "all" || ideasFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Авторы</h1>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-4 py-3 mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Sort */}
          <button onClick={() => handleSort("rating")} className={filterBtnClass(sortField === "rating")}>
            Рейтинг {sortField === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
          <button onClick={() => handleSort("ideasCount")} className={filterBtnClass(sortField === "ideasCount")}>
            Идеи {sortField === "ideasCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
          <button onClick={() => handleSort("subscribersCount")} className={filterBtnClass(sortField === "subscribersCount")}>
            Подписчики {sortField === "subscribersCount" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
          <button onClick={() => handleSort("createdAt")} className={filterBtnClass(sortField === "createdAt")}>
            Дата рег. {sortField === "createdAt" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Rating filter */}
          {[
            { label: "⭐ 3+", value: "3" },
            { label: "⭐ 5+", value: "5" },
            { label: "⭐ 7+", value: "7" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRatingFilter(ratingFilter === opt.value ? "all" : opt.value)}
              className={filterBtnClass(ratingFilter === opt.value)}
            >
              {opt.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Ideas filter */}
          {[
            { label: "5+ идей", value: "5" },
            { label: "10+ идей", value: "10" },
            { label: "20+ идей", value: "20" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setIdeasFilter(ideasFilter === opt.value ? "all" : opt.value)}
              className={filterBtnClass(ideasFilter === opt.value)}
            >
              {opt.label}
            </button>
          ))}

          {hasActiveFilters && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); }}
                className="text-xs text-green-600 hover:text-green-700 dark:hover:text-green-400"
              >
                ✕ сбросить
              </button>
            </>
          )}
        </div>
      </div>

      {/* Results count */}
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
          <div className="text-5xl mb-4">👤</div>
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
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 divide-y dark:divide-gray-800">
          {filtered.map((author) => (
            <div key={author.id} className="flex items-center gap-4 px-5 py-4">
              {/* Avatar */}
              <AuthorAvatar author={author} />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-base text-gray-900 dark:text-gray-100">{author.displayName}</div>
                {author.fomoId && (
                  <div className="text-sm text-gray-400 dark:text-gray-500">@{author.fomoId}</div>
                )}
                {author.bio && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">{author.bio}</p>
                )}
              </div>

              {/* Stats */}
              <div className="flex items-center gap-5 text-sm text-gray-600 dark:text-gray-400 shrink-0">
                <div className="flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-green-500">
                    <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">{Number(author.rating).toFixed(1)}</span>
                </div>
                <div className="text-center">
                  <span className="font-medium">{author.ideasCount}</span>
                  <span className="text-xs text-gray-400 ml-1">идей</span>
                </div>
                <div className="text-center">
                  <span className="font-medium">{author.subscribersCount}</span>
                  <span className="text-xs text-gray-400 ml-1">подп.</span>
                </div>
              </div>

              {/* Profile button */}
              <Link
                href={`/profile/${author.id}`}
                className="shrink-0 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:border-green-500 text-sm text-gray-700 dark:text-gray-300 transition"
              >
                Профиль &rsaquo;
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
