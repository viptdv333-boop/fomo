/**
 * Workspace of floating windows over the chart area: pure model (no DOM). Every window - the price chart itself ("main") and the extra windows -
 * is a rectangle given as FRACTIONS of the area (so a saved layout survives another screen size) with a z-order. The workspace is always there
 * on a wide screen: the default (nobody has touched anything, nothing is stored) is ONE window, the price chart, filling the whole area. Windows
 * can be added, moved, resized and closed - the price chart's too; a workspace with no window at all (everything closed) is valid, it is an
 * empty background. A narrow screen has no windows (the classic stack).
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
/** Of them, windows with a chart of their own (each is a whole chart with its own data feed). */
export const MAX_CHARTS = 6;
/** Smallest window, CSS px, whatever the fractions say. */
export const MIN_WIN_W = 200;
export const MIN_WIN_H = 120;
/** Below this size of the chart area (CSS px) the windows fold back into one stack (phone / narrow window). Same threshold as pane-layout. */
export const MIN_AREA_W = 640;
export const MIN_AREA_H = 260;
/** Size of a new window: share of the area. */
export const NEW_W = 0.42;
export const NEW_H = 0.45;
/** Smallest fraction a stored value may have (the pixel floors decide the rest on screen). */
const MIN_FRAC = 0.05;
const ID_RE = /^[a-z][a-z0-9]{0,11}$/;
const SRC_RE = /^[a-z][a-z0-9]{0,11}$/;
const TK_RE = /^[A-Za-z0-9_.:\-!@/]{1,40}$/;
const fin = (v: unknown): v is number => typeof v === "number" && isFinite(v);

/** "chart": a price chart (the main one or a window with a chart of its own); "ind": a window with indicators of ONE chart; "new": a window nobody has decided about yet. */
export type WinKind = "new" | "ind" | "chart";

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
  /** The chart an indicator window belongs to (the id of the price chart or of a chart window): its bars, time view and crosshair. A chart's own id for a chart; for a new window the chart it will be linked to. */
  link: string;
  /** A chart window: its instrument (data source and data ticker, as the chart takes them). Its interval and indicators are the chart's own. */
  src?: string;
  tk?: string;
}

/** The windows that are open (the price chart is one of them unless it was closed). */
export interface Workspace {
  wins: WsWindow[];
}

/* ───────────── queries ───────────── */

const mainWin = (): WsWindow => ({ id: MAIN_ID, kind: "chart", x: 0, y: 0, w: 1, h: 1, z: 1, link: MAIN_ID });

/** What nobody has touched: the price chart fills the area. (Never changed: every edit makes a new workspace.) */
export const DEFAULT_WORKSPACE: Workspace = { wins: [mainWin()] };

/** The default look (or nothing): not worth storing. */
export function isDefault(ws: Workspace | null): boolean {
  if (!ws) return true;
  const m = ws.wins[0];
  return ws.wins.length === 1 && m.id === MAIN_ID && m.kind === "chart" && Math.abs(m.x) < 1e-6 && Math.abs(m.y) < 1e-6 && Math.abs(m.w - 1) < 1e-6 && Math.abs(m.h - 1) < 1e-6;
}

/** Windows besides the price chart, in creation order. */
export const extraIds = (ws: Workspace | null): string[] => (ws ? ws.wins.filter((w) => w.id !== MAIN_ID).map((w) => w.id) : []);

export const hasWindow = (ws: Workspace | null, id: string): boolean => !!ws && ws.wins.some((w) => w.id === id);

/** Windows with indicators (the ones an indicator can be moved to), in creation order. */
export const indIds = (ws: Workspace | null): string[] => (ws ? ws.wins.filter((w) => w.id !== MAIN_ID && w.kind === "ind").map((w) => w.id) : []);
export const hasIndWindow = (ws: Workspace | null, id: string): boolean => !!ws && ws.wins.some((w) => w.id === id && w.kind === "ind" && w.id !== MAIN_ID);
export const chartCount = (ws: Workspace | null): number => (ws ? ws.wins.filter((w) => w.id !== MAIN_ID && w.kind === "chart").length : 0);
/** Every chart of the workspace: the price chart first, then the chart windows. */
export const chartIds = (ws: Workspace | null): string[] => [MAIN_ID, ...(ws ? ws.wins.filter((w) => w.id !== MAIN_ID && w.kind === "chart").map((w) => w.id) : [])];
/** Indicator windows that follow a chart. */
export const dependents = (ws: Workspace | null, chartId: string): string[] => (ws ? ws.wins.filter((w) => w.kind === "ind" && w.link === chartId).map((w) => w.id) : []);

