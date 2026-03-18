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
}

function ChannelAvatar({ ch, size = "md" }: { ch: Channel; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return (
    <div className={`${cls} rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold overflow-hidden shrink-0`}>
      {ch.author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ch.author.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        ch.author.displayName[0]
      )}
    </div>
  );
}

export default function ChannelsPage() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"list" | "grid" | "cards">("cards");

  // Filters
  const [sortField, setSortField] = useState<"price" | "subscribers" | "rating">("subscribers");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [priceFilter, setPriceFilter] = useState<string>("all"); // all, <1000, <3000, <5000
  const [ratingFilter, setRatingFilter] = useState<string>("all"); // all, 3+, 5+, 7+

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
    else { setSortField(field); setSortDir("desc"); }
  }

  const filtered = useMemo(() => {
    let result = channels.filter((ch) => {
      if (priceFilter !== "all") {
        const max = parseInt(priceFilter);
        if (ch.price > max) return false;
      }
      if (ratingFilter !== "all") {
        const min = parseFloat(ratingFilter);
        if (Number(ch.author.rating) < min) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      let va: number, vb: number;
      switch (sortField) {
        case "price": va = a.price; vb = b.price; break;
        case "subscribers": va = a.subscribersCount; vb = b.subscribersCount; break;
        case "rating": va = Number(a.author.rating); vb = Number(b.author.rating); break;
        default: va = 0; vb = 0;
      }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [channels, priceFilter, ratingFilter, sortField, sortDir]);

  const filterBtnClass = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${
      active
        ? "bg-blue-600 text-white"
        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
    }`;

  const hasActiveFilters = priceFilter !== "all" || ratingFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Каналы</h1>
        {session && (
          <Link
            href="/channels/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            + Создать канал
          </Link>
        )}
      </div>

      {/* Filter bar — single row, same style as feed */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-4 py-3 mb-6">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Sort */}
          <button onClick={() => handleSort("subscribers")} className={filterBtnClass(sortField === "subscribers")}>
            Подписчики {sortField === "subscribers" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
          <button onClick={() => handleSort("price")} className={filterBtnClass(sortField === "price")}>
            Цена {sortField === "price" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>
          <button onClick={() => handleSort("rating")} className={filterBtnClass(sortField === "rating")}>
            Рейтинг {sortField === "rating" ? (sortDir === "desc" ? "↓" : "↑") : ""}
          </button>

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Price filter */}
          {[
            { label: "Все цены", value: "all" },
            { label: "до 1000₽", value: "1000" },
            { label: "до 3000₽", value: "3000" },
            { label: "до 5000₽", value: "5000" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPriceFilter(priceFilter === opt.value && opt.value !== "all" ? "all" : opt.value)}
              className={filterBtnClass(priceFilter === opt.value)}
            >
              {opt.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />

          {/* Rating filter */}
          {[
            { label: "5+", value: "5" },
            { label: "7+", value: "7" },
            { label: "9+", value: "9" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setRatingFilter(ratingFilter === opt.value ? "all" : opt.value)}
              className={filterBtnClass(ratingFilter === opt.value)}
            >
              ⭐ {opt.label}
            </button>
          ))}

          {hasActiveFilters && (
            <>
              <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-0.5" />
              <button
                onClick={() => { setPriceFilter("all"); setRatingFilter("all"); }}
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
          {filtered.length === channels.length
            ? `Всего: ${channels.length}`
            : `Найдено: ${filtered.length} из ${channels.length}`}
        </p>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📡</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {hasActiveFilters ? "Каналы не найдены" : "Каналов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            {hasActiveFilters
              ? "Попробуйте изменить фильтры"
              : "Здесь будут платные каналы авторов с эксклюзивной аналитикой и торговыми сигналами."}
          </p>
          {hasActiveFilters && (
            <button
              onClick={() => { setPriceFilter("all"); setRatingFilter("all"); }}
              className="mt-3 text-sm text-blue-600 hover:underline"
            >
              Сбросить фильтры
            </button>
          )}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 divide-y dark:divide-gray-800">
          {filtered.map((ch) => (
            <Link key={ch.id} href={`/channels/${ch.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition">
              <ChannelAvatar ch={ch} size="sm" />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 dark:text-gray-100">{ch.name}</span>
                <span className="text-xs text-gray-400 ml-1">({ch.id.slice(0, 8)})</span>
                <span className="text-xs text-gray-400 ml-2">{ch.author.displayName}</span>
              </div>
              <div className="flex items-center gap-4 text-xs shrink-0">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{ch.price} ₽</span>
                <span className="text-gray-400">{ch.subscribersCount} подп.</span>
              </div>
            </Link>
          ))}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filtered.map((ch) => (
            <Link key={ch.id} href={`/channels/${ch.id}`} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-4 border dark:border-gray-800 text-center">
              <div className="flex justify-center mb-2"><ChannelAvatar ch={ch} /></div>
              <div className="font-semibold text-sm text-gray-900 dark:text-gray-100 truncate">{ch.name} <span className="font-normal text-gray-400">({ch.id.slice(0, 8)})</span></div>
              <div className="text-xs text-gray-400 truncate">{ch.author.displayName}</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-2">{ch.price} ₽ / {ch.durationDays} дн.</div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ch) => (
            <Link key={ch.id} href={`/channels/${ch.id}`} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5 border dark:border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <ChannelAvatar ch={ch} />
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{ch.name} <span className="font-normal text-sm text-gray-400">({ch.id.slice(0, 8)})</span></div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{ch.author.displayName}</div>
                </div>
              </div>
              {ch.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{ch.description}</p>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-600 dark:text-blue-400 font-semibold">{ch.price} ₽ / {ch.durationDays} дн.</span>
                <span className="text-gray-400">{ch.subscribersCount} подписчиков</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
