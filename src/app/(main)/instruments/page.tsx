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
    </div>
  );
}
