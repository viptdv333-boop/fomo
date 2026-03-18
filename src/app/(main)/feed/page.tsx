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

  // Filter state
  const [sortBy, setSortBy] = useState("date");
  const [sortOrder, setSortOrder] = useState("desc");
  const [paidFilter, setPaidFilter] = useState<"all" | "free" | "paid">("all");
  const [authorFilter, setAuthorFilter] = useState("");
  const [authorSearch, setAuthorSearch] = useState("");
  const [authorOptions, setAuthorOptions] = useState<AuthorOption[]>([]);
  const [showAuthorDropdown, setShowAuthorDropdown] = useState(false);
  const [authorDisplayName, setAuthorDisplayName] = useState("");

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "paragraph" | "cards">("paragraph");

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then(setCategories);
  }, []);

  useEffect(() => {
    loadIdeas();
  }, [selectedInstrument, page, sortBy, sortOrder, authorFilter, paidFilter]);

  // Load all idea authors on mount
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

  function toggleCategory(catId: string) {
    setExpandedCategory(expandedCategory === catId ? null : catId);
  }

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  return (
    <div>
      {/* Filter bar — single row */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-4 py-3 mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* All / Paid / Free */}
          <button
            onClick={() => { setPaidFilter("all"); setSelectedInstrument(""); setExpandedCategory(null); setPage(1); }}
            className={filterBtnClass(paidFilter === "all" && !selectedInstrument)}
          >
            Все
          </button>
          <button
            onClick={() => { setPaidFilter(paidFilter === "paid" ? "all" : "paid"); setPage(1); }}
            className={filterBtnClass(paidFilter === "paid")}
          >
            Платные
          </button>
          <button
            onClick={() => { setPaidFilter(paidFilter === "free" ? "all" : "free"); setPage(1); }}
            className={filterBtnClass(paidFilter === "free")}
          >
            Бесплатные
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Sort */}
          <button
            onClick={() => { setSortBy("date"); setSortOrder("desc"); setPage(1); }}
            className={filterBtnClass(sortBy === "date" && sortOrder === "desc")}
          >
            Новые
          </button>
          <button
            onClick={() => { setSortBy("date"); setSortOrder("asc"); setPage(1); }}
            className={filterBtnClass(sortBy === "date" && sortOrder === "asc")}
          >
            Старые
          </button>
          <button
            onClick={() => { setSortBy(sortBy === "rating" ? "date" : "rating"); setSortOrder("desc"); setPage(1); }}
            className={filterBtnClass(sortBy === "rating")}
          >
            Рейтинг
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Categories — tree dropdown */}
          {categories.map((cat) => (
            <div key={cat.id} className="relative">
              <button
                onClick={() => toggleCategory(cat.id)}
                className={`${filterBtnClass(
                  cat.instruments.some((i) => i.id === selectedInstrument)
                )} ${expandedCategory === cat.id ? "ring-1 ring-blue-400" : ""}`}
              >
                {cat.name} ▾
              </button>
              {expandedCategory === cat.id && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setExpandedCategory(null)} />
                  <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[180px]">
                    {cat.instruments.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">Нет инструментов</div>
                    ) : (
                      cat.instruments.map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => {
                            setSelectedInstrument(inst.id);
                            setExpandedCategory(null);
                            setPage(1);
                          }}
                          className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
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
                </>
              )}
            </div>
          ))}

          {/* Author dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAuthorDropdown(!showAuthorDropdown)}
              className={filterBtnClass(!!authorFilter)}
            >
              {authorFilter ? authorDisplayName : "Автор"} ▾
            </button>
            {showAuthorDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAuthorDropdown(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-50 w-56">
                  <div className="p-2 border-b dark:border-gray-700">
                    <input
                      type="text"
                      placeholder="Поиск автора..."
                      value={authorSearch}
                      onChange={(e) => setAuthorSearch(e.target.value)}
                      className="w-full px-2 py-1.5 border dark:border-gray-600 rounded text-xs focus:ring-1 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    <button
                      onClick={() => { setAuthorFilter(""); setAuthorDisplayName(""); setAuthorSearch(""); setShowAuthorDropdown(false); setPage(1); }}
                      className={`block w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${!authorFilter ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
                    >
                      Все авторы
                    </button>
                    {authorOptions
                      .filter((a) => !authorSearch || a.displayName.toLowerCase().includes(authorSearch.toLowerCase()))
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => { setAuthorFilter(a.id); setAuthorDisplayName(a.displayName); setAuthorSearch(""); setShowAuthorDropdown(false); setPage(1); }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 ${authorFilter === a.id ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-700 dark:text-gray-300"}`}
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

          {/* Reset active filters */}
          {(selectedInstrument || authorFilter) && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                onClick={() => { setSelectedInstrument(""); setAuthorFilter(""); setAuthorDisplayName(""); setPage(1); }}
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ✕ сбросить
              </button>
            </>
          )}

          {/* View mode — right side */}
          <div className="ml-auto flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition ${viewMode === "list" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Список">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
            </button>
            <button onClick={() => setViewMode("paragraph")} className={`p-1.5 rounded transition ${viewMode === "paragraph" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Абзац">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" x2="17" y1="8" y2="8"/><line x1="7" x2="13" y1="12" y2="12"/></svg>
            </button>
            <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded transition ${viewMode === "cards" ? "bg-white dark:bg-gray-700 shadow-sm" : "text-gray-400 hover:text-gray-600"}`} title="Карточки">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Ideas list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : ideas.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Нет идей</div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} compact />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow divide-y dark:divide-gray-800">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} minimal />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && ideas.length > 0 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100"
          >
            ←
          </button>
          <span className="px-4 py-2 text-gray-500 dark:text-gray-400">Стр. {page}</span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-100"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
