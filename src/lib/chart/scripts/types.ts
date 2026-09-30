/* Shared types of the user-script (custom indicator) subsystem. Pure types, no runtime code. */

export const SCRIPT_KIND = "indicator_script";
export const SCRIPT_ID_PREFIX = "usr_";

/** Hard limits, enforced inside the worker (and again on the main thread when decoding). */
export const SCRIPT_LIMITS = { plots: 20, values: 5_000_000, shapes: 2000, timeoutMs: 1500, codeChars: 100_000 } as const;

export type ScriptInputType = "int" | "float" | "bool" | "string" | "select" | "color";

export interface ScriptInputDecl {
  key: string;
  name: string;
  type: ScriptInputType;
  def: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  /** A `source` input: a select whose value the script turns into a series. */
  source?: boolean;
  group?: string;
}

export type ScriptFormat = "inherit" | "price" | "volume" | "percent";

/** What the script declared about itself (ctx.indicator + inputs). Cached with the saved script so that the
    definition can be registered without running the code. */
export interface ScriptMeta {
  name: string;
  overlay: boolean;
  format: ScriptFormat;
  minmax: [number, number] | null;
  paneRatio: number;
  inputs: ScriptInputDecl[];
}

/** A saved script. Stored per user as kind `indicator_script`, key = id. */
export interface ScriptRecord {
  id: string;
  name: string;
  code: string;
  meta?: ScriptMeta;
  updatedAt?: string;
}

export interface ScriptError {
  message: string;
  line: number | null;
  col: number | null;
  syntax?: boolean;
  /** "timeout" | "worker" | "limit" | undefined (script's own error) */
  kind?: "timeout" | "worker" | "limit";
}

export interface ScriptShape {
  /** Bar index. */
  i: number;
  /** Shape kind. */
  s: string;
  /** "a" above, "b" below, "x" absolute. */
  l: "a" | "b" | "x";
  /** Price (absolute) or NaN. */
  p: number;
  c: string;
  t: string;
  tc: string;
  /** Size in px. */
  z: number;
}

export interface EncColors {
  pal: string[];
  /** 0 = none, k = pal[k-1]; null = the single palette color for every bar. */
  idx: Uint16Array | null;
}

export interface ScriptPlotOut {
  title: string;
  style: "line" | "histogram" | "area" | "columns" | "circles" | "step";
  color: string;
  pal: string[];
  idx: Uint16Array | null;
  width: number;
  linestyle: "solid" | "dashed" | "dotted";
  offset: number;
  hidden: boolean;
  pricelabel: boolean | null;
  legend: boolean | null;
  connect: boolean;
  data: Float64Array;
}

export interface ScriptHLineOut {
  price: number;
  title: string;
  color: string;
  linestyle: "solid" | "dashed" | "dotted";
  width: number;
}

export type FillRef = { t: "plot"; i: number } | { t: "hline"; i: number } | { t: "ser"; data: Float64Array };

export interface ScriptFillOut {
  a: FillRef;
  b: FillRef;
  title: string;
  color: string;
  colorUp: string;
  colorDown: string;
}

export interface ScriptAlertOut {
  message: string;
  count: number;
  last: boolean;
}

/** Raw answer of the worker. */
export interface WorkerDone {
  type: "done";
  id: number;
  ok: boolean;
  error: ScriptError | null;
  logs: string[];
  inputs: ScriptInputDecl[];
  meta: { name: string; overlay: boolean; format: ScriptFormat; minmax: [number, number] | null; paneRatio: number; precision: number } | null;
  ms: number;
  n: number;
  alerts: ScriptAlertOut[];
  shapesCut: boolean;
  plots?: ScriptPlotOut[];
  hlines?: ScriptHLineOut[];
  fills?: ScriptFillOut[];
  bg?: EncColors[];
  bar?: EncColors[];
  shapes?: ScriptShape[];
}

/** What the drawExtra painter of a script indicator needs (kept in IndResult.extra). */
export interface ScriptExtra {
  kind: "script";
  overlay: boolean;
  shapes: ScriptShape[];
  bg: EncColors[];
  bar: EncColors[];
}

/** Snapshot for the editor's output panels. */
export interface ScriptStatus {
  pending: boolean;
  ok: boolean;
  error: ScriptError | null;
  logs: string[];
  alerts: ScriptAlertOut[];
  ms: number;
  bars: number;
  shapesCut: boolean;
  /** Number of runs so far (lets the UI notice a fresh result). */
  seq: number;
}
