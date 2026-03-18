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
type SortDir = "asc" | "desc";

function AuthorAvatar({ author, size = "md" }: { author: Author; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-8 h-8 text-xs" : "w-12 h-12 text-lg";
  return (
    <div className={`${cls} rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold overflow-hidden shrink-0`}>
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={author.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        author.displayName[0]
      )}
    </div>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid" | "cards">("cards");

  // Filters
  const [minRating, setMinRating] = useState<number>(0);
  const [minIdeas, setMinIdeas] = useState<number>(0);
  const [registeredPeriod, setRegisteredPeriod] = useState<string>("all"); // all, 7d, 30d, 90d, 365d
  const [sortField, setSortField] = useState<SortField>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetch("/api/authors")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAuthors(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    let result = authors.filter((a) => {
      // Search
      if (search) {
        const q = search.toLowerCase();
        if (
          !a.displayName.toLowerCase().includes(q) &&
          !(a.fomoId && a.fomoId.toLowerCase().includes(q))
        )
          return false;
      }
      // Min rating
      if (minRating > 0 && Number(a.rating) < minRating) return false;
      // Min ideas
      if (minIdeas > 0 && a.ideasCount < minIdeas) return false;
      // Registration period
      if (registeredPeriod !== "all") {
        const days = parseInt(registeredPeriod);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        if (new Date(a.createdAt) < cutoff) return false;
      }
      return true;
    });

    // Sort
    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "rating":
          va = Number(a.rating);
          vb = Number(b.rating);
          break;
        case "ideasCount":
          va = a.ideasCount;
          vb = b.ideasCount;
          break;
        case "subscribersCount":
          va = a.subscribersCount;
          vb = b.subscribersCount;
          break;
        case "createdAt":
          va = new Date(a.createdAt).getTime();
          vb = new Date(b.createdAt).getTime();
          break;
        default:
          va = 0;
          vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });

    return result;
  }, [authors, search, minRating, minIdeas, registeredPeriod, sortField, sortDir]);

  const activeFiltersCount = [
    minRating > 0,
    minIdeas > 0,
    registeredPeriod !== "all",
  ].filter(Boolean).length;

  function resetFilters() {
    setMinRating(0);
    setMinIdeas(0);
    setRegisteredPeriod("all");
    setSortField("rating");
    setSortDir("desc");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Авторы</h1>
        {/* View mode switcher */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded transition ${viewMode === "list" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            title="Список"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded transition ${viewMode === "grid" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            title="Сетка"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
          <button
            onClick={() => setViewMode("cards")}
            className={`p-1.5 rounded transition ${viewMode === "cards" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
            title="Карточки"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="2" y1="15" x2="22" y2="15"/></svg>
          </button>
        </div>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Поиск по имени или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-md px-4 py-2.5 border dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition ${
            showFilters || activeFiltersCount > 0
              ? "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400"
              : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Фильтры
          {activeFiltersCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {activeFiltersCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-4 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Rating filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Минимальный рейтинг
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={minRating}
                  onChange={(e) => setMinRating(parseFloat(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 w-8 text-right">
                  {minRating > 0 ? `${minRating}+` : "—"}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                <span>0</span>
                <span>5</span>
                <span>10</span>
              </div>
            </div>

            {/* Ideas count filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Минимум идей
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={minIdeas}
                  onChange={(e) => setMinIdeas(parseInt(e.target.value))}
                  className="flex-1 px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="0">Любое</option>
                  <option value="1">≥ 1</option>
                  <option value="3">≥ 3</option>
                  <option value="5">≥ 5</option>
                  <option value="10">≥ 10</option>
                  <option value="20">≥ 20</option>
                  <option value="50">≥ 50</option>
                </select>
              </div>
            </div>

            {/* Registration period filter */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Зарегистрирован
              </label>
              <select
                value={registeredPeriod}
                onChange={(e) => setRegisteredPeriod(e.target.value)}
                className="w-full px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
              >
                <option value="all">За всё время</option>
                <option value="7">За последнюю неделю</option>
                <option value="30">За последний месяц</option>
                <option value="90">За последние 3 месяца</option>
                <option value="365">За последний год</option>
              </select>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                Сортировка
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="flex-1 px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
                >
                  <option value="rating">Рейтинг</option>
                  <option value="ideasCount">Кол-во идей</option>
                  <option value="subscribersCount">Подписчики</option>
                  <option value="createdAt">Дата регистрации</option>
                </select>
                <button
                  onClick={() => setSortDir(sortDir === "desc" ? "asc" : "desc")}
                  className="p-1.5 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                  title={sortDir === "desc" ? "По убыванию" : "По возрастанию"}
                >
                  {sortDir === "desc" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 5v14M5 12l7 7 7-7"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 19V5M5 12l7-7 7 7"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Reset */}
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      )}

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
            {search || activeFiltersCount > 0 ? "Авторы не найдены" : "Авторов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {search || activeFiltersCount > 0
              ? "Попробуйте изменить параметры поиска или фильтры"
              : "Здесь будут профили авторов торговых идей"}
          </p>
          {activeFiltersCount > 0 && (
            <button
              onClick={resetFilters}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        /* LIST VIEW */
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 divide-y dark:divide-gray-800">
          {filtered.map((author) => (
            <Link
              key={author.id}
              href={`/profile/${author.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
            >
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
        /* GRID VIEW */
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((author) => (
            <Link
              key={author.id}
              href={`/profile/${author.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-4 border dark:border-gray-800 text-center"
            >
              <div className="flex justify-center mb-2">
                <AuthorAvatar author={author} />
              </div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
              {author.fomoId && (
                <div className="text-xs text-gray-400 truncate">#{author.fomoId}</div>
              )}
              <div className="flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400 mt-2">
                <span>⭐ {Number(author.rating).toFixed(1)}</span>
                <span>{author.ideasCount} идей</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* CARDS VIEW */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((author) => (
            <Link
              key={author.id}
              href={`/profile/${author.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5 border dark:border-gray-800"
            >
              <div className="flex items-center gap-3 mb-3">
                <AuthorAvatar author={author} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
                  {author.fomoId && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">#{author.fomoId}</div>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 shrink-0">
                  {formatDate(author.createdAt)}
                </div>
              </div>

              {author.bio && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{author.bio}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="text-yellow-500">⭐</span> {Number(author.rating).toFixed(1)}
                </span>
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
