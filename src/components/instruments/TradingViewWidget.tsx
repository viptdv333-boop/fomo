"use client";

import { useEffect, useRef, useState } from "react";

export type DataSource = "moex" | "bybit" | "none";

interface TradingViewWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

/**
 * Map our internal tickers to TradingView symbol format.
 */
function getTVSymbol(ticker: string, source: DataSource): string {
  if (source === "bybit") {
    return `BYBIT:${ticker}`;
  }

  if (source === "moex") {
    // Futures → continuous contract
    const futuresMap: Record<string, string> = {
      BR: "MOEX:BR1!",
      GOLD: "MOEX:GD1!",
      SILV: "MOEX:SV1!",
      NG: "MOEX:NG1!",
      WHEAT: "MOEX:W41!",
      PLT: "MOEX:PT1!",
      PLD: "MOEX:PD1!",
      COCOA: "MOEX:CC1!",
      Si: "MOEX:SI1!",
      Eu: "MOEX:EU1!",
      CR: "MOEX:CR1!",
      NASD: "MOEX:NA1!",
      SPYF: "MOEX:SF1!",
      MIX: "MOEX:MX1!",
    };
    if (futuresMap[ticker]) return futuresMap[ticker];

    // Currency
    if (ticker === "USD000UTSTOM") return "MOEX:USDRUB_TOM";
    if (ticker === "EUR_RUB__TOM") return "MOEX:EURRUB_TOM";
    if (ticker === "CNY000UTSTOM") return "MOEX:CNYRUB_TOM";

    return `MOEX:${ticker}`;
  }

  return ticker;
}

export default function TradingViewWidget({
  ticker,
  source,
  name,
  height = 500,
}: TradingViewWidgetProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const tvSymbol = getTVSymbol(ticker, source);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const isDark = document.documentElement.classList.contains("dark");

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = "100%";
    inner.style.width = "100%";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Europe/Moscow",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "ru",
      allow_symbol_change: false,
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: true,
      calendar: false,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });

    widgetDiv.appendChild(inner);
    widgetDiv.appendChild(script);
    containerRef.current.appendChild(widgetDiv);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [tvSymbol]);

  // Fullscreen
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (!wrapperRef.current) return;
    if (!document.fullscreenElement) {
      try { await wrapperRef.current.requestFullscreen(); } catch { /* */ }
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
      {/* Mini toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          {name && <span className="text-xs font-bold dark:text-gray-100">{name}</span>}
          <span className="text-[10px] font-mono text-gray-400">{tvSymbol}</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-medium animate-pulse">
            LIVE
          </span>
        </div>
        <button
          onClick={toggleFullscreen}
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
          title={isFullscreen ? "Выйти из полного экрана" : "Полный экран"}
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d={isFullscreen
              ? "M8 3v3a2 2 0 01-2 2H3m18 0h-3a2 2 0 01-2-2V3m0 18v-3a2 2 0 012-2h3M3 16h3a2 2 0 012 2v3"
              : "M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"
            } />
          </svg>
        </button>
      </div>

      {/* TradingView chart */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
}
