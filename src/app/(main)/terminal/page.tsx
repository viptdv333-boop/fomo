"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { DataSource } from "@/components/instruments/ChartWidget";

const ChartWidget = dynamic(
  () => import("@/components/instruments/ChartWidget"),
  { ssr: false, loading: () => <div className="flex-1 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl" /> }
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

/* Category-styled ticker icon: color + SVG per category slug */
function CategoryIcon({ slug }: { slug?: string }) {
  const cfg: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    "stocks-ru": {
      bg: "bg-blue-100 dark:bg-blue-900/40",
      text: "text-blue-600 dark:text-blue-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
        </svg>
      ),
    },
    commodities: {
      bg: "bg-amber-100 dark:bg-amber-900/40",
      text: "text-amber-600 dark:text-amber-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L6 7h3v6H6l6 5 6-5h-3V7h3L12 2zM4 19h16v2H4v-2z" />
        </svg>
      ),
    },
    currencies: {
      bg: "bg-emerald-100 dark:bg-emerald-900/40",
      text: "text-emerald-600 dark:text-emerald-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
        </svg>
      ),
    },
    crypto: {
      bg: "bg-orange-100 dark:bg-orange-900/40",
      text: "text-orange-600 dark:text-orange-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M9.5 2v2m5-2v2M9.5 20v2m5-2v2M5.5 9H4m1.5 6H4m16-6h-1.5m1.5 6h-1.5" />
          <rect x="7" y="4" width="10" height="16" rx="2" />
          <path d="M9.5 10h5m-5 4h5" />
        </svg>
      ),
    },
    "moex-futures": {
      bg: "bg-violet-100 dark:bg-violet-900/40",
      text: "text-violet-600 dark:text-violet-400",
      icon: (
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M2 20h20M5 20V9l4 3V20M13 20V5l4 6V20" />
        </svg>
      ),
    },
  };

  const style = (slug && cfg[slug]) || cfg["stocks-ru"]!;

  return (
    <div className={`w-7 h-7 rounded-lg ${style.bg} ${style.text} flex items-center justify-center shrink-0`}>
      {style.icon}
    </div>
  );
}

