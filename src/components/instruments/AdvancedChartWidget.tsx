"use client";

import { useEffect, useRef, useState, memo } from "react";

export type DataSource = "moex" | "none";

interface Props {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

// Map our internal tickers to TradingView symbols
const TV_SYMBOL_MAP: Record<string, string> = {
  // Акции РФ
  SBER: "MOEX:SBER",
  GAZP: "MOEX:GAZP",
  LKOH: "MOEX:LKOH",
  YDEX: "MOEX:YDEX",
  ROSN: "MOEX:ROSN",
  // Товарные фьючерсы
  GOLD: "MOEX:GOLD1!",
  SILV: "MOEX:SILV1!",
  PLT: "MOEX:PLT1!",
  PLD: "MOEX:PLD1!",
  CU: "MOEX:CU1!",
  BR: "MOEX:BR1!",
  NG: "MOEX:NG1!",
  WHEAT: "MOEX:WHEAT1!",
  SUGAR: "MOEX:SUGAR1!",
  COCOA: "MOEX:COCOA1!",
  // Валютные фьючерсы
  Si: "MOEX:SI1!",
  Eu: "MOEX:EU1!",
  CR: "MOEX:CR1!",
  // Индексные фьючерсы
  MIX: "MOEX:MIX1!",
  RTS: "MOEX:RTS1!",
  NASD: "MOEX:NASD1!",
  SPYF: "MOEX:SPYF1!",
  BTCF: "MOEX:BTCF1!",
};

function AdvancedChartWidget({ ticker, source, name, height = 500 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const tvSymbol = TV_SYMBOL_MAP[ticker] || `MOEX:${ticker}`;

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear previous widget
    containerRef.current.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: "D",
      timezone: "Europe/Moscow",
      theme: "dark",
      style: "1",
      locale: "ru",
      allow_symbol_change: false,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      withdateranges: true,
      save_image: true,
      hide_volume: false,
      support_host: "https://www.tradingview.com",
    });

    containerRef.current.appendChild(script);

    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = "";
      }
    };
  }, [tvSymbol]);

  // Fullscreen
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  return (
    <div
      className={`bg-gray-900 rounded-xl shadow border border-gray-700 overflow-hidden flex flex-col ${
        isFullscreen ? "!rounded-none !border-0" : ""
      }`}
      style={{ height: isFullscreen ? "100vh" : height > 0 ? height : "100%" }}
    >
      <div
        ref={containerRef}
        className="tradingview-widget-container flex-1"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}

export default memo(AdvancedChartWidget);
