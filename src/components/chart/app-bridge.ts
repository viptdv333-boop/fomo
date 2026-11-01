import type { RangeId } from "./BottomBar";

/** What the app-only terminal page (src/components/app/AppTerminal.tsx) can ask of the chart that sits inside it. */
export interface AppChartHandle {
  setInterval: (id: string) => void;
  applyRange: (r: RangeId) => void;
  openSearch: () => void;
  openAlerts: () => void;
  openIndicators: () => void;
  openSettings: () => void;
  /** Adds a window (the same «chart / indicator» window of the web terminal). */
  addWindow: () => void;
  toggleDrawTools: () => void;
  openWatchlist: () => void;
  /** pin / unpin timeframes (the chart's settings: saved on this device and on the account like the other chart preferences) */
  setFavIntervals: (list: string[]) => void;
}

/** What the chart tells the page around it (for the chips and the caption). */
export interface AppChartState {
  interval: string;
  /** MOEX bars up to the 15-minute delay of the public ISS */
  delayed: boolean;
  /** wide window: the chart has its own side panel with the watchlist, so the page never repeats the list below the chart (phones keep the lower list) */
  sideWatch?: boolean;
  /** the pinned timeframes (chart settings, `ui.favIntervals`) */
  favIntervals: string[];
  /** the chart's data source (seconds exist only for some) */
  source: string;
  /** The chart can have windows (its area is big enough): the page shows its «Windows» action with the count. */
  windows?: { count: number; canAdd: boolean };
}
