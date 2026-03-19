"use client";

import dynamic from "next/dynamic";

export type DataSource = "moex" | "none";

interface ChartWidgetProps {
  ticker: string;
  source: DataSource;
  name?: string;
  height?: number;
}

const AdvancedChartWidget = dynamic(
  () => import("./AdvancedChartWidget"),
  {
    ssr: false,
    loading: () => (
      <div className="h-full bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
    ),
  }
);

export default function ChartWidget(props: ChartWidgetProps) {
  return (
    <AdvancedChartWidget
      ticker={props.ticker}
      source={props.source}
      name={props.name}
      height={props.height}
    />
  );
}
