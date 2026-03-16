"use client";

import { useEffect, useState } from "react";

interface Language {
  code: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
}

export default function AdminLanguagesPage() {
  const [languages, setLanguages] = useState<Language[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/admin/languages");
    if (res.ok) setLanguages(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd() {
    setError("");
    if (!code || !name) {
      setError("Укажите код и название");
      return;
    }
    const res = await fetch("/api/admin/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: code.toLowerCase(),
        name,
        enabled: true,
        sortOrder: parseInt(sortOrder) || 0,
      }),
    });
    if (res.ok) {
      setCode("");
      setName("");
      setSortOrder("0");
      load();
    } else {
      const data = await res.json();
      setError(data.error || "Ошибка");
    }
  }

  async function toggleEnabled(lang: Language) {
    await fetch("/api/admin/languages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...lang, enabled: !lang.enabled }),
    });
    load();
  }

  async function deleteLang(langCode: string) {
    await fetch("/api/admin/languages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: langCode }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6 dark:text-gray-100">Управление языками</h1>

      {/* Add form */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 dark:text-gray-100">Добавить язык</h2>
        <div className="flex gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Код (ru, en, cn)
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={5}
              className="border dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-24 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Название
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border dark:border-gray-700 rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Порядок
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="border dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-20 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <button
            onClick={handleAdd}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            Добавить
          </button>
        </div>
        {error && <p className="text-red-500 dark:text-red-400 text-sm mt-2">{error}</p>}
      </div>

      {/* Languages table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Код
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Название
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Порядок
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Статус
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {languages.map((lang) => (
              <tr key={lang.code} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-6 py-4 font-mono text-sm dark:text-gray-300">{lang.code}</td>
                <td className="px-6 py-4 dark:text-gray-300">{lang.name}</td>
                <td className="px-6 py-4 dark:text-gray-400">{lang.sortOrder}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => toggleEnabled(lang)}
                    className={`px-2 py-0.5 rounded text-xs font-medium ${
                      lang.enabled
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {lang.enabled ? "Активен" : "Отключён"}
                  </button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => deleteLang(lang.code)}
                    className="text-red-500 dark:text-red-400 hover:text-red-700 text-xs"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {languages.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            Нет языков
          </div>
        )}
      </div>
    </div>
  );
}
