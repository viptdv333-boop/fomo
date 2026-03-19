"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { init, dispose, registerLocale, type Chart, type KLineData } from "klinecharts";

export type DataSource = "moex" | "none";

interface Props {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

/* ── Russian locale ── */
registerLocale("ru", {
  time: "Время：",
  open: "Откр：",
  high: "Макс：",
  low: "Мин：",
  close: "Закр：",
  volume: "Объём：",
  turnover: "Оборот：",
  change: "Изм：",
});

/* ── Timeframes ── */
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

/* ── Chart types ── */
const CHART_TYPES = [
  { label: "Свечи", value: "candle_solid" },
  { label: "OHLC", value: "ohlc" },
  { label: "Линия", value: "area" },
];

/* ── Available indicators (main pane) ── */
const MAIN_INDICATORS = [
  { label: "MA", value: "MA", params: { calcParams: [5, 10, 20, 60] } },
  { label: "EMA", value: "EMA", params: { calcParams: [5, 10, 20, 60] } },
  { label: "BOLL", value: "BOLL", params: { calcParams: [20, 2] } },
  { label: "SAR", value: "SAR", params: {} },
];

/* ── Available indicators (sub pane) ── */
const SUB_INDICATORS = [
  { label: "VOL", value: "VOL", params: {} },
  { label: "MACD", value: "MACD", params: { calcParams: [12, 26, 9] } },
  { label: "RSI", value: "RSI", params: { calcParams: [6, 12, 24] } },
  { label: "KDJ", value: "KDJ", params: { calcParams: [9, 3, 3] } },
  { label: "ATR", value: "ATR", params: { calcParams: [14] } },
  { label: "CCI", value: "CCI", params: { calcParams: [20] } },
  { label: "WR", value: "WR", params: { calcParams: [6, 10, 14] } },
  { label: "DMI", value: "DMI", params: { calcParams: [14, 6] } },
];

/* ── Drawing tools ── */
const DRAWING_TOOLS = [
  { label: "─", value: "horizontalSegment", title: "Горизонтальная линия" },
  { label: "╲", value: "segment", title: "Отрезок" },
  { label: "↕", value: "verticalSegment", title: "Вертикальная линия" },
  { label: "⟋", value: "rayLine", title: "Луч" },
  { label: "▭", value: "rect", title: "Прямоугольник" },
  { label: "⊕", value: "circle", title: "Окружность" },
  { label: "∥", value: "parallelStraightLine", title: "Параллельный канал" },
  { label: "△", value: "triangle", title: "Треугольник" },
  { label: "%", value: "fibonacciLine", title: "Уровни Фибоначчи" },
];

/* ── Compute current period timestamp (seconds) ── */
function getCurrentPeriodTimestamp(tf: string): number {
  const now = Date.now();
  const s = Math.floor(now / 1000);
  switch (tf) {
    case "1": return Math.floor(s / 60) * 60;
    case "5": return Math.floor(s / 300) * 300;
    case "15": return Math.floor(s / 900) * 900;
    case "60": return Math.floor(s / 3600) * 3600;
    case "240": return Math.floor(s / 14400) * 14400;
    case "D": {
      const d = new Date(now);
      const msk = new Date(d.getTime() + 3 * 3600_000);
      msk.setUTCHours(0, 0, 0, 0);
      return Math.floor((msk.getTime() - 3 * 3600_000) / 1000);
    }
    case "W": {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
      return Math.floor(d.getTime() / 1000);
    }
    case "M": {
      const d = new Date(now);
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    }
    default: return Math.floor(s / 86400) * 86400;
  }
}

export default function KlineChartWidget({ ticker, source, name, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const rtTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBarTs = useRef<number>(0);

  const [tf, setTf] = useState("D");
  const [chartType, setChartType] = useState("candle_solid");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState(ticker);
  const [fullscreen, setFullscreen] = useState(false);
  const [mainInds, setMainInds] = useState<Set<string>>(new Set());
  const [subInds, setSubInds] = useState<Set<string>>(new Set(["VOL"]));
  const [showIndMenu, setShowIndMenu] = useState(false);
  const [showDrawMenu, setShowDrawMenu] = useState(false);
  const [showChartType, setShowChartType] = useState(false);
  const [activeDraw, setActiveDraw] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);

  /* ── Fetch historical candles from /api/klines ── */
  const fetchCandles = useCallback(async (): Promise<{ data: KLineData[]; resolved: string }> => {
    const r = await fetch(
      `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${tf}&limit=500`
    );
    const j = await r.json();
    const c = j.candles ?? j;
    if (!Array.isArray(c)) return { data: [], resolved: j.ticker ?? ticker };
    return {
      data: c.map((d: any) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume || 0,
      })),
      resolved: j.ticker ?? ticker,
    };
  }, [source, ticker, tf]);

  /* ── Apply indicators to chart ── */
  const applyIndicators = useCallback((chart: Chart, main: Set<string>, sub: Set<string>) => {
    // Remove existing overlays from main pane
    const allMain = MAIN_INDICATORS.map(i => i.value);
    allMain.forEach(name => {
      try { chart.removeIndicator("candle_pane", name); } catch { /* ok */ }
    });
    // Add active main indicators
    main.forEach(name => {
      chart.createIndicator(name, false, { id: "candle_pane" });
    });

    // For sub indicators — remove all sub panes first, then re-add active ones
    const allSub = SUB_INDICATORS.map(i => i.value);
    allSub.forEach(name => {
      try { chart.removeIndicator(name); } catch { /* ok */ }
    });
    sub.forEach(name => {
      chart.createIndicator(name, false);
    });
  }, []);

  /* ── Load data into chart ── */
  const loadData = useCallback(async () => {
    const chart = chartRef.current;
    if (!chart) return;
    setLoading(true);
    setError("");
    try {
      const { data, resolved: r } = await fetchCandles();
      setResolved(r);
      if (data.length === 0) {
        setError("Нет данных");
        setLoading(false);
        return;
      }
      chart.applyNewData(data);
      lastBarTs.current = data[data.length - 1].timestamp;
      applyIndicators(chart, mainInds, subInds);
    } catch {
      setError("Ошибка загрузки");
    }
    setLoading(false);
  }, [fetchCandles, applyIndicators, mainInds, subInds]);

  /* ── Start realtime updates via Tinkoff /api/quote ── */
  const startRealtime = useCallback(() => {
    if (rtTimer.current) clearInterval(rtTimer.current);
    const ms = ["1", "5", "15", "60"].includes(tf) ? 5000 : 15000;

    rtTimer.current = setInterval(async () => {
      const chart = chartRef.current;
      if (!chart) return;
      try {
        const r = await fetch(
          `/api/quote?source=${source}&ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const q = await r.json();
        if (!q.price) return;

        const curPeriod = getCurrentPeriodTimestamp(tf) * 1000; // KlineChart uses ms

        if (curPeriod > lastBarTs.current) {
          // New candle
          const newBar: KLineData = {
            timestamp: curPeriod,
            open: q.price,
            high: q.price,
            low: q.price,
            close: q.price,
            volume: q.volume || 0,
          };
          lastBarTs.current = curPeriod;
          chart.updateData(newBar);
        } else {
          // Update last candle — open is required by KLineData type
          chart.updateData({
            timestamp: lastBarTs.current,
            open: q.price,
            close: q.price,
            high: q.price,
            low: q.price,
            volume: q.volume || 0,
          });
        }
      } catch { /* silent */ }
    }, ms);
  }, [tf, source, ticker]);

  /* ── Initialize chart ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const chartId = `kline-${ticker}-${Date.now()}`;
    containerRef.current.id = chartId;

    const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

    const chart = init(chartId, {
      locale: "ru",
      timezone: "Europe/Moscow",
      styles: {
        grid: {
          show: true,
          horizontal: {
            color: dark ? "#1f293780" : "#f3f4f680",
          },
          vertical: {
            color: dark ? "#1f293780" : "#f3f4f680",
          },
        },
        candle: {
          type: chartType as any,
          priceMark: {
            last: {
              show: true,
              upColor: "#22c55e",
              downColor: "#ef4444",
              noChangeColor: "#888888",
            },
          },
          bar: {
            upColor: "#22c55e",
            downColor: "#ef4444",
            noChangeColor: "#888888",
            upBorderColor: "#22c55e",
            downBorderColor: "#ef4444",
            noChangeBorderColor: "#888888",
            upWickColor: "#22c55e",
            downWickColor: "#ef4444",
            noChangeWickColor: "#888888",
          },
          tooltip: {
            showRule: "always" as const,
            showType: "standard" as const,
          },
        },
        indicator: {
          lastValueMark: {
            show: true,
          },
        },
        xAxis: {
          show: true,
        },
        yAxis: {
          show: true,
        },
        crosshair: {
          show: true,
          horizontal: {
            show: true,
            line: {
              show: true,
              style: "dashed" as any,
              color: dark ? "#6b7280" : "#9ca3af",
            },
            text: {
              show: true,
              color: "#ffffff",
              backgroundColor: dark ? "#4b5563" : "#6b7280",
            },
          },
          vertical: {
            show: true,
            line: {
              show: true,
              style: "dashed" as any,
              color: dark ? "#6b7280" : "#9ca3af",
            },
            text: {
              show: true,
              color: "#ffffff",
              backgroundColor: dark ? "#4b5563" : "#6b7280",
            },
          },
        },
      },
    });

    if (!chart) return;
    chartRef.current = chart;

    return () => {
      if (rtTimer.current) clearInterval(rtTimer.current);
      dispose(chartId);
      chartRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Reload on ticker/tf change ── */
  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Start realtime after data loads ── */
  useEffect(() => {
    if (!loading && !error) startRealtime();
    return () => {
      if (rtTimer.current) clearInterval(rtTimer.current);
    };
  }, [loading, error, startRealtime]);

  /* ── Chart type change ── */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles({
      candle: { type: chartType as any },
    });
  }, [chartType]);

  /* ── Fullscreen listener ── */
  useEffect(() => {
    const handler = () => {
      setFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        chartRef.current?.resize();
      }, 200);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ── Resize observer ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      chartRef.current?.resize();
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── Toggle main indicator ── */
  function toggleMainInd(name: string) {
    const next = new Set(mainInds);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setMainInds(next);
    if (chartRef.current) applyIndicators(chartRef.current, next, subInds);
  }

  /* ── Toggle sub indicator ── */
  function toggleSubInd(name: string) {
    const next = new Set(subInds);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSubInds(next);
    if (chartRef.current) applyIndicators(chartRef.current, mainInds, next);
  }

  /* ── Drawing tool ── */
  function selectDrawing(tool: string) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeDraw === tool) {
      setActiveDraw(null);
      return;
    }
    chart.createOverlay(tool);
    setActiveDraw(tool);
    setShowDrawMenu(false);
  }

  /* ── Remove all overlays ── */
  function clearDrawings() {
    chartRef.current?.removeOverlay();
    setActiveDraw(null);
  }

  /* ── Fullscreen ── */
  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      try { await wrapperRef.current.requestFullscreen(); } catch { /* */ }
    } else {
      await document.exitFullscreen();
    }
  }

  /* ── Screenshot ── */
  function takeScreenshot() {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getConvertPictureUrl(true, "jpeg", "#111827");
    const link = document.createElement("a");
    link.download = `${ticker}_${tf}.jpg`;
    link.href = url;
    link.click();
  }

  /* ── Zoom controls ── */
  function zoomIn() {
    chartRef.current?.zoomAtCoordinate(1.2, { x: 0, y: 0 });
  }
  function zoomOut() {
    chartRef.current?.zoomAtCoordinate(0.8, { x: 0, y: 0 });
  }
  function fitContent() {
    chartRef.current?.scrollToRealTime();
  }

  /* ── Render ── */
  return (
    <div
      ref={wrapperRef}
      className={`bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col ${
        fullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: fullscreen ? "100vh" : height > 0 ? height : "100%" }}
    >
      {/* ══════ TOP TOOLBAR ══════ */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 flex-wrap">
        {/* Ticker badge */}
        {name && (
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white">{(name || "")[0]}</span>
            </div>
            <span className="text-xs font-bold dark:text-gray-100">{resolved}</span>
            {resolved !== ticker && (
              <span className="text-[9px] text-gray-400 font-mono">({ticker})</span>
            )}
          </div>
        )}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Timeframes */}
        {INTERVALS.map((i) => (
          <button
            key={i.value}
            onClick={() => setTf(i.value)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              tf === i.value
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {i.label}
          </button>
        ))}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Chart type dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowChartType(!showChartType); setShowIndMenu(false); setShowDrawMenu(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              showChartType ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="14" y="6" width="3" height="12" />
            </svg>
            Тип
          </button>
          {showChartType && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowChartType(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px] py-1">
                {CHART_TYPES.map((ct) => (
                  <button
                    key={ct.value}
                    onClick={() => { setChartType(ct.value); setShowChartType(false); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      chartType === ct.value ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Indicators dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowIndMenu(!showIndMenu); setShowDrawMenu(false); setShowChartType(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              showIndMenu ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3v18h18" /><path d="M7 16l4-6 4 4 5-8" />
            </svg>
            Индикаторы
          </button>
          {showIndMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowIndMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1 max-h-80 overflow-y-auto">
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">На графике</div>
                {MAIN_INDICATORS.map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => toggleMainInd(ind.value)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      mainInds.has(ind.value) ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${
                      mainInds.has(ind.value) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"
                    }`}>
                      {mainInds.has(ind.value) ? "✓" : ""}
                    </span>
                    {ind.label}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700 mt-1 pt-1" />
                <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Панели</div>
                {SUB_INDICATORS.map((ind) => (
                  <button
                    key={ind.value}
                    onClick={() => toggleSubInd(ind.value)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      subInds.has(ind.value) ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${
                      subInds.has(ind.value) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"
                    }`}>
                      {subInds.has(ind.value) ? "✓" : ""}
                    </span>
                    {ind.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Drawing tools dropdown */}
        <div className="relative">
          <button
            onClick={() => { setShowDrawMenu(!showDrawMenu); setShowIndMenu(false); setShowChartType(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              showDrawMenu || activeDraw ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            </svg>
            Рисование
          </button>
          {showDrawMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDrawMenu(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1">
                {DRAWING_TOOLS.map((tool) => (
                  <button
                    key={tool.value}
                    onClick={() => selectDrawing(tool.value)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      activeDraw === tool.value ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span className="w-4 text-center text-sm">{tool.label}</span>
                    {tool.title}
                  </button>
                ))}
                <div className="border-t dark:border-gray-700 mt-1 pt-1" />
                <button
                  onClick={() => { clearDrawings(); setShowDrawMenu(false); }}
                  className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10"
                >
                  <span className="w-4 text-center">✕</span>
                  Удалить все
                </button>
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Zoom controls */}
        <button onClick={zoomIn} title="Приблизить" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition text-xs font-bold">+</button>
        <button onClick={zoomOut} title="Отдалить" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition text-xs font-bold">−</button>
        <button onClick={fitContent} title="К текущей цене" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" />
          </svg>
        </button>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Screenshot */}
        <button onClick={takeScreenshot} title="Скриншот" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 13a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </button>

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} title={fullscreen ? "Выйти" : "Полный экран"} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={fullscreen
              ? "M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"
              : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
            } />
          </svg>
        </button>

        {/* Source label */}
        <span className="ml-auto text-[10px] text-gray-400 font-mono">MOEX • T-API</span>
      </div>

      {/* ══════ CHART AREA ══════ */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 z-10">
            <div className="text-sm text-gray-500">Загрузка...</div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 z-10">
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
