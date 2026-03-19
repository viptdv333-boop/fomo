"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, type Chart } from "klinecharts";

export type DataSource = "moex" | "bybit" | "none";

interface KlineChartWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

interface KlineItem {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const INTERVALS = [
  { label: "1м", value: "1" },
  { label: "5м", value: "5" },
  { label: "15м", value: "15" },
  { label: "1ч", value: "60" },
  { label: "4ч", value: "240" },
  { label: "Д", value: "D" },
  { label: "Н", value: "W" },
  { label: "М", value: "M" },
];

const INDICATORS = [
  { label: "MA", value: "MA", isMain: true },
  { label: "EMA", value: "EMA", isMain: true },
  { label: "BOLL", value: "BOLL", isMain: true },
  { label: "SAR", value: "SAR", isMain: true },
  { label: "VOL", value: "VOL", isMain: false },
  { label: "MACD", value: "MACD", isMain: false },
  { label: "KDJ", value: "KDJ", isMain: false },
  { label: "RSI", value: "RSI", isMain: false },
  { label: "WR", value: "WR", isMain: false },
  { label: "DMI", value: "DMI", isMain: false },
  { label: "OBV", value: "OBV", isMain: false },
];

export default function KlineChartWidget({
  ticker,
  source,
  name,
  height = 500,
}: KlineChartWidgetProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const subPaneIds = useRef<Record<string, string>>({});
  const [interval, setInterval] = useState("D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(["MA", "VOL"])
  );
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);

  // Fetch data via our server-side proxy (avoids CORS)
  const loadData = useCallback(async () => {
    if (!chartInstance.current) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${interval}&limit=300`
      );
      const data: KlineItem[] = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        setError("Нет данных для этого инструмента");
        setLoading(false);
        return;
      }

      chartInstance.current.applyNewData(
        data.map((d) => ({
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        }))
      );
    } catch {
      setError("Ошибка загрузки данных");
    }

    setLoading(false);
  }, [source, ticker, interval]);

  // Init chart
  useEffect(() => {
    if (!chartRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    chartInstance.current = init(chartRef.current, {
      styles: {
        grid: {
          show: true,
          horizontal: { color: isDark ? "#1f2937" : "#f3f4f6" },
          vertical: { color: isDark ? "#1f2937" : "#f3f4f6" },
        },
        candle: {
          bar: {
            upColor: "#22c55e",
            downColor: "#ef4444",
            upBorderColor: "#22c55e",
            downBorderColor: "#ef4444",
            upWickColor: "#22c55e",
            downWickColor: "#ef4444",
          },
          priceMark: {
            high: { color: "#22c55e" },
            low: { color: "#ef4444" },
            last: {
              upColor: "#22c55e",
              downColor: "#ef4444",
              noChangeColor: "#888",
            },
          },
          tooltip: {
            text: { color: isDark ? "#d1d5db" : "#374151" },
          },
        },
        indicator: {
          ohlc: {
            upColor: "#22c55e",
            downColor: "#ef4444",
            noChangeColor: "#888",
          },
        },
        xAxis: {
          tickText: { color: isDark ? "#6b7280" : "#9ca3af" },
        },
        yAxis: {
          tickText: { color: isDark ? "#6b7280" : "#9ca3af" },
        },
        crosshair: {
          horizontal: {
            line: { color: isDark ? "#4b5563" : "#d1d5db" },
            text: {
              backgroundColor: isDark ? "#374151" : "#e5e7eb",
              color: isDark ? "#d1d5db" : "#374151",
            },
          },
          vertical: {
            line: { color: isDark ? "#4b5563" : "#d1d5db" },
            text: {
              backgroundColor: isDark ? "#374151" : "#e5e7eb",
              color: isDark ? "#d1d5db" : "#374151",
            },
          },
        },
      },
    }) as Chart;

    // Default indicators
    chartInstance.current.createIndicator("MA", false, { id: "candle_pane" });
    const volPaneId = chartInstance.current.createIndicator("VOL");
    if (volPaneId) subPaneIds.current["VOL"] = volPaneId;

    return () => {
      if (chartRef.current) {
        dispose(chartRef.current);
        chartInstance.current = null;
        subPaneIds.current = {};
      }
    };
  }, []);

  // Load data when ticker/interval changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleIndicator(ind: { value: string; isMain: boolean }) {
    if (!chartInstance.current) return;

    const next = new Set(activeIndicators);

    if (next.has(ind.value)) {
      next.delete(ind.value);
      if (ind.isMain) {
        chartInstance.current.removeIndicator("candle_pane", ind.value);
      } else {
        const paneId = subPaneIds.current[ind.value];
        if (paneId) {
          chartInstance.current.removeIndicator(paneId, ind.value);
          delete subPaneIds.current[ind.value];
        }
      }
    } else {
      next.add(ind.value);
      if (ind.isMain) {
        chartInstance.current.createIndicator(ind.value, false, {
          id: "candle_pane",
        });
      } else {
        const paneId = chartInstance.current.createIndicator(ind.value);
        if (paneId) subPaneIds.current[ind.value] = paneId;
      }
    }

    setActiveIndicators(next);
  }

  // Compute effective height for chart container
  const containerStyle = height > 0 ? { height } : { height: "100%" };

  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col"
      style={height > 0 ? undefined : { height: "100%" }}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-wrap shrink-0">
        {name && (
          <>
            <span className="text-xs font-semibold dark:text-gray-100 mr-1">
              {name}
            </span>
            <span className="text-[10px] font-mono text-gray-400 mr-2">
              {ticker}
            </span>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
          </>
        )}

        {INTERVALS.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setInterval(tf.value)}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              interval === tf.value
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tf.label}
          </button>
        ))}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />

        <div className="relative">
          <button
            onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              showIndicatorPanel
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Индикаторы ({activeIndicators.size})
          </button>

          {showIndicatorPanel && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowIndicatorPanel(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[200px]">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">
                  На графике
                </div>
                {INDICATORS.filter((i) => i.isMain).map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => toggleIndicator(ind)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeIndicators.has(ind.value)
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {activeIndicators.has(ind.value) ? "✓ " : ""}
                    {ind.label}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700 px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">
                  Подвальные
                </div>
                {INDICATORS.filter((i) => !i.isMain).map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => toggleIndicator(ind)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeIndicators.has(ind.value)
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {activeIndicators.has(ind.value) ? "✓ " : ""}
                    {ind.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <span className="ml-auto text-[10px] text-gray-400 font-mono">
          {source === "moex" ? "MOEX" : source === "bybit" ? "Bybit" : ""}
        </span>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-h-0" style={containerStyle}>
        <div ref={chartRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
            <div className="text-sm text-gray-500">Загрузка...</div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
            <div className="text-center">
              <div className="text-2xl mb-2">📊</div>
              <div className="text-sm text-gray-500">{error}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
