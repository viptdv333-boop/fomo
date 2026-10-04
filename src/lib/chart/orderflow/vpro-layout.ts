/* Pure layout rules of the volume profile statistics table (no canvas, no DOM), so they can be checked in isolation.
   On a plot narrower than VP_TABLE_MIN_WIDTH (every phone in portrait: the screen minus the price axis) the full table would
   cover half of the candles, so it turns into a small chip ("▸ VP 70%") that opens into a compact table on tap. */

/** Plots narrower than this get the compact (chip) table instead of the full one. */
export const VP_TABLE_MIN_WIDTH = 380;
/** Gap between the table and the plot edge, px. */
export const TABLE_MARGIN = 8;
/** Width kept free on the left of a top-right table for the indicator legend, px. */
export const LEGEND_ROOM = 440;
/** Largest font of the compact table, px (the configured size is used when it is smaller). */
export const NARROW_MAX_FONT = 10;

export type TablePos = "tr" | "tl" | "br" | "bl";

export function isNarrowPlot(plotWidth: number): boolean {
  return plotWidth < VP_TABLE_MIN_WIDTH;
}

/**
 * Corner of the narrow table: the vertical half the user chose, the horizontal side opposite the histogram - the histogram
 * hugs the right edge by default and the table over it would hide the bars it describes.
 */
export function narrowCorner(pos: TablePos, placement: "left" | "right" | "start" | "end"): TablePos {
  const histLeft = placement === "left" || placement === "start";
  const bottom = pos === "br" || pos === "bl";
  return bottom ? (histLeft ? "br" : "bl") : histLeft ? "tr" : "tl";
}

export interface TableMetrics {
  fontPx: number;
  rowH: number;
  padX: number;
  gap: number;
}

/** Font and spacing of the table: the configured ones on a wide plot, a small tight set on a narrow one. */
export function tableMetrics(configuredFontPx: number, compactCfg: boolean, narrow: boolean): TableMetrics {
  const compact = compactCfg || narrow;
  const fontPx = narrow ? Math.min(configuredFontPx, NARROW_MAX_FONT) : configuredFontPx;
  return {
    fontPx,
    rowH: Math.round(fontPx * (compact ? 1.55 : 2.05)),
    padX: compact ? 5 : 8,
    gap: compact ? 8 : 14,
  };
}

export interface PlaceIn {
  W: number;
  H: number;
  /** Space kept free at the top (indicator legend) for the left corner; px. */
  insetTop: number;
  /** Space already used in the same corner by earlier tables; px. */
  stack: number;
}

/** Vertical room for the table in its corner (below the legend for the top corners that meet it). */
export function availableHeight(pos: TablePos, tableW: number, p: PlaceIn): number {
  const bottom = pos === "br" || pos === "bl";
  const top = bottom ? 0 : topOffset(pos, tableW, p);
  return Math.max(0, p.H - top - TABLE_MARGIN - p.stack - (bottom ? TABLE_MARGIN : 0));
}

function topOffset(pos: TablePos, tableW: number, p: PlaceIn): number {
  const right = pos === "tr";
  // the legend of the indicators lives at the top left: a table that would reach over it goes below it
  const belowLegend = !right || p.W - tableW - TABLE_MARGIN < LEGEND_ROOM;
  return (belowLegend ? p.insetTop : TABLE_MARGIN) + p.stack;
}

/** How many data rows (besides the header) fit into `avail` px; never negative, never more than `rows`. */
export function fitRows(rows: number, rowH: number, avail: number): number {
  if (rowH <= 0) return 0;
  return Math.max(0, Math.min(rows, Math.floor(avail / rowH) - 1));
}

/** Top-left corner of a table of size w x h in its corner of the plot; always inside [0, W-w] x [0, H-h] when it fits. */
export function placeTable(pos: TablePos, w: number, h: number, p: PlaceIn): { x: number; y: number } {
  const right = pos === "tr" || pos === "br";
  const bottom = pos === "br" || pos === "bl";
  const m = TABLE_MARGIN;
  const x = Math.round(right ? p.W - w - m : m);
  const y = Math.round(bottom ? p.H - h - m - p.stack : topOffset(pos, w, p));
  return { x: Math.max(0, x), y: Math.max(0, y) };
}
