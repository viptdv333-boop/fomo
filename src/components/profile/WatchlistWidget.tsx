"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";

interface WatchlistAsset {
  id: string;
  sortOrder: number;
  asset: {
    id: string;
    name: string;
    ticker: string | null;
    slug: string;
    category: { name: string; slug: string } | null;
    instruments: { tradingViewSymbol: string | null; ticker: string | null; source: string | null }[];
  };
}

interface Props {
  userId: string;
  isOwner?: boolean;
}

export default function WatchlistWidget({ userId, isOwner = false }: Props) {
  const { t } = useT();
  const [items, setItems] = useState<WatchlistAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const tvRef = useRef<HTMLDivElement>(null);

  const loadWatchlist = useCallback(async () => {
    const res = await fetch(`/api/watchlist?userId=${userId}`);
    if (res.ok) setItems(await res.json());
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  // Render TradingView widget when items change
  useEffect(() => {
    if (!tvRef.current || items.length === 0) return;
    tvRef.current.innerHTML = "";

    const symbols = items
      .map((item) => {
        const tvSym = item.asset.instruments.find((i) => i.tradingViewSymbol)?.tradingViewSymbol;
        if (tvSym) return [item.asset.name, `${tvSym}|1D`];
        const ticker = item.asset.ticker || item.asset.instruments[0]?.ticker;
        if (ticker) return [item.asset.name, `${ticker}|1D`];
        return null;
      })
      .filter(Boolean) as string[][];

    if (symbols.length === 0) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      dateRange: "1D",
      showChart: true,
      locale: "ru",
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: false,
      width: "100%",
      height: Math.max(400, symbols.length * 50 + 200),
      tabs: [{
        title: t("watch.title"),
        symbols: symbols.map(([name, s]) => ({ s, d: name })),
        originalTitle: "Watchlist",
      }],
    });

    tvRef.current.appendChild(script);
  }, [items]);

  // Search assets
  const searchAssets = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/instruments/search?q=${encodeURIComponent(q)}&limit=10`);
      if (res.ok) {
        const data = await res.json();
        const existing = new Set(items.map((i) => i.asset.id));
        setSearchResults((data.assets || data).filter((a: any) => !existing.has(a.id)));
      }
    } finally { setSearching(false); }
  }, [items]);

  useEffect(() => {
    const t = setTimeout(() => searchAssets(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery, searchAssets]);

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
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            👁 {t("watch.title")}
          </h3>
          <span className="text-xs text-gray-400">{items.length} {t("watch.count")}</span>
        </div>

        {/* Add instrument (owner only) */}
        {isOwner && (
          <div className="relative">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("watch.add")}
              className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg text-sm dark:bg-gray-900 dark:text-gray-100" />
            {searching && <div className="absolute right-3 top-2.5 text-xs text-gray-400">...</div>}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {searchResults.map((a: any) => (
                  <button key={a.id} onClick={() => addToWatchlist(a.id)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm flex justify-between">
                    <span className="font-medium">{a.name}</span>
                    <span className="text-xs text-gray-400">{a.ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 text-center py-8">...</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">
          {isOwner ? t("watch.addHelp") : t("watch.empty")}
        </div>
      ) : (
        <>
          {/* User's list with remove buttons */}
          {isOwner && (
            <div className="px-4 py-2 space-y-1 border-b border-gray-100 dark:border-gray-700">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-2 py-1 group">
                  <Link href={`/instruments/${item.asset.slug}`} className="flex-1 text-sm text-gray-700 dark:text-gray-300 hover:text-green-600 truncate">
                    {item.asset.name}
                  </Link>
                  {item.asset.ticker && <span className="text-xs text-gray-400">{item.asset.ticker}</span>}
                  <button onClick={() => removeFromWatchlist(item.asset.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* TradingView widget */}
          <div ref={tvRef} />
        </>
      )}
    </div>
  );
}
