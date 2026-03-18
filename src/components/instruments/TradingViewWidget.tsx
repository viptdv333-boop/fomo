"use client";

import { useEffect, useRef, useState } from "react";

interface TradingViewWidgetProps {
  symbol: string;
  height?: number;
}

export default function TradingViewWidget({
  symbol,
  height = 500,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState("D");

  const intervals = [
    { label: "1м", value: "1" },
    { label: "5м", value: "5" },
    { label: "15м", value: "15" },
    { label: "1ч", value: "60" },
    { label: "4ч", value: "240" },
    { label: "Д", value: "D" },
    { label: "Н", value: "W" },
    { label: "М", value: "M" },
  ];

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const isDark = document.documentElement.classList.contains("dark");

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbol,
      interval,
      timezone: "Europe/Moscow",
      theme: isDark ? "dark" : "light",
      style: "1",
      locale: "ru",
      allow_symbol_change: true,
      support_host: "https://www.tradingview.com",
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      withdateranges: true,
      details: true,
      hotlist: true,
      calendar: false,
      studies: ["STD;SMA", "STD;RSI"],
      width: "100%",
      height,
    });

    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    wrapper.style.height = `${height}px`;
    wrapper.style.width = "100%";

    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    inner.style.height = `calc(${height}px - 32px)`;
    inner.style.width = "100%";

    wrapper.appendChild(inner);
    wrapper.appendChild(script);
    containerRef.current.appendChild(wrapper);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = "";
    };
  }, [symbol, height, interval]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden border dark:border-gray-700">
      {/* Timeframe selector */}
      <div className="flex items-center gap-1 px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <span className="text-xs text-gray-400 mr-1">Таймфрейм:</span>
        {intervals.map((tf) => (
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
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
