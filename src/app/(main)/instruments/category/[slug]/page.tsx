"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Ticker {
  id: string;
  ticker: string | null;
  exchange: string | null;
  exchangeRel: { shortName: string; country: string } | null;
}

interface Asset {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  instruments: Ticker[];
  _count: { instruments: number };
}

const FLAGS: Record<string, string> = { RU: "🇷🇺", US: "🇺🇸", CN: "🇨🇳", GB: "🇬🇧", SPOT: "🌐", CRYPTO: "₿" };

export default function CategoryPage() {
  const { slug } = useParams();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [catName, setCatName] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"paragraph" | "list" | "cards">("paragraph");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/assets?categorySlug=${slug}`)
      .then(r => r.json())
      .then((data: Asset[]) => {
        setAssets(Array.isArray(data) ? data : []);
        if (data.length > 0 && (data[0] as any).category) setCatName((data[0] as any).category.name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    fetch("/api/categories").then(r => r.json()).then((cats: any[]) => {
      const found = cats.find((c: any) => c.slug === slug);
      if (found) setCatName(found.name);
    }).catch(() => {});
  }, [slug]);

  const filtered = search
    ? assets.filter(a => a.name.toLowerCase().includes(search.toLowerCase()) || a.description?.toLowerCase().includes(search.toLowerCase()))
    : assets;

  function TickerBadges({ tickers }: { tickers: Ticker[] }) {
    return (
      <div className="flex flex-wrap gap-1">
        {tickers.slice(0, 5).map(t => (
          <span key={t.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded text-[11px] font-mono font-bold">
            #{t.ticker}
            {t.exchangeRel && <span className="text-[9px] text-gray-400 font-normal">{FLAGS[t.exchangeRel.country] || ""}{t.exchangeRel.shortName}</span>}
          </span>
        ))}
        {tickers.length > 5 && <span className="text-[11px] text-gray-400">+{tickers.length - 5}</span>}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <Link href="/instruments" className="text-sm text-green-600 hover:text-green-700 dark:text-green-400">← Каталог</Link>
          <h1 className="text-2xl font-bold dark:text-gray-100 mt-1">{catName || "..."}</h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        <span className="text-xs text-gray-400">{filtered.length} инструментов</span>

        {/* Search */}
        <div className="ml-auto relative shrink-0 flex items-center gap-2">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              placeholder="Поиск..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 w-40"
            />
          </div>

          {/* View mode */}
          <div className="flex items-center gap-0.5">
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
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>{search ? "Ничего не найдено" : "Инструменты пока не добавлены"}</p>
        </div>
      ) : viewMode === "cards" ? (
        /* Cards view */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(asset => (
            <Link key={asset.id} href={`/instruments/${asset.slug}`} className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-lg transition p-5">
              <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-1">{asset.name}</h3>
              {asset.description && <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">{asset.description}</p>}
              <TickerBadges tickers={asset.instruments} />
            </Link>
          ))}
        </div>
      ) : viewMode === "list" ? (
        /* List view — compact */
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow">
          {filtered.map(asset => (
            <Link key={asset.id} href={`/instruments/${asset.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b border-gray-100 dark:border-gray-800/30 last:border-b-0">
              <span className="font-semibold text-sm text-gray-900 dark:text-gray-100 w-40 shrink-0">{asset.name}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500 flex-1 truncate">{asset.description || ""}</span>
              <TickerBadges tickers={asset.instruments} />
            </Link>
          ))}
        </div>
      ) : (
        /* Paragraph view — default, with description */
        <div className="space-y-3">
          {filtered.map(asset => (
            <Link key={asset.id} href={`/instruments/${asset.slug}`} className="block bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-gray-900 dark:text-gray-100">{asset.name}</h3>
                  {asset.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{asset.description}</p>}
                </div>
                <div className="shrink-0">
                  <TickerBadges tickers={asset.instruments} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
