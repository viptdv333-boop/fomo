"use client";

import { useEffect, useState } from "react";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} мин`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ч`;
  const days = Math.floor(hrs / 24);
  return `${days} д`;
}

export default function RuNews() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/news")
      .then(r => r.ok ? r.json() : [])
      .then(setNews)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
        <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">Новости рынков</h2>
        <div className="space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-12 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (news.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
      <h2 className="text-lg font-semibold dark:text-gray-100 mb-4">Новости рынков</h2>
      <div className="space-y-1 max-h-[500px] overflow-y-auto">
        {news.map((item, i) => (
          <a
            key={i}
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition group"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-200 group-hover:text-green-600 dark:group-hover:text-green-400 transition line-clamp-2">
                {item.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">{item.source}</span>
                {item.pubDate && (
                  <span className="text-xs text-gray-400">{timeAgo(item.pubDate)}</span>
                )}
              </div>
            </div>
            <svg className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 mt-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ))}
      </div>
    </div>
  );
}
