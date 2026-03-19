"use client";

import dynamic from "next/dynamic";

export type DataSource = "moex" | "bybit" | "none";

interface ChartWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

// MOEX futures tickers that don't work on TradingView free widget
// These need KlineChart + MOEX API (correct contracts in RUB)
const MOEX_FUTURES = new Set([
  "BR", "GOLD", "SILV", "NG", "WHEAT", "PLT", "PLD", "COCOA",
  "MIX", "IMOEXF",
]);

// Determine which chart engine to use
function useKlineChart(ticker: string, source: DataSource): boolean {
  if (source !== "moex") return false;
  return MOEX_FUTURES.has(ticker);
}

const TradingViewWidget = dynamic(
  () => import("./TradingViewWidget"),
  { ssr: false, loading: () => <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" /> }
);

const KlineChartWidget = dynamic(
  () => import("./KlineChartWidget"),
  { ssr: false, loading: () => <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" /> }
);

export default function ChartWidget(props: ChartWidgetProps) {
  const needsKline = useKlineChart(props.ticker, props.source);

  if (needsKline) {
    return (
      <KlineChartWidget
        ticker={props.ticker}
        source={props.source}
        name={props.name}
        height={props.height}
      />
    );
  }

  return (
    <TradingViewWidget
      ticker={props.ticker}
      source={props.source}
      name={props.name}
      height={props.height}
    />
  );
}