/** z-orders as 1..n in the order they have (what is stored is what parseWorkspace would make of it). */
function rankZ(wins: WsWindow[]): WsWindow[] {
  const order = wins.map((w, i) => ({ id: w.id, z: w.z, i })).sort((a, b) => a.z - b.z || a.i - b.i);
  const rank = new Map(order.map((o, k) => [o.id, k + 1]));
  return wins.map((w) => (rank.get(w.id) === w.z ? w : { ...w, z: rank.get(w.id) as number }));
}

/**
 * The chart group a window belongs to: a chart (the price chart or a chart window) is its own group, an indicator window belongs to the chart it is
 * linked to; null for a window that has not decided yet / an unknown one. Scrolling, zoom and the crosshair move the windows of ONE group
 * together (the engine of an indicator window follows the engine of its chart) and never those of another group.
 */
export function groupOf(ws: Workspace | null, id: string): string | null {
  const base = ws ?? DEFAULT_WORKSPACE;
  const w = base.wins.find((x) => x.id === id);
  if (id === MAIN_ID && !w) return MAIN_ID;
  if (!w) return null;
  if (w.kind === "chart") return w.id;
  if (w.kind === "ind") return chartIds(base).includes(w.link) ? w.link : MAIN_ID;
  return null;
}

/** Every window that moves together with this chart: the chart itself (when it is open) and the indicator windows linked to it. */
export function groupMembers(ws: Workspace | null, chartId: string): string[] {
  const base = ws ?? DEFAULT_WORKSPACE;
  return base.wins.filter((w) => groupOf(base, w.id) === chartId).map((w) => w.id);
}

/** Links made right: an indicator / new window points at a chart that exists (else the price chart), a chart points at itself. */
function relink(wins: WsWindow[]): WsWindow[] {
  const charts = new Set([MAIN_ID, ...wins.filter((w) => w.id !== MAIN_ID && w.kind === "chart").map((w) => w.id)]);
  return wins.map((w) => {
    const want = w.kind === "chart" ? w.id : charts.has(w.link) ? w.link : MAIN_ID;
    return want === w.link ? w : { ...w, link: want };
  });
}

/** There is a window besides the price chart. */
export const isActive = (ws: Workspace | null): ws is Workspace => !!ws && ws.wins.some((w) => w.id !== MAIN_ID);

/** 1-based number of an indicator window ("Window 2"), 0 for anything else. */
export const windowNumber = (ws: Workspace | null, id: string): number => indIds(ws).indexOf(id) + 1;

/** Lowest free id "w1", "w2" ... */
export function newWindowId(ws: Workspace | null): string {
  const used = new Set((ws?.wins ?? []).map((w) => w.id));
  for (let i = 1; ; i++) if (!used.has(`w${i}`)) return `w${i}`;
}

const topZ = (ws: Workspace | null): number => (ws ? ws.wins.reduce((m, w) => Math.max(m, w.z), 0) : 0);

/* ───────────── edits (all return a new workspace, the old one is never changed) ───────────── */

/** Where the n-th extra window opens: a cascade inside the area (never exactly over the previous one, never outside). A chart window is bigger. */
export function cascadeRect(n: number, kind: WinKind = "new"): Rect {
  const k = n % 6;
  if (kind === "chart") return { x: 0.4 - 0.05 * k, y: 0.35 - 0.05 * k, w: 0.5, h: 0.55 };
  return { x: 0.5 - 0.05 * k, y: 0.45 - 0.06 * k, w: NEW_W, h: NEW_H };
}

/**
 * Adds a window nobody has decided about yet (it shows the choice «chart / indicator»). `link` is the chart it will follow if it becomes an indicator
 * window (the chart the user was looking at; a chart that does not exist is the price chart). Null when there are too many windows.
 */
