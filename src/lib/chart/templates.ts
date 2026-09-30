import type { ChartSettings } from "./settings";
import type { ChartType } from "./types";

/* Chart templates ('chart_template') and layouts ('layout') stored through lib/chart/userdata. */

export const TEMPLATE_KIND = "chart_template";
export const LAYOUT_KIND = "layout";

/** Look of a chart: settings, chart type, indicators and (optionally) the drawings of the symbol. */
export interface ChartTemplateData {
  v: 1;
  settings: ChartSettings;
  chartType: ChartType;
  showVolume: boolean;
  showGrid: boolean;
  showWatermark: boolean;
  /** JSON from IndicatorsController.serialize(). */
  indicators?: string;
  /** JSON from DrawingsController.serialize(); only when saved with drawings. */
  drawings?: string;
}

/** A template plus what the chart shows: symbol and interval. */
export interface ChartLayoutData {
  v: 1;
  source: string;
  ticker: string;
  name?: string;
  interval: string;
  template: ChartTemplateData;
}

export function isTemplate(d: unknown): d is ChartTemplateData {
  return !!d && typeof d === "object" && (d as ChartTemplateData).v === 1 && typeof (d as ChartTemplateData).chartType === "string";
}

export function isLayout(d: unknown): d is ChartLayoutData {
  const l = d as ChartLayoutData;
  return !!l && typeof l === "object" && l.v === 1 && typeof l.source === "string" && typeof l.ticker === "string" && isTemplate(l.template);
}
