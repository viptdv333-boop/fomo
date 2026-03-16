"use client";

import { useEffect, useRef } from "react";

interface TradingViewWidgetProps {
  symbol: string;
  height?: number;
}

declare global {
  interface Window {
    TradingView?: any;
  }
}

export default function TradingViewWidget({
  symbol,
  height = 400,
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clear any previous widget
    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (window.TradingView && containerRef.current) {
        new window.TradingView.widget({
          container_id: containerRef.current.id,
          symbol,
          interval: "D",
          timezone: "Europe/Moscow",
          theme: document.documentElement.classList.contains("dark")
            ? "dark"
            : "light",
          style: "1",
          locale: "ru",
          toolbar_bg: "#f1f3f6",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          save_image: false,
          height,
          width: "100%",
          studies: ["MASimple@tv-basicstudies", "RSI@tv-basicstudies"],
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      script.remove();
    };
  }, [symbol, height]);

  return (
    <div
      id={`tv-widget-${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`}
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-lg overflow-hidden border dark:border-gray-700"
    />
  );
}
