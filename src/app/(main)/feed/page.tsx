"use client";

import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import IdeaCard from "@/components/ideas/IdeaCard";
import { useT } from "@/lib/i18n/client";

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
  const { t } = useT();
  const [ideas, setIdeas] = useState<IdeaData[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<string>(
    searchParams.get("instrumentId") || ""
  );
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [instrumentSearch, setInstrumentSearch] = useState("");
  const [instrumentResults, setInstrumentResults] = useState<{ id: string; name: string; ticker: string | null; slug: string; exchangeRel?: { shortName: string } | null }[]>([]);
  const [selectedInstrumentName, setSelectedInstrumentName] = useState("");
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
  const [viewMode, setViewMode] = useState<"list" | "paragraph" | "cards">("paragraph");

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
    `px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
      active
        ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
        : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
    }`;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold dark:text-gray-100 mb-1">{t("feed.title")}</h1>
        <p className="text-base text-gray-500 dark:text-gray-400">{t("feed.subtitle")}</p>
      </div>

      {/* Filter bar — no border, no background */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {/* Paid filters */}
        <button
          onClick={() => { setPaidFilter(paidFilter === "paid" ? "all" : "paid"); setPage(1); }}
          className={pillClass(paidFilter === "paid")}
        >
          {t("feed.paid")}
        </button>
        <button
          onClick={() => { setPaidFilter(paidFilter === "free" ? "all" : "free"); setPage(1); }}
          className={pillClass(paidFilter === "free")}
        >
          {t("feed.free")}
        </button>
        <button
          onClick={() => { setSortBy("date"); setSortOrder("desc"); setPage(1); }}
          className={pillClass(sortBy === "date" && sortOrder === "desc")}
        >
          {t("feed.new")}
        </button>
        <button
          onClick={() => { setSortBy("date"); setSortOrder("asc"); setPage(1); }}
          className={pillClass(sortBy === "date" && sortOrder === "asc")}
        >
          {t("feed.old")}
        </button>
        <button
          onClick={() => { setSortBy(sortBy === "rating" ? "date" : "rating"); setSortOrder("desc"); setPage(1); }}
          className={pillClass(sortBy === "rating")}
        >
          {t("feed.rating")}
        </button>

        {/* Instrument search autocomplete */}
        <div className="relative">
          <button
            onClick={() => setExpandedCategory(expandedCategory === "__root" ? null : "__root")}
            className={`${pillClass(!!selectedInstrument)} inline-flex items-center gap-1`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
            </svg>
            {selectedInstrument ? selectedInstrumentName || t("channels.instrument") : t("feed.instruments")}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M19 9l-7 7-7-7" /></svg>
          </button>
          {expandedCategory === "__root" && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => { setExpandedCategory(null); setInstrumentSearch(""); setInstrumentResults([]); }} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-lg z-50 w-72">
                <div className="p-2 border-b dark:border-gray-700">
                  <input
                    type="text"
                    placeholder="Поиск: нефть, SBER, gold..."
                    value={instrumentSearch}
                    onChange={async (e) => {
                      const q = e.target.value;
                      setInstrumentSearch(q);
                      if (q.length >= 2) {
                        const res = await fetch(`/api/instruments?search=${encodeURIComponent(q)}`);
                        if (res.ok) setInstrumentResults(await res.json());
                      } else setInstrumentResults([]);
                    }}
                    className="w-full px-2.5 py-1.5 border dark:border-gray-600 rounded-lg text-xs focus:ring-1 focus:ring-green-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  <button
                    onClick={() => { setSelectedInstrument(""); setSelectedInstrumentName(""); setExpandedCategory(null); setInstrumentSearch(""); setInstrumentResults([]); setPage(1); }}
                    className={`block w-full text-left px-3 py-2 text-xs border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      !selectedInstrument ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {t("feed.allInstruments")}
                  </button>
                  {instrumentSearch.length >= 2 ? (
                    instrumentResults.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">Ничего не найдено</div>
                    ) : (
                      instrumentResults.map((inst) => (
                        <button
                          key={inst.id}
                          onClick={() => {
                            const label = `${inst.ticker || inst.name}${inst.exchangeRel?.shortName ? ` (${inst.exchangeRel.shortName})` : ""}`;
                            setSelectedInstrument(inst.id);
                            setSelectedInstrumentName(label);
                            setExpandedCategory(null);
                            setInstrumentSearch("");
                            setInstrumentResults([]);
                            setPage(1);
                          }}
                          className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2 ${
                            selectedInstrument === inst.id ? "text-green-600 font-medium bg-green-50 dark:bg-green-900/30" : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          <span className="font-mono font-bold text-green-600 dark:text-green-400">#{inst.ticker || "—"}</span>
                          {inst.exchangeRel?.shortName && <span className="text-gray-400 text-[10px]">({inst.exchangeRel.shortName})</span>}
                          <span className="truncate flex-1 text-gray-500">{inst.name}</span>
                        </button>
                      ))
                    )
                  ) : (
                    /* Show categories when no search */
                    categories.map((cat) => (
                      <div key={cat.id}>
                        <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">{cat.name}</div>
                        {cat.instruments.slice(0, 5).map((inst: any) => (
                          <button
                            key={inst.id}
                            onClick={() => {
                              const label = `${inst.ticker || inst.name}${inst.exchangeRel?.shortName ? ` (${inst.exchangeRel.shortName})` : ""}`;
                              setSelectedInstrument(inst.id);
                              setSelectedInstrumentName(label);
                              setExpandedCategory(null);
                              setPage(1);
                            }}
                            className={`w-full text-left px-4 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                              selectedInstrument === inst.id ? "text-green-600 font-medium" : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <span className="font-mono font-bold">{inst.ticker || "—"}</span> {inst.name}
                          </button>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Author filter removed */}

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

      {/* Top 3 ideas */}
      {!loading && ideas.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          {[...ideas].sort((a, b) => b.voteScore - a.voteScore).slice(0, 3).map((idea, i) => {
            const labels = [t("top.1"), t("top.2"), t("top.3")];
            const labelColors = ["text-green-600 bg-green-50 dark:bg-green-900/20", "text-green-600 bg-green-50 dark:bg-green-900/20", "text-green-600 bg-green-50 dark:bg-green-900/20"];
            return (
              <Link key={idea.id} href={`/ideas/${idea.id}`}
                className="rounded-xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-4 transition hover:shadow-md">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${labelColors[i]}`}>{labels[i]}</span>
                  <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate flex-1">{idea.title}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{idea.preview}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>{idea.author.displayName}</span>
                  <span>❤️ {idea.voteScore}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Ideas */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 animate-pulse">
              <div className="flex gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700" />
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
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} compact />
          ))}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow">
          {ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} onVote={loadIdeas} minimal />
          ))}
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
