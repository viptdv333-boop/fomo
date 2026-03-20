"use client";

import { useEffect, useState, Suspense } from "react";
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
}

interface AuthorOption {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  ideasCount: number;
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);

  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [paidFilter, setPaidFilter] = useState<"all" | "free" | "paid">("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");
  const [authorOptions, setAuthorOptions] = useState<AuthorOption[]>([]);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [authorDisplayName, setAuthorDisplayName] = useState("");

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [selectedInstrument, page, sortBy, sortOrder, authorFilter, paidFilter]);

  useEffect(() => {
    fetch("/api/ideas/authors")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAuthorOptions(data);
      })
      .catch(() => {});
  }, []);

  async function loadIdeas() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (selectedInstrument) params.set("instrumentId", selectedInstrument);
    if (sortBy !== "date") params.set("sortBy", sortBy);
    if (sortOrder !== "desc") params.set("sortOrder", sortOrder);
    if (authorFilter) params.set("authorId", authorFilter);
    if (paidFilter === "free") params.set("isPaid", "false");
    if (paidFilter === "paid") params.set("isPaid", "true");

    const res = await fetch(`/api/ideas?${params}`);
    const data = await res.json();
    const list = data.data || data.ideas || (Array.isArray(data) ? data : []);
    setIdeas(list);
    setHasMore(list.length >= 50);
    setLoading(false);
  }

  const pillClass = (active: boolean) =>
    `px-3.5 py-1.5 rounded-full text-xs font-medium transition-all ${
      active
        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100 mb-1">Доска идей</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Торговые идеи от авторов FOMO</p>
      </div>

      {/* Filter bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 px-4 py-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Paid filters */}
          <button
            onClick={() => { setPaidFilter("all"); setSelectedInstrument(""); setExpandedCategory(null); setPage(1); }}
            className={pillClass(paidFilter === "all" && !selectedInstrument)}
          >
            Все
          </button>
          <button
            onClick={() => { setPaidFilter(paidFilter === "paid" ? "all" : "paid"); setPage(1); }}
            className={pillClass(paidFilter === "paid")}
          >
            Платные
          </button>
          <button
            onClick={() => { setPaidFilter(paidFilter === "free" ? "all" : "free"); setPage(1); }}
            className={pillClass(paidFilter === "free")}
          >
            Бесплатные
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Sort */}
          <button
            onClick={() => { setSortBy("date"); setSortOrder("desc"); setPage(1); }}
            className={pillClass(sortBy === "date" && sortOrder === "desc")}
          >
            Новые
          </button>
          <button
            onClick={() => { setSortBy("date"); setSortOrder("asc"); setPage(1); }}
            className={pillClass(sortBy === "date" && sortOrder === "asc")}
          >
            Старые
          </button>
          <button
            onClick={() => { setSortBy(sortBy === "rating" ? "date" : "rating"); setSortOrder("desc"); setPage(1); }}
            className={pillClass(sortBy === "rating")}
          >
            Рейтинг
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

          {/* Categories dropdown */}
          <div className="relative">
            <button
              onClick={() => setExpandedCategory(expandedCategory === "__root" ? null : "__root")}
              className={`${pillClass(!!selectedInstrument)} inline-flex items-center gap-1`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
              {selectedInstrument
                ? categories.flatMap((c) => c.instruments).find((i) => i.id === selectedInstrument)?.name || "Категории"
                : "Категории"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
            </button>
            {expandedCategory === "__root" && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setExpandedCategory(null)} />
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-lg z-50 min-w-[220px] max-h-80 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedInstrument(""); setExpandedCategory(null); setPage(1); }}
                    className={`block w-full text-left px-3 py-2 text-xs border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      !selectedInstrument ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    Все инструменты
                  </button>
                  {categories.map((cat) => (
                    <div key={cat.id}>
                      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                        {cat.name}
                      </div>
                      {cat.instruments.length === 0 ? (
                        <div className="px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500 italic">Нет инструментов</div>
                      ) : (
                        cat.instruments.map((inst) => (
                          <button
                            key={inst.id}
                            onClick={() => { setSelectedInstrument(inst.id); setExpandedCategory(null); setPage(1); }}
                            className={`block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                              selectedInstrument === inst.id
                                ? "text-green-700 dark:text-green-300 font-medium bg-green-50 dark:bg-green-900/30"
                                : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {inst.name}
                          </button>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Author dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAuthorDropdown(!showAuthorDropdown)}
              className={`${pillClass(!!authorFilter)} inline-flex items-center gap-1`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
              {authorFilter ? authorDisplayName : "Автор"}
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
            </button>
            {showAuthorDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAuthorDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-lg z-50 w-56">
                  <div className="p-2 border-b dark:border-gray-700">
                    <input
                      type="text"
                      placeholder="Поиск автора..."
                      value={authorSearch}
                      onChange={(e) => setAuthorSearch(e.target.value)}
                      className="w-full px-2.5 py-1.5 border dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setAuthorFilter(""); setAuthorDisplayName(""); setAuthorSearch(""); setShowAuthorDropdown(false); setPage(1); }}
                      className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${!authorFilter ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      Все авторы
                    </button>
                    {authorOptions
                      .filter((a) => !authorSearch || a.displayName.toLowerCase().includes(authorSearch.toLowerCase()))
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setAuthorFilter(a.id); setAuthorDisplayName(a.displayName); setAuthorSearch(""); setShowAuthorDropdown(false); setPage(1); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 ${authorFilter === a.id ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                        >
                          {a.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.avatarUrl} alt="" className="w-5 h-5 rounded-full" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[10px] text-gray-500">{a.displayName[0]}</div>
                          )}
                          <span className="flex-1 truncate">{a.displayName}</span>
                          <span className="text-gray-400 text-[10px]">{a.ideasCount}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Reset */}
          {(selectedInstrument || authorFilter) && (
            <button
              onClick={() => { setSelectedInstrument(""); setAuthorFilter(""); setAuthorDisplayName(""); setPage(1); }}
              className="text-xs text-gray-400 hover:text-red-500 transition ml-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Ideas list — single vertical stack */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-20" />
                </div>
              </div>
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400">Нет идей</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && ideas.length > 0 && (
        <div className="flex justify-center items-center gap-3 mt-8">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100 transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 font-medium">
            {page}
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 rounded-lg border dark:border-gray-700 disabled:opacity-30 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100 transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
