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
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export default function TerminalPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);

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
                open: data.open,
                high: data.high,
                low: data.low,
                volume: data.volume,
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
  const selectedPrice = selected ? prices[selected.id] : null;

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    return p.toFixed(2);
  };

  const formatChange = (c: number) => {
    const sign = c >= 0 ? "+" : "";
    return `${sign}${c.toFixed(2)}%`;
  };

  const formatVol = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
      {/* Top instrument bar */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 px-4 py-2.5 flex items-center gap-4 shrink-0">
        {/* Instrument selector */}
        <div className="relative">
          <button
            onClick={() => setShowInstrumentPicker(!showInstrumentPicker)}
            className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 transition"
          >
            <div className="w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold dark:text-gray-100 leading-tight">
                {selected?.name || "Выберите инструмент"}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 leading-tight">
                {selected?.ticker || selected?.dataTicker || ""}{selected?.exchange ? ` · ${selected.exchange}` : ""}
              </div>
            </div>
            <svg className="w-4 h-4 text-gray-400 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showInstrumentPicker && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowInstrumentPicker(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-xl shadow-lg z-50 w-72 max-h-96 overflow-y-auto">
                <div className="p-2 border-b dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
                  <input
                    type="text"
                    placeholder="Поиск инструмента..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-1.5 border dark:border-gray-600 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500"
                    autoFocus
                  />
                </div>
                {filteredCategories.map((cat) => (
                  <div key={cat.id}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 dark:bg-gray-800/50">
                      {cat.name}
                    </div>
                    {cat.instruments.map((inst) => {
                      const hasData = inst.dataSource && inst.dataTicker;
                      return (
                        <button
                          key={inst.id}
                          onClick={() => {
                            if (hasData) { setSelected(inst); setShowInstrumentPicker(false); setSearch(""); }
                          }}
                          className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 ${
                            selected?.id === inst.id ? "text-green-600 dark:text-green-400 font-medium bg-green-50 dark:bg-green-900/20" : hasData ? "text-gray-700 dark:text-gray-300" : "text-gray-400 opacity-50"
                          }`}
                        >
                          <span className="font-mono font-semibold">{inst.ticker || inst.dataTicker || "—"}</span>
                          <span className="truncate flex-1">{inst.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />

        {/* Price + Change */}
        {selectedPrice ? (
          <>
            <div>
              <div className="text-lg font-bold dark:text-gray-100 leading-tight">
                {formatPrice(selectedPrice.price)}
              </div>
              <div className={`text-xs font-medium leading-tight ${
                selectedPrice.change > 0 ? "text-green-600" : selectedPrice.change < 0 ? "text-red-500" : "text-gray-400"
              }`}>
                {formatChange(selectedPrice.change)}
              </div>
            </div>

            <div className="w-px h-8 bg-gray-200 dark:bg-gray-700" />

            {/* OHLCV */}
            <div className="flex items-center gap-4 text-xs">
              {selectedPrice.open != null && (
                <div>
                  <div className="text-gray-400 dark:text-gray-500 text-[10px]">O</div>
                  <div className="font-medium dark:text-gray-200">{formatPrice(selectedPrice.open)}</div>
                </div>
              )}
              {selectedPrice.high != null && (
                <div>
                  <div className="text-gray-400 dark:text-gray-500 text-[10px]">H</div>
                  <div className="font-medium text-green-600">{formatPrice(selectedPrice.high)}</div>
                </div>
              )}
              {selectedPrice.low != null && (
                <div>
                  <div className="text-gray-400 dark:text-gray-500 text-[10px]">L</div>
                  <div className="font-medium text-red-500">{formatPrice(selectedPrice.low)}</div>
                </div>
              )}
              {selectedPrice.volume != null && (
                <div>
                  <div className="text-gray-400 dark:text-gray-500 text-[10px]">V</div>
                  <div className="font-medium dark:text-gray-200">{formatVol(selectedPrice.volume)}</div>
                </div>
              )}
            </div>
          </>
        ) : selected ? (
          <div className="text-xs text-gray-400 animate-pulse">Загрузка цены...</div>
        ) : null}

        {/* Right side: instrument page link */}
        {selected && (
          <Link
            href={`/instruments/${selected.slug}`}
            className="ml-auto text-xs text-gray-400 hover:text-green-600 dark:hover:text-green-400 flex items-center gap-1 transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
            </svg>
            Страница
          </Link>
        )}
      </div>

      {/* Main area: Chart+Sandbox left, Watchlist right */}
      <div className="flex gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Left column: Chart + Sandbox */}
        <div className="flex-1 flex flex-col gap-2 overflow-hidden min-w-0">
          {/* Chart */}
          <div className="flex-1 min-h-0">
            {selected && chartSource !== "none" && chartTicker ? (
              <ChartWidget
                key={`${selected.id}-${chartTicker}`}
                ticker={chartTicker}
                source={chartSource}
                name={selected.name}
                height={0}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800">
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

          {/* Sandbox trading panel — below chart */}
          <div className="shrink-0">
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

        {/* Right: Watchlist only */}
        <div className="w-72 shrink-0 flex flex-col overflow-hidden">
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
                      className="w-full flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-800/50 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-800 transition"
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
                            className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition group ${
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
                              className={`text-[10px] shrink-0 transition ${isFav ? "text-yellow-500" : "text-gray-300 dark:text-gray-600 group-hover:text-gray-400"}`}
                            >
                              {isFav ? "\u2605" : "\u2606"}
                            </button>

                            {/* Ticker + Name */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <span className={`text-[11px] font-mono font-semibold ${isSelected ? "text-green-600 dark:text-green-400" : "dark:text-gray-100"}`}>
                                  {inst.ticker || inst.dataTicker || "\u2014"}
                                </span>
                              </div>
                              <div className="text-[9px] text-gray-400 dark:text-gray-500 truncate leading-tight">
                                {inst.name}
                              </div>
                            </div>

                            {/* Price + Change */}
                            {priceData ? (
                              <div className="text-right shrink-0">
                                <div className="text-[11px] font-medium dark:text-gray-100">
                                  {formatPrice(priceData.price)}
                                </div>
                                <div className={`text-[9px] font-medium ${
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
                          </button>
                        );
                      })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
