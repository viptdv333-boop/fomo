"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  slug: string;
  _count: { assets: number };
}

const CATEGORY_ICONS: Record<string, { emoji: string; color: string; bg: string }> = {
  "ru-stocks": { emoji: "🇷🇺", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800" },
  "us-stocks": { emoji: "🇺🇸", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" },
  "indices": { emoji: "📊", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800" },
  "currencies": { emoji: "💱", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" },
  "crypto": { emoji: "₿", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800" },
  "commodities": { emoji: "🛢️", color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800" },
  "metals": { emoji: "🥇", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800" },
};

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(data => setCategories((Array.isArray(data) ? data : []).filter((c: Category) => (c._count?.assets || 0) > 0)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold dark:text-gray-100">Каталог</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Инструменты и тикеры мировых бирж</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map(cat => {
            const style = CATEGORY_ICONS[cat.slug] || { emoji: "📁", color: "text-gray-600", bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700" };
            return (
              <Link
                key={cat.id}
                href={`/instruments/category/${cat.slug}`}
                className={`rounded-2xl border p-6 transition hover:shadow-lg hover:-translate-y-1 ${style.bg}`}
              >
                <div className="text-4xl mb-3">{style.emoji}</div>
                <h2 className={`text-lg font-bold ${style.color} dark:text-gray-100`}>{cat.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {cat._count?.assets || 0} инструментов
                </p>
              </Link>
            );
          })}
        </div>
      )}
      {/* TradingView Heatmap */}
      <div className="mt-8">
        <h2 className="text-xl font-bold dark:text-gray-100 mb-4">Карта рынка</h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="h-[500px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              exchanges: [], dataSource: "SPX500", grouping: "sector",
              blockSize: "market_cap_basic", blockColor: "change",
              locale: "ru", symbolUrl: "", colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              hasTopBar: true, isDataSetEnabled: true, isZoomEnabled: true, hasSymbolTooltip: true,
              width: "100%", height: "100%",
            });
            el.appendChild(script);
          }} />
        </div>
      </div>

      {/* TradingView Crypto Heatmap */}
      <div className="mt-6">
        <h2 className="text-xl font-bold dark:text-gray-100 mb-4">Карта крипторынка</h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="h-[500px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              dataSource: "Crypto", blockSize: "market_cap_calc", blockColor: "change",
              locale: "ru", symbolUrl: "", colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              hasTopBar: true, isDataSetEnabled: true, isZoomEnabled: true, hasSymbolTooltip: true,
              width: "100%", height: "100%",
            });
            el.appendChild(script);
          }} />
        </div>
      </div>

      {/* TradingView Screener */}
      <div className="mt-6">
        <h2 className="text-xl font-bold dark:text-gray-100 mb-4">Скринер акций</h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
          <div className="h-[500px]" ref={(el) => {
            if (!el || el.querySelector("iframe")) return;
            const script = document.createElement("script");
            script.src = "https://s3.tradingview.com/external-embedding/embed-widget-screener.js";
            script.async = true;
            script.innerHTML = JSON.stringify({
              width: "100%", height: "100%", defaultColumn: "overview",
              defaultScreen: "most_capitalized", market: "russia", showToolbar: true,
              locale: "ru", colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
              isTransparent: true,
            });
            el.appendChild(script);
          }} />
        </div>
      </div>
    </div>
  );
}
