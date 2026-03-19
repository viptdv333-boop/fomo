"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  init,
  dispose,
  registerLocale,
  CandleType,
  YAxisType,
  ActionType,
  OverlayMode,
  type Chart,
} from "klinecharts";

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

/* ====== Register Russian locale ====== */
registerLocale("ru-RU", {
  time: "Время",
  open: "Откр",
  high: "Макс",
  low: "Мин",
  close: "Закр",
  volume: "Объём",
  change: "Изм",
  turnover: "Оборот",
});

/* ====== Constants ====== */
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
  { label: "SMA", value: "SMA", isMain: true },
  { label: "BOLL", value: "BOLL", isMain: true },
  { label: "SAR", value: "SAR", isMain: true },
  { label: "VOL", value: "VOL", isMain: false },
  { label: "MACD", value: "MACD", isMain: false },
  { label: "KDJ", value: "KDJ", isMain: false },
  { label: "RSI", value: "RSI", isMain: false },
  { label: "WR", value: "WR", isMain: false },
  { label: "DMI", value: "DMI", isMain: false },
  { label: "OBV", value: "OBV", isMain: false },
  { label: "CCI", value: "CCI", isMain: false },
];

const DRAWING_TOOLS = [
  { label: "Трендовая линия", value: "straightLine", svg: "M4 20L20 4" },
  { label: "Горизонт. уровень", value: "horizontalStraightLine", svg: "M3 12h18" },
  { label: "Луч", value: "rayLine", svg: "M4 17L17 4m0 0h-6m6 0v6" },
  { label: "Отрезок", value: "segment", svg: "M6 18L18 6M6 18h0M18 6h0" },
  { label: "Верт. линия", value: "verticalStraightLine", svg: "M12 3v18" },
  { label: "Ценовая линия", value: "priceLine", svg: "M3 12h12M19 9v6M17 9h4M17 15h4" },
  { label: "Фибоначчи", value: "fibonacciLine", svg: "M3 5h18M3 9h18M3 14h18M3 19h18" },
  { label: "Параллельный канал", value: "parallelStraightLine", svg: "M4 8l16-4M4 20l16-4" },
  { label: "Ценовой канал", value: "priceChannelLine", svg: "M4 6l16 4M4 18l16-4M4 12l16 0" },
];

const CHART_TYPES = [
  { label: "Свечи", value: "candle_solid" },
  { label: "Свечи (полые)", value: "candle_stroke" },
  { label: "Зелёные полые", value: "candle_up_stroke" },
  { label: "Красные полые", value: "candle_down_stroke" },
  { label: "OHLC бары", value: "ohlc" },
  { label: "Область", value: "area" },
];

const YAXIS_TYPES = [
  { label: "Обычная", value: "normal" },
  { label: "Процентная", value: "percentage" },
  { label: "Логарифм.", value: "log" },
];

