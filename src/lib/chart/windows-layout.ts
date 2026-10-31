/**
 * Workspace of floating windows over the chart area: pure model (no DOM). Every window - the price chart itself ("main") and the extra windows
 * with indicators - is a rectangle given as FRACTIONS of the area (so a saved layout survives another screen size) with a z-order. The default
 * (nobody has added a window) is the classic single chart: no workspace, nothing is stored. The first extra window switches the workspace on:
 * the price chart becomes a window too (it starts filling the whole area) that can be moved and resized like the others.
 * Stored next to the indicators (one extra entry `{ws: ...}` of the indicator list, which older builds skip). The tiled layout of the first
 * multi-window build (`{lay: tree}`) is still read and turned into rectangles (`migrateTree`). Every stored value goes through the sanitisers
 * here: whatever is wrong with it, the result is a valid workspace or null (= the classic chart).
 * Run the check:  npx tsx scripts/check-windows-layout.ts
 */

/** Id of the price chart. */
export const MAIN_ID = "main";
/** Id of the pane inside the engine of an extra window (its indicators share this pane and its scale). */
export const WIN_PANE = "win";
/** `IndicatorsController.paneOf` of an indicator that lives in a window: WIN_PREFIX + window id. */
export const WIN_PREFIX = "win:";
/** Extra windows (the price chart is not counted). */
export const MAX_WINDOWS = 8;
/** Smallest window, CSS px, whatever the fractions say. */
export const MIN_WIN_W = 200;
export const MIN_WIN_H = 120;
/** Below this size of the chart area (CSS px) the windows fold back into one stack (phone / narrow window). Same threshold as pane-layout. */
export const MIN_AREA_W = 640;
export const MIN_AREA_H = 260;
/** Size of a new window: share of the area. */
export const NEW_W = 0.4;
export const NEW_H = 0.35;
/** Smallest fraction a stored value may have (the pixel floors decide the rest on screen). */
const MIN_FRAC = 0.05;
const ID_RE = /^[a-z][a-z0-9]{0,11}$/;
const fin = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** "chart": a price chart (the main one); "ind": a window with indicators. */
export type WinKind = "ind" | "chart";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WsWindow extends Rect {
  id: string;
  kind: WinKind;
  /** Stacking order: a bigger number is on top. */
  z: number;
  /** The chart whose bars and time view an indicator window follows (only the price chart for now). */
  link: string;
}

/** wins[0] is always the price chart. */
export interface Workspace {
  wins: WsWindow[];
}

/* ───────────── queries ───────────── */

const mainWin = (): WsWindow => ({ id: MAIN_ID, kind: "chart", x: 0, y: 0, w: 1, h: 1, z: 1, link: MAIN_ID });

/** Windows besides the price chart, in creation order. */
export const extraIds = (ws: Workspace | null): string[] => (ws ? ws.wins.filter((w) => w.id !== MAIN_ID).map((w) => w.id) : []);

export const hasWindow = (ws: Workspace | null, id: string): boolean => !!ws && ws.wins.some((w) => w.id === id);

/** The workspace is on: there is something besides the price chart. */
export const isActive = (ws: Workspace | null): ws is Workspace => !!ws && ws.wins.length > 1;

/** 1-based number of an extra window ("Window 2"), 0 for the price chart / an unknown id. */
export const windowNumber = (ws: Workspace | null, id: string): number => extraIds(ws).indexOf(id) + 1;

/** Lowest free id "w1", "w2" ... */
export function newWindowId(ws: Workspace | null): string {
  const used = new Set((ws?.wins ?? []).map((w) => w.id));
  for (let i = 1; ; i++) if (!used.has(`w${i}`)) return `w${i}`;
}

const topZ = (ws: Workspace | null): number => (ws ? ws.wins.reduce((m, w) => Math.max(m, w.z), 0) : 0);

/* ───────────── edits (all return a new workspace, the old one is never changed) ───────────── */

/** Where the n-th extra window opens: a cascade inside the area (never exactly over the previous one, never outside). */
export function cascadeRect(n: number): Rect {
  const k = n % 6;
  return { x: 0.55 - 0.05 * k, y: 0.6 - 0.07 * k, w: NEW_W, h: NEW_H };
}

