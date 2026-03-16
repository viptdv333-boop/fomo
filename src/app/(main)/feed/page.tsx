"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import IdeaCard from "@/components/ideas/IdeaCard";

interface Instrument {
  id: string;
  name: string;
  slug: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  instruments: Instrument[];
}

interface IdeaData {
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
}

interface AuthorOption {
  id: string;
  displayName: string;
}

export default function FeedPageWrapper() {
  return (
    <Suspense fallback={<div className="text-gray-500 py-12 text-center">Загрузка...</div>}>
      <FeedPage />
    </Suspense>
  );
}

function FeedPage() {
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>(
    searchParams.get("instrumentId") || ""
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  // New filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [authorFilter, setAuthorFilter] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");
  const [authorOptions, setAuthorOptions] = useState<AuthorOption[]>([]);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [authorDisplayName, setAuthorDisplayName] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [selectedInstrument, dateFrom, dateTo, page, search, sortBy, sortOrder, authorFilter]);

  // Debounced search
  function handleSearchChange(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearch(value);
      setPage(1);
    }, 300);
  }

  // Author search
  useEffect(() => {
    if (!authorSearch || authorSearch.length < 2) {
      setAuthorOptions([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/users?search=${encodeURIComponent(authorSearch)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        setAuthorOptions(data);
        setShowAuthorDropdown(true);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [authorSearch]);

  async function loadIdeas() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "20");
    if (selectedInstrument) params.set("instrumentId", selectedInstrument);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (search) params.set("search", search);
    if (sortBy !== "date") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (authorFilter) params.set("authorId", authorFilter);

    const res = await fetch(`/api/ideas?${params}`);
    const data = await res.json();
    const list = data.data || data.ideas || (Array.isArray(data) ? data : []);
    setIdeas(list);
    setHasMore(list.length >= 20);
    setLoading(false);
  }

  function toggleCategory(catId: string) {
    setExpandedCategory(expandedCategory === catId ? null : catId);
  }

  function handleSortChange(value: string) {
    switch (value) {
      case "date-desc":
        setSortBy("date");
        setSortOrder("desc");
        break;
      case "date-asc":
        setSortBy("date");
        setSortOrder("asc");
        break;
      case "rating":
        setSortBy("rating");
        setSortOrder("desc");
        break;
      case "alpha-asc":
        setSortBy("alphabet");
        setSortOrder("asc");
        break;
      case "alpha-desc":
        setSortBy("alphabet");
        setSortOrder("desc");
        break;
    }
    setPage(1);
  }

  const sortValue =
    sortBy === "rating"
      ? "rating"
      : sortBy === "alphabet"
      ? sortOrder === "asc"
        ? "alpha-asc"
        : "alpha-desc"
      : sortOrder === "asc"
      ? "date-asc"
      : "date-desc";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Стакан идей</h1>
      </div>

      {session && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 mb-6 space-y-3">
          {/* Search + Sort row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Поиск по идеям..."
                defaultValue={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
            </div>
            <select
              value={sortValue}
              onChange={(e) => handleSortChange(e.target.value)}
              className="px-3 py-2 border dark:border-gray-700 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-gray-100"
            >
              <option value="date-desc">Новые</option>
              <option value="date-asc">Старые</option>
              <option value="rating">По рейтингу автора</option>
              <option value="alpha-asc">А → Я</option>
              <option value="alpha-desc">Я → А</option>
            </select>
          </div>

          {/* Author filter + Date range row */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Фильтр по автору..."
                value={authorFilter ? authorDisplayName : authorSearch}
                onChange={(e) => {
                  if (authorFilter) {
                    setAuthorFilter("");
                    setAuthorDisplayName("");
                  }
                  setAuthorSearch(e.target.value);
                }}
                onFocus={() => authorOptions.length > 0 && setShowAuthorDropdown(true)}
                onBlur={() => setTimeout(() => setShowAuthorDropdown(false), 200)}
                className="w-full px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
              />
              {authorFilter && (
                <button
                  onClick={() => {
                    setAuthorFilter("");
                    setAuthorDisplayName("");
                    setAuthorSearch("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              )}
              {showAuthorDropdown && authorOptions.length > 0 && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-10 w-full max-h-40 overflow-y-auto">
                  {authorOptions.map((a) => (
                    <button
                      key={a.id}
                      onMouseDown={() => {
                        setAuthorFilter(a.id);
                        setAuthorDisplayName(a.displayName);
                        setAuthorSearch("");
                        setShowAuthorDropdown(false);
                        setPage(1);
                      }}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                      {a.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
              />
              <span className="text-gray-400 dark:text-gray-500">—</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-1.5 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100"
              />
            </div>
          </div>

          {/* Category instrument filters */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setSelectedInstrument("");
                setExpandedCategory(null);
                setPage(1);
              }}
              className={`px-3 py-1 rounded-full text-sm transition ${
                !selectedInstrument
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              Все
            </button>
            {categories.map((cat) => (
              <div key={cat.id} className="relative">
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className={`px-3 py-1 rounded-full text-sm transition ${
                    cat.instruments.some((i) => i.id === selectedInstrument)
                      ? "bg-blue-600 text-white"
                      : expandedCategory === cat.id
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {cat.name} ▾
                </button>
                {expandedCategory === cat.id && (
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-10 min-w-[180px]">
                    {cat.instruments.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Нет инструментов</div>
                    ) : (
                      cat.instruments.map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => {
                            setSelectedInstrument(inst.id);
                            setExpandedCategory(null);
                            setPage(1);
                          }}
                          className={`block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            selectedInstrument === inst.id
                              ? "text-blue-700 dark:text-blue-300 font-medium bg-blue-50 dark:bg-blue-900/30"
                              : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {inst.name}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {selectedInstrument && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Фильтр:{" "}
              <span className="font-medium text-blue-600">
                {categories
                  .flatMap((c) => c.instruments)
                  .find((i) => i.id === selectedInstrument)?.name}
              </span>
              <button
                onClick={() => {
                  setSelectedInstrument("");
                  setPage(1);
                }}
                className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Нет идей</div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
          ))}
        </div>
      )}

      {session && !loading && ideas.length > 0 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100"
          >
            ← Назад
          </button>
          <span className="px-4 py-2 text-gray-500 dark:text-gray-400">Стр. {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100"
          >
            Далее →
          </button>
        </div>
      )}
    </div>
  );
}
