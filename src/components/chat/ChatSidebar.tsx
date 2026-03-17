"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Instrument {
  id: string;
  name: string;
  slug: string;
  chatRoom: { id: string } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  instruments: Instrument[];
}

export default function ChatSidebar({ currentSlug }: { currentSlug?: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        // Auto-expand category that contains current instrument
        if (currentSlug) {
          for (const cat of data) {
            if (cat.instruments.some((i) => i.slug === currentSlug)) {
              setExpanded(new Set([cat.id]));
              break;
            }
          }
        }
      });
  }, [currentSlug]);

  function toggleCategory(catId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  return (
    <div className="w-64 shrink-0 overflow-y-auto">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4">
        <h3 className="font-semibold text-sm text-gray-500 dark:text-gray-400 uppercase mb-3">Чаты</h3>
        <div className="space-y-1">
          <Link
            href="/chat"
            className={`block px-3 py-2 rounded-lg text-sm ${
              !currentSlug
                ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            Общий чат
          </Link>

          {categories.map((cat) => (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
              >
                <span>{cat.name}</span>
                <span className="text-xs">{expanded.has(cat.id) ? "▾" : "▸"}</span>
              </button>
              {expanded.has(cat.id) && (
                <div className="ml-2 space-y-0.5">
                  {cat.instruments.length === 0 ? (
                    <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500">Нет инструментов</div>
                  ) : (
                    cat.instruments.map((inst) => (
                      <Link
                        key={inst.slug}
                        href={`/chat/${inst.slug}`}
                        className={`block px-3 py-1.5 rounded-lg text-sm ${
                          inst.slug === currentSlug
                            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                            : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        {inst.name}
                      </Link>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
