"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WatchlistAsset {
  id: string;
  sortOrder: number;
  asset: {
    id: string;
    name: string;
    ticker: string | null;
    slug: string;
    category: { name: string; slug: string } | null;
  };
}

interface Props {
  userId: string;
  isOwner?: boolean;
}

export default function WatchlistWidget({ userId, isOwner = false }: Props) {
  const [items, setItems] = useState<WatchlistAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  async function loadWatchlist() {
    const res = await fetch(`/api/watchlist?userId=${userId}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }

  useEffect(() => { loadWatchlist(); }, [userId]);

  async function searchAssets(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(items.map((i) => i.asset.id));
        setSearchResults((data.assets || data).filter((a: any) => !existing.has(a.id)));
      }
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => searchAssets(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  async function addToWatchlist(assetId: string) {
    await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    setSearchQuery("");
    setSearchResults([]);
    loadWatchlist();
  }

  async function removeFromWatchlist(assetId: string) {
    await fetch(`/api/watchlist?assetId=${assetId}`, { method: "DELETE" });
    loadWatchlist();
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>👁</span> Список наблюдения
        </h3>
        <span className="text-xs text-gray-400">{items.length} шт.</span>
      </div>

      {/* Add instrument (owner only) */}
      {isOwner && (
        <div className="relative mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Добавить инструмент..."
            className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100"
          />
          {searching && <div className="absolute right-3 top-2.5 text-xs text-gray-400">...</div>}
          {searchResults.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {searchResults.map((a: any) => (
                <button key={a.id} onClick={() => addToWatchlist(a.id)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex justify-between items-center">
                  <span className="font-medium">{a.name}</span>
                  <span className="text-xs text-gray-400">{a.ticker}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-4">Загрузка...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-4">
          {isOwner ? "Добавьте инструменты для отслеживания" : "Список пуст"}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 group">
              <Link href={`/instruments/${item.asset.slug}`} className="flex-1 min-w-0 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{item.asset.name}</span>
                {item.asset.ticker && (
                  <span className="text-xs text-gray-400 shrink-0">{item.asset.ticker}</span>
                )}
              </Link>
              {item.asset.category && (
                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 rounded shrink-0">
                  {item.asset.category.name}
                </span>
              )}
              {isOwner && (
                <button onClick={() => removeFromWatchlist(item.asset.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition shrink-0">✕</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
