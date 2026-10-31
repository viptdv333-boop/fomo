/**
 * Multi-window layout of the chart: pure model (no DOM). The chart area is a tree of splits; every leaf is a window. The leaf "main" is the
 * price chart, the others show the indicators the user moved there (see IndicatorsController: `w` of an indicator = the id of its window).
 *   {kind:"split", dir:"h", ratio, a, b}   a | b side by side, `ratio` = the share of `a` along the split
 *   {kind:"split", dir:"v", ratio, a, b}   a over b
 *   {kind:"win", id}
 * The tree is saved next to the indicators (one extra entry `{lay: ...}` of the indicator JSON, which older builds skip) and every stored tree is
 * checked by `parseLayout`: whatever is wrong with it, the result is a valid tree or null (= the single-window chart, as before).
 * Run the check:  npx tsx scripts/check-windows-layout.ts
 */

export type SplitDir = "h" | "v";
export type WinNode = { kind: "win"; id: string } | { kind: "split"; dir: SplitDir; ratio: number; a: WinNode; b: WinNode };

/** Id of the price chart in the tree. */
export const MAIN_ID = "main";
/** Id of the pane inside the engine of an extra window (its indicators share this pane and its scale). */
export const WIN_PANE = "win";
/** `IndicatorsController.paneOf` of an indicator that lives in a window: WIN_PREFIX + window id. */
export const WIN_PREFIX = "win:";
/** Extra windows (the main chart is not counted). */
export const MAX_WINDOWS = 6;
/** Deepest nesting of splits that is accepted from a stored tree. */
export const MAX_DEPTH = 8;
/** Share of the smaller side of a split that no drag and no stored value goes under (the pixel floors below decide the rest). */
export const MIN_RATIO = 0.04;
/** Share a new window takes (the first one / the next ones: the main chart gives up less each time). */
export const FIRST_SHARE = 0.32;
export const NEXT_SHARE = 0.25;
/** Thickness of the divider between two tiles, CSS px. */
export const DIVIDER_PX = 6;
/** Smallest tile, CSS px: the price chart / an extra window. */
export const MIN_MAIN_W = 260;
export const MIN_MAIN_H = 180;
export const MIN_WIN_W = 150;
export const MIN_WIN_H = 90;
/** Below this width of the chart area (CSS px) the windows fold back into one stack (phone / narrow window). Same threshold as pane-layout. */
export const MIN_AREA_W = 640;
export const MIN_AREA_H = 260;

const fin = (v: unknown): v is number => typeof v === "number" && isFinite(v);
const ID_RE = /^[a-z][a-z0-9]{0,11}$/;

export const clampRatio = (r: number): number => Math.min(1 - MIN_RATIO, Math.max(MIN_RATIO, r));

/* ───────────── queries ───────────── */

export const mainLayout = (): WinNode => ({ kind: "win", id: MAIN_ID });

export function leafIds(n: WinNode | null): string[] {
  if (!n) return [MAIN_ID];
  return n.kind === "win" ? [n.id] : [...leafIds(n.a), ...leafIds(n.b)];
}

/** Ids of the extra windows in reading order (left to right, top to bottom). */
export function windowIds(n: WinNode | null): string[] {
  return leafIds(n).filter((id) => id !== MAIN_ID);
}

export const hasLeaf = (n: WinNode | null, id: string): boolean => leafIds(n).includes(id);

/** More than the main chart. */
export const isMulti = (n: WinNode | null): boolean => !!n && windowIds(n).length > 0;

/** 1-based number of an extra window in reading order ("Window 2"), 0 for the main chart / an unknown id. */
export function windowNumber(n: WinNode | null, id: string): number {
  return windowIds(n).indexOf(id) + 1;
}

/** Lowest free id "w1", "w2" ... */
export function newWindowId(n: WinNode | null): string {
  const used = new Set(leafIds(n));
  for (let i = 1; ; i++) if (!used.has(`w${i}`)) return `w${i}`;
}

/* ───────────── edits (all return a new tree, the old one is never changed) ───────────── */

/**
 * Adds an empty window. `at` = the leaf to split (the new window goes right of / below it, 50:50); without `at` the whole area is split: the new
 * window takes a strip along the right / bottom edge. Null when there are too many windows already.
 */