export function addWindow(ws: Workspace | null, id?: string, link: string = MAIN_ID): { ws: Workspace; id: string } | null {
  const base: Workspace = ws ?? { wins: [mainWin()] };
  if (extraIds(base).length >= MAX_WINDOWS) return null;
  const wid = id && ID_RE.test(id) && !hasWindow(base, id) ? id : newWindowId(base);
  const win: WsWindow = { id: wid, kind: "new", ...cascadeRect(extraIds(base).length), z: topZ(base) + 1, link: chartIds(base).includes(link) ? link : MAIN_ID };
  return { ws: { wins: [...base.wins, win] }, id: wid };
}

const replaceWin = (ws: Workspace, id: string, f: (w: WsWindow) => WsWindow): Workspace => ({ wins: relink(ws.wins.map((w) => (w.id === id ? f(w) : w))) });

/**
 * A new (or indicator) window becomes a chart of its own on this instrument - or, when the price chart's window was closed, THAT window comes
 * back in its place (the price chart is the one behind the toolbar). The same object comes back when that is not possible (too many charts,
 * junk instrument).
 */
export function makeChart(ws: Workspace | null, id: string, src: string, tk: string): Workspace | null {
  if (!ws) return ws;
  const w = ws.wins.find((x) => x.id === id && x.id !== MAIN_ID);
  if (w && w.kind === "new" && !hasWindow(ws, MAIN_ID)) {
    const back: WsWindow = { id: MAIN_ID, kind: "chart", x: w.x, y: w.y, w: w.w, h: w.h, z: w.z, link: MAIN_ID };
    return { wins: relink(ws.wins.map((x) => (x.id === id ? back : x))) };
  }
  if (!SRC_RE.test(src) || !TK_RE.test(tk)) return ws;
  if (!w || w.kind === "chart" || chartCount(ws) >= MAX_CHARTS) return ws;
  return replaceWin(ws, id, (x) => ({ id: x.id, kind: "chart", x: x.x, y: x.y, w: x.w, h: x.h, z: x.z, link: id, src, tk }));
}

/** A new (or chart) window becomes an indicator window of the chart it was meant for (a chart that goes away: the price chart); its dependents move to the price chart. */
export function makeIndicator(ws: Workspace | null, id: string): Workspace | null {
  if (!ws) return ws;
  const w = ws.wins.find((x) => x.id === id && x.id !== MAIN_ID);
  if (!w || w.kind === "ind") return ws;
  return replaceWin(ws, id, (x) => ({ id: x.id, kind: "ind", x: x.x, y: x.y, w: x.w, h: x.h, z: x.z, link: x.kind === "new" ? x.link : MAIN_ID }));
}

/** Back to a window nobody has decided about (the user wants another kind). Windows that followed it move to the price chart. */
export function resetKind(ws: Workspace | null, id: string): Workspace | null {
  if (!ws) return ws;
  const w = ws.wins.find((x) => x.id === id && x.id !== MAIN_ID);
  if (!w || w.kind === "new") return ws;
  return replaceWin(ws, id, (x) => ({ id: x.id, kind: "new", x: x.x, y: x.y, w: x.w, h: x.h, z: x.z, link: MAIN_ID }));
}

/** An indicator window follows another chart. The same object comes back when nothing changes (or the chart does not exist). */
export function setLink(ws: Workspace | null, id: string, chart: string): Workspace | null {
  if (!ws || !chartIds(ws).includes(chart)) return ws;
  const w = ws.wins.find((x) => x.id === id && x.kind === "ind");
  if (!w || w.link === chart) return ws;
  return replaceWin(ws, id, (x) => ({ ...x, link: chart }));
}

/** Another instrument in a chart window. The same object comes back when nothing changed (or the window / instrument is not valid). */
export function setSymbol(ws: Workspace | null, id: string, src: string, tk: string): Workspace | null {
  if (!ws || !SRC_RE.test(src) || !TK_RE.test(tk)) return ws;
  const i = ws.wins.findIndex((w) => w.id === id && w.id !== MAIN_ID && w.kind === "chart");
  if (i < 0 || (ws.wins[i].src === src && ws.wins[i].tk === tk)) return ws;
  const wins = ws.wins.slice();
  wins[i] = { ...wins[i], src, tk };
  return { wins };
}

