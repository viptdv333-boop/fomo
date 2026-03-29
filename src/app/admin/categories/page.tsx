"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  isHidden: boolean;
  _count: { instruments: number; assets: number };
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [loading, setLoading] = useState(true);

  async function loadCategories() {
    setLoading(true);
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data.sort((a: Category, b: Category) => a.sortOrder - b.sortOrder));
    setLoading(false);
  }

  useEffect(() => { loadCategories(); }, []);

  function generateSlug(text: string) {
    const map: Record<string, string> = {
      "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
      "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
      "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
      "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
      "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    };
    return text.toLowerCase().split("").map((c) => map[c] || c).join("")
      .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, sortOrder: Number(sortOrder) }),
    });
    setName(""); setSlug(""); setSortOrder("0");
    loadCategories();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить категорию? Инструменты останутся без категории.")) return;
    await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    loadCategories();
  }

  async function handleToggleHidden(id: string, isHidden: boolean) {
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, isHidden: !isHidden }),
    });
    loadCategories();
  }

  async function moveCategory(id: string, direction: "up" | "down") {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((c) => c.id === id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const current = sorted[idx];
    const other = sorted[swapIdx];
    await Promise.all([
      fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, sortOrder: other.sortOrder }),
      }),
      fetch("/api/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: other.id, sortOrder: current.sortOrder }),
      }),
    ]);
    loadCategories();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Категории инструментов</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Добавить категорию</h2>
        <div className="flex gap-4 flex-wrap items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input type="text" value={name} onChange={(e) => { setName(e.target.value); setSlug(generateSlug(e.target.value)); }}
              required className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" placeholder="Криптовалюты" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
            <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)}
              required className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" placeholder="crypto" />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Порядок</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg dark:bg-gray-700 dark:text-gray-100" />
          </div>
          <button type="submit" className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition">Добавить</button>
        </div>
      </form>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет категорий</div>
          ) : (
            <div>
              {categories.map((cat, idx) => (
                <div key={cat.id} className={`flex items-center gap-3 px-4 py-3 border-b border-gray-50 dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${cat.isHidden ? "opacity-50" : ""}`}>
                  {/* Sort arrows */}
                  <div className="flex flex-col gap-0.5">
                    <button onClick={() => moveCategory(cat.id, "up")} disabled={idx === 0}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▲</button>
                    <button onClick={() => moveCategory(cat.id, "down")} disabled={idx === categories.length - 1}
                      className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-20 text-xs leading-none">▼</button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">{cat.name}</span>
                      <span className="text-xs text-gray-400">/{cat.slug}</span>
                      {cat.isHidden && <span className="text-[10px] px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 rounded">Скрыта</span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {cat._count.instruments || cat._count.assets || 0} инструментов • порядок: {cat.sortOrder}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleToggleHidden(cat.id, cat.isHidden)}
                      className={`text-xs ${cat.isHidden ? "text-green-600 hover:text-green-800" : "text-gray-500 hover:text-amber-600"}`}>
                      {cat.isHidden ? "Показать" : "Скрыть"}
                    </button>
                    <button onClick={() => handleDelete(cat.id)}
                      className="text-xs text-red-500 hover:text-red-700">Удалить</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
