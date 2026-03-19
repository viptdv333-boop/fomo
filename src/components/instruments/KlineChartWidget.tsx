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

const DRAWING_TOOLS = [
  { label: "Трендовая линия", value: "straightLine", icon: "📏" },
  { label: "Горизонтальный уровень", value: "horizontalStraightLine", icon: "➖" },
  { label: "Луч", value: "rayLine", icon: "↗" },
  { label: "Отрезок", value: "segment", icon: "📐" },
  { label: "Горизонтальный отрезок", value: "horizontalSegment", icon: "↔" },
  { label: "Вертикальная линия", value: "verticalStraightLine", icon: "│" },
  { label: "Ценовая линия", value: "priceLine", icon: "💰" },
  { label: "Фибоначчи", value: "fibonacciLine", icon: "🔢" },
  { label: "Параллельный канал", value: "parallelStraightLine", icon: "═" },
  { label: "Ценовой канал", value: "priceChannelLine", icon: "📊" },
];

export default function KlineChartWidget({
  ticker,
  source,
  name,
  height = 500,
}: KlineChartWidgetProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<Chart | null>(null);
  const subPaneIds = useRef<Record<string, string>>({});
  const [interval, setInterval] = useState("D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(["MA", "VOL"])
  );
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [showDrawingPanel, setShowDrawingPanel] = useState(false);
  const [activeDrawing, setActiveDrawing] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

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

      // Force resize after data load to ensure chart fills container
      setTimeout(() => {
        chartInstance.current?.resize();
      }, 50);
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
        overlay: {
          line: { color: "#2563eb" },
          point: {
            color: "#2563eb",
            borderColor: "#2563eb",
            activeColor: "#3b82f6",
            activeBorderColor: "#3b82f6",
          },
        },
      },
    }) as Chart;

    // Default indicators
    chartInstance.current.createIndicator("MA", false, { id: "candle_pane" });
    const volPaneId = chartInstance.current.createIndicator("VOL");
    if (volPaneId) subPaneIds.current["VOL"] = volPaneId;

    // Ensure chart sizes itself correctly after mount
    setTimeout(() => {
      chartInstance.current?.resize();
    }, 100);

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

  // Listen for fullscreen change
  useEffect(() => {
    const onFsChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      // Resize chart after fullscreen transition
      setTimeout(() => {
        chartInstance.current?.resize();
      }, 200);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

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

  function selectDrawingTool(toolName: string) {
    if (!chartInstance.current) return;

    if (activeDrawing === toolName) {
      // Deselect
      setActiveDrawing(null);
      return;
    }

    chartInstance.current.createOverlay(toolName);
    setActiveDrawing(toolName);
    setShowDrawingPanel(false);
  }

  function clearAllDrawings() {
    if (!chartInstance.current) return;
    chartInstance.current.removeOverlay();
    setActiveDrawing(null);
  }

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await wrapperRef.current.requestFullscreen();
      } catch {
        // Fullscreen not supported
      }
    } else {
      await document.exitFullscreen();
    }
  }

  return (
    <div
      ref={wrapperRef}
      className={`bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col ${
        isFullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: isFullscreen ? "100vh" : height > 0 ? height : "100%" }}
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

        {/* Indicators dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowIndicatorPanel(!showIndicatorPanel);
              setShowDrawingPanel(false);
            }}
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
                    {activeIndicators.has(ind.value) ? "\u2713 " : ""}
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
                    {activeIndicators.has(ind.value) ? "\u2713 " : ""}
                    {ind.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Drawing tools dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowDrawingPanel(!showDrawingPanel);
              setShowIndicatorPanel(false);
            }}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              showDrawingPanel || activeDrawing
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title="Инструменты рисования"
          >
            <svg className="w-3.5 h-3.5 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            {" "}Рисование
          </button>

          {showDrawingPanel && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowDrawingPanel(false)}
              />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg z-50 min-w-[220px]">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase">
                  Линии и уровни
                </div>
                {DRAWING_TOOLS.map((tool) => (
                  <button
                    key={tool.value}
                    onClick={() => selectDrawingTool(tool.value)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeDrawing === tool.value
                        ? "text-blue-600 dark:text-blue-400 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span className="mr-2">{tool.icon}</span>
                    {tool.label}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700">
                  <button
                    onClick={() => {
                      clearAllDrawings();
                      setShowDrawingPanel(false);
                    }}
                    className="block w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium"
                  >
                    Удалить все рисунки
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right side: source + fullscreen */}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-mono">
            {source === "moex" ? "MOEX" : source === "bybit" ? "Bybit" : ""}
          </span>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            title={isFullscreen ? "Выйти из полноэкранного режима" : "Полный экран"}
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Chart area */}
      <div className="relative flex-1 min-h-0">
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
