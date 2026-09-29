import type { ChartEngine } from "./engine";

/* Shared contracts between the chart modules (indicators, drawings, terminal shell).
   Each module implements its side; the shell only talks to these interfaces. */

export type ParamValue = number | string | boolean;

export interface IndicatorInstance {
  /** Unique per instance, e.g. "rsi-1". */
  uid: string;
  /** Definition id, e.g. "rsi". */
  id: string;
  params: Record<string, ParamValue>;
  visible: boolean;
}

export interface IndicatorsControllerLike {
  attach(engine: ChartEngine): void;
  detach(): void;
  list(): IndicatorInstance[];
  /** Adds an indicator with default params merged with `params`; returns its uid. */
  add(id: string, params?: Record<string, ParamValue>): string;
  remove(uid: string): void;
  update(uid: string, patch: { params?: Record<string, ParamValue>; visible?: boolean }): void;
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
  color: string;
  width: number;
  /** "solid" | "dashed" | "dotted" */
  dash: string;
  fill?: string;
  fillOpacity?: number;
  text?: string;
}

export interface DrawingSelection {
  id: string;
  tool: DrawingToolId;
  style: DrawingStyle;
  locked: boolean;
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
}
