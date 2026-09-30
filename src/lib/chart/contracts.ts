import type { ChartEngine } from "./engine";
import type { Drawing, DrawingPatch } from "./drawings/types";

/* Shared contracts between the chart modules (indicators, drawings, terminal shell).
   Each module implements its side; the shell only talks to these interfaces. */

export type ParamValue = number | string | boolean;

/** How one plot of an indicator is drawn. Every field is optional: what is missing comes from the definition. */
export interface PlotStyle {
  visible?: boolean;
  /** "#rrggbb" or "rgba(r,g,b,a)". */
  color?: string;
  width?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
  /** Plot type, like TradingView: line, histogram (thin bars), area, columns (wide bars), circles, step line. */
  type?: "line" | "histogram" | "area" | "columns" | "circles" | "step";
  /** Horizontal line at the last value across the chart. */
  priceLine?: boolean;
  /** Flag with the last value on the price scale. */
  lastValue?: boolean;
  /** Value in the legend / status line. */
  legendValue?: boolean;
}

export interface FillStyle {
  visible?: boolean;
  color?: string;
}

export interface LevelStyle {
  visible?: boolean;
  value?: number;
  color?: string;
  width?: number;
  lineStyle?: "solid" | "dashed" | "dotted";
}

/** Extended, per-instance appearance (Style / Visibility tabs of the settings dialog). Backward compatible: absent = defaults. */
export interface IndicatorStyle {
  /** By plot key (see the definition's plots). */
  plots?: Record<string, PlotStyle>;
  /** By fill index. */
  fills?: Record<string, FillStyle>;
  /** By level index. */
  levels?: Record<string, LevelStyle>;
  /** Background band between the levels (RSI 30..70). */
  band?: FillStyle;
  /** Timeframe groups the indicator is shown on; missing group = shown. */
  tf?: Partial<Record<"seconds" | "minutes" | "hours" | "days" | "weeks" | "months", boolean>>;
  /** Placement override: draw on the main pane or in its own pane. Missing = the definition's default. */
  pane?: "main" | "own";
}

export interface IndicatorInstance {
  /** Unique per instance, e.g. "rsi-1". */
  uid: string;
  /** Definition id, e.g. "rsi". */
  id: string;
  params: Record<string, ParamValue>;
  visible: boolean;
  /** Extended appearance; absent for instances that were never restyled. */
  style?: IndicatorStyle;
}

export interface IndicatorsControllerLike {
  attach(engine: ChartEngine): void;
  detach(): void;
  list(): IndicatorInstance[];
  /** Adds an indicator with default params merged with `params`; returns its uid. */
  add(id: string, params?: Record<string, ParamValue>): string;
  remove(uid: string): void;
  /** `style` replaces the whole style of the instance (null clears it). */
  update(uid: string, patch: { params?: Record<string, ParamValue>; visible?: boolean; style?: IndicatorStyle | null }): void;
  /** Called after any change (list, params, visibility). Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
  /** JSON of the active instances, for saving with a layout. */
  serialize(): string;
  restore(json: string): void;
  /** Recompute after the candles changed (data loaded, history prepended, new bar). Cheap when nothing changed. */
  refresh(): void;
}

export type DrawingToolId = string;

export interface DrawingStyle {
  /** Line / border colour. May carry alpha ("rgba(r,g,b,a)"). */
  color: string;
  width: number;
  /** "solid" | "dashed" | "dotted" */
  dash: string;
  fill?: string;
  fillOpacity?: number;
  text?: string;
  /* ── properties (all optional and backward compatible; the per-tool schema is in drawings/props.ts) ── */
  extendLeft?: boolean;
  extendRight?: boolean;
  /** "none" | "arrow" */
  leftEnd?: string;
  rightEnd?: string;
  /** Background on/off (undefined = on). */
  showFill?: boolean;
  /** Border on/off (undefined = on). */
  showBorder?: boolean;
  borderColor?: string;
  /* text */
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  textColor?: string;
  showTextBg?: boolean;
  textBg?: string;
  showTextBorder?: boolean;
  textBorder?: string;
  /** "left" | "center" | "right" */
  textAlign?: string;
  /** "top" | "middle" | "bottom" */
  textVAlign?: string;
  textWrap?: boolean;
  /* labels */
  showPrice?: boolean;
  showPct?: boolean;
  showBars?: boolean;
  showTime?: boolean;
  showDist?: boolean;
  showAngle?: boolean;
  showStats?: boolean;
  showMid?: boolean;
  midColor?: string;
  midDash?: string;
  /* anything else a tool schema stores (new tools) */
  [key: string]: string | number | boolean | undefined;
}

export interface DrawingSelection {
  id: string;
  tool: DrawingToolId;
  style: DrawingStyle;
  locked: boolean;
  /** Hidden one by one (object tree). */
  hidden?: boolean;
  /** Every selected id (multi-selection); `id` is the primary one. */
  ids?: string[];
  count?: number;
}

export interface DrawingsControllerLike {
  attach(engine: ChartEngine): void;
  detach(): void;
  /** null = plain cursor (select/move existing drawings, pan the chart). */
  setTool(tool: DrawingToolId | null): void;
  getTool(): DrawingToolId | null;
  setMagnet(mode: "off" | "weak" | "strong"): void;
  getMagnet(): "off" | "weak" | "strong";
  setStayInDrawing(on: boolean): void;
  getStayInDrawing(): boolean;
  setHidden(on: boolean): void;
  isHidden(): boolean;
  setLockedAll(on: boolean): void;
  isLockedAll(): boolean;
  removeSelected(): void;
  removeAll(): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getSelection(): DrawingSelection | null;
  updateSelectedStyle(patch: Partial<DrawingStyle>): void;
  toggleSelectedLock(): void;
  cloneSelected(): void;
  /** Called after any change (tool, selection, list, style). Returns an unsubscribe function. */
  subscribe(cb: () => void): () => void;
  /** JSON of all drawings (anchored by time and price, so they survive a timeframe change). */
  serialize(): string;
  restore(json: string): void;

  /* ── properties dialog / context menu API ── */
  /** A copy-safe reference to a drawing (do not mutate; use updateById). */
  getById(id: string): Drawing | null;
  /**
   * Merges a patch into a drawing: `style` and `extra` are merged key by key (undefined removes a key),
   * `points` / `locked` replace. `opts.commit` (default: coalesced within 700 ms) controls the undo entry:
   * true pushes one now, false pushes none (used for the following live-preview edits of a dialog session).
   * `opts.replace` restores exactly the given style/extra (Cancel in the dialog).
   */
  updateById(id: string, patch: DrawingPatch, opts?: boolean | { commit?: boolean; replace?: boolean; dropUndo?: boolean }): void;
  /** The shell registers what happens when the user wants the properties of a drawing (gear, double click, context menu). */
  setSettingsHandler(cb: ((id: string) => void) | null): void;
  requestSettings(id: string): void;
  /** Stored per-tool defaults (`drawing_default` user data) that new drawings of that tool start with. */
  getToolDefault(toolId: string): { style?: Partial<DrawingStyle>; extra?: Record<string, unknown> } | null;
  setToolDefault(toolId: string, data: { style?: Partial<DrawingStyle>; extra?: Record<string, unknown> } | null): void;
  /** Bar index (fractional) of a chart time and back, plus the current timeframe in ms and price precision. */
  barIndexOf(t: number): number;
  timeOfBar(i: number): number;
  getViewInfo(): { intervalMs: number; precision: number; bars: number };
}
