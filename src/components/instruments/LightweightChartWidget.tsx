"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts";
import { calcSMA, calcEMA, calcBOLL, calcRSI, calcMACD } from "@/lib/indicators";
import type { Bar } from "@/lib/indicators";

export type DataSource = "moex" | "none";

interface Props {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
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

const INDICATORS_LIST = [
  { label: "MA 20", key: "MA", main: true },
  { label: "EMA 20", key: "EMA", main: true },
  { label: "BOLL", key: "BOLL", main: true },
  { label: "VOL", key: "VOL", main: false },
  { label: "RSI", key: "RSI", main: false },
  { label: "MACD", key: "MACD", main: false },
];

function getIsDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function getTheme(dark: boolean) {
  return {
    bg: dark ? "#111827" : "#ffffff",
    text: dark ? "#9ca3af" : "#6b7280",
    grid: dark ? "#1f2937" : "#f3f4f6",
    border: dark ? "#374151" : "#e5e7eb",
    cross: dark ? "#6b7280" : "#9ca3af",
  };
}

export default function LightweightChartWidget({ ticker, source, name, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartApi = useRef<IChartApi | null>(null);
  const candleSeries = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volSeries = useRef<ISeriesApi<"Histogram"> | null>(null);
  const indSeries = useRef<Map<string, ISeriesApi<any>[]>>(new Map());
  const rtTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const barsData = useRef<Bar[]>([]);

  const [tf, setTf] = useState("D");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolved, setResolved] = useState(ticker);
  const [inds, setInds] = useState<Set<string>>(new Set(["VOL"]));
  const [showInds, setShowInds] = useState(false);
  const [showCfg, setShowCfg] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [xhair, setXhair] = useState("");

  useEffect(() => {
    setResolved(ticker);
  }, [ticker]);

  /* ====== Fetch candle data ====== */
  const fetchData = useCallback(
    async (limit = 500) => {
      const ts = limit <= 5 ? "&_t=" + Date.now() : "";
      const r = await fetch(
        `/api/klines?source=${source}&ticker=${encodeURIComponent(ticker)}&interval=${tf}&limit=${limit}${ts}`,
        limit <= 5 ? { cache: "no-store" } : undefined
      );
      const j = await r.json();
      const c = j.candles ?? j;
      if (!Array.isArray(c)) return { data: [] as Bar[], resolved: j.ticker ?? ticker };
      return {
        data: c.map((d: any) => ({
          time: Math.floor(d.timestamp / 1000),
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
          volume: d.volume || 0,
        })),
        resolved: j.ticker ?? ticker,
      };
    },
    [source, ticker, tf]
  );

  /* ====== Current period timestamp (seconds) ====== */
  const periodTs = useCallback(
    (ms: number) => {
      const s = Math.floor(ms / 1000);
      switch (tf) {
        case "1":
          return Math.floor(s / 60) * 60;
        case "5":
          return Math.floor(s / 300) * 300;
        case "15":
          return Math.floor(s / 900) * 900;
        case "60":
          return Math.floor(s / 3600) * 3600;
        case "240":
          return Math.floor(s / 14400) * 14400;
        case "D": {
          const d = new Date(ms);
          const msk = new Date(d.getTime() + 3 * 3600_000);
          msk.setUTCHours(0, 0, 0, 0);
          return Math.floor((msk.getTime() - 3 * 3600_000) / 1000);
        }
        case "W": {
          const d = new Date(ms);
          d.setUTCHours(0, 0, 0, 0);
          const day = d.getUTCDay();
          d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
          return Math.floor(d.getTime() / 1000);
        }
        case "M": {
          const d = new Date(ms);
          d.setUTCDate(1);
          d.setUTCHours(0, 0, 0, 0);
          return Math.floor(d.getTime() / 1000);
        }
        default:
          return Math.floor(s / 86400) * 86400;
      }
    },
    [tf]
  );

  /* ====== Draw indicators ====== */
  const drawInds = useCallback((chart: IChartApi, data: Bar[], active: Set<string>) => {
    // Remove old indicator series
    indSeries.current.forEach((list) =>
      list.forEach((s) => {
        try {
          chart.removeSeries(s);
        } catch {
          /* ignore */
        }
      })
    );
    indSeries.current.clear();

    // Volume
    if (active.has("VOL") && volSeries.current) {
      volSeries.current.setData(
        data.map((b) => ({
          time: b.time as Time,
          value: b.volume,
          color: b.close >= b.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
        }))
      );
    } else if (volSeries.current) {
      volSeries.current.setData([]);
    }

    // MA 20
    if (active.has("MA")) {
      const s = chart.addSeries(LineSeries,{ color: "#f59e0b", lineWidth: 1, priceScaleId: "right" });
      s.setData(calcSMA(data, 20).map((d) => ({ time: d.time as Time, value: d.value })));
      indSeries.current.set("MA", [s]);
    }

    // EMA 20
    if (active.has("EMA")) {
      const s = chart.addSeries(LineSeries,{ color: "#8b5cf6", lineWidth: 1, priceScaleId: "right" });
      s.setData(calcEMA(data, 20).map((d) => ({ time: d.time as Time, value: d.value })));
      indSeries.current.set("EMA", [s]);
    }

    // Bollinger Bands
    if (active.has("BOLL")) {
      const boll = calcBOLL(data, 20, 2);
      const sUp = chart.addSeries(LineSeries,{ color: "#3b82f6", lineWidth: 1, priceScaleId: "right" });
      const sMid = chart.addSeries(LineSeries,{
        color: "#3b82f6",
        lineWidth: 1,
        lineStyle: 2,
        priceScaleId: "right",
      });
      const sLow = chart.addSeries(LineSeries,{ color: "#3b82f6", lineWidth: 1, priceScaleId: "right" });
      sUp.setData(boll.upper.map((d) => ({ time: d.time as Time, value: d.value })));
      sMid.setData(boll.middle.map((d) => ({ time: d.time as Time, value: d.value })));
      sLow.setData(boll.lower.map((d) => ({ time: d.time as Time, value: d.value })));
      indSeries.current.set("BOLL", [sUp, sMid, sLow]);
    }

    // RSI
    if (active.has("RSI")) {
      const s = chart.addSeries(LineSeries,{
        color: "#ec4899",
        lineWidth: 1,
        priceScaleId: "rsi",
      });
      s.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      s.setData(calcRSI(data, 14).map((d) => ({ time: d.time as Time, value: d.value })));
      indSeries.current.set("RSI", [s]);
    }

    // MACD
    if (active.has("MACD")) {
      const m = calcMACD(data);
      if (m.macd.length > 0) {
        const sh = chart.addSeries(HistogramSeries,{ priceScaleId: "macd-h" });
        const sm = chart.addSeries(LineSeries,{ color: "#3b82f6", lineWidth: 1, priceScaleId: "macd" });
        const ss = chart.addSeries(LineSeries,{ color: "#f97316", lineWidth: 1, priceScaleId: "macd" });
        sh.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
        sh.setData(
          m.histogram.map((d) => ({ time: d.time as Time, value: d.value, color: d.color }))
        );
        sm.setData(m.macd.map((d) => ({ time: d.time as Time, value: d.value })));
        ss.setData(m.signal.map((d) => ({ time: d.time as Time, value: d.value })));
        indSeries.current.set("MACD", [sh, sm, ss]);
      }
    }
  }, []);

  /* ====== Load data ====== */
  const loadData = useCallback(async () => {
    if (!chartApi.current || !candleSeries.current) return;
    setLoading(true);
    setError("");
    try {
      const { data, resolved: r } = await fetchData(500);
      setResolved(r);
      barsData.current = data;
      if (data.length === 0) {
        setError("Нет данных");
        setLoading(false);
        return;
      }
      candleSeries.current.setData(
        data.map((b) => ({
          time: b.time as Time,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }))
      );
      drawInds(chartApi.current, data, inds);
      chartApi.current.timeScale().fitContent();
    } catch {
      setError("Ошибка загрузки");
    }
    setLoading(false);
  }, [fetchData, drawInds, inds]);

  /* ====== Realtime updates via Tinkoff API ====== */
  const startRt = useCallback(() => {
    if (rtTimer.current) clearInterval(rtTimer.current);
    const ms = ["1", "5", "15", "60"].includes(tf) ? 5000 : 15000;

    rtTimer.current = setInterval(async () => {
      if (!candleSeries.current) return;
      try {
        const r = await fetch(
          `/api/quote?source=${source}&ticker=${encodeURIComponent(ticker)}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const q = await r.json();
        if (!q.price) return;

        const d = barsData.current;
        if (d.length === 0) return;
        const last = d[d.length - 1];
        const cur = periodTs(Date.now());

        if (cur > last.time) {
          // New candle period
          const nb: Bar = {
            time: cur,
            open: q.price,
            high: q.price,
            low: q.price,
            close: q.price,
            volume: q.volume || 0,
          };
          d.push(nb);
          candleSeries.current.update({
            time: cur as Time,
            open: q.price,
            high: q.price,
            low: q.price,
            close: q.price,
          });
          if (volSeries.current && inds.has("VOL")) {
            volSeries.current.update({
              time: cur as Time,
              value: q.volume || 0,
              color: "rgba(34,197,94,0.4)",
            });
          }
        } else {
          // Update existing candle
          last.high = Math.max(last.high, q.price);
          last.low = Math.min(last.low, q.price);
          last.close = q.price;
          last.volume = q.volume || last.volume;
          candleSeries.current.update({
            time: last.time as Time,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
          });
          if (volSeries.current && inds.has("VOL")) {
            volSeries.current.update({
              time: last.time as Time,
              value: last.volume,
              color: last.close >= last.open ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)",
            });
          }
        }
      } catch {
        /* silent */
      }
    }, ms);
  }, [tf, source, ticker, periodTs, inds]);

  /* ====== Init chart ====== */
  useEffect(() => {
    if (!containerRef.current) return;
    const dark = getIsDark();
    const t = getTheme(dark);

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: t.bg },
        textColor: t.text,
        fontFamily: "'Inter', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: t.grid },
        horzLines: { color: t.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: t.cross, labelBackgroundColor: t.border },
        horzLine: { color: t.cross, labelBackgroundColor: t.border },
      },
      rightPriceScale: { borderColor: t.border },
      timeScale: {
        borderColor: t.border,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { locale: "ru-RU" },
    });

    const cs = chart.addSeries(CandlestickSeries,{
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    const vs = chart.addSeries(HistogramSeries,{
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    // Crosshair info
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time) {
        setXhair("");
        return;
      }
      const cd = param.seriesData.get(cs) as CandlestickData | undefined;
      if (cd && "open" in cd) {
        const ch = cd.close - cd.open;
        const pct = cd.open !== 0 ? ((ch / cd.open) * 100).toFixed(2) : "0";
        const sign = ch >= 0 ? "+" : "";
        setXhair(
          `O: ${cd.open}  H: ${cd.high}  L: ${cd.low}  C: ${cd.close}  ${sign}${ch.toFixed(2)} (${sign}${pct}%)`
        );
      }
    });

    chartApi.current = chart;
    candleSeries.current = cs;
    volSeries.current = vs;

    // Responsive resize
    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (rtTimer.current) clearInterval(rtTimer.current);
      chart.remove();
      chartApi.current = null;
      candleSeries.current = null;
      volSeries.current = null;
    };
  }, []);

  // Reload on interval/ticker change
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Start realtime after load
  useEffect(() => {
    if (!loading && !error) startRt();
    return () => {
      if (rtTimer.current) clearInterval(rtTimer.current);
    };
  }, [loading, error, startRt]);

  // Fullscreen listener
  useEffect(() => {
    const handler = () => {
      setFullscreen(!!document.fullscreenElement);
      setTimeout(() => {
        if (containerRef.current && chartApi.current) {
          chartApi.current.applyOptions({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      }, 200);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  /* ====== Actions ====== */
  function toggleIndicator(key: string) {
    const next = new Set(inds);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setInds(next);
    if (chartApi.current && barsData.current.length > 0) {
      drawInds(chartApi.current, barsData.current, next);
    }
  }

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      try {
        await wrapperRef.current.requestFullscreen();
      } catch {
        /* ignore */
      }
    } else {
      await document.exitFullscreen();
    }
  }

  function takeScreenshot() {
    if (!chartApi.current) return;
    const canvas = chartApi.current.takeScreenshot();
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${ticker}_${tf}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  /* ====== Render ====== */
  return (
    <div
      ref={wrapperRef}
      className={`bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden flex flex-col ${
        fullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: fullscreen ? "100vh" : height > 0 ? height : "100%" }}
    >
      {/* Top Toolbar */}
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

        {/* Indicators dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowInds(!showInds);
              setShowCfg(false);
            }}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium transition ${
              showInds
                ? "bg-blue-600 text-white"
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 3v18h18" />
              <path d="M7 16l4-6 4 4 5-8" />
            </svg>
            Индикаторы
          </button>
          {showInds && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowInds(false)} />
              <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                {INDICATORS_LIST.map((ind) => (
                  <button
                    key={ind.key}
                    onClick={() => toggleIndicator(ind.key)}
                    className={`flex items-center gap-2 w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 ${
                      inds.has(ind.key)
                        ? "text-blue-600 font-medium"
                        : "text-gray-600 dark:text-gray-400"
                    }`}
                  >
                    <span
                      className={`w-3 h-3 rounded border text-[8px] flex items-center justify-center ${
                        inds.has(ind.key)
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      {inds.has(ind.key) ? "\u2713" : ""}
                    </span>
                    {ind.label}
                    {!ind.main && (
                      <span className="text-[9px] text-gray-400 ml-auto">панель</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-0.5" />

        {/* Screenshot */}
        <button
          onClick={takeScreenshot}
          title="Скриншот"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 13a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </button>

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          title={fullscreen ? "Выйти" : "Полный экран"}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d={
                fullscreen
                  ? "M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"
                  : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
              }
            />
          </svg>
        </button>

        {/* Source label */}
        <span className="ml-auto text-[10px] text-gray-400 font-mono">MOEX</span>
      </div>

      {/* Crosshair info bar */}
      {xhair && (
        <div className="px-2 py-0.5 text-[10px] font-mono text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 shrink-0 truncate">
          {xhair}
        </div>
      )}

      {/* Chart area */}
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
