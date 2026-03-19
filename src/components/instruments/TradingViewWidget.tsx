"use client";

import { useEffect, useRef } from "react";

export type DataSource = "moex" | "bybit" | "none";

interface TradingViewWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

/**
 * Map our internal tickers to TradingView widget symbols.
 * Uses only confirmed-working free symbols.
 */
function getTVSymbol(ticker: string, source: DataSource): string {
  if (source === "bybit") {
    return `BYBIT:${ticker}`;
  }

  if (source === "moex") {
    const map: Record<string, string> = {
      // Commodities → TVC (free, real-time, confirmed)
      BR: "TVC:UKOIL",
      GOLD: "TVC:GOLD",
      SILV: "TVC:SILVER",
      PLT: "TVC:PLATINUM",
      PLD: "TVC:PALLADIUM",
      NG: "NYMEX:NG1!",
      WHEAT: "CBOT:ZW1!",
      COCOA: "TVC:COCOA",

      // Russian index
      MIX: "MOEX:IMOEX",
      IMOEXF: "MOEX:IMOEX",

      // US indices
      NASD: "NASDAQ:NDX",
      SPYF: "SP:SPX",

      // Currency → MOEX (confirmed)
      Si: "MOEX:USDRUB_TOM",
      Eu: "MOEX:EURRUB_TOM",
      CR: "MOEX:CNYRUB_TOM",
      USD000UTSTOM: "MOEX:USDRUB_TOM",
      EUR_RUB__TOM: "MOEX:EURRUB_TOM",
      CNY000UTSTOM: "MOEX:CNYRUB_TOM",
    };
    if (map[ticker]) return map[ticker];

    // Stocks, bonds → MOEX:TICKER
    return `MOEX:${ticker}`;
  }

  return ticker;
}

export default function TradingViewWidget({
  ticker,
  source,
  height = 500,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      className="bg-white dark:bg-gray-900 rounded-xl shadow border dark:border-gray-700 overflow-hidden"
      style={{ height: height > 0 ? height : "100%" }}
    >
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
