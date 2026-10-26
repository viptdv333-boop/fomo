/**
 * Heights of the chart panes: pure ratio logic (no DOM). The main (price) pane takes what the indicator panes leave; every
 * indicator pane keeps its own share of the plot height (a RATIO, so a saved layout survives another window height). The share is
 * stored with the indicator (IndicatorsController serialize: `pr` desktop / `pm` narrow chart) and goes through the same local-first
 * + account sync as the indicator list.
 */

/** Smallest share of one indicator pane (also the thinnest "strip" a divider can be dragged to). */
export const MIN_SUB_RATIO = 0.05;
/** Largest share of one indicator pane. */
export const MAX_ONE_RATIO = 0.5;
/** All indicator panes together: the price pane keeps at least 40%. */
export const MAX_SUB_TOTAL = 0.6;
/** A layout nobody has dragged yet: the indicator panes share at most this much, the price pane keeps 60% and more. */
export const DEFAULT_SUB_TOTAL = 0.4;
/** Pixel floors used when the ratios are turned into heights (a strip stays readable, the price pane stays usable). */
export const MIN_SUB_PX = 40;
export const MIN_MAIN_PX = 120;
/** A chart narrower than this (CSS px) is a "phone" layout: it keeps its own heights. */
export const COMPACT_MAX_WIDTH = 640;

const EPS = 1e-9;
const fin = (v: unknown): v is number => typeof v === "number" && isFinite(v);

export const clampSub = (r: number): number => Math.min(MAX_ONE_RATIO, Math.max(MIN_SUB_RATIO, r));

export const isCompactWidth = (w: number): boolean => w > 0 && w < COMPACT_MAX_WIDTH;

/** A stored ratio (any JSON value) -> a valid share, or undefined when there is none. */
export function parseRatio(v: unknown): number | undefined {
  return fin(v) && v > 0 ? clampSub(v) : undefined;
}

const sum = (a: readonly number[]) => a.reduce((s, x) => s + x, 0);

/** Scales the shares down (keeping the proportions, never below MIN_SUB_RATIO) until together they fit `cap`. */
export function capTotal(rs: readonly number[], cap = MAX_SUB_TOTAL): number[] {
  const out = rs.slice();
  for (let iter = 0; iter < 8; iter++) {
    if (sum(out) <= cap + EPS) break;
    let fixed = 0;
    let free = 0;
    for (const x of out) {
      if (x <= MIN_SUB_RATIO + EPS) fixed += x;
      else free += x;
    }
    if (free <= EPS) break;
    const k = (cap - fixed) / free;
    if (k <= 0) {
      for (let i = 0; i < out.length; i++) out[i] = MIN_SUB_RATIO;
      break;
    }
    for (let i = 0; i < out.length; i++) if (out[i] > MIN_SUB_RATIO + EPS) out[i] = Math.max(MIN_SUB_RATIO, out[i] * k);
  }
  return out;
}

/**
 * A new pane is added to a layout: it gets `weight` (not more than the average of the panes already there, so a layout of thin
 * strips does not get a fat newcomer) and the price pane and the existing panes give it room in proportion to their size.
 * Returns the new shares of the existing panes (same order) and the share of the new one.
 */
export function addPane(existing: readonly number[], weight: number): { existing: number[]; added: number } {
  const w = clampSub(fin(weight) ? weight : 0.18);
  const added = existing.length ? clampSub(Math.min(w, sum(existing) / existing.length)) : w;
  const k = 1 - added;
  const all = capTotal([...existing.map((x) => clampSub(x * k)), added]);
  return { existing: all.slice(0, existing.length), added: all[existing.length] };
}

/** The pane at `idx` is gone: the others keep their shares (the price pane takes the freed room). */
export function removePane(rs: readonly number[], idx: number): number[] {
  return rs.filter((_, i) => i !== idx);
}

export interface PaneEntry {
  /** Stored share (any value is checked), null / undefined: this pane has never been sized. */
  saved?: unknown;
  /** The indicator's own default share. */
  weight: number;
}

/**
 * Shares of all indicator panes (in order) from what is stored: stored shares are kept as they are (only checked), panes without a
 * stored share are added one after another the way a new pane is. A layout nobody has touched gets the default look: the price
 * pane keeps about 60-80%, the panes share the rest by their default weights.
 */
export function resolveRatios(entries: readonly PaneEntry[]): number[] {
  const n = entries.length;
  if (n === 0) return [];
  const saved = entries.map((e) => parseRatio(e.saved));
  if (saved.every((s) => s === undefined)) {
    const w = entries.map((e) => clampSub(fin(e.weight) ? e.weight : 0.18));
    const total = sum(w);
    const k = total > DEFAULT_SUB_TOTAL ? DEFAULT_SUB_TOTAL / total : 1;
    return capTotal(
      w.map((x) => clampSub(x * k)),
      MAX_SUB_TOTAL,
    );
  }
  const vals: (number | undefined)[] = saved.slice();
  const present: number[] = [];
  vals.forEach((v, i) => {
    if (v !== undefined) present.push(i);
  });
  for (let i = 0; i < n; i++) {
    if (vals[i] !== undefined) continue;
    const r = addPane(
      present.map((j) => vals[j] as number),
      entries[i].weight,
    );
    present.forEach((j, k) => (vals[j] = r.existing[k]));
    vals[i] = r.added;
    present.push(i);
  }
  return capTotal(vals as number[]);
}

/** A divider above pane `idx` is dragged: `delta` is the change of that pane's share (up = bigger). The price pane absorbs it. */
export function dragRatio(rs: readonly number[], idx: number, delta: number): number[] {
  const out = rs.slice();
  if (idx < 0 || idx >= out.length || !fin(delta)) return out;
  const others = sum(out) - out[idx];
  const hi = Math.max(MIN_SUB_RATIO, Math.min(MAX_ONE_RATIO, MAX_SUB_TOTAL - others));
  out[idx] = Math.min(hi, Math.max(MIN_SUB_RATIO, out[idx] + delta));
  return out;
}

/** Shares -> pixel heights of the plot: the panes never go under MIN_SUB_PX unless the chart is tiny, the price pane keeps its floor. */
export function layoutHeights(plotH: number, rs: readonly number[]): { main: number; subs: number[] } {
  const H = fin(plotH) ? Math.max(0, plotH) : 0; // NaN / Infinity never reach the canvas
  if (rs.length === 0) return { main: H, subs: [] };
  // a broken share (NaN, negative, > 1: a stored value is checked on load, this is the last line) counts as the smallest one
  const capped = capTotal(rs.map((r) => (fin(r) ? clampSub(r) : MIN_SUB_RATIO)));
  let hs = capped.map((r) => H * r);
  const budget = Math.max(H * 0.35, H - MIN_MAIN_PX);
  const raised = hs.map((h) => Math.max(h, Math.min(MIN_SUB_PX, budget / rs.length)));
  const tot = sum(raised);
  hs = tot > budget ? raised.map((h) => (h * budget) / tot) : raised;
  return { main: H - sum(hs), subs: hs };
}
