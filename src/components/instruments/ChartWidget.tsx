"use client";

import dynamic from "next/dynamic";

export type DataSource = "moex" | "bybit" | "none";

interface ChartWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
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
  // MOEX = всегда KlineChart (правильные тикеры MOEX в рублях)
  // Bybit = TradingView (реалтайм крипта)
  if (props.source === "bybit") {
    return (
      <TradingViewWidget
        ticker={props.ticker}
        source={props.source}
        name={props.name}
        height={props.height}
      />
    );
  }

  return (
    <KlineChartWidget
      ticker={props.ticker}
      source={props.source}
      name={props.name}
      height={props.height}
    />
  );
}