/**
 * Closes a window (the price chart's too: what is left may be an empty background). The windows that followed a closed chart move to the price
 * chart. Null when what is left is the default look (the price chart filling the area).
 */
export function closeWindow(ws: Workspace | null, id: string): Workspace | null {
  const base = ws ?? DEFAULT_WORKSPACE;
  if (!hasWindow(base, id)) return ws;
  const out: Workspace = { wins: rankZ(relink(base.wins.filter((w) => w.id !== id))) };
  return isDefault(out) ? null : out;
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

/** The size «shrink» gives a window: half the area each way (a quarter of it). */
export const SHRUNK = 0.5;

/**
 * «Shrink»: the window becomes a normal window of at most a quarter of the area (half the width, half the height), keeping its top-left corner
 * where it can (pulled inside the area); if that would sit exactly on another window it is shifted a little. The same object comes back when
 * the window is that small already.
 */
export function shrink(ws: Workspace | null, id: string): Workspace | null {
  if (!ws) return ws;
  const w = ws.wins.find((x) => x.id === id);
  if (!w || (w.w <= SHRUNK + 1e-6 && w.h <= SHRUNK + 1e-6)) return ws;
  const nw = Math.min(w.w, SHRUNK);
  const nh = Math.min(w.h, SHRUNK);
  let x = Math.min(w.x, 1 - nw);
  let y = Math.min(w.y, 1 - nh);
  const sits = (cx: number, cy: number) => ws.wins.some((o) => o.id !== id && Math.abs(o.x - cx) < 0.01 && Math.abs(o.y - cy) < 0.01 && Math.abs(o.w - nw) < 0.01 && Math.abs(o.h - nh) < 0.01);
  for (let i = 0; i < 6 && sits(x, y); i++) {
    // down and right, or back up and left at the edge of the area
    x = x + 0.04 <= 1 - nw ? x + 0.04 : Math.max(0, x - 0.04);
    y = y + 0.05 <= 1 - nh ? y + 0.05 : Math.max(0, y - 0.05);
  }
  return setRect(ws, id, { x, y, w: nw, h: nh });
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
  return {
    v: 2,
    wins: ws.wins.map((w) => ({ id: w.id, kind: w.kind, x: r(w.x), y: r(w.y), w: r(w.w), h: r(w.h), z: w.z, link: w.link, ...(w.src && w.tk ? { src: w.src, tk: w.tk } : {}) })),
  };
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
  let charts = 0;
  for (const v of (raw as { wins: unknown[] }).wins) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const id = o.id;
    if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id) || (id !== MAIN_ID && o.kind !== "ind" && o.kind !== "chart" && o.kind !== "new")) continue;
    // a chart window needs a valid instrument, or it is dropped
    const isChart = id !== MAIN_ID && o.kind === "chart";
    if (isChart && !(typeof o.src === "string" && SRC_RE.test(o.src) && typeof o.tk === "string" && TK_RE.test(o.tk))) continue;
    if (id !== MAIN_ID) {
      if (extra >= MAX_WINDOWS || (isChart && charts >= MAX_CHARTS)) continue;
      extra++;
      if (isChart) charts++;
    }
    seen.add(id);
    const c = id === MAIN_ID && !(fin(o.w) && fin(o.h)) ? { x: 0, y: 0, w: 1, h: 1 } : clampFrac({ x: o.x as number, y: o.y as number, w: o.w as number, h: o.h as number });
    list.push({
      id,
      kind: id === MAIN_ID || isChart ? "chart" : o.kind === "new" ? "new" : "ind",
      ...c,
      z: fin(o.z) ? o.z : 0,
      link: isChart ? id : typeof o.link === "string" ? o.link : MAIN_ID,
      ...(isChart ? { src: o.src as string, tk: o.tk as string } : {}),
    });
  }
  // z by rank (ties keep the stored order), the price chart first in the list
  const ranked = list.map((w, i) => ({ w, i })).sort((a, b) => a.w.z - b.w.z || a.i - b.i);
  ranked.forEach((e, k) => (e.w.z = k + 1));
  // a link to a chart that is not there (or to something that is not a chart) is the price chart; no price chart in the list = it was closed
  const wins = relink(list);
  return isDefault({ wins }) ? null : { wins };
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
