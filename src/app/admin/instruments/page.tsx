"use client";

import { useEffect, useState } from "react";

interface Category {
  id: string;
  name: string;
}

interface Instrument {
  id: string;
  name: string;
  slug: string;
  categoryId: string | null;
  category: Category | null;
  createdAt: string;
}

export default function AdminInstrumentsPage() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadInstruments() {
    setLoading(true);
    const res = await fetch("/api/instruments");
    setInstruments(await res.json());
    setLoading(false);
  }

  async function loadCategories() {
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }

  useEffect(() => {
    loadInstruments();
    loadCategories();
  }, []);

  function generateSlug(text: string) {
    return text
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s-]/gi, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { name, slug };
    if (categoryId) payload.categoryId = categoryId;
    else payload.categoryId = null;

    if (editId) {
      await fetch(`/api/instruments/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setName("");
    setSlug("");
    setCategoryId("");
    setEditId(null);
    loadInstruments();
  }

  async function handleDelete(id: string) {
    if (!confirm("Удалить инструмент? Связанный чат-рум тоже будет удалён.")) return;
    await fetch(`/api/instruments/${id}`, { method: "DELETE" });
    loadInstruments();
  }

  function startEdit(instrument: Instrument) {
    setEditId(instrument.id);
    setName(instrument.name);
    setSlug(instrument.slug);
    setCategoryId(instrument.categoryId || "");
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Инструменты</h1>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">
          {editId ? "Редактировать" : "Добавить"} инструмент
        </h2>
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Название</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!editId) setSlug(generateSlug(e.target.value));
              }}
              required
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="Bitcoin"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Slug (URL)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              required
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100"
              placeholder="bitcoin"
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Категория</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-4 py-2 border dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-green-500 dark:bg-gray-700 dark:text-gray-100"
            >
              <option value="">Без категории</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="bg-green-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-green-700 transition"
            >
              {editId ? "Сохранить" : "Добавить"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={() => {
                  setEditId(null);
                  setName("");
                  setSlug("");
                  setCategoryId("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Отмена
              </button>
            )}
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
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Категория</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Создан</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {instruments.map((inst) => (
                <tr key={inst.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 font-medium dark:text-gray-100">{inst.name}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{inst.slug}</td>
                  <td className="px-4 py-3">
                    {inst.category ? (
                      <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs">
                        {inst.category.name}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(inst.createdAt).toLocaleDateString("ru")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3">
                      <button
                        onClick={() => startEdit(inst)}
                        className="text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 text-xs font-medium"
                      >
                        Изменить
                      </button>
                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {instruments.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет инструментов</div>
          )}
        </div>
      )}
    </div>
  );
}