/* ====== SVG Icons ====== */
const Ico = ({ d, c = "w-3.5 h-3.5" }: { d: string; c?: string }) => (
  <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const IcoIndicator = ({ c = "w-3.5 h-3.5" }: { c?: string }) => (
  <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v18h18" /><path d="M7 16l4-6 4 4 5-8" />
  </svg>
);
const IcoSettings = ({ c = "w-3.5 h-3.5" }: { c?: string }) => (
  <svg className={c} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

/* ====== Toolbar button helper ====== */
function TbBtn({
  active,
  onClick,
  title,
  children,
  className = "",
}: {
  active?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1 rounded transition ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* ====== Component ====== */
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
  const realtimeTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const [interval, setInterval] = useState("D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndicators, setActiveIndicators] = useState<Set<string>>(
    new Set(["MA", "VOL"])
  );
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);
  const [activeDrawing, setActiveDrawing] = useState<string | null>(null);
  const [magnetMode, setMagnetMode] = useState<"normal" | "weak" | "strong">("normal");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [chartType, setChartType] = useState<string>("candle_solid");
  const [yAxisType, setYAxisType] = useState<string>("normal");
  const [crosshairInfo, setCrosshairInfo] = useState<string>("");
  const [resolvedTicker, setResolvedTicker] = useState<string>(ticker);

  // Reset resolved ticker when ticker prop changes
  useEffect(() => {
    setResolvedTicker(ticker);
  }, [ticker]);

  // Close all panels
  const closeAllPanels = useCallback(() => {
    setShowIndicatorPanel(false);
    setShowSettingsPanel(false);
  }, []);

  // Fetch kline data
  const fetchKlines = useCallback(
    async (limit = 500): Promise<{ bars: any[]; resolved: string }> => {
      // Add timestamp to bust browser/CDN cache for realtime requests
      const ts = limit <= 5 ? `&_t=${Date.now()}` : "";
      const res = await fetch(
        `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${interval}&limit=${limit}${ts}`,
        limit <= 5 ? { cache: "no-store" } : undefined
      );
      const json = await res.json();

      // API returns { ticker, source, candles: [...] }
      const candles: KlineItem[] = json.candles ?? json;
      const resolved: string = json.ticker ?? ticker;

      if (!Array.isArray(candles)) return { bars: [], resolved };
      return {
        bars: candles.map((d) => ({
          timestamp: d.timestamp,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume,
        })),
        resolved,
      };
    },
    [source, ticker, interval]
  );

  // Load initial data
  const loadData = useCallback(async () => {
    if (!chartInstance.current) return;
    setLoading(true);
    setError("");

    try {
      const { bars, resolved } = await fetchKlines(500);
      setResolvedTicker(resolved);

      if (bars.length === 0) {
        setError("Нет данных для этого инструмента");
        setLoading(false);
        return;
      }

      // applyNewData with more=true to enable backward loading
      chartInstance.current.applyNewData(bars, true);

      setTimeout(() => chartInstance.current?.resize(), 50);
    } catch {
      setError("Ошибка загрузки данных");
    }
    setLoading(false);
  }, [fetchKlines]);

  // Real-time update: fetch latest bar and update
  const startRealtime = useCallback(() => {
    if (realtimeTimer.current) clearInterval(realtimeTimer.current);

    // Update every 10 sec for intraday, 60 sec for daily+
    const ms = ["1", "5", "15", "60"].includes(interval) ? 10_000 : 60_000;

    realtimeTimer.current = globalThis.setInterval(async () => {
      if (!chartInstance.current) return;
      try {
        const { bars } = await fetchKlines(2);
        if (bars.length > 0) {
          chartInstance.current.updateData(bars[bars.length - 1]);
        }
      } catch {
        /* silent */
      }
    }, ms);
  }, [interval, fetchKlines]);

  // Init chart
  useEffect(() => {
    if (!chartRef.current) return;

    const isDark = document.documentElement.classList.contains("dark");

    const chart = init(chartRef.current, {
      locale: "ru-RU",
      timezone: "Europe/Moscow",
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
        separator: {
          color: isDark ? "#1f2937" : "#e5e7eb",
          activeBackgroundColor: isDark ? "#374151" : "#d1d5db",
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

    chartInstance.current = chart;

    // Set precision based on source
    if (source === "moex") {
      chart.setPriceVolumePrecision(2, 0);
    } else if (source === "bybit") {
      chart.setPriceVolumePrecision(2, 4);
    }

    // Subscribe to crosshair changes for info bar
    chart.subscribeAction(ActionType.OnCrosshairChange, (data: any) => {
      if (data?.kLineData) {
        const d = data.kLineData;
        const ch = d.close - d.open;
        const chPct = d.open !== 0 ? ((ch / d.open) * 100).toFixed(2) : "0";
        const sign = ch >= 0 ? "+" : "";
        setCrosshairInfo(
          `O: ${d.open}  H: ${d.high}  L: ${d.low}  C: ${d.close}  ${sign}${ch.toFixed(2)} (${sign}${chPct}%)  Vol: ${d.volume}`
        );
      } else {
        setCrosshairInfo("");
      }
    });

    // Default indicators
    chart.createIndicator("MA", false, { id: "candle_pane" });
    const volPaneId = chart.createIndicator("VOL");
    if (volPaneId) subPaneIds.current["VOL"] = volPaneId;

    setTimeout(() => chart.resize(), 100);

    return () => {
      if (realtimeTimer.current) clearInterval(realtimeTimer.current);
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

  // Start realtime updates after data loads
  useEffect(() => {
    if (!loading && !error) {
      startRealtime();
    }
    return () => {
      if (realtimeTimer.current) clearInterval(realtimeTimer.current);
    };
  }, [loading, error, startRealtime]);

  // Fullscreen listener
  useEffect(() => {
    const onFsChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      setTimeout(() => chartInstance.current?.resize(), 200);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  /* ====== Actions ====== */
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
        chartInstance.current.createIndicator(ind.value, false, { id: "candle_pane" });
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
      setActiveDrawing(null);
      return;
    }
    // Set overlay mode based on magnet state
    const mode =
      magnetMode === "strong"
        ? OverlayMode.StrongMagnet
        : magnetMode === "weak"
        ? OverlayMode.WeakMagnet
        : OverlayMode.Normal;

    chartInstance.current.createOverlay({
      name: toolName,
      mode,
    });
    setActiveDrawing(toolName);
  }

  function clearAllDrawings() {
    if (!chartInstance.current) return;
    chartInstance.current.removeOverlay();
    setActiveDrawing(null);
  }

  function cycleMagnetMode() {
    const modes: Array<"normal" | "weak" | "strong"> = ["normal", "weak", "strong"];
    const idx = modes.indexOf(magnetMode);
    setMagnetMode(modes[(idx + 1) % 3]);
  }

  function setChartStyle(type: string) {
    if (!chartInstance.current) return;
    setChartType(type);
    chartInstance.current.setStyles({ candle: { type: type as CandleType } });
    closeAllPanels();
  }

  function setYAxis(type: string) {
    if (!chartInstance.current) return;
    setYAxisType(type);
    chartInstance.current.setStyles({ yAxis: { type: type as YAxisType } });
    closeAllPanels();
  }

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      try { await wrapperRef.current.requestFullscreen(); } catch { /* */ }
    } else {
      await document.exitFullscreen();
    }
  }

  function takeScreenshot() {
    if (!chartInstance.current) return;
    const url = chartInstance.current.getConvertPictureUrl(true, "image/png", "#ffffff");
    if (!url) return;
    const link = document.createElement("a");
    link.download = `${ticker}_${interval}_chart.png`;
    link.href = url;
    link.click();
  }

  function scrollToLatest() {
    chartInstance.current?.scrollToRealTime(300);
  }

  function zoomIn() {
    chartInstance.current?.zoomAtCoordinate(1.2, undefined, 200);
  }

  function zoomOut() {
    chartInstance.current?.zoomAtCoordinate(0.8, undefined, 200);
  }

  /* ====== Render ====== */
  return (
    <div
      ref={wrapperRef}
      className={`bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col ${
        isFullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: isFullscreen ? "100vh" : height > 0 ? height : "100%" }}
    >
      {/* Top Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
        {/* Ticker badge */}
        {name && (
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white">{(name || "")[0]}</span>
            </div>
            <span className="text-xs font-bold dark:text-gray-100">{resolvedTicker}</span>
            {resolvedTicker !== ticker && (
              <span className="text-[9px] text-gray-400 font-mono">({ticker})</span>
            )}
          </div>
        )}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Timeframes */}
        {INTERVALS.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setInterval(tf.value)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              interval === tf.value
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {tf.label}
          </button>
        ))}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Indicator button */}
        <div className="relative">
          <button
            onClick={() => { setShowIndicatorPanel(!showIndicatorPanel); setShowSettingsPanel(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              showIndicatorPanel ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <IcoIndicator />
            Индикаторы
          </button>
          {showIndicatorPanel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowIndicatorPanel(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1 max-h-80 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Основные</div>
                {INDICATORS.filter((i) => i.isMain).map((ind) => (
                  <button key={ind.value} onClick={() => toggleIndicator(ind)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeIndicators.has(ind.value) ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}>
                    <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${
                      activeIndicators.has(ind.value) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"
                    }`}>{activeIndicators.has(ind.value) ? "\u2713" : ""}</span>
                    {ind.label}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700 mt-1 pt-1 px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Подвальные</div>
                {INDICATORS.filter((i) => !i.isMain).map((ind) => (
                  <button key={ind.value} onClick={() => toggleIndicator(ind)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeIndicators.has(ind.value) ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}>
                    <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${
                      activeIndicators.has(ind.value) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"
                    }`}>{activeIndicators.has(ind.value) ? "\u2713" : ""}</span>
                    {ind.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Timezone display */}
        <span className="text-[10px] text-gray-400 font-mono hidden sm:inline">MSK</span>

        {/* Settings dropdown (chart type + Y-axis) */}
        <div className="relative">
          <TbBtn active={showSettingsPanel} onClick={() => { setShowSettingsPanel(!showSettingsPanel); setShowIndicatorPanel(false); }} title="Настройки">
            <IcoSettings />
          </TbBtn>
          {showSettingsPanel && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPanel(false)} />
              <div className="absolute top-full right-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1">
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Тип графика</div>
                {CHART_TYPES.map((ct) => (
                  <button key={ct.value} onClick={() => setChartStyle(ct.value)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      chartType === ct.value ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}>
                    {chartType === ct.value ? "\u2713 " : "  "}{ct.label}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700 mt-1 pt-1 px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Шкала Y</div>
                {YAXIS_TYPES.map((yt) => (
                  <button key={yt.value} onClick={() => setYAxis(yt.value)}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      yAxisType === yt.value ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}>
                    {yAxisType === yt.value ? "\u2713 " : "  "}{yt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Screenshot */}
        <TbBtn onClick={takeScreenshot} title="Скриншот">
          <Ico d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 13a4 4 0 100-8 4 4 0 000 8z" />
        </TbBtn>

        {/* Fullscreen */}
        <TbBtn onClick={toggleFullscreen} title={isFullscreen ? "Выйти" : "Полный экран"}>
          <Ico d={isFullscreen
            ? "M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"
            : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
          } />
        </TbBtn>

        {/* Source badge */}
        <span className="ml-auto text-[10px] text-gray-400 font-mono">
          {source === "moex" ? "MOEX" : source === "bybit" ? "Bybit" : ""}
        </span>
      </div>

      {/* Crosshair info bar */}
      {crosshairInfo && (
        <div className="px-2 py-0.5 text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 shrink-0 truncate">
          {crosshairInfo}
        </div>
      )}

      {/* Body: Left drawing sidebar + Chart + Right controls */}
      <div className="flex flex-1 min-h-0">
        {/* Left Drawing Tools Sidebar */}
        <div className="w-9 shrink-0 border-r dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-col items-center py-1.5 gap-0.5 overflow-y-auto">
          {DRAWING_TOOLS.map((tool) => (
            <button
              key={tool.value}
              onClick={() => selectDrawingTool(tool.value)}
              className={`w-7 h-7 rounded flex items-center justify-center transition group relative ${
                activeDrawing === tool.value
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              title={tool.label}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={tool.svg} />
              </svg>
              <span className="absolute left-full ml-2 px-2 py-1 text-[10px] font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                {tool.label}
              </span>
            </button>
          ))}

          <div className="w-5 h-px bg-gray-200 dark:bg-gray-700 my-1" />

          {/* Magnet mode toggle */}
          <button
            onClick={cycleMagnetMode}
            className={`w-7 h-7 rounded flex items-center justify-center transition group relative ${
              magnetMode !== "normal"
                ? "bg-amber-500 text-white"
                : "text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
            title={`Магнит: ${magnetMode === "normal" ? "Выкл" : magnetMode === "weak" ? "Слабый" : "Сильный"}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 3v6a6 6 0 0012 0V3M6 3h3M18 3h-3M6 9h3M18 9h-3" />
            </svg>
            {magnetMode !== "normal" && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full text-[6px] text-amber-900 font-bold flex items-center justify-center">
                {magnetMode === "weak" ? "1" : "2"}
              </span>
            )}
            <span className="absolute left-full ml-2 px-2 py-1 text-[10px] font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              Магнит: {magnetMode === "normal" ? "Выкл" : magnetMode === "weak" ? "Слабый" : "Сильный"}
            </span>
          </button>

          <div className="w-5 h-px bg-gray-200 dark:bg-gray-700 my-1" />

          {/* Clear drawings */}
          <button
            onClick={clearAllDrawings}
            className="w-7 h-7 rounded flex items-center justify-center text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 transition group relative"
            title="Удалить все рисунки"
          >
            <Ico d="M3 6h18M8 6V4h8v2m-7 5v6m4-6v6M5 6l1 14h12l1-14" />
            <span className="absolute left-full ml-2 px-2 py-1 text-[10px] font-medium bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              Удалить все
            </span>
          </button>
        </div>

        {/* Chart area */}
        <div className="relative flex-1 min-h-0 min-w-0">
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

          {/* Floating controls: zoom + scroll to latest */}
          <div className="absolute bottom-12 right-2 flex flex-col gap-1 z-10">
            <button onClick={zoomIn} className="w-7 h-7 rounded bg-white/90 dark:bg-gray-800/90 shadow border dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center text-sm font-bold transition" title="Приблизить">+</button>
            <button onClick={zoomOut} className="w-7 h-7 rounded bg-white/90 dark:bg-gray-800/90 shadow border dark:border-gray-700 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center justify-center text-sm font-bold transition" title="Отдалить">&minus;</button>
            <button onClick={scrollToLatest} className="w-7 h-7 rounded bg-white/90 dark:bg-gray-800/90 shadow border dark:border-gray-700 text-gray-500 hover:text-blue-600 flex items-center justify-center transition" title="К последней цене">
              <Ico d="M13 17l5-5-5-5M6 17l5-5-5-5" c="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
