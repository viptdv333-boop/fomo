import type { RangeId } from "./BottomBar";

/** What the app-only terminal page (src/components/app/AppTerminal.tsx) can ask of the chart that sits inside it. */
export interface AppChartHandle {
  setInterval: (id: string) => void;
  applyRange: (r: RangeId) => void;
  openSearch: () => void;
  openAlerts: () => void;
  openIndicators: () => void;
  openSettings: () => void;
  toggleDrawTools: () => void;
  openWatchlist: () => void;
}

/** What the chart tells the page around it (for the chips and the caption). */
export interface AppChartState {
  interval: string;
  /** MOEX bars up to the 15-minute delay of the public ISS */
  delayed: boolean;
}
