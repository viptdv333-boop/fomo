"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  _count: { instruments: number };
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
    setCategories(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    loadCategories();
  }, []);

  function generateSlug(text: string) {
    const map: Record<string, string> = {
      "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "yo",
      "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
      "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
      "ф": "f", "х": "kh", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "shch",
      "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    };
    return text
      .toLowerCase()
      .split("")
      .map((c) => map[c] || c)
      .join("")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug, sortOrder: Number(sortOrder) }),
    });
    setName("");
    setSlug("");
    setSortOrder("0");
    loadCategories();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить категорию? Инструменты останутся без категории.")) return;
    await fetch(`/api/categories?id=${id}`, { method: "DELETE" });
    loadCategories();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Категории инструментов</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Добавить категорию</h2>
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(generateSlug(e.target.value));
              }}
              required
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Криптовалюты"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="crypto"
            />
          </div>
          <div className="w-24">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Порядок</label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Добавить
            </button>
          </div>
        </div>
      </form>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Название</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Порядок</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Инструментов</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 font-medium dark:text-gray-100">{cat.name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{cat.slug}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{cat.sortOrder}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{cat._count.instruments}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(cat.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет категорий</div>
          )}
        </div>
      )}
    </div>
  );
}
