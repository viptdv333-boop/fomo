import type { DrawingStyle } from "../contracts";

/** An anchor of a drawing: time (ms, same clock as Candle.t) and price. Never a bar index. */
export interface DPoint {
  t: number;
  p: number;
}

export interface Drawing {
  id: string;
  tool: string;
  points: DPoint[];
  style: DrawingStyle;
  locked: boolean;
  /** Hidden by the user (object tree / context menu); not drawn and not selectable. */
  hidden?: boolean;
  /** Custom name shown in the object tree. */
  name?: string;
  extra?: Record<string, unknown>;
}

/** What updateById merges: style / extra key by key (undefined removes a key), points and locked replace. */
export interface DrawingPatch {
  style?: Partial<DrawingStyle>;
  extra?: Record<string, unknown>;
  points?: DPoint[];
  locked?: boolean;
}

export type Magnet = "off" | "weak" | "strong";

export interface SerializedDrawings {
  v: 1;
  drawings: Drawing[];
}

/** Screen point, CSS pixels inside the chart canvas. */
export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Translatable strings used inside drawings (measure labels etc). The toolbar pushes translated ones. */
export interface DrawLabels {
  bars: string;
  d: string;
  h: string;
  m: string;
  rr: string;
  entry: string;
  stop: string;
  target: string;
  price: string;
  empty: string;
  /** Optional extras (position tools); English fallbacks are used when the shell does not push them. */
  qty?: string;
  risk?: string;
  reward?: string;
}

export const DEFAULT_LABELS: DrawLabels = {
  bars: "bars",
  d: "d",
  h: "h",
  m: "m",
  rr: "R:R",
  entry: "Entry",
  stop: "Stop",
  target: "Target",
  price: "Price",
  empty: "Aa",
};
