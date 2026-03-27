"use client";

import { useEffect, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface Channel {
  id: string;
  name: string;
  description: string | null;
  price: number;
  durationDays: number;
  subscribersCount: number;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    rating: number;
  };
  tags?: string[];
  ideasCount?: number;
}

const CATEGORIES = [
  { label: "Все", value: "all" },
  { label: "Фьючерсы", value: "futures" },
  { label: "Акции", value: "stocks" },
  { label: "Крипто", value: "crypto" },
  { label: "Валюты", value: "forex" },
  { label: "Обучение", value: "education" },
  { label: "VIP", value: "vip" },
];

const AVATAR_COLORS = [
  "bg-green-500",
  "bg-red-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-orange-500",
  "bg-cyan-500",
  "bg-amber-600",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function StarRating({ rating }: { rating: number }) {
  const stars = Math.round(Number(rating) / 2);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i <= stars ? "text-green-500" : "text-gray-200 dark:text-gray-700"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function ChannelAvatar({ ch }: { ch: Channel }) {
  const colorClass = getAvatarColor(ch.author.displayName);
  return (
    <div
      className={`w-12 h-12 rounded-full ${colorClass} flex items-center justify-center text-white font-bold text-lg overflow-hidden shrink-0`}
    >
      {ch.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ch.author.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        ch.author.displayName[0]?.toUpperCase()
      )}
    </div>
  );
}

export default function ChannelsPage() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [subscribedIds, setSubscribedIds] = useState<Set<string>>(new Set());
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Existing filters preserved
  const [sortField, setSortField] = useState<"price" | "subscribers" | "rating">("subscribers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [priceFilter, setPriceFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [showFilters] = useState(false); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [viewMode, setViewMode] = useState<"list" | "paragraph" | "cards">("paragraph");

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setChannels(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleToggleSubscribe(e: React.MouseEvent, channelId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!session || togglingId) return;
    setTogglingId(channelId);
    const isSubscribed = subscribedIds.has(channelId);

    fetch(`/api/channels/${channelId}/${isSubscribed ? "unsubscribe" : "subscribe"}`, {
      method: "POST",
    })
      .then((r) => {
        if (r.ok) {
          setSubscribedIds((prev) => {
            const next = new Set(prev);
            if (isSubscribed) next.delete(channelId);
            else next.add(channelId);
            return next;
          });
        }
      })
      .catch(() => {})
      .finally(() => setTogglingId(null));
  }

  const filtered = useMemo(() => {
    let result = channels.filter((ch) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = ch.name.toLowerCase().includes(q);
        const matchesAuthor = ch.author.displayName.toLowerCase().includes(q);
        const matchesDesc = ch.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesAuthor && !matchesDesc) return false;
      }

      // Price filter
      if (priceFilter !== "all") {
        const max = parseInt(priceFilter);
        if (ch.price > max) return false;
      }

      // Rating filter
      if (ratingFilter !== "all") {
        const min = parseFloat(ratingFilter);
        if (Number(ch.author.rating) < min) return false;
      }

      return true;
    });

    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "price":
          va = a.price;
          vb = b.price;
          break;
        case "subscribers":
          va = a.subscribersCount;
          vb = b.subscribersCount;
          break;
        case "rating":
          va = Number(a.author.rating);
          vb = Number(b.author.rating);
          break;
        default:
          va = 0;
          vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [channels, searchQuery, priceFilter, ratingFilter, sortField, sortDir]);

  const uniqueAuthors = useMemo(() => {
    const ids = new Set(channels.map((ch) => ch.author.id));
    return ids.size;
  }, [channels]);

  const hasActiveFilters = priceFilter !== "all" || ratingFilter !== "all";

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Каналы</h1>
          {session && (
            <Link
              href="/channels/create"
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-all duration-150"
            >
              + Создать канал
            </Link>
          )}
        </div>
        <p className="text-gray-500 dark:text-gray-400">
          Подпишитесь на каналы профессиональных трейдеров
        </p>
      </div>

      {/* Filter bar — inline pills like Feed */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setActiveCategory(cat.value)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
              activeCategory === cat.value
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {cat.label}
          </button>
        ))}

        {(
          [
            { label: "Подписчики", field: "subscribers" as const },
            { label: "Цена", field: "price" as const },
            { label: "Рейтинг", field: "rating" as const },
          ] as const
        ).map((s) => (
          <button
            key={s.field}
            onClick={() => handleSort(s.field)}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium transition-all ${
              sortField === s.field
                ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {s.label} {sortField === s.field ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
        ))}

        {hasActiveFilters && (
          <button
            onClick={() => { setPriceFilter("all"); setRatingFilter("all"); }}
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

      {/* Top 3 channels */}
      {channels.length >= 3 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {[...channels].sort((a, b) => b.subscribersCount - a.subscribersCount).slice(0, 3).map((ch, i) => {
            const medals = ["🥇", "🥈", "🥉"];
            const bgColors = ["bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800", "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700", "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800"];
            return (
              <Link key={ch.id} href={`/channels/${ch.id}`} className={`rounded-xl border p-4 transition hover:shadow-md ${bgColors[i]}`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{medals[i]}</span>
                  <ChannelAvatar ch={ch} />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{ch.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">{ch.author.displayName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>👥 {ch.subscribersCount}</span>
                  <StarRating rating={ch.author.rating} />
                  {ch.price > 0 && <span className="text-green-600 font-medium">{ch.price} ₽/мес</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <div className="inline-block w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-green-600 rounded-full animate-spin mb-4" />
          <p>Загрузка каналов...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {hasActiveFilters || searchQuery ? "Каналы не найдены" : "Каналов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {hasActiveFilters || searchQuery
              ? "Попробуйте изменить фильтры или поисковый запрос"
              : "Здесь будут платные каналы авторов с эксклюзивной аналитикой и торговыми сигналами."}
          </p>
          {(hasActiveFilters || searchQuery) && (
            <button
              onClick={() => {
                setPriceFilter("all");
                setRatingFilter("all");
                setSearchQuery("");
              }}
              className="mt-3 text-sm text-green-600 hover:text-green-700 font-medium transition-all duration-150"
            >
              Сбросить все фильтры
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Results count */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            {filtered.length === channels.length
              ? `Всего: ${channels.length}`
              : `Найдено: ${filtered.length} из ${channels.length}`}
          </p>

          {/* Channel list — compact */}
          {viewMode === "list" ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow">
              {filtered.map((ch) => {
                const isSubscribed = subscribedIds.has(ch.id);
                return (
                  <Link key={ch.id} href={`/channels/${ch.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b border-gray-100 dark:border-gray-800/30 last:border-b-0">
                    <ChannelAvatar ch={ch} />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm text-gray-900 dark:text-gray-100">{ch.name}</span>
                      <div className="text-xs text-gray-400 dark:text-gray-500">{ch.author.displayName}</div>
                    </div>
                    <span className="text-xs text-gray-400">👥 {ch.subscribersCount}</span>
                    {ch.price > 0 && <span className="text-xs text-green-600 font-medium">{ch.price} ₽</span>}
                    {isSubscribed && <span className="text-xs text-green-500">✓</span>}
                  </Link>
                );
              })}
            </div>
          ) : (
          <div className={viewMode === "cards" ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : "flex flex-col gap-4"}>
            {filtered.map((ch) => {
              const isSubscribed = subscribedIds.has(ch.id);
              const isToggling = togglingId === ch.id;
              const ideasCount = ch.ideasCount ?? Math.floor(Number(ch.author.rating) * 3 + ch.subscribersCount * 0.1);

              return (
                <Link
                  key={ch.id}
                  href={`/channels/${ch.id}`}
                  className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                >
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChannelAvatar ch={ch} />
                      <div className="min-w-0">
                        <div className="font-semibold text-base text-gray-900 dark:text-gray-100 truncate">
                          {ch.name}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          {ch.author.displayName}
                        </div>
                        <StarRating rating={ch.author.rating} />
                      </div>
                    </div>
                    {ch.price > 0 && (
                      <span className="shrink-0 ml-3 px-3 py-1 rounded-full text-sm font-medium text-green-600 border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 whitespace-nowrap">
                        {ch.price} ₽/мес
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {ch.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                      {ch.description}
                    </p>
                  )}

                  {/* Tags */}
                  {ch.tags && ch.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {ch.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Bottom row */}
                  <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-800/30">
                    <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {ch.subscribersCount}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        {ideasCount}
                      </span>
                    </div>

                    {session && (
                      <button
                        onClick={(e) => handleToggleSubscribe(e, ch.id)}
                        disabled={isToggling}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                          isSubscribed
                            ? "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            : "bg-green-600 text-white hover:bg-green-700"
                        } ${isToggling ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        {isSubscribed ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Подписан
                          </span>
                        ) : (
                          "Подписаться"
                        )}
                      </button>
                    )}
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