export function addWindow(n: WinNode | null, dir: SplitDir, at?: string, id?: string): { tree: WinNode; id: string } | null {
  const root = n ?? mainLayout();
  if (windowIds(root).length >= MAX_WINDOWS) return null;
  if (at !== undefined && !hasLeaf(root, at)) return null;
  const wid = id && ID_RE.test(id) && !hasLeaf(root, id) ? id : newWindowId(root);
  const leaf: WinNode = { kind: "win", id: wid };
  if (at === undefined) {
    const share = windowIds(root).length === 0 ? FIRST_SHARE : NEXT_SHARE;
    return { tree: { kind: "split", dir, ratio: clampRatio(1 - share), a: root, b: leaf }, id: wid };
  }
  const put = (t: WinNode): WinNode => {
    if (t.kind === "win") return t.id === at ? { kind: "split", dir, ratio: 0.5, a: t, b: leaf } : t;
    return { ...t, a: put(t.a), b: put(t.b) };
  };
  return { tree: put(root), id: wid };
}

/** Removes a window: its sibling takes the room. The main chart cannot be closed. Returns null when nothing is left but the main chart. */
export function closeWindow(n: WinNode | null, id: string): WinNode | null {
  if (!n || id === MAIN_ID) return n;
  const drop = (t: WinNode): WinNode => {
    if (t.kind === "win") return t;
    if (t.a.kind === "win" && t.a.id === id) return t.b;
    if (t.b.kind === "win" && t.b.id === id) return t.a;
    return { ...t, a: drop(t.a), b: drop(t.b) };
  };
  const out = drop(n);
  return isMulti(out) ? out : null;
}

/** The node at a path of "a" / "b" steps from the root ("" = the root), or null. */
export function nodeAt(n: WinNode | null, path: string): WinNode | null {
  let cur = n;
  for (const ch of path) {
    if (!cur || cur.kind !== "split") return null;
    cur = ch === "a" ? cur.a : ch === "b" ? cur.b : null;
  }
  return cur;
}

/** Sets the ratio of the split at `path` (clamped). The same tree object comes back when nothing changed. */
export function setRatioAt(n: WinNode | null, path: string, ratio: number): WinNode | null {
  if (!n || !fin(ratio)) return n;
  const r = clampRatio(ratio);
  const go = (t: WinNode, rest: string): WinNode => {
    if (t.kind !== "split") return t;
    if (rest === "") return Math.abs(t.ratio - r) < 1e-9 ? t : { ...t, ratio: r };
    const next = rest[0] === "a" ? go(t.a, rest.slice(1)) : rest[0] === "b" ? go(t.b, rest.slice(1)) : null;
    if (next === null) return t;
    return rest[0] === "a" ? (next === t.a ? t : { ...t, a: next }) : next === t.b ? t : { ...t, b: next };
  };
  return go(n, path);
}

/* ───────────── stored form ───────────── */

/** Plain JSON of a tree (ratios rounded). */
export function serializeLayout(n: WinNode): unknown {
  if (n.kind === "win") return { kind: "win", id: n.id };
  return { kind: "split", dir: n.dir, ratio: Math.round(n.ratio * 10000) / 10000, a: serializeLayout(n.a), b: serializeLayout(n.b) };
}

/**
 * Any stored value -> a valid tree or null. Broken pieces are dropped (a split with one good side becomes that side), a repeated id, an id that
 * is not "w<n>"-like, more windows than MAX_WINDOWS and trees deeper than MAX_DEPTH are cut away. No main chart in the result: null.
 */
export function parseLayout(raw: unknown): WinNode | null {
  const seen = new Set<string>();
  let extra = 0;
  const walk = (v: unknown, depth: number): WinNode | null => {
    if (!v || typeof v !== "object" || depth > MAX_DEPTH) return null;
    const o = v as Record<string, unknown>;
    if (o.kind === "win") {
      const id = o.id;
      if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) return null;
      if (id !== MAIN_ID) {
        if (extra >= MAX_WINDOWS) return null;
        extra++;
      }
      seen.add(id);
      return { kind: "win", id };
    }
    if (o.kind !== "split" || (o.dir !== "h" && o.dir !== "v")) return null;
    const a = walk(o.a, depth + 1);
    const b = walk(o.b, depth + 1);
    if (!a || !b) return a ?? b;
    return { kind: "split", dir: o.dir, ratio: fin(o.ratio) ? clampRatio(o.ratio) : 0.5, a, b };
  };
  const root = walk(raw, 0);
  return root && hasLeaf(root, MAIN_ID) && isMulti(root) ? root : null;
}