/** Adds an empty indicator window. Null when there are too many windows. */
export function addWindow(ws: Workspace | null, id?: string): { ws: Workspace; id: string } | null {
  const base: Workspace = ws ?? { wins: [mainWin()] };
  if (extraIds(base).length >= MAX_WINDOWS) return null;
  const wid = id && ID_RE.test(id) && !hasWindow(base, id) ? id : newWindowId(base);
  const win: WsWindow = { id: wid, kind: "ind", ...cascadeRect(extraIds(base).length), z: topZ(base) + 1, link: MAIN_ID };
  return { ws: { wins: [...base.wins, win] }, id: wid };
}

/** Closes a window. The price chart cannot be closed. Null when nothing is left but the price chart (back to the classic look). */
export function closeWindow(ws: Workspace | null, id: string): Workspace | null {
  if (!ws || id === MAIN_ID || !hasWindow(ws, id)) return ws;
  const out: Workspace = { wins: ws.wins.filter((w) => w.id !== id) };
  return isActive(out) ? out : null;
}

const clampFrac = (r: Rect): Rect => {
  const w = Math.min(1, Math.max(MIN_FRAC, fin(r.w) ? r.w : NEW_W));
  const h = Math.min(1, Math.max(MIN_FRAC, fin(r.h) ? r.h : NEW_H));
  return { w, h, x: Math.min(1 - w, Math.max(0, fin(r.x) ? r.x : 0)), y: Math.min(1 - h, Math.max(0, fin(r.y) ? r.y : 0)) };
};

/** Sets the rectangle of a window (fractions, kept inside the area). The same object comes back when nothing changed. */
export function setRect(ws: Workspace | null, id: string, r: Rect): Workspace | null {
  if (!ws) return ws;
  const i = ws.wins.findIndex((w) => w.id === id);
  if (i < 0) return ws;
  const c = clampFrac(r);
  const w = ws.wins[i];
  if (Math.abs(w.x - c.x) < 1e-6 && Math.abs(w.y - c.y) < 1e-6 && Math.abs(w.w - c.w) < 1e-6 && Math.abs(w.h - c.h) < 1e-6) return ws;
  const wins = ws.wins.slice();
  wins[i] = { ...w, ...c };
  return { wins };
}

/** Brings a window to the front. The same object comes back when it is there already. */
export function raise(ws: Workspace | null, id: string): Workspace | null {
  if (!ws) return ws;
  const w = ws.wins.find((x) => x.id === id);
  if (!w || (w.z >= topZ(ws) && ws.wins.filter((x) => x.z === w.z).length === 1)) return ws;
  // z-orders stay 1..n (what is stored is what parseWorkspace would make of it)
  const order = ws.wins.map((x, i) => ({ id: x.id, z: x.id === id ? Infinity : x.z, i })).sort((a, b) => a.z - b.z || a.i - b.i);
  const rank = new Map(order.map((o, k) => [o.id, k + 1]));
  return { wins: ws.wins.map((x) => ({ ...x, z: rank.get(x.id) as number })) };
}

/* ───────────── pixels <-> fractions, dragging ───────────── */

/** A window in CSS px of an area W x H: not smaller than the floors (unless the area is), always inside the area. */
export function rectPx(r: Rect, W: number, H: number): Rect {
  const aw = Math.max(0, fin(W) ? W : 0);
  const ah = Math.max(0, fin(H) ? H : 0);
  const w = Math.min(aw, Math.max(MIN_WIN_W, r.w * aw));
  const h = Math.min(ah, Math.max(MIN_WIN_H, r.h * ah));
  return { w, h, x: Math.min(Math.max(0, aw - w), Math.max(0, r.x * aw)), y: Math.min(Math.max(0, ah - h), Math.max(0, r.y * ah)) };
}

