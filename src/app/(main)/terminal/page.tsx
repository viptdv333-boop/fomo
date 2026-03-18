"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

interface Instrument {
  id: string;
  name: string;
  slug: string;
  ticker: string | null;
  exchange: string | null;
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
  const [allInstruments, setAllInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState("");
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/categories?withInstruments=true")
      .then((r) => r.json())
      .then((data: Category[]) => {
        setCategories(data);
        const all = data.flatMap((c) => c.instruments);
        setAllInstruments(all);
        // Expand all categories by default
        setExpandedCats(new Set(data.map((c) => c.id)));
        // Select first instrument with tradingViewSymbol
        const first = all.find((i) => i.tradingViewSymbol);
        if (first) {
          setSelectedSymbol(first.tradingViewSymbol);
          setSelectedName(first.name);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Render TradingView chart
  useEffect(() => {
    if (!chartRef.current || !selectedSymbol) return;
    chartRef.current.innerHTML = "";

    const isDark = document.documentElement.classList.contains("dark");

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.height = "100%";
    wrapper.style.width = "100%";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "calc(100% - 32px)";
    inner.style.width = "100%";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbol: selectedSymbol,
      interval: "D",
      timezone: "Europe/Moscow",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "ru",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      withdateranges: true,
      details: true,
      hotlist: true,
      calendar: false,
      studies: ["STD;SMA", "STD;RSI"],
      width: "100%",
      height: "100%",
    });

    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    chartRef.current.appendChild(wrapper);

    return () => {
      if (chartRef.current) chartRef.current.innerHTML = "";
    };
  }, [selectedSymbol]);

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
                {/* Category header */}
                <button
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hover:bg-gray-100 dark:hover:bg-gray-800 transition"
                >
                  <span>{cat.name}</span>
                  <span className="text-gray-400">{expandedCats.has(cat.id) ? "▾" : "▸"}</span>
                </button>

                {/* Instruments */}
                {expandedCats.has(cat.id) &&
                  cat.instruments.map((inst) => {
                    const isSelected = inst.tradingViewSymbol === selectedSymbol;
                    return (
                      <button
                        key={inst.id}
                        onClick={() => {
                          if (inst.tradingViewSymbol) {
                            setSelectedSymbol(inst.tradingViewSymbol);
                            setSelectedName(inst.name);
                          }
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500"
                            : "hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-transparent"
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className={`text-xs font-medium truncate ${isSelected ? "text-blue-600 dark:text-blue-400" : "dark:text-gray-100"}`}>
                            {inst.name}
                          </div>
                          <div className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                            {inst.ticker || inst.tradingViewSymbol || "—"}
                          </div>
                        </div>
                        <Link
                          href={`/instruments/${inst.slug}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-[10px] text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                          title="Открыть страницу инструмента"
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
      <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-800 overflow-hidden flex flex-col">
        {/* Chart header */}
        <div className="flex items-center justify-between px-4 py-2 border-b dark:border-gray-800">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold dark:text-gray-100">{selectedName || "Выберите инструмент"}</h3>
            {selectedSymbol && (
              <span className="text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                {selectedSymbol}
              </span>
            )}
          </div>
          {selectedSymbol && (
            <Link
              href={`/instruments/${allInstruments.find((i) => i.tradingViewSymbol === selectedSymbol)?.slug || ""}`}
              className="text-xs text-blue-600 hover:underline"
            >
              Открыть страницу →
            </Link>
          )}
        </div>

        {/* TradingView chart */}
        {selectedSymbol ? (
          <div ref={chartRef} className="flex-1" />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
            <div className="text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-sm">Выберите инструмент из списка слева</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
