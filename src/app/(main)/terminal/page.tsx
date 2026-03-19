"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { DataSource } from "@/components/instruments/ChartWidget";

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="flex-1 bg-gray-100 dark:bg-gray-800 animate-pulse" /> }
);

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
  dataSource: string | null;
  dataTicker: string | null;
  tradingViewSymbol: string | null;
  category: { id: string; name: string; slug: string } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  instruments: Instrument[];
}

export default function TerminalPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        setExpandedCats(new Set(data.map((c) => c.id)));
        const all = data.flatMap((c) => c.instruments);
        const first = all.find((i) => i.dataSource && i.dataTicker);
        if (first) setSelected(first);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function toggleCategory(catId: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  const filteredCategories = categories
    .map((cat) => ({
      ...cat,
      instruments: cat.instruments.filter((inst) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          inst.name.toLowerCase().includes(q) ||
          (inst.ticker && inst.ticker.toLowerCase().includes(q))
        );
      }),
    }))
    .filter((cat) => cat.instruments.length > 0);

  const chartTicker = selected?.dataTicker || selected?.ticker || "";
  const chartSource = (selected?.dataSource || "none") as DataSource;

  return (
    <div className="flex gap-4 h-[calc(100vh-6rem)]">
      {/* Watchlist sidebar */}
      <div className="w-72 shrink-0 bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b dark:border-gray-800">
          <h2 className="text-sm font-semibold dark:text-gray-100 mb-2">Список наблюдения</h2>
          <input
            type="text"
            placeholder="Поиск инструмента..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-1.5 border dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-xs">Загрузка...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-xs">Ничего не найдено</div>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.id}>
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <span>{cat.name}</span>
                  <span className="text-gray-400">{expandedCats.has(cat.id) ? "▾" : "▸"}</span>
                </button>

                {expandedCats.has(cat.id) &&
                  cat.instruments.map((inst) => {
                    const isSelected = selected?.id === inst.id;
                    const hasData = inst.dataSource && inst.dataTicker;
                    return (
                      <button
                        key={inst.id}
                        onClick={() => { if (hasData) setSelected(inst); }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                            : hasData
                            ? "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                            : "opacity-40 border-l-2 border-transparent cursor-default"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium truncate ${isSelected ? "text-blue-600 dark:text-blue-400" : "dark:text-gray-100"}`}>
                            {inst.name}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono flex items-center gap-1">
                            <span>{inst.ticker || "—"}</span>
                            {inst.dataSource && (
                              <span className={`px-1 rounded ${inst.dataSource === "moex" ? "bg-blue-50 dark:bg-blue-900/20 text-blue-500" : "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600"}`}>
                                {inst.dataSource === "moex" ? "MOEX" : "Bybit"}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/instruments/${inst.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                          title="Открыть страницу"
                        >
                          →
                        </Link>
                      </button>
                    );
                  })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected && chartSource !== "none" && chartTicker ? (
          <ChartWidget
            key={`${selected.id}-${chartTicker}`}
            ticker={chartTicker}
            source={chartSource}
            name={selected.name}
            height={0}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800">
            <div className="text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm">
                {selected ? "Нет данных для этого инструмента" : "Выберите инструмент из списка слева"}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