/* ── Collapsible category for sidebar ── */
function CollapsibleCategory({ category, selected, onSelect }: {
  category: Category;
  selected: Instrument | null;
  onSelect: (inst: Instrument) => void;
}) {
  const [open, setOpen] = useState(() => {
    return category.instruments.some((i) => i.id === selected?.id);
  });

  return (
    <div>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
        <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M9 5l7 7-7 7" />
        </svg>
        {category.name}
        <span className="text-[9px] text-gray-300 dark:text-gray-600 ml-auto">{category.instruments.length}</span>
      </button>
      {open && category.instruments.map((inst) => {
        const isSelected = selected?.id === inst.id;
        const hasData = inst.dataSource && inst.dataTicker;
        return (
          <button key={inst.id} onClick={() => { if (hasData) onSelect(inst); }}
            className={`w-full text-left pl-5 pr-2 py-1 text-[11px] flex items-center gap-1 transition ${
              isSelected ? "bg-green-50 dark:bg-green-900/20 text-green-600 font-bold" : hasData ? "hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300" : "opacity-30"
            }`}>
            <span className="font-mono font-semibold truncate">{inst.ticker || "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

const TIMEFRAMES = ["1м", "5м", "15м", "4ч", "1д", "7д", "1мес"] as const;

export default function TerminalPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Instrument | null>(null);
  const [search, setSearch] = useState("");
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showInstrumentPicker, setShowInstrumentPicker] = useState(false);
  const [timeframe, setTimeframe] = useState("15м");
  // bottom panel removed

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then((data: Category[]) => {
        // Terminal: only MOEX (Tinkoff) and Bybit instruments
        const terminalSources = new Set(["moex", "bybit"]);
        const filtered = data
          .map((cat) => ({
            ...cat,
            instruments: cat.instruments.filter((i: Instrument) => i.dataSource && terminalSources.has(i.dataSource)),
          }))
          .filter((cat) => cat.instruments.length > 0);
        setCategories(filtered);
        const all = filtered.flatMap((c) => c.instruments);
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

  function toggleFavorite(instId: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(instId)) next.delete(instId);
      else next.add(instId);
      return next;
    });
  }

  /* Flat list of all instruments for watchlist */
  const allInstruments = categories.flatMap((cat) =>
    cat.instruments.map((inst) => ({ ...inst, catSlug: cat.slug }))
  );

  const filteredInstruments = allInstruments.filter((inst) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      inst.name.toLowerCase().includes(q) ||
      (inst.ticker && inst.ticker.toLowerCase().includes(q))
    );
  });

  /* For instrument picker dropdown — keep categories */
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
      {/* Top instrument bar — 2 rows */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow px-4 py-2 shrink-0">
        {/* Row 1: Ticker + Price + Timeframes + Chart icons */}
        <div className="flex items-center gap-3">
          {/* Instrument selector */}
          <div className="relative">
            <button
              onClick={() => setShowInstrumentPicker(!showInstrumentPicker)}
              className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 transition"
            >
              <div>
                <div className="text-xl font-black dark:text-gray-100 leading-tight tracking-tight">
                  {selected?.ticker || selected?.dataTicker || "—"}
                </div>
                <div className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight">
                  {selected?.name || "Выберите инструмент"}
                </div>
              </div>
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showInstrumentPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowInstrumentPicker(false)} />
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800/30 rounded-xl shadow-lg z-50 w-72 max-h-96 overflow-y-auto">
                  <div className="p-2 border-b border-gray-100 dark:border-gray-800/30 sticky top-0 bg-white dark:bg-gray-900">
                    <input
                      type="text"
                      placeholder="Поиск инструмента..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg text-xs dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500"
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
                            <CategoryIcon slug={cat.slug} />
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
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700/50" />

          {/* Price + Change */}
          {selectedPrice ? (
            <div>
              <div className="text-xl font-bold dark:text-gray-100 leading-tight">
                {formatPrice(selectedPrice.price)}
              </div>
              <div className={`text-xs font-semibold leading-tight ${
                selectedPrice.change > 0 ? "text-green-600" : selectedPrice.change < 0 ? "text-red-500" : "text-gray-400"
              }`}>
                {formatChange(selectedPrice.change)}
              </div>
            </div>
          ) : selected ? (
            <div className="text-xs text-gray-400 animate-pulse">Загрузка...</div>
          ) : null}

          {/* Timeframe buttons */}
          <div className="flex items-center gap-0.5 ml-4">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition ${
                  timeframe === tf
                    ? "bg-green-600 text-white"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Chart type icons */}
          <div className="flex items-center gap-1">
            {/* Candlestick */}
            <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition" title="Свечи">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M9 4v4m0 8v4M9 8h-2a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1V9a1 1 0 00-1-1z" />
                <path d="M17 2v6m0 8v6M17 8h-2a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1V9a1 1 0 00-1-1z" />
              </svg>
            </button>
            {/* Line */}
            <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition" title="Линия">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 17l6-6 4 4 8-8" />
              </svg>
            </button>
            {/* Area */}
            <button className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition" title="Область">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M3 17l6-6 4 4 8-8v11H3z" />
              </svg>
            </button>
          </div>

          {/* Settings */}
          {selected && (
            <Link
              href={`/instruments/${selected.slug}`}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-green-600 dark:hover:text-green-400 transition"
              title="Страница инструмента"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><path d="M15 3h6v6" /><path d="M10 14L21 3" />
              </svg>
            </Link>
          )}
        </div>

        {/* Row 2: OHLCV */}
        {selectedPrice && (
          <div className="flex items-center gap-5 mt-1.5 text-xs">
            {selectedPrice.open != null && (
              <span><span className="text-gray-400 dark:text-gray-500">O</span> <span className="font-medium dark:text-gray-200">{formatPrice(selectedPrice.open)}</span></span>
            )}
            {selectedPrice.high != null && (
              <span><span className="text-gray-400 dark:text-gray-500">H</span> <span className="font-medium text-green-600">{formatPrice(selectedPrice.high)}</span></span>
            )}
            {selectedPrice.low != null && (
              <span><span className="text-gray-400 dark:text-gray-500">L</span> <span className="font-medium text-red-500">{formatPrice(selectedPrice.low)}</span></span>
            )}
            {selectedPrice.volume != null && (
              <span><span className="text-gray-400 dark:text-gray-500">V</span> <span className="font-medium dark:text-gray-200">{formatVol(selectedPrice.volume)}</span></span>
            )}
          </div>
        )}
      </div>

      {/* Middle area: Watchlist left (narrow) + Chart right (full width) */}
      <div className="flex gap-2 flex-1 min-h-0 overflow-hidden">
        {/* Watchlist — narrow sidebar with collapsible categories */}
        <div className="w-48 shrink-0 bg-white dark:bg-gray-900 rounded-xl shadow flex flex-col overflow-hidden">
          <div className="p-2 shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-7 pr-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="text-center py-4 text-gray-400 text-xs">Загрузка...</div>
            ) : search ? (
              filteredInstruments.map((inst) => {
                const isSelected = selected?.id === inst.id;
                const hasData = inst.dataSource && inst.dataTicker;
                return (
                  <button key={inst.id} onClick={() => { if (hasData) setSelected(inst); }}
                    className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-1.5 transition ${
                      isSelected ? "bg-green-50 dark:bg-green-900/20 text-green-600" : hasData ? "hover:bg-gray-50 dark:hover:bg-gray-800 dark:text-gray-300" : "opacity-40"
                    }`}>
                    <span className="font-mono font-bold truncate">{inst.ticker || "—"}</span>
                    <span className="text-[9px] text-gray-400 truncate">{inst.name}</span>
                  </button>
                );
              })
            ) : (
              filteredCategories.map((cat) => (
                <CollapsibleCategory key={cat.id} category={cat} selected={selected} onSelect={(inst) => setSelected(inst)} />
              ))
            )}
          </div>
        </div>

        {/* Chart — full width */}
        <div className="flex-1 overflow-hidden min-w-0">
          {selected && chartSource !== "none" && chartTicker ? (
            <ChartWidget
              key={`${selected.id}-${chartTicker}`}
              ticker={chartTicker}
              source={chartSource}
              name={selected.name}
              height={0}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-900 rounded-xl shadow">
              <div className="text-center">
                <svg className="w-20 h-20 mx-auto mb-4 text-gray-200 dark:text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
                  <path d="M3 3v18h18" /><path d="M7 16l4-4 3 3 4-5" />
                </svg>
                <p className="text-base font-medium text-gray-400 dark:text-gray-500">
                  {selected ? `График ${selected.ticker || selected.dataTicker}` : "Выберите инструмент"}
                </p>
                <p className="text-xs text-gray-300 dark:text-gray-600 mt-1">
                  {selected ? `Таймфрейм: ${timeframe}` : "из списка слева"}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Old watchlist removed — now in left sidebar */}
      </div>

      {/* Bottom panel removed */}
    </div>
  );
}
