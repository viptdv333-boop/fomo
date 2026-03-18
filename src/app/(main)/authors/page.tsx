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

function AuthorAvatar({ author, size = "md" }: { author: Author; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-8 h-8 text-xs" : "w-12 h-12 text-lg";
  return (
    <div className={`${cls} rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold overflow-hidden shrink-0`}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        (author.displayName || "?")[0]
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid" | "cards">("cards");

  // Filters
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [ideasFilter, setIdeasFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");

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
      if (periodFilter !== "all") {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(periodFilter));
        if (new Date(a.createdAt) < cutoff) return false;
      }
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
  }, [authors, ratingFilter, ideasFilter, periodFilter, sortField, sortDir]);

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  const hasActiveFilters = ratingFilter !== "all" || ideasFilter !== "all" || periodFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Авторы</h1>
      </div>

      {/* Filter bar — single row, same style as feed/channels */}
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

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Period filter */}
          {[
            { label: "Неделя", value: "7" },
            { label: "Месяц", value: "30" },
            { label: "Год", value: "365" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriodFilter(periodFilter === opt.value ? "all" : opt.value)}
              className={filterBtnClass(periodFilter === opt.value)}
            >
              {opt.label}
            </button>
          ))}

          {hasActiveFilters && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); setPeriodFilter("all"); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕ сбросить
              </button>
            </>
          )}

          {/* View mode — right side */}
          <div className="ml-auto flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition ${viewMode === "list" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Список">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            </button>
            <button onClick={() => setViewMode("grid")} className={`p-1.5 rounded transition ${viewMode === "grid" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Сетка">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            </button>
            <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded transition ${viewMode === "cards" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Карточки">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/></svg>
            </button>
          </div>
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
            <button onClick={() => { setRatingFilter("all"); setIdeasFilter("all"); setPeriodFilter("all"); }} className="mt-3 text-sm text-blue-600 hover:underline">
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 divide-y dark:divide-gray-800">
          {filtered.map((author) => (
            <Link key={author.id} href={`/profile/${author.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <AuthorAvatar author={author} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 dark:text-gray-100">{author.displayName}</span>
                {author.fomoId && <span className="text-xs text-gray-400 ml-2">#{author.fomoId}</span>}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 shrink-0">
                <span>⭐ {Number(author.rating).toFixed(1)}</span>
                <span>{author.ideasCount} идей</span>
                <span>{author.subscribersCount} подп.</span>
                <span className="hidden sm:inline text-gray-400">{formatDate(author.createdAt)}</span>
              </div>
            </Link>
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((author) => (
            <Link key={author.id} href={`/profile/${author.id}`} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-4 border dark:border-gray-800 text-center">
              <div className="flex justify-center mb-2"><AuthorAvatar author={author} /></div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
              {author.fomoId && <div className="text-xs text-gray-400 truncate">#{author.fomoId}</div>}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2">
                <span>⭐ {Number(author.rating).toFixed(1)}</span>
                <span>{author.ideasCount} идей</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((author) => (
            <Link key={author.id} href={`/profile/${author.id}`} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5 border dark:border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <AuthorAvatar author={author} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
                  {author.fomoId && <div className="text-xs text-gray-500 dark:text-gray-400">#{author.fomoId}</div>}
                </div>
                <div className="text-[10px] text-gray-400 shrink-0">{formatDate(author.createdAt)}</div>
              </div>
              {author.bio && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{author.bio}</p>}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1"><span className="text-yellow-500">⭐</span> {Number(author.rating).toFixed(1)}</span>
                <span>{author.ideasCount} идей</span>
                <span>{author.subscribersCount} подписчиков</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