export function rectFromPx(r: Rect, W: number, H: number): Rect {
  if (!(W > 0) || !(H > 0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H };
}

export type DragMode = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** The rectangle (px) after the pointer moved by dx / dy: a move keeps the size, an edge / corner changes the size down to the floors; always inside the area. */
export function dragRect(start: Rect, mode: DragMode, dx: number, dy: number, W: number, H: number): Rect {
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;
  if (mode === "move") {
    const x = clamp(start.x + dx, 0, W - start.w);
    const y = clamp(start.y + dy, 0, H - start.h);
    return { x, y, w: start.w, h: start.h };
  }
  if (mode.includes("w")) left = clamp(left + dx, 0, right - MIN_WIN_W);
  if (mode.includes("e")) right = clamp(right + dx, left + MIN_WIN_W, W);
  if (mode.includes("n")) top = clamp(top + dy, 0, bottom - MIN_WIN_H);
  if (mode.includes("s")) bottom = clamp(bottom + dy, top + MIN_WIN_H, H);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/* ───────────── stored form ───────────── */

/** Plain JSON of a workspace (fractions rounded). */
export function serializeWorkspace(ws: Workspace): unknown {
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return { v: 2, wins: ws.wins.map((w) => ({ id: w.id, kind: w.kind, x: r(w.x), y: r(w.y), w: r(w.w), h: r(w.h), z: w.z, link: w.link })) };
}

/**
 * Any stored value -> a valid workspace or null. A broken window is dropped, a repeated / odd id is dropped, a window outside the area is pulled
 * back in, z-orders become 1..n, a missing price chart gets the whole area, more windows than MAX_WINDOWS are cut. Nothing but the price chart: null.
 */
export function parseWorkspace(raw: unknown): Workspace | null {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { wins?: unknown }).wins)) return null;
  const seen = new Set<string>();
  const list: WsWindow[] = [];
  let extra = 0;
  for (const v of (raw as { wins: unknown[] }).wins) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const id = o.id;
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id) || (id !== MAIN_ID && o.kind !== "ind")) continue;
    if (id !== MAIN_ID) {
      if (extra >= MAX_WINDOWS) continue;
      extra++;
    }
    seen.add(id);
    const c = id === MAIN_ID && !(fin(o.w) && fin(o.h)) ? { x: 0, y: 0, w: 1, h: 1 } : clampFrac({ x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number });
    list.push({ id, kind: id === MAIN_ID ? "chart" : "ind", ...c, z: fin(o.z) ? o.z : 0, link: MAIN_ID });
  }
  if (!seen.has(MAIN_ID)) list.unshift(mainWin());
  // z by rank (ties keep the stored order), the price chart first in the list
  const ranked = list.map((w, i) => ({ w, i })).sort((a, b) => a.w.z - b.w.z || a.i - b.i);
  ranked.forEach((e, k) => (e.w.z = k + 1));
  const main = list.find((w) => w.id === MAIN_ID) as WsWindow;
  const wins = [main, ...list.filter((w) => w !== main)];
  return wins.length > 1 ? { wins } : null;
}

/* ───────────── the tiled layout of the first multi-window build ───────────── */

export type SplitDir = "h" | "v";
export type WinNode = { kind: "win"; id: string } | { kind: "split"; dir: SplitDir; ratio: number; a: WinNode; b: WinNode };

export const MAX_DEPTH = 8;

export function leafIds(n: WinNode | null): string[] {
  if (!n) return [MAIN_ID];
  return n.kind === "win" ? [n.id] : [...leafIds(n.a), ...leafIds(n.b)];
}

/**
 * Old stored tree -> a valid tree or null (broken pieces are dropped, repeated ids, bad ids, more windows than allowed, trees deeper than
 * MAX_DEPTH are cut away; no price chart in the result: null).
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
    return { kind: "split", dir: o.dir, ratio: fin(o.ratio) ? Math.min(0.96, Math.max(0.04, o.ratio)) : 0.5, a, b };
  };
  const root = walk(raw, 0);
  return root && leafIds(root).includes(MAIN_ID) && leafIds(root).length > 1 ? root : null;
}

/** The tiles of an old tree as windows of a workspace (same places, side by side as they were), null for a single chart. */
export function migrateTree(tree: WinNode | null): Workspace | null {
  if (!tree) return null;
  const tiles: Record<string, Rect> = {};
  const walk = (t: WinNode, r: Rect) => {
    if (t.kind === "win") {
      tiles[t.id] = r;
      return;
    }
    if (t.dir === "h") {
      walk(t.a, { x: r.x, y: r.y, w: r.w * t.ratio, h: r.h });
      walk(t.b, { x: r.x + r.w * t.ratio, y: r.y, w: r.w * (1 - t.ratio), h: r.h });
    } else {
      walk(t.a, { x: r.x, y: r.y, w: r.w, h: r.h * t.ratio });
      walk(t.b, { x: r.x, y: r.y + r.h * t.ratio, w: r.w, h: r.h * (1 - t.ratio) });
    }
  };
  walk(tree, { x: 0, y: 0, w: 1, h: 1 });
  const ids = leafIds(tree);
  return parseWorkspace({ wins: ids.map((id, i) => ({ id, kind: id === MAIN_ID ? "chart" : "ind", ...tiles[id], z: id === MAIN_ID ? 0 : i + 1 })) });
}