/* ───────────── geometry ───────────── */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A draggable divider: where it is, which split it belongs to and how far its ratio may go for the current size. */
export interface Divider {
  /** Path of the split in the tree (see nodeAt). */
  path: string;
  dir: SplitDir;
  /** The strip between the two tiles. */
  rect: Rect;
  /** The room of the whole split (both tiles and the strip). */
  parent: Rect;
  minRatio: number;
  maxRatio: number;
}

export interface Geometry {
  /** Tile of every window by id (including "main"). */
  tiles: Record<string, Rect>;
  dividers: Divider[];
}

/** Smallest size of a subtree along the x ("w") or y ("h") axis. */
export function minSize(n: WinNode, axis: "w" | "h", gap = DIVIDER_PX): number {
  if (n.kind === "win") return n.id === MAIN_ID ? (axis === "w" ? MIN_MAIN_W : MIN_MAIN_H) : axis === "w" ? MIN_WIN_W : MIN_WIN_H;
  const along = (n.dir === "h") === (axis === "w");
  const a = minSize(n.a, axis, gap);
  const b = minSize(n.b, axis, gap);
  return along ? a + b + gap : Math.max(a, b);
}

/**
 * Tiles and dividers of a tree in `area`. A ratio that would push a tile under its floor is pulled back; when the area is too small for the
 * floors the tiles share it in proportion to them (nothing ever gets a negative size).
 */
export function computeGeometry(n: WinNode, area: Rect, gap = DIVIDER_PX): Geometry {
  const out: Geometry = { tiles: {}, dividers: [] };
  const walk = (t: WinNode, r: Rect, path: string) => {
    if (t.kind === "win") {
      out.tiles[t.id] = { x: r.x, y: r.y, w: Math.max(0, r.w), h: Math.max(0, r.h) };
      return;
    }
    const horiz = t.dir === "h";
    const total = Math.max(0, (horiz ? r.w : r.h) - gap);
    const axis = horiz ? "w" : "h";
    const minA = minSize(t.a, axis, gap);
    const minB = minSize(t.b, axis, gap);
    let lo: number;
    let hi: number;
    if (total >= minA + minB) {
      lo = minA / (total || 1);
      hi = 1 - minB / (total || 1);
    } else {
      lo = hi = minA / (minA + minB || 1);
    }
    // a broken ratio (NaN: a tree that did not come through parseLayout) is the middle, never a NaN size
    const ratio = Math.min(hi, Math.max(lo, fin(t.ratio) ? t.ratio : 0.5));
    const sa = total * ratio;
    const ra: Rect = horiz ? { x: r.x, y: r.y, w: sa, h: r.h } : { x: r.x, y: r.y, w: r.w, h: sa };
    const strip: Rect = horiz ? { x: r.x + sa, y: r.y, w: gap, h: r.h } : { x: r.x, y: r.y + sa, w: r.w, h: gap };
    const rb: Rect = horiz ? { x: r.x + sa + gap, y: r.y, w: Math.max(0, total - sa), h: r.h } : { x: r.x, y: r.y + sa + gap, w: r.w, h: Math.max(0, total - sa) };
    out.dividers.push({ path, dir: t.dir, rect: strip, parent: r, minRatio: lo, maxRatio: hi });
    walk(t.a, ra, path + "a");
    walk(t.b, rb, path + "b");
  };
  walk(n, area, "");
  return out;
}

/** The ratio a divider gets when its centre is dragged to `pos` (x for "h", y for "v"; same coordinates as the geometry), within its limits. */
export function ratioAtPointer(d: Divider, pos: number, gap = DIVIDER_PX): number {
  const horiz = d.dir === "h";
  const start = horiz ? d.parent.x : d.parent.y;
  const total = Math.max(1, (horiz ? d.parent.w : d.parent.h) - gap);
  const r = (pos - gap / 2 - start) / total;
  return Math.min(d.maxRatio, Math.max(d.minRatio, r));
}
