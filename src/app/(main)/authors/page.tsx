"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Author {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  fomoId: string | null;
  rating: number;
  ideasCount: number;
  subscribersCount: number;
  bio: string | null;
}

export default function AuthorsPage() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/authors")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAuthors(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = authors.filter(
    (a) =>
      !search ||
      a.displayName.toLowerCase().includes(search.toLowerCase()) ||
      (a.fomoId && a.fomoId.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold dark:text-gray-100">Авторы</h1>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Поиск по имени или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 border dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-900 dark:text-gray-100 dark:placeholder-gray-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">Загрузка...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">👤</div>
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {search ? "Авторы не найдены" : "Авторов пока нет"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {search ? "Попробуйте изменить поисковый запрос" : "Здесь будут профили авторов торговых идей"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((author) => (
            <Link
              key={author.id}
              href={`/profile/${author.id}`}
              className="bg-white dark:bg-gray-900 rounded-xl shadow hover:shadow-md transition p-5 border dark:border-gray-800"
            >
              <div className="flex items-center gap-3 mb-3">
                {author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={author.avatarUrl} alt="" className="w-12 h-12 rounded-full" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-lg">
                    {author.displayName[0]}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">{author.displayName}</div>
                  {author.fomoId && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">@{author.fomoId}</div>
                  )}
                </div>
              </div>

              {author.bio && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{author.bio}</p>
              )}

              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="text-yellow-500">⭐</span> {author.rating.toFixed(1)}
                </span>
                <span>{author.ideasCount} идей</span>
                <span>{author.subscribersCount} подписчиков</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
