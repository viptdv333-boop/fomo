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
  /** pin / unpin timeframes (the chart's settings: saved on this device and on the account like the other chart preferences) */
  setFavIntervals: (list: string[]) => void;
}

/** What the chart tells the page around it (for the chips and the caption). */
export interface AppChartState {
  interval: string;
  /** MOEX bars up to the 15-minute delay of the public ISS */
  delayed: boolean;
  /** the chart's own side panel is on screen showing its watchlist (wide window, panel open, «Список» tab): the page does not repeat the list below */
  sideWatch?: boolean;
  /** the pinned timeframes (chart settings, `ui.favIntervals`) */
  favIntervals: string[];
  /** the chart's data source (seconds exist only for some) */
  source: string;
}
