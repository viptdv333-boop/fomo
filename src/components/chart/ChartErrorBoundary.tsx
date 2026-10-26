"use client";

import { Component, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { chartResetKeys } from "@/lib/chart/prefs";
import { reloadOnceForChunkError } from "@/lib/chunk-reload";
import { purgeShellCaches } from "@/lib/stale-build";

/**
 * «Сбросить настройки графика»: the chart's stored preferences and chart settings (pinned timeframes ...) of this device are removed (also the ones of
 * the panes of a multi-chart layout) and the page reloads from the network with the stored shell dropped. Indicators, drawings, alerts and the
 * watchlist are the user's work and stay. The account copy of the preferences / settings goes through the same sanitizing on load, so a bad one
 * cannot bring the chart down again.
 */
export async function resetChartSettings(): Promise<void> {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of chartResetKeys(keys)) localStorage.removeItem(k);
  } catch {}
  try {
    await purgeShellCaches();
  } catch {}
  window.location.reload();
}

interface Props {
  children: ReactNode;
  /** a thin strip (the timeframe row) instead of the whole chart area */
  compact?: boolean;
}

interface State {
  error: Error | null;
}

class Boundary extends Component<Props & { texts: Texts }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // a stale build (chunk missing after a deploy) heals itself: the stored shell is dropped and the page reloads once
    reloadOnceForChunkError(error);
    try {
      console.error("[chart] render failed:", error);
    } catch {}
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { texts, compact } = this.props;
    const buttons = (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          data-chart-reset
          onClick={() => void resetChartSettings()}
          style={{ padding: "8px 14px", borderRadius: 9, border: 0, background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
        >
          {texts.reset}
        </button>
        {!compact && (
          <button
            type="button"
            data-chart-retry
            onClick={() => window.location.reload()}
            style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid currentColor", background: "transparent", color: "inherit", fontSize: 14, cursor: "pointer", opacity: 0.8 }}
          >
            {texts.retry}
          </button>
        )}
      </div>
    );
    if (compact) {
      return (
        <div role="alert" data-chart-error="strip" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", minHeight: 46, boxSizing: "border-box", flexWrap: "wrap" }}>
          {buttons}
        </div>
      );
    }
    return (
      <div
        role="alert"
        data-chart-error="chart"
        style={{ minHeight: 220, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, padding: 20, textAlign: "center", boxSizing: "border-box" }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>{texts.title}</div>
        <div style={{ fontSize: 13, opacity: 0.7, maxWidth: 360 }}>{texts.text}</div>
        {buttons}
      </div>
    );
  }
}

interface Texts {
  title: string;
  text: string;
  reset: string;
  retry: string;
}

/** Around the chart (and its timeframe row): a render error shows «Сбросить настройки графика» instead of a blank area. */
export default function ChartErrorBoundary(props: Props) {
  const { t } = useT();
  const texts: Texts = { title: t("chart.err.title"), text: t("chart.err.text"), reset: t("chart.err.reset"), retry: t("chart.err.reload") };
  return <Boundary {...props} texts={texts} />;
}
