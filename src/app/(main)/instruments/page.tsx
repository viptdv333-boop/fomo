"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  _count: { assets: number };
}

const CATEGORY_META: Record<string, { emoji: string; color: string; bg: string; desc: string }> = {
  "ru-stocks": { emoji: "🇷🇺", color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800", desc: "Акции российских компаний на Московской бирже: Сбербанк, Газпром, Лукойл, Яндекс и другие" },
  "us-stocks": { emoji: "🇺🇸", color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800", desc: "Акции крупнейших американских компаний: Apple, Tesla, Nvidia, Microsoft, Amazon" },
  "indices": { emoji: "📊", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800", desc: "Мировые фондовые индексы: S&P 500, NASDAQ, РТС, IMOEX, Dow Jones" },
  "currencies": { emoji: "💱", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800", desc: "Валютные пары и курсы: доллар, евро, юань, рубль" },
  "crypto": { emoji: "₿", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800", desc: "Криптовалюты: Bitcoin, Ethereum, Solana, XRP и другие цифровые активы" },
  "commodities": { emoji: "🛢️", color: "text-amber-700", bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800", desc: "Сырьевые товары: нефть Brent/WTI, природный газ, пшеница, сахар, какао" },
  "metals": { emoji: "🥇", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800", desc: "Драгоценные и промышленные металлы: золото, серебро, платина, палладий, медь" },
};

export default function CatalogPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "list" | "paragraph">("cards");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/categories")
      .then(r => r.json())
      .then(data => setCategories((Array.isArray(data) ? data : []).filter((c: Category) => (c._count?.assets || 0) > 0)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = search
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || CATEGORY_META[c.slug]?.desc.toLowerCase().includes(search.toLowerCase()))
    : categories;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold dark:text-gray-100">Каталог</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Инструменты и тикеры мировых бирж</p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap mb-6">
        {search && (
          <button onClick={() => setSearch("")} className="text-xs text-gray-400 hover:text-red-500 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input type="text" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-sm dark:bg-gray-800 dark:text-gray-100 w-44" />
          </div>
          <div className="flex items-center gap-0.5">
            <button onClick={() => setViewMode("paragraph")} className={`p-1.5 rounded transition ${viewMode === "paragraph" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" x2="17" y1="8" y2="8"/><line x1="7" x2="13" y1="12" y2="12"/></svg>
            </button>
            <button onClick={() => setViewMode("list")} className={`p-1.5 rounded transition ${viewMode === "list" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>
            </button>
            <button onClick={() => setViewMode("cards")} className={`p-1.5 rounded transition ${viewMode === "cards" ? "text-gray-900 dark:text-gray-100" : "text-gray-300 dark:text-gray-600 hover:text-gray-500"}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1,2,3,4,5,6,7].map(i => (
            <div key={i} className="h-32 bg-gray-100 dark:bg-gray-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <div className="text-4xl mb-3">📭</div>
          <p>{search ? "Ничего не найдено" : "Категории пока не добавлены"}</p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(cat => {
            const m = CATEGORY_META[cat.slug] || { emoji: "📁", color: "text-gray-600", bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700", desc: "" };
            return (
              <Link key={cat.id} href={`/instruments/category/${cat.slug}`}
                className={`rounded-2xl border p-6 transition hover:shadow-lg hover:-translate-y-1 ${m.bg}`}>
                <div className="text-4xl mb-3">{m.emoji}</div>
                <h2 className={`text-lg font-bold ${m.color} dark:text-gray-100`}>{cat.name}</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{m.desc}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">{cat._count?.assets || 0} инструментов</p>
              </Link>
            );
          })}
        </div>
      ) : viewMode === "list" ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow">
          {filtered.map(cat => {
            const m = CATEGORY_META[cat.slug] || { emoji: "📁", color: "text-gray-600", bg: "", desc: "" };
            return (
              <Link key={cat.id} href={`/instruments/category/${cat.slug}`}
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition border-b border-gray-100 dark:border-gray-800/30 last:border-b-0">
                <span className="text-3xl">{m.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className={`font-bold text-base ${m.color} dark:text-gray-100`}>{cat.name}</span>
                    <span className="text-xs text-gray-400">{cat._count?.assets || 0} инструментов</span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 truncate">{m.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        /* Paragraph — large cards */
        <div className="space-y-4">
          {filtered.map(cat => {
            const m = CATEGORY_META[cat.slug] || { emoji: "📁", color: "text-gray-600", bg: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700", desc: "" };
            return (
              <Link key={cat.id} href={`/instruments/category/${cat.slug}`}
                className={`block rounded-2xl border p-6 transition hover:shadow-lg ${m.bg}`}>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">{m.emoji}</span>
                  <div>
                    <h2 className={`text-xl font-bold ${m.color} dark:text-gray-100`}>{cat.name}</h2>
                    <span className="text-xs text-gray-400">{cat._count?.assets || 0} инструментов</span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">{m.desc}</p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
