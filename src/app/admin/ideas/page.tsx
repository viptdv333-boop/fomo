"use client";

import { useEffect, useState } from "react";

interface Idea {
  id: string;
  title: string;
  isPaid: boolean;
  createdAt: string;
  author: { displayName: string };
  instruments: { name: string }[];
}

export default function AdminIdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function loadIdeas() {
    setLoading(true);
    const res = await fetch(`/api/ideas?page=${page}&limit=50`);
    const data = await res.json();
    setIdeas(data.data || data.ideas || (Array.isArray(data) ? data : []));
    setLoading(false);
  }

  useEffect(() => {
    loadIdeas();
  }, [page]);

  async function deleteIdea(id: string) {
    if (!confirm("Удалить идею?")) return;
    await fetch(`/api/ideas/${id}`, { method: "DELETE" });
    loadIdeas();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Модерация идей</h1>

      {loading ? (
        <div className="text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
          <table className="w-full text-sm dark:text-gray-300">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Заголовок</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Автор</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Инструменты</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Платная</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Дата</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-700">
              {ideas.map((idea) => (
                <tr key={idea.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 font-medium max-w-xs truncate dark:text-gray-100">
                    {idea.title}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {idea.author.displayName}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {idea.instruments.map((i) => (
                        <span
                          key={i.name}
                          className="px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded text-xs"
                        >
                          {i.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {idea.isPaid ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Да</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">Нет</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(idea.createdAt).toLocaleDateString("ru")}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteIdea(idea.id)}
                      className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-xs font-medium"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {ideas.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">Нет идей</div>
          )}
        </div>
      )}

      <div className="flex justify-center gap-2 mt-4">
        <button
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300"
        >
          ← Назад
        </button>
        <span className="px-4 py-2 text-gray-500 dark:text-gray-400">Стр. {page}</span>
        <button
          onClick={() => setPage(page + 1)}
          disabled={ideas.length < 50}
          className="px-4 py-2 border dark:border-gray-700 rounded-lg disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300"
        >
          Далее →
        </button>
      </div>
    </div>
  );
}
