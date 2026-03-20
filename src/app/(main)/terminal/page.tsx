"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { DataSource } from "@/components/instruments/ChartWidget";

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="flex-1 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" /> }
);

const SandboxPanel = dynamic(
  () => import("@/components/sandbox/SandboxPanel"),
  { ssr: false, loading: () => <div className="h-40 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" /> }
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

interface PriceData {
  price: number;
  change: number;
}

const AVATAR_COLORS = [
  "bg-green-600", "bg-teal-600", "bg-emerald-600", "bg-cyan-600",
  "bg-amber-600", "bg-rose-600", "bg-violet-600", "bg-indigo-600",
];

export default function TerminalPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

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

  // Fetch prices for visible instruments
  const fetchPrices = useCallback(async () => {
    const all = categories.flatMap((c) => c.instruments).filter((i) => i.dataTicker);
    if (all.length === 0) return;

    const newPrices: Record<string, PriceData> = {};
    await Promise.all(
      all.map(async (inst) => {
        try {
          const res = await fetch(`/api/quote?ticker=${inst.dataTicker}`);
          if (res.ok) {
            const data = await res.json();
            if (data.price) {
              newPrices[inst.id] = {
                price: data.price,
                change: data.change || 0,
              };
            }
          }
        } catch {}
      })
    );
    setPrices((prev) => ({ ...prev, ...newPrices }));
  }, [categories]);

  useEffect(() => {
    if (categories.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 30000);
      return () => clearInterval(interval);
    }
  }, [categories, fetchPrices]);

  function toggleCategory(catId: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function toggleFavorite(instId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(instId)) next.delete(instId);
      else next.add(instId);
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

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    return p.toFixed(2);
  };

  const formatChange = (c: number) => {
    const sign = c >= 0 ? "+" : "";
    return `${sign}${c.toFixed(2)}%`;
  };

  return (
    <div className="flex gap-3 flex-1 min-h-0 overflow-hidden">
      {/* Chart area — LEFT, takes most space */}
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
              <svg className="w-16 h-16 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
              <p className="text-sm">
                {selected ? "Нет данных для этого инструмента" : "Выберите инструмент из списка справа"}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right panel: Watchlist + Sandbox */}
      <div className="w-80 shrink-0 flex flex-col gap-3 overflow-hidden">
        {/* Watchlist */}
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 flex flex-col overflow-hidden flex-1 min-h-0">
          <div className="p-3 border-b dark:border-gray-800">
            <h2 className="text-sm font-semibold dark:text-gray-100 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
              Watchlist
            </h2>
            <div className="relative">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500"
              />
            </div>
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
                    className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                  >
                    <span>{cat.name}</span>
                    <span className="text-gray-400 text-xs">{expandedCats.has(cat.id) ? "\u25BE" : "\u25B8"}</span>
                  </button>

                  {expandedCats.has(cat.id) &&
                    cat.instruments.map((inst) => {
                      const isSelected = selected?.id === inst.id;
                      const hasData = inst.dataSource && inst.dataTicker;
                      const priceData = prices[inst.id];
                      const isFav = favorites.has(inst.id);

                      return (
                        <button
                          key={inst.id}
                          onClick={() => { if (hasData) setSelected(inst); }}
                          className={`w-full flex items-center gap-2 px-2 py-2 text-left transition group ${
                            isSelected
                              ? "bg-green-50 dark:bg-green-900/20 border-l-2 border-green-500"
                              : hasData
                              ? "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                              : "opacity-40 border-l-2 border-transparent cursor-default"
                          }`}
                        >
                          {/* Favorite star */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavorite(inst.id); }}
                            className={`text-xs shrink-0 transition ${isFav ? "text-yellow-500" : "text-gray-300 dark:text-gray-600 group-hover:text-gray-400"}`}
                          >
                            {isFav ? "\u2605" : "\u2606"}
                          </button>

                          {/* Ticker + Name */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-xs font-mono font-semibold ${isSelected ? "text-green-600 dark:text-green-400" : "dark:text-gray-100"}`}>
                                {inst.ticker || inst.dataTicker || "\u2014"}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                              {inst.name}
                            </div>
                          </div>

                          {/* Price + Change */}
                          {priceData ? (
                            <div className="text-right shrink-0">
                              <div className="text-xs font-medium dark:text-gray-100">
                                {formatPrice(priceData.price)}
                              </div>
                              <div className={`text-[10px] font-medium ${
                                priceData.change > 0 ? "text-green-600" : priceData.change < 0 ? "text-red-500" : "text-gray-400"
                              }`}>
                                {formatChange(priceData.change)}
                              </div>
                            </div>
                          ) : hasData ? (
                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-gray-300 dark:text-gray-600">...</div>
                            </div>
                          ) : null}

                          {/* Page link */}
                          <Link
                            href={`/instruments/${inst.slug}`}
                            onClick={(e) => e.stopPropagation()}
                            className="text-[10px] text-gray-300 hover:text-green-600 dark:hover:text-green-400 shrink-0 opacity-0 group-hover:opacity-100 transition"
                            title="Открыть страницу"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
                            </svg>
                          </Link>
                        </button>
                      );
                    })}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Sandbox trading panel */}
        <SandboxPanel
          selectedTicker={chartTicker || undefined}
          selectedName={selected?.name}
          onSelectTicker={(ticker, instrName) => {
            const all = categories.flatMap((c) => c.instruments);
            const match = all.find(
              (i) =>
                i.dataTicker === ticker ||
                i.ticker === ticker ||
                (i.dataTicker && ticker.startsWith(i.dataTicker)) ||
                (i.ticker && ticker.startsWith(i.ticker))
            );
            if (match) {
              setSelected(match);
            } else {
              setSelected({
                id: `virtual-${ticker}`,
                name: instrName || ticker,
                slug: ticker.toLowerCase(),
                ticker: ticker,
                exchange: "MOEX",
                dataSource: "moex",
                dataTicker: ticker,
                tradingViewSymbol: null,
                category: null,
              });
            }
          }}
        />
      </div>
    </div>
  );
}
