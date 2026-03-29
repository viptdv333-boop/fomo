"use client";

import { useEffect, useRef } from "react";

interface Props {
  symbols?: string[][];
}

const DEFAULT_SYMBOLS = [
  ["Apple", "AAPL|1D"],
  ["Google", "GOOGL|1D"],
  ["Microsoft", "MSFT|1D"],
  ["Bitcoin", "BINANCE:BTCUSDT|1D"],
  ["Ethereum", "BINANCE:ETHUSDT|1D"],
  ["Газпром", "MOEX:GAZP|1D"],
  ["Сбербанк", "MOEX:SBER|1D"],
  ["Золото", "TVC:GOLD|1D"],
  ["Нефть Brent", "TVC:UKOIL|1D"],
  ["EUR/USD", "FX:EURUSD|1D"],
];

export default function WatchlistWidget({ symbols }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
    script.async = true;
    script.type = "text/javascript";
    script.textContent = JSON.stringify({
      colorTheme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      dateRange: "1D",
      showChart: true,
      locale: "ru",
      largeChartUrl: "",
      isTransparent: true,
      showSymbolLogo: true,
      showFloatingTooltip: false,
      width: "100%",
      height: "500",
      tabs: [
        {
          title: "Список наблюдения",
          symbols: (symbols || DEFAULT_SYMBOLS).map(([name, s]) => ({
            s,
            d: name,
          })),
          originalTitle: "Watchlist",
        },
      ],
    });

    containerRef.current.appendChild(script);
  }, [symbols]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
      <div className="tradingview-widget-container" ref={containerRef} />
    </div>
  );
}
