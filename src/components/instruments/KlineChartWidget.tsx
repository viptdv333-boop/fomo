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

const CHART_TYPES = [
  { label: "Свечи", value: "candle_solid" },
  { label: "OHLC", value: "ohlc" },
  { label: "Линия", value: "area" },
];

const MAIN_INDICATORS = ["MA", "EMA", "BOLL", "SAR"];
const SUB_INDICATORS = ["VOL", "MACD", "RSI", "KDJ", "ATR", "CCI", "WR", "DMI"];

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
  const chartIdRef = useRef<string>("");
  const rtTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBarRef = useRef<KLineData | null>(null);
  // Track sub-indicator pane IDs for proper removal
  const subPaneIds = useRef<Map<string, string>>(new Map());

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
  const [chartReady, setChartReady] = useState(false);

  /* ── Init chart once ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const id = `kline-${Date.now()}`;
    containerRef.current.id = id;
    chartIdRef.current = id;

    const dark = document.documentElement.classList.contains("dark");
    const chart = init(id, {
      locale: "ru",
      timezone: "Europe/Moscow",
      styles: {
        grid: {
          show: true,
          horizontal: { color: dark ? "#1f293780" : "#f3f4f680" },
          vertical: { color: dark ? "#1f293780" : "#f3f4f680" },
        },
        candle: {
          type: "candle_solid" as any,
          priceMark: {
            last: { show: true, upColor: "#22c55e", downColor: "#ef4444", noChangeColor: "#888" },
          },
          bar: {
            upColor: "#22c55e", downColor: "#ef4444", noChangeColor: "#888",
            upBorderColor: "#22c55e", downBorderColor: "#ef4444", noChangeBorderColor: "#888",
            upWickColor: "#22c55e", downWickColor: "#ef4444", noChangeWickColor: "#888",
          },
          tooltip: {
            showRule: "always" as any,
            showType: "standard" as any,
          },
        },
        indicator: { lastValueMark: { show: true } },
        crosshair: {
          show: true,
          horizontal: {
            show: true,
            line: { show: true, style: "dashed" as any, color: dark ? "#6b7280" : "#9ca3af" },
            text: { show: true, color: "#fff", backgroundColor: dark ? "#4b5563" : "#6b7280" },
          },
          vertical: {
            show: true,
            line: { show: true, style: "dashed" as any, color: dark ? "#6b7280" : "#9ca3af" },
            text: { show: true, color: "#fff", backgroundColor: dark ? "#4b5563" : "#6b7280" },
          },
        },
      },
    });
    if (!chart) return;
    chartRef.current = chart;

    // Default VOL indicator
    const volPaneId = chart.createIndicator("VOL", false);
    if (volPaneId) subPaneIds.current.set("VOL", volPaneId);

    setChartReady(true);

    return () => {
      if (rtTimer.current) clearInterval(rtTimer.current);
      dispose(id);
      chartRef.current = null;
      subPaneIds.current.clear();
      setChartReady(false);
    };
  }, []); // eslint-disable-line

  /* ── Load historical data ── */
  const loadData = useCallback(async () => {
    const chart = chartRef.current;
    if (!chart) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch(
        `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${tf}&limit=500`
      );
      const j = await r.json();
      const c = j.candles ?? j;
      if (!Array.isArray(c) || c.length === 0) {
        setError("Нет данных");
        setLoading(false);
        return;
      }
      setResolved(j.ticker ?? ticker);
      const data: KLineData[] = c.map((d: any) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume || 0,
      }));
      chart.applyNewData(data);
      lastBarRef.current = { ...data[data.length - 1] };
    } catch {
      setError("Ошибка загрузки");
    }
    setLoading(false);
  }, [source, ticker, tf]);

  /* ── Load on change ── */
  useEffect(() => {
    if (chartReady) loadData();
  }, [chartReady, loadData]);

  /* ── Realtime polling ── */
  useEffect(() => {
    if (!chartReady) return;
    // Small delay to ensure data is loaded first
    const startDelay = setTimeout(() => {
      const ms = ["1", "5", "15", "60"].includes(tf) ? 4000 : 12000;
      const poll = async () => {
        const chart = chartRef.current;
        if (!chart || !lastBarRef.current) return;
        try {
          const r = await fetch(
            `/api/quote?source=${source}&ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`,
            { cache: "no-store" }
          );
          if (!r.ok) return;
          const q = await r.json();
          if (!q.price) return;

          const curPeriod = getCurrentPeriodTimestamp(tf) * 1000;
          const bar = lastBarRef.current;

          if (curPeriod > bar.timestamp) {
            // New candle
            const newBar: KLineData = {
              timestamp: curPeriod,
              open: q.price, high: q.price, low: q.price, close: q.price,
              volume: q.volume || 0,
            };
            lastBarRef.current = newBar;
            chart.updateData(newBar);
          } else {
            // Update existing
            bar.close = q.price;
            bar.high = Math.max(bar.high, q.price);
            bar.low = Math.min(bar.low, q.price);
            if (q.volume) bar.volume = q.volume;
            chart.updateData({ ...bar });
          }
        } catch { /* silent */ }
      };
      // Immediate first poll
      poll();
      rtTimer.current = setInterval(poll, ms);
    }, 2000);

    return () => {
      clearTimeout(startDelay);
      if (rtTimer.current) { clearInterval(rtTimer.current); rtTimer.current = null; }
    };
  }, [chartReady, tf, source, ticker]);

  /* ── Chart type ── */
  useEffect(() => {
    chartRef.current?.setStyles({ candle: { type: chartType as any } });
  }, [chartType]);

  /* ── Resize ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => chartRef.current?.resize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* ── Fullscreen ── */
  useEffect(() => {
    const h = () => { setFullscreen(!!document.fullscreenElement); setTimeout(() => chartRef.current?.resize(), 200); };
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* ── Toggle main indicator ── */
  function toggleMainInd(ind: string) {
    const chart = chartRef.current;
    if (!chart) return;
    const next = new Set(mainInds);
    if (next.has(ind)) {
      next.delete(ind);
      chart.removeIndicator("candle_pane", ind);
    } else {
      next.add(ind);
      chart.createIndicator(ind, true, { id: "candle_pane" });
    }
    setMainInds(next);
  }

  /* ── Toggle sub indicator ── */
  function toggleSubInd(ind: string) {
    const chart = chartRef.current;
    if (!chart) return;
    const next = new Set(subInds);
    if (next.has(ind)) {
      next.delete(ind);
      const paneId = subPaneIds.current.get(ind);
      if (paneId) {
        chart.removeIndicator(paneId, ind);
        subPaneIds.current.delete(ind);
      }
    } else {
      next.add(ind);
      const paneId = chart.createIndicator(ind, false);
      if (paneId) subPaneIds.current.set(ind, paneId);
    }
    setSubInds(next);
  }

  function selectDrawing(tool: string) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeDraw === tool) { setActiveDraw(null); return; }
    chart.createOverlay(tool);
    setActiveDraw(tool);
    setShowDrawMenu(false);
  }

  function clearDrawings() { chartRef.current?.removeOverlay(); setActiveDraw(null); }

  async function toggleFullscreen2() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      try { await wrapperRef.current.requestFullscreen(); } catch {}
    } else { await document.exitFullscreen(); }
  }

  function takeScreenshot() {
    const chart = chartRef.current;
    if (!chart) return;
    const url = chart.getConvertPictureUrl(true, "jpeg", "#111827");
    const a = document.createElement("a");
    a.download = `${ticker}_${tf}.jpg`;
    a.href = url;
    a.click();
  }

  return (
    <div
      ref={wrapperRef}
      className={`bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col ${
        fullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: fullscreen ? "100vh" : height > 0 ? height : "100%" }}
    >
      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0 flex-wrap">
        {name && (
          <div className="flex items-center gap-1.5 mr-1">
            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-[9px] font-bold text-white">{(name || "")[0]}</span>
            </div>
            <span className="text-xs font-bold dark:text-gray-100">{resolved}</span>
            {resolved !== ticker && <span className="text-[9px] text-gray-400 font-mono">({ticker})</span>}
          </div>
        )}
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {INTERVALS.map((i) => (
          <button key={i.value} onClick={() => setTf(i.value)}
            className={`px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              tf === i.value ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}>{i.label}</button>
        ))}
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Chart type */}
        <div className="relative">
          <button onClick={() => { setShowChartType(!showChartType); setShowIndMenu(false); setShowDrawMenu(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${showChartType ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="14" y="6" width="3" height="12" /></svg>
            Тип
          </button>
          {showChartType && (<>
            <div className="fixed inset-0 z-40" onClick={() => setShowChartType(false)} />
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[140px] py-1">
              {CHART_TYPES.map((ct) => (
                <button key={ct.value} onClick={() => { setChartType(ct.value); setShowChartType(false); }}
                  className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${chartType === ct.value ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"}`}>{ct.label}</button>
              ))}
            </div>
          </>)}
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Indicators */}
        <div className="relative">
          <button onClick={() => { setShowIndMenu(!showIndMenu); setShowDrawMenu(false); setShowChartType(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${showIndMenu ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 3v18h18" /><path d="M7 16l4-6 4 4 5-8" /></svg>
            Индикаторы
          </button>
          {showIndMenu && (<>
            <div className="fixed inset-0 z-40" onClick={() => setShowIndMenu(false)} />
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1 max-h-80 overflow-y-auto">
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">На графике</div>
              {MAIN_INDICATORS.map((ind) => (
                <button key={ind} onClick={() => toggleMainInd(ind)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${mainInds.has(ind) ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"}`}>
                  <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${mainInds.has(ind) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"}`}>
                    {mainInds.has(ind) ? "✓" : ""}
                  </span>{ind}
                </button>
              ))}
              <div className="border-t dark:border-gray-700 mt-1 pt-1" />
              <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase">Панели</div>
              {SUB_INDICATORS.map((ind) => (
                <button key={ind} onClick={() => toggleSubInd(ind)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${subInds.has(ind) ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"}`}>
                  <span className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${subInds.has(ind) ? "bg-blue-600 border-blue-600 text-white" : "border-gray-300 dark:border-gray-600"}`}>
                    {subInds.has(ind) ? "✓" : ""}
                  </span>{ind}
                </button>
              ))}
            </div>
          </>)}
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Drawing */}
        <div className="relative">
          <button onClick={() => { setShowDrawMenu(!showDrawMenu); setShowIndMenu(false); setShowChartType(false); }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${showDrawMenu || activeDraw ? "bg-blue-600 text-white" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"}`}>
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /></svg>
            Рисование
          </button>
          {showDrawMenu && (<>
            <div className="fixed inset-0 z-40" onClick={() => setShowDrawMenu(false)} />
            <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[200px] py-1">
              {DRAWING_TOOLS.map((tool) => (
                <button key={tool.value} onClick={() => selectDrawing(tool.value)}
                  className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${activeDraw === tool.value ? "text-blue-600 font-medium" : "text-gray-600 dark:text-gray-400"}`}>
                  <span className="w-4 text-center text-sm">{tool.label}</span>{tool.title}
                </button>
              ))}
              <div className="border-t dark:border-gray-700 mt-1 pt-1" />
              <button onClick={() => { clearDrawings(); setShowDrawMenu(false); }}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
                <span className="w-4 text-center">✕</span>Удалить все
              </button>
            </div>
          </>)}
        </div>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        <button onClick={() => chartRef.current?.zoomAtCoordinate(1.2)} title="+" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition text-xs font-bold">+</button>
        <button onClick={() => chartRef.current?.zoomAtCoordinate(0.8)} title="−" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition text-xs font-bold">−</button>
        <button onClick={() => chartRef.current?.scrollToRealTime()} title="→" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 2v4m0 12v4m10-10h-4M6 12H2" /></svg>
        </button>
        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        <button onClick={takeScreenshot} title="Скриншот" className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 13a4 4 0 100-8 4 4 0 000 8z" /></svg>
        </button>
        <button onClick={toggleFullscreen2} title={fullscreen ? "Выйти" : "Полный экран"} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d={fullscreen ? "M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3" : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"} />
          </svg>
        </button>
        <span className="ml-auto text-[10px] text-gray-400 font-mono">MOEX T-API</span>
      </div>

      {/* ═══ CHART ═══ */}
      <div className="relative flex-1 min-h-0">
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70 z-10">
            <div className="text-sm text-gray-500">Загрузка...</div>
          </div>
        )}
        {error && !loading && !lastBarRef.current && (
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
