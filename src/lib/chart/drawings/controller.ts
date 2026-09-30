import type { DrawingSelection, DrawingsControllerLike, DrawingStyle, DrawingToolId } from "../contracts";
import { deleteUserData, listUserData, saveUserData } from "../userdata";
import type { ChartEngine } from "../engine";
import { formatPrice } from "../format";
import type { OverlayLayer, PointerInfo } from "../types";
import { dist, distToPolyline, nearestOhlc, snapAngle, snapAxis, snapSquare } from "./geometry";
import { evalHit, recordDraw, recordedIntersectsRect, type Recorded } from "./hittest";
import { toolForHotkey } from "./hotkeys";
import { visibleAt } from "./render";
import { TOOL_LIST, CURSOR_TOOLS, defaultHandles, getToolDef, isCursorTool, isDrawingTool, type Env, type HandleDef, type ToolDef } from "./tools";
import { DEFAULT_LABELS, type DPoint, type Drawing, type DrawingPatch, type DrawLabels, type Magnet, type Pt, type SerializedDrawings } from "./types";

const MAIN = "main";
const HANDLE_R = 5;
const HANDLE_R_TOUCH = 7.5;
const MAX_HISTORY = 80;
const WEAK_MAGNET_PX = 14;
const DASHES = ["solid", "dashed", "dotted"];

type CursorTool = (typeof CURSOR_TOOLS)[number];

interface Pending {
  d: Drawing;
  def: ToolDef;
  /** Anchors already fixed by clicks; the one at index `fixed` follows the pointer. */
  fixed: number;
  /** True while the gesture that created the drawing is still going (enables click-drag placement). */
  firstGesture: boolean;
  moved: boolean;
  downX: number;
  downY: number;
  before: string;
}

interface DragItem {
  id: string;
  origPts: DPoint[];
  origPx: Pt[];
}

interface DragState {
  kind: "move" | "handle";
  /** The drawing under the pointer (the anchor being dragged belongs to it). */
  id: string;
  handle: HandleDef | null;
  /** Everything that moves: the whole selection for a body drag, just the drawing for an anchor. */
  items: DragItem[];
  origPts: DPoint[];
  origPx: Pt[];
  sx: number;
  sy: number;
  /** Where the dragged anchor sat when the drag started (Shift keeps it on one axis). */
  hx: number;
  hy: number;
  moved: boolean;
  before: string;
}

interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  base: string[];
  moved: boolean;
}

export interface ContextRequest {
  /** Chart-local pixels. */
  x: number;
  y: number;
  /** Drawing under the pointer, if any (it is already selected). */
  id: string | null;
}

/** Drawings copied with Ctrl+C. Module level so they survive a symbol change. */
let CLIP: Drawing[] = [];

const NEUTRAL_STATE = { selected: false, hover: false, preview: false };
const SQUARE_TOOLS = new Set(["rect", "ellipse"]);
const NO_ANGLE_TOOLS = new Set(["price_range", "date_range", "datprice_range", "measure", "long", "short", "note", "text", "price_label", "flag", "gann_box", "gann_square", "gann_square_fixed", "fixed_volume_profile", "forecast", "price_note", "callout", "signpost", "cyclic_lines", "time_cycles", "sine_line", "fib_time", "regression", "bars_pattern", "ghost_feed"]);

export type ZOrderMode = "front" | "forward" | "backward" | "back";

let seq = 0;
function newId(): string {
  seq += 1;
  return `d${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function cloneDrawing(d: Drawing): Drawing {
  return JSON.parse(JSON.stringify(d)) as Drawing;
}

function isEditable(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

const DOT_CURSOR =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='3.2' fill='%232962ff' stroke='white' stroke-width='1.2'/></svg>\") 8 8, crosshair";

export class DrawingsController implements DrawingsControllerLike, OverlayLayer {
  private engine: ChartEngine | null = null;
  private drawings: Drawing[] = [];
  /** Selected drawing ids in selection order; the last one is the primary (the style bar edits it). */
  private sel: string[] = [];
  private hoverId: string | null = null;
  private hoverHandle = -1;
  private tool: string | null = null;
  private cursorStyle: CursorTool = "cursor_cross";
  private magnet: Magnet = "off";
  private stay = false;
  private hidden = false;
  private lockedAll = false;
  private labels: DrawLabels = { ...DEFAULT_LABELS };
  private listeners = new Set<() => void>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pending: Pending | null = null;
  private drag: DragState | null = null;
  private captured = false;
  private hoverPt: Pt | null = null;
  private lastStyleEdit = { key: "", at: 0 };
  private lastNudge = 0;
  private ptype = "mouse";
  private marquee: Marquee | null = null;
  private collapseTo: string | null = null;
  private lpTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDown = { id: "", at: 0, x: 0, y: 0 };
  private ctxHandler: ((r: ContextRequest) => void) | null = null;

  /** Single-selection view of the selection: the primary id. Assigning selects exactly that drawing (or nothing). */
  private get selectedId(): string | null {
    return this.sel.length ? this.sel[this.sel.length - 1] : null;
  }
  private set selectedId(v: string | null) {
    this.sel = v ? [v] : [];
  }

  /* ───────────── lifecycle ───────────── */

  attach(engine: ChartEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    engine.addLayer(this);
    this.loadToolDefaults();
    if (typeof document !== "undefined") document.addEventListener("keydown", this.onKey);
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      const w = window as unknown as { __drawings?: unknown; __drawTools?: unknown };
      w.__drawings = this;
      w.__drawTools = TOOL_LIST.map((t) => ({ id: t.id, points: t.points, total: t.total, variable: !!t.variable }));
    }
    engine.requestOverlayRedraw();
  }

  detach(): void {
    if (typeof document !== "undefined") document.removeEventListener("keydown", this.onKey);
    this.pending = null;
    this.drag = null;
    this.marquee = null;
    this.clearLongPress();
    this.captured = false;
    this.hoverPt = null;
    this.hoverId = null;
    this.hoverHandle = -1;
    if (this.engine) {
      const e = this.engine;
      this.engine = null;
      e.removeLayer(this);
    }
  }

  /** Translated strings used inside drawings (bars, days, R:R ...). Safe to call at any time. */
  setLabels(patch: Partial<DrawLabels>): void {
    this.labels = { ...this.labels, ...patch };
    this.redraw();
  }

  /* ───────────── state accessors ───────────── */

  setTool(tool: DrawingToolId | null): void {
    this.cancelPending();
    this.drag = null;
    if (tool && isCursorTool(tool)) {
      this.cursorStyle = tool as CursorTool;
      this.tool = null;
    } else if (tool && isDrawingTool(tool)) {
      this.tool = tool;
      this.selectedId = null;
      this.hoverId = null;
      this.hoverHandle = -1;
      if (this.hidden) this.hidden = false;
    } else {
      this.tool = null;
    }
    this.changed();
  }
  getTool(): DrawingToolId | null {
    return this.tool;
  }
  getCursorStyle(): string {
    return this.cursorStyle;
  }

  setMagnet(mode: Magnet): void {
    this.magnet = mode === "weak" || mode === "strong" ? mode : "off";
    this.changed();
  }
  getMagnet(): Magnet {
    return this.magnet;
  }
  setStayInDrawing(on: boolean): void {
    this.stay = !!on;
    this.changed();
  }
  getStayInDrawing(): boolean {
    return this.stay;
  }
  setHidden(on: boolean): void {
    this.hidden = !!on;
    if (this.hidden) {
      this.cancelPending();
      this.selectedId = null;
      this.hoverId = null;
    }
    this.changed();
  }
  isHidden(): boolean {
    return this.hidden;
  }
  setLockedAll(on: boolean): void {
    this.lockedAll = !!on;
    if (this.lockedAll) {
      this.selectedId = null;
      this.hoverId = null;
      this.hoverHandle = -1;
    }
    this.changed();
  }
  isLockedAll(): boolean {
    return this.lockedAll;
  }

  getSelection(): DrawingSelection | null {
    const d = this.selected();
    if (!d) return null;
    return { id: d.id, tool: d.tool, style: { ...d.style }, locked: d.locked, hidden: !!d.hidden, ids: [...this.sel], count: this.sel.length };
  }

  /** Tool and anchors (chart time, price) of the selected drawing, for features that follow a line (alerts). */
  getSelectedGeometry(): { tool: string; points: DPoint[] } | null {
    const d = this.selected();
    return d ? { tool: d.tool, points: d.points.map((pt) => ({ t: pt.t, p: pt.p })) } : null;
  }

  getDrawingsCount(): number {
    return this.drawings.length;
  }

  /* ───────────── edits ───────────── */

  removeSelected(): void {
    const ids = new Set(this.sel);
    if (ids.size === 0) return;
    const before = this.snapshot();
    this.drawings = this.drawings.filter((x) => !ids.has(x.id));
    this.sel = [];
    this.hoverId = null;
    this.hoverHandle = -1;
    this.pushUndo(before);
    this.changed();
  }

  removeAll(): void {
    if (this.drawings.length === 0) return;
    const before = this.snapshot();
    this.cancelPending();
    this.drawings = [];
    this.selectedId = null;
    this.hoverId = null;
    this.hoverHandle = -1;
    this.pushUndo(before);
    this.changed();
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (prev === undefined) return;
    this.cancelPending();
    this.redoStack.push(this.snapshot());
    this.loadSnapshot(prev);
    this.changed();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.cancelPending();
    this.undoStack.push(this.snapshot());
    this.loadSnapshot(next);
    this.changed();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  updateSelectedStyle(patch: Partial<DrawingStyle>): void {
    const d = this.selected();
    if (!d) return;
    const key = `style:${d.id}`;
    const now = Date.now();
    if (this.lastStyleEdit.key !== key || now - this.lastStyleEdit.at > 700) this.pushUndo(this.snapshot());
    this.lastStyleEdit = { key, at: now };
    // a multi-selection takes colour, width, dash and fill together; the text stays with the primary drawing
    const targets = this.sel.length > 1 ? this.selectedList() : [d];
    for (const t of targets) {
      const next: DrawingStyle = { ...t.style };
      for (const [k, v] of Object.entries(patch)) {
        if (t !== d && k === "text") continue;
        if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
        else (next as unknown as Record<string, unknown>)[k] = v;
      }
      if (typeof next.width === "number") next.width = Math.max(1, Math.min(20, next.width));
      t.style = next;
    }
    this.changed();
  }

  /* ───────────── properties dialog API ───────────── */

  private settingsHandler: ((id: string) => void) | null = null;
  private toolDefaults = new Map<string, { style?: Partial<DrawingStyle>; extra?: Record<string, unknown> }>();
  private defaultsRequested = false;
  private lastPatchEdit = { key: "", at: 0 };

  /** The live drawing (do not mutate; go through updateById). */
  getById(id: string): Drawing | null {
    return this.drawings.find((d) => d.id === id) ?? null;
  }

  /**
   * Merges a patch into a drawing. style / extra merge key by key (undefined removes a key), points and locked replace.
   * opts: `commit` true = push one undo entry now, false = none (live preview after the first edit of a dialog session),
   * unset = coalesced with edits of the same drawing within 700 ms. `replace` swaps style / extra wholesale (Cancel);
   * `dropUndo` also forgets the entry the session pushed.
   */
  updateById(id: string, patch: DrawingPatch, opts?: boolean | { commit?: boolean; replace?: boolean; dropUndo?: boolean }): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    const o = typeof opts === "boolean" ? { commit: opts } : opts ?? {};
    if (o.dropUndo) {
      this.undoStack.pop();
    } else if (o.commit === true) {
      this.pushUndo(this.snapshot());
    } else if (o.commit === undefined) {
      const key = `patch:${id}`;
      const now = Date.now();
      if (this.lastPatchEdit.key !== key || now - this.lastPatchEdit.at > 700) this.pushUndo(this.snapshot());
      this.lastPatchEdit = { key, at: now };
    }
    if (patch.style) {
      const next = (o.replace ? { ...patch.style } : { ...d.style }) as unknown as Record<string, unknown>;
      if (!o.replace) {
        for (const [k, v] of Object.entries(patch.style)) {
          if (v === undefined) delete next[k];
          else next[k] = v;
        }
      }
      const st = next as unknown as DrawingStyle;
      if (typeof st.width === "number") st.width = Math.max(1, Math.min(20, st.width));
      d.style = st;
    }
    if (patch.extra) {
      const next: Record<string, unknown> = o.replace ? { ...patch.extra } : { ...(d.extra ?? {}) };
      if (!o.replace) {
        for (const [k, v] of Object.entries(patch.extra)) {
          if (v === undefined) delete next[k];
          else next[k] = v;
        }
      }
      if (Object.keys(next).length) d.extra = next;
      else delete d.extra;
    } else if (o.replace) {
      delete d.extra;
    }
    if (patch.points && patch.points.length === d.points.length && patch.points.every((q) => Number.isFinite(q.t) && Number.isFinite(q.p))) {
      let changedIdx = -1;
      patch.points.forEach((q, i) => {
        if (q.t !== d.points[i].t || q.p !== d.points[i].p) changedIdx = i;
      });
      d.points = patch.points.map((q) => ({ t: q.t, p: q.p }));
      if (changedIdx >= 0) getToolDef(d.tool)?.constrain?.(d, changedIdx);
    }
    if (typeof patch.locked === "boolean") d.locked = patch.locked;
    this.changed();
  }

  /** The shell registers what opens the properties of a drawing (style bar gear, double click, context menu). */
  setSettingsHandler(cb: ((id: string) => void) | null): void {
    this.settingsHandler = cb;
  }
  requestSettings(id: string): void {
    if (this.settingsHandler && this.drawings.some((d) => d.id === id)) this.settingsHandler(id);
  }

  /** Per-tool defaults new drawings start with (user data `drawing_default`, loaded once). */
  getToolDefault(toolId: string): { style?: Partial<DrawingStyle>; extra?: Record<string, unknown> } | null {
    this.loadToolDefaults();
    return this.toolDefaults.get(toolId) ?? null;
  }
  setToolDefault(toolId: string, data: { style?: Partial<DrawingStyle>; extra?: Record<string, unknown> } | null): void {
    if (data) {
      this.toolDefaults.set(toolId, data);
      void saveUserData("drawing_default", toolId, data);
    } else {
      this.toolDefaults.delete(toolId);
      void deleteUserData("drawing_default", toolId);
    }
  }
  private loadToolDefaults(): void {
    if (this.defaultsRequested || typeof window === "undefined") return;
    this.defaultsRequested = true;
    void listUserData<{ style?: Partial<DrawingStyle>; extra?: Record<string, unknown> }>("drawing_default").then((items) => {
      for (const it of items) if (it && typeof it.key === "string" && it.data && typeof it.data === "object" && !this.toolDefaults.has(it.key)) this.toolDefaults.set(it.key, it.data);
    });
  }

  barIndexOf(t: number): number {
    return this.engine ? this.engine.getIndexForTime(t) : 0;
  }
  timeOfBar(i: number): number {
    return this.engine ? this.engine.getTimeForIndex(i) : 0;
  }
  getViewInfo(): { intervalMs: number; precision: number; bars: number } {
    const e = this.engine;
    return { intervalMs: e ? e.getIntervalMs() : 86_400_000, precision: e ? e.getPrecision() : 2, bars: e ? e.getCandles().length : 0 };
  }

  toggleSelectedLock(): void {
    const list = this.selectedList();
    if (list.length === 0) return;
    const to = !this.selected()!.locked;
    this.pushUndo(this.snapshot());
    for (const d of list) d.locked = to;
    this.changed();
  }

  cloneSelected(): void {
    const list = this.selectedList();
    if (list.length === 0) return;
    const before = this.snapshot();
    const made = list.map((d) => this.copyOf(d, 16, 16));
    this.drawings.push(...made);
    this.sel = made.map((d) => d.id);
    this.pushUndo(before);
    this.changed();
  }

  /** A duplicate of `d`, shifted by dx/dy pixels, with a fresh id. */
  private copyOf(d: Drawing, dx: number, dy: number): Drawing {
    const e = this.engine;
    const copy = cloneDrawing(d);
    copy.id = newId();
    copy.locked = false;
    copy.hidden = false;
    if (e) {
      copy.points = d.points.map((pt) => {
        const x = e.timeToX(pt.t) + dx;
        const y = e.priceToY(MAIN, pt.p) + dy;
        return { t: e.xToTime(x), p: e.yToPrice(MAIN, y) };
      });
    } else {
      copy.points = d.points.map((pt) => ({ t: pt.t + 86_400_000, p: pt.p }));
    }
    getToolDef(copy.tool)?.constrain?.(copy, -1);
    return copy;
  }

  /* ───────────── selection, order, clipboard (object tree, context menu, hotkeys) ───────────── */

  /** Every drawing, bottom to top. The array is a copy, the drawings are live: do not mutate them. */
  listAll(): Drawing[] {
    return this.drawings.slice();
  }
  getSelectedIds(): string[] {
    return [...this.sel];
  }
  isSelected(id: string): boolean {
    return this.sel.includes(id);
  }
  /** Selects one drawing (null clears). `additive` toggles it in a multi-selection instead. */
  selectById(id: string | null, additive = false): void {
    if (id === null) {
      if (this.sel.length) {
        this.sel = [];
        this.hoverHandle = -1;
        this.changed();
      }
      return;
    }
    if (!this.drawings.some((d) => d.id === id)) return;
    if (additive) this.sel = this.sel.includes(id) ? this.sel.filter((x) => x !== id) : [...this.sel, id];
    else if (this.sel.length === 1 && this.sel[0] === id) return;
    else this.sel = [id];
    this.hoverHandle = -1;
    this.changed();
  }
  selectMany(ids: string[]): void {
    const have = new Set(this.drawings.map((d) => d.id));
    this.sel = ids.filter((id, i) => have.has(id) && ids.indexOf(id) === i);
    this.hoverHandle = -1;
    this.changed();
  }
  selectAll(): void {
    this.sel = this.drawings.filter((d) => !d.hidden).map((d) => d.id);
    this.changed();
  }

  removeById(id: string): void {
    if (!this.drawings.some((d) => d.id === id)) return;
    const before = this.snapshot();
    this.drawings = this.drawings.filter((d) => d.id !== id);
    this.sel = this.sel.filter((x) => x !== id);
    this.hoverId = null;
    this.hoverHandle = -1;
    this.pushUndo(before);
    this.changed();
  }
  setLockedById(id: string, on: boolean): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d || d.locked === on) return;
    this.pushUndo(this.snapshot());
    d.locked = on;
    this.changed();
  }
  setHiddenById(id: string, on: boolean): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d || !!d.hidden === on) return;
    this.pushUndo(this.snapshot());
    d.hidden = on;
    if (on) {
      this.sel = this.sel.filter((x) => x !== id);
      this.hoverId = null;
      this.hoverHandle = -1;
    }
    this.changed();
  }
  renameById(id: string, name: string): void {
    const d = this.drawings.find((x) => x.id === id);
    if (!d) return;
    const next = name.trim().slice(0, 80);
    if ((d.name ?? "") === next) return;
    this.pushUndo(this.snapshot());
    if (next) d.name = next;
    else delete d.name;
    this.changed();
  }
  /** Hides the selected drawings (they stay in the object tree, where they can be shown again). */
  toggleSelectedHidden(): void {
    const list = this.selectedList();
    if (list.length === 0) return;
    this.pushUndo(this.snapshot());
    for (const d of list) d.hidden = true;
    this.sel = [];
    this.hoverId = null;
    this.hoverHandle = -1;
    this.changed();
  }
  /** Shows every drawing that was hidden one by one. */
  showAllHidden(): void {
    if (!this.drawings.some((d) => d.hidden)) return;
    this.pushUndo(this.snapshot());
    for (const d of this.drawings) delete d.hidden;
    this.changed();
  }
  hasHiddenDrawings(): boolean {
    return this.drawings.some((d) => d.hidden);
  }

  /** Visual order. Acts on the whole selection when `id` is part of it, else on that drawing alone. */
  zOrder(id: string, mode: ZOrderMode): void {
    const ids = new Set(this.sel.includes(id) ? this.sel : [id]);
    const arr = this.drawings;
    if (!arr.some((d) => ids.has(d.id))) return;
    const before = this.snapshot();
    let next = arr.slice();
    if (mode === "front") next = [...arr.filter((d) => !ids.has(d.id)), ...arr.filter((d) => ids.has(d.id))];
    else if (mode === "back") next = [...arr.filter((d) => ids.has(d.id)), ...arr.filter((d) => !ids.has(d.id))];
    else if (mode === "forward") {
      for (let i = next.length - 2; i >= 0; i--) {
        if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    } else {
      for (let i = 1; i < next.length; i++) {
        if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
      }
    }
    if (next.every((d, i) => d === arr[i])) return;
    this.drawings = next;
    this.pushUndo(before);
    this.changed();
  }
  zOrderSelected(mode: ZOrderMode): void {
    const id = this.selectedId;
    if (id) this.zOrder(id, mode);
  }

  /** Adds a finished drawing programmatically (context menu "horizontal line here"); returns its id. */
  addDrawing(tool: string, points: DPoint[], style?: Partial<DrawingStyle>): string | null {
    const def = getToolDef(tool);
    if (!def || points.length === 0) return null;
    const before = this.snapshot();
    const d: Drawing = { id: newId(), tool: def.id, points: points.map((q) => ({ ...q })), style: { ...def.style, ...style }, locked: false };
    this.drawings.push(d);
    this.sel = [d.id];
    this.pushUndo(before);
    this.changed();
    return d.id;
  }

  /** Scrolls the chart so the drawing is in view. */
  focusOn(id: string): void {
    const e = this.engine;
    const d = this.drawings.find((x) => x.id === id);
    if (!e || !d || d.points.length === 0) return;
    let t0 = Infinity;
    let t1 = -Infinity;
    let p0 = Infinity;
    let p1 = -Infinity;
    for (const q of d.points) {
      t0 = Math.min(t0, q.t);
      t1 = Math.max(t1, q.t);
      p0 = Math.min(p0, q.p);
      p1 = Math.max(p1, q.p);
    }
    e.centerOn((t0 + t1) / 2, (p0 + p1) / 2);
  }

  copySelected(): boolean {
    const list = this.selectedList();
    if (list.length === 0) return false;
    CLIP = list.map(cloneDrawing);
    this.changed();
    return true;
  }
  cutSelected(): void {
    if (this.copySelected()) this.removeSelected();
  }
  hasClipboard(): boolean {
    return CLIP.length > 0;
  }
  /** Pastes at a chart-local pixel position (centre of the pasted group), or shifted a little when none is given. */
  paste(at?: { x: number; y: number } | null): string[] {
    const e = this.engine;
    if (!e || CLIP.length === 0) return [];
    const before = this.snapshot();
    const pts: Pt[] = [];
    for (const d of CLIP) {
      for (const q of d.points) {
        const x = e.timeToX(q.t);
        const y = e.priceToY(MAIN, q.p);
        if (Number.isFinite(x) && Number.isFinite(y)) pts.push({ x, y });
      }
    }
    let dx = 16;
    let dy = 16;
    if (at && pts.length) {
      const cx = (Math.min(...pts.map((q) => q.x)) + Math.max(...pts.map((q) => q.x))) / 2;
      const cy = (Math.min(...pts.map((q) => q.y)) + Math.max(...pts.map((q) => q.y))) / 2;
      dx = at.x - cx;
      dy = at.y - cy;
    }
    const made = CLIP.map((d) => this.copyOf(d, dx, dy));
    this.drawings.push(...made);
    this.sel = made.map((d) => d.id);
    this.pushUndo(before);
    this.changed();
    return this.sel.slice();
  }
  pasteAtPointer(): string[] {
    return this.paste(this.hoverPt);
  }

  /** Moves the selection by whole bars / price ticks (arrow keys). */
  nudgeSelected(bars: number, ticks: number): void {
    const e = this.engine;
    const list = this.selectedList().filter((d) => !d.locked);
    if (!e || list.length === 0) return;
    const now = Date.now();
    if (now - this.lastNudge > 700) this.pushUndo(this.snapshot());
    this.lastNudge = now;
    const tick = Math.pow(10, -Math.max(0, Math.min(8, e.getPrecision())));
    for (const d of list) {
      d.points = d.points.map((q) => ({
        t: bars ? e.getTimeForIndex(e.getIndexForTime(q.t) + bars) : q.t,
        p: ticks ? q.p + ticks * tick : q.p,
      }));
      getToolDef(d.tool)?.constrain?.(d, -1);
    }
    this.changed();
  }

  /** The shell shows its context menu from here (touch long-press); mouse right-click goes through selectAtPoint. */
  setContextMenuHandler(cb: ((r: ContextRequest) => void) | null): void {
    this.ctxHandler = cb;
  }
  /** Opens the properties of a drawing through the handler the shell registered, when there is one. */
  openSettings(id: string): void {
    const fn = (this as unknown as { requestSettings?: (id: string) => void }).requestSettings;
    if (typeof fn === "function") fn.call(this, id);
  }
  /** Last known pointer position over the main pane (chart-local pixels), else null. */
  getPointerPx(): Pt | null {
    return this.hoverPt ? { ...this.hoverPt } : null;
  }
  /** Drawing under a chart-local point, or null. */
  hitTest(x: number, y: number, pointerType = "mouse"): string | null {
    if (this.hidden) return null;
    const env = this.makeEnv();
    if (!env) return null;
    return this.topHit(env, x, y, pointerType)?.id ?? null;
  }
  /** Right-click: selects the drawing under the pointer (keeping a multi-selection it belongs to) and returns its id. */
  selectAtPoint(x: number, y: number, pointerType = "mouse"): string | null {
    const id = this.hitTest(x, y, pointerType);
    if (id) {
      if (!this.sel.includes(id)) {
        this.sel = [id];
        this.hoverHandle = -1;
        this.changed();
      }
    } else if (this.sel.length) {
      this.sel = [];
      this.hoverHandle = -1;
      this.changed();
    }
    return id;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /* ───────────── persistence ───────────── */

  serialize(): string {
    const out: SerializedDrawings = { v: 1, drawings: this.drawings };
    try {
      return JSON.stringify(out);
    } catch {
      return JSON.stringify({ v: 1, drawings: [] });
    }
  }

  restore(json: string): void {
    this.cancelPending();
    let list: Drawing[] = [];
    if (json) {
      try {
        const raw: unknown = JSON.parse(json);
        const arr = raw && typeof raw === "object" ? (raw as { drawings?: unknown }).drawings : undefined;
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const d = sanitize(item);
            if (d) list.push(d);
          }
        }
      } catch {
        return;
      }
    }
    // duplicate ids would break selection
    const seen = new Set<string>();
    list = list.map((d) => {
      if (seen.has(d.id)) d.id = newId();
      seen.add(d.id);
      return d;
    });
    this.drawings = list;
    this.selectedId = null;
    this.hoverId = null;
    this.hoverHandle = -1;
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  /* ───────────── overlay layer: painting ───────────── */

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    if (engine !== this.engine || this.hidden) return;
    const env = this.makeEnv();
    if (!env) return;
    const rect = engine.getPaneRect(MAIN);
    if (!rect) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rect.top, rect.width, rect.height);
    ctx.clip();

    for (const d of this.drawings) {
      if (d.hidden || !visibleAt(d, env.intervalMs)) continue;
      const on = this.sel.includes(d.id);
      this.paint(ctx, env, d, { selected: on, hover: d.id === this.hoverId && !on, preview: false });
    }

    // anchors: of everything selected (a handful), and of the drawing under the pointer
    if (!this.lockedAll) {
      const primary = this.selectedId;
      if (this.sel.length <= 6) {
        for (const sd of this.selectedList()) {
          if (sd.locked || !visibleAt(sd, env.intervalMs)) continue;
          const def = getToolDef(sd.tool);
          const P = this.pxPoints(sd);
          if (!def || !P) continue;
          const hs = defaultHandles(def, env, sd, P);
          hs.forEach((h, i) => this.paintHandle(ctx, env, h.x, h.y, sd.style.color, sd.id === primary && i === this.hoverHandle, false));
        }
      }
      const hov = this.hoverId && !this.sel.includes(this.hoverId) ? this.drawings.find((x) => x.id === this.hoverId) : null;
      if (hov && !hov.locked && !hov.hidden && !this.tool && !this.pending) {
        const def = getToolDef(hov.tool);
        const P = this.pxPoints(hov);
        if (def && P) defaultHandles(def, env, hov, P).forEach((h) => this.paintHandle(ctx, env, h.x, h.y, hov.style.color, false, true));
      }
    }

    const pend = this.pending;
    if (pend) {
      this.paint(ctx, env, pend.d, { selected: false, hover: false, preview: true });
      const P = this.pxPoints(pend.d);
      if (P) for (let i = 0; i < pend.fixed && i < P.length; i++) this.paintHandle(ctx, env, P[i].x, P[i].y, pend.d.style.color, false, false);
    }

    const mq = this.marquee;
    if (mq && mq.moved) {
      const x = Math.min(mq.x0, mq.x1);
      const y = Math.min(mq.y0, mq.y1);
      ctx.save();
      ctx.fillStyle = "rgba(41,98,255,0.10)";
      ctx.strokeStyle = "rgba(41,98,255,0.85)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x, y, Math.abs(mq.x1 - mq.x0), Math.abs(mq.y1 - mq.y0));
      ctx.strokeRect(x + 0.5, y + 0.5, Math.abs(mq.x1 - mq.x0), Math.abs(mq.y1 - mq.y0));
      ctx.restore();
    }

    if ((this.tool || pend) && this.magnet !== "off" && this.hoverPt) {
      const s = this.magnetPoint(this.hoverPt.x, this.hoverPt.y);
      const x = engine.timeToX(s.t);
      const y = engine.priceToY(MAIN, s.p);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = env.theme.line;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private paint(ctx: CanvasRenderingContext2D, env: Env, d: Drawing, st: { selected: boolean; hover: boolean; preview: boolean }) {
    const def = getToolDef(d.tool);
    if (!def) return;
    const P = this.pxPoints(d);
    if (!P) return;
    ctx.save();
    try {
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      def.draw(ctx, env, d, P, st);
    } catch (err) {
      /* a broken drawing must not take the chart down */
      if (process.env.NODE_ENV !== "production") console.error("[drawing]", d.tool, err);
    }
    ctx.restore();
  }

  private paintHandle(ctx: CanvasRenderingContext2D, env: Env, x: number, y: number, color: string, hot: boolean, small: boolean) {
    const base = this.ptype === "touch" ? HANDLE_R_TOUCH : HANDLE_R;
    const r = small ? base - 1.5 : hot ? base + 1.5 : base;
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = hot ? color : env.theme.bg;
    ctx.fill();
    ctx.lineWidth = small ? 1.5 : 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /* ───────────── overlay layer: pointer ───────────── */

  pointerDown(p: PointerInfo): boolean {
    const e = this.engine;
    if (!e || p.button !== 0) return false;
    this.ptype = p.pointerType || "mouse";
    if (!this.inMain(p)) return false;
    const additive = p.ctrlKey || p.shiftKey;

    // placing
    if (this.pending) {
      this.captured = true;
      return this.placeClick(p);
    }
    if (this.tool) {
      const def = getToolDef(this.tool);
      if (!def) return false;
      if (!this.hidden && !this.lockedAll) {
        const env = this.makeEnv();
        if (env) {
          // stay-in-drawing: the anchors of the drawing just placed stay grabbable ...
          const cur = this.selected();
          if (cur && !cur.locked && this.sel.length === 1) {
            const h = this.handleAt(env, cur, p.x, p.y, p.pointerType);
            if (h) {
              this.startDrag("handle", cur, h, p);
              this.captured = true;
              return true;
            }
          }
          // ... and Ctrl+click picks up any drawing without leaving the tool
          if (p.ctrlKey) {
            const hit = this.topHit(env, p.x, p.y, p.pointerType);
            if (hit) return this.grab(hit, p, false);
          }
        }
      }
      this.captured = true;
      this.startPlacing(def, p);
      return true;
    }

    // cursor mode: select / move / edit
    if (this.hidden || this.lockedAll) return false;
    const env = this.makeEnv();
    if (!env) return false;
    const sel = this.selected();
    if (sel && !sel.locked && this.sel.length === 1) {
      const h = this.handleAt(env, sel, p.x, p.y, p.pointerType);
      if (h) {
        this.startDrag("handle", sel, h, p);
        this.captured = true;
        return true;
      }
    }
    const hit = this.topHit(env, p.x, p.y, p.pointerType);
    if (!hit) {
      // Ctrl/Shift + drag on empty space: rubber-band selection
      if (additive && p.pointerType !== "touch") {
        this.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, base: [...this.sel], moved: false };
        this.captured = true;
        return true;
      }
      if (this.sel.length) {
        this.sel = [];
        this.hoverHandle = -1;
        this.changed();
      }
      return false;
    }
    return this.grab(hit, p, additive);
  }

  /** A drawing was pressed in cursor mode: select it (Ctrl/Shift toggles) and start moving the selection. */
  private grab(hit: Drawing, p: PointerInfo, additive: boolean): boolean {
    const now = Date.now();
    const last = this.lastDown;
    const dbl = !additive && last.id === hit.id && now - last.at < 380 && Math.hypot(p.x - last.x, p.y - last.y) < 8;
    this.lastDown = { id: hit.id, at: dbl ? 0 : now, x: p.x, y: p.y };
    if (dbl) {
      // double click / double tap: properties
      if (!this.sel.includes(hit.id)) this.sel = [hit.id];
      this.captured = true;
      this.drag = null;
      this.changed();
      this.openSettings(hit.id);
      return true;
    }
    if (additive) {
      if (this.sel.includes(hit.id)) {
        this.sel = this.sel.filter((i) => i !== hit.id);
        this.hoverHandle = -1;
        this.changed();
        this.captured = true;
        return true;
      }
      this.sel = [...this.sel, hit.id];
      this.hoverHandle = -1;
      this.changed();
    } else if (!this.sel.includes(hit.id)) {
      this.sel = [hit.id];
      this.hoverHandle = -1;
      this.changed();
    } else if (this.sel.length > 1) {
      // pressing one of several selected: a click narrows the selection to it, a drag moves them all
      this.collapseTo = hit.id;
    }
    if (this.selectedId !== hit.id) {
      this.sel = [...this.sel.filter((i) => i !== hit.id), hit.id];
      this.changed();
    }
    if (!this.selectedList().some((d) => !d.locked)) return false; // locked: selected, the chart still pans
    this.startDrag("move", hit, null, p);
    this.captured = true;
    if (p.pointerType === "touch" && !hit.locked) this.armLongPress(p, hit.id);
    return true;
  }

  private armLongPress(p: PointerInfo, id: string) {
    this.clearLongPress();
    this.lpTimer = setTimeout(() => {
      this.lpTimer = null;
      const dr = this.drag;
      if (!dr || dr.moved || !this.captured || !this.ctxHandler) return;
      this.drag = null;
      this.captured = false;
      this.ctxHandler({ x: p.x, y: p.y, id });
    }, 520);
  }
  private clearLongPress() {
    if (this.lpTimer) clearTimeout(this.lpTimer);
    this.lpTimer = null;
  }

  pointerMove(p: PointerInfo): boolean {
    const e = this.engine;
    if (!e) return false;
    const inMain = this.inMain(p);
    if (p.pointerType) this.ptype = p.pointerType;

    // captured gestures
    if (this.captured) {
      if (this.pending) {
        this.updatePending(p);
      } else if (this.drag) {
        this.updateDrag(p);
      } else if (this.marquee) {
        this.updateMarquee(p);
      }
      return true;
    }

    this.hoverPt = inMain ? { x: p.x, y: p.y } : null;

    if (this.pending) {
      if (inMain) this.updatePending(p);
      else this.redraw();
      return false;
    }
    if (this.tool) {
      // the anchors of the drawing just placed can be grabbed in stay-in-drawing mode
      let hh = -1;
      const cur = this.selected();
      if (inMain && cur && !cur.locked && this.sel.length === 1 && !this.hidden && !this.lockedAll) {
        const env = this.makeEnv();
        const h = env ? this.handleAt(env, cur, p.x, p.y, p.pointerType) : null;
        hh = h ? h.index : -1;
      }
      if (hh !== this.hoverHandle) {
        this.hoverHandle = hh;
        this.redraw();
      }
      if (this.magnet !== "off") this.redraw();
      return false;
    }

    // cursor mode hover
    let hoverId: string | null = null;
    let hoverHandle = -1;
    if (inMain && !this.hidden && !this.lockedAll) {
      const env = this.makeEnv();
      if (env) {
        const sel = this.selected();
        if (sel && !sel.locked && this.sel.length === 1) {
          const h = this.handleAt(env, sel, p.x, p.y, p.pointerType);
          if (h) {
            hoverId = sel.id;
            hoverHandle = h.index;
          }
        }
        if (!hoverId) hoverId = this.topHit(env, p.x, p.y, p.pointerType)?.id ?? null;
      }
    }
    if (hoverId !== this.hoverId || hoverHandle !== this.hoverHandle) {
      this.hoverId = hoverId;
      this.hoverHandle = hoverHandle;
      this.redraw();
    }
    if (!inMain) return false;
    return hoverId !== null || this.cursorStyle !== "cursor_cross";
  }

  pointerUp(p: PointerInfo): void {
    this.captured = false;
    this.clearLongPress();
    const pend = this.pending;
    if (pend) {
      if (pend.def.points === 0) {
        this.finishBrush();
      } else if (pend.firstGesture && pend.moved && !pend.def.variable) {
        pend.firstGesture = false;
        const q = this.placePx(pend, p);
        const pt = this.magnetPoint(q.x, q.y);
        pend.d.points[pend.fixed] = pt;
        pend.fixed += 1;
        this.padPoints(pend, pt);
        if (pend.fixed >= pend.def.points) this.finishPlacing();
        else this.redraw();
      } else {
        pend.firstGesture = false;
      }
      return;
    }
    if (this.marquee) {
      this.marquee = null;
      this.redraw();
      return;
    }
    const drag = this.drag;
    const collapse = this.collapseTo;
    this.collapseTo = null;
    if (drag) {
      this.drag = null;
      if (drag.moved && this.snapshot() !== drag.before) {
        this.pushUndo(drag.before);
        this.changed();
        return;
      }
    }
    if (collapse && !(drag && drag.moved) && this.sel.includes(collapse)) {
      this.sel = [collapse];
      this.changed();
      return;
    }
    if (drag) this.redraw();
  }

  cursor(p: PointerInfo): string | null {
    if (!this.engine || !this.inMain(p)) return null;
    if (this.hoverHandle >= 0) return "pointer";
    if (this.pending || this.tool) return "crosshair";
    if (this.hoverId) {
      const d = this.drawings.find((x) => x.id === this.hoverId);
      return d?.locked ? "default" : "move";
    }
    if (this.cursorStyle === "cursor_dot") return DOT_CURSOR;
    if (this.cursorStyle === "cursor_arrow") return "default";
    return null;
  }

  private updateMarquee(p: PointerInfo) {
    const m = this.marquee;
    if (!m) return;
    m.x1 = p.x;
    m.y1 = p.y;
    if (!m.moved && Math.hypot(p.x - m.x0, p.y - m.y0) > 3) m.moved = true;
    if (m.moved) {
      const env = this.makeEnv();
      if (env) {
        const r = { x0: Math.min(m.x0, m.x1), y0: Math.min(m.y0, m.y1), x1: Math.max(m.x0, m.x1), y1: Math.max(m.y0, m.y1) };
        const ids = this.drawings.filter((d) => !d.hidden && this.touchesRect(env, d, r)).map((d) => d.id);
        const merged = [...m.base, ...ids.filter((i) => !m.base.includes(i))];
        if (merged.join("|") !== this.sel.join("|")) {
          this.sel = merged;
          this.changed();
          return;
        }
      }
    }
    this.redraw();
  }

  private touchesRect(env: Env, d: Drawing, r: { x0: number; y0: number; x1: number; y1: number }): boolean {
    const def = getToolDef(d.tool);
    const P = this.pxPoints(d);
    if (!def || !P) return false;
    if (P.some((q) => q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1)) return true;
    if (P.length > 400) return false;
    try {
      return recordedIntersectsRect(recordDraw((ctx) => def.draw(ctx, env, d, P, NEUTRAL_STATE)), r);
    } catch {
      return false;
    }
  }

  /* ───────────── placement ───────────── */

  private startPlacing(def: ToolDef, p: PointerInfo) {
    const env = this.makeEnv();
    if (!env) return;
    const pt = def.points === 0 ? this.rawPoint(p.x, p.y) : this.magnetPoint(p.x, p.y);
    const dflt = this.getToolDefault(def.id);
    const d: Drawing = { id: newId(), tool: def.id, points: [pt], style: { ...def.style, ...(dflt?.style as DrawingStyle | undefined) }, locked: false };
    if (dflt?.extra && Object.keys(dflt.extra).length) d.extra = JSON.parse(JSON.stringify(dflt.extra)) as Record<string, unknown>;
    if (def.points === 1) {
      d.points = def.complete ? def.complete([pt], env) : [pt];
      const before = this.snapshot();
      this.commitNew(d, before);
      return;
    }
    const pend: Pending = {
      d,
      def,
      fixed: 1,
      firstGesture: true,
      moved: false,
      downX: p.x,
      downY: p.y,
      before: this.snapshot(),
    };
    if (def.points > 0) this.padPoints(pend, pt);
    this.pending = pend;
    this.redraw();
  }

  /** Points not yet placed mirror the pointer so drawing code always sees a full set. */
  private padPoints(pend: Pending, pt: DPoint) {
    const n = this.slots(pend);
    for (let i = pend.fixed; i < n; i++) pend.d.points[i] = { ...pt };
  }

  /** Anchor slots kept while placing: the fixed ones plus a preview following the pointer (variable tools) or all of them. */
  private slots(pend: Pending): number {
    return pend.def.variable ? pend.fixed + 1 : pend.def.points;
  }

  /** Variable-length tools (polyline, path): each click adds an anchor, a click on the last anchor (double click) finishes. */
  private placeVariable(pend: Pending, p: PointerInfo): boolean {
    const e = this.engine;
    if (!e) return false;
    const last = pend.d.points[pend.fixed - 1];
    const near = !!last && Math.hypot(e.timeToX(last.t) - p.x, e.priceToY(MAIN, last.p) - p.y) < 6;
    if (near) {
      if (pend.fixed >= 2) this.finishVariable(pend);
      return true;
    }
    const q = this.placePx(pend, p);
    const pt = this.magnetPoint(q.x, q.y);
    pend.d.points[pend.fixed] = pt;
    pend.fixed += 1;
    pend.firstGesture = false;
    pend.d.points[pend.fixed] = { ...pt };
    this.redraw();
    return true;
  }

  private finishVariable(pend: Pending) {
    if (this.pending !== pend) return;
    this.pending = null;
    this.captured = false;
    pend.d.points = pend.d.points.slice(0, pend.fixed);
    if (pend.d.points.length < pend.def.points) {
      this.changed();
      return;
    }
    this.commitNew(pend.d, pend.before);
  }

  private placeClick(p: PointerInfo): boolean {
    const pend = this.pending;
    if (!pend) return false;
    if (pend.def.points === 0) {
      this.finishBrush();
      return true;
    }
    if (pend.def.variable) return this.placeVariable(pend, p);
    const q = this.placePx(pend, p);
    const pt = this.magnetPoint(q.x, q.y);
    pend.d.points[pend.fixed] = pt;
    pend.fixed += 1;
    pend.firstGesture = false;
    this.padPoints(pend, pt);
    if (pend.fixed >= pend.def.points) this.finishPlacing();
    else this.redraw();
    return true;
  }

  /** Pointer position for the anchor being placed; Shift snaps angles to 15 degrees, or makes squares and circles. */
  private placePx(pend: Pending, p: PointerInfo): Pt {
    const cur: Pt = { x: p.x, y: p.y };
    const e = this.engine;
    if (!p.shiftKey || !e || pend.fixed < 1 || pend.def.points < 2) return cur;
    const id = pend.def.id;
    const px = (a: DPoint): Pt => ({ x: e.timeToX(a.t), y: e.priceToY(MAIN, a.p) });
    if (SQUARE_TOOLS.has(id)) return snapSquare(px(pend.d.points[0]), cur);
    if (NO_ANGLE_TOOLS.has(id)) return cur;
    const anchor = pend.d.points[pend.fixed - 1];
    return anchor ? snapAngle(px(anchor), cur, 15) : cur;
  }

  private updatePending(p: PointerInfo) {
    const pend = this.pending;
    if (!pend) return;
    if (pend.def.points === 0) {
      const e = this.engine;
      if (!e) return;
      const last = pend.d.points[pend.d.points.length - 1];
      const lx = e.timeToX(last.t);
      const ly = e.priceToY(MAIN, last.p);
      if (Math.hypot(p.x - lx, p.y - ly) >= 2) pend.d.points.push(this.rawPoint(p.x, p.y));
    } else {
      if (!pend.moved && Math.hypot(p.x - pend.downX, p.y - pend.downY) > 4) pend.moved = true;
      const q = this.placePx(pend, p);
      const pt = this.magnetPoint(q.x, q.y);
      for (let i = pend.fixed; i < this.slots(pend); i++) pend.d.points[i] = { ...pt };
    }
    this.redraw();
  }

  private finishBrush() {
    const pend = this.pending;
    if (!pend) return;
    this.pending = null;
    if (pend.d.points.length < 2) {
      this.changed();
      return;
    }
    // thin out the stroke a little to keep serialized drawings small
    if (pend.d.points.length > 3000) pend.d.points = pend.d.points.filter((_, i, a) => i % 2 === 0 || i === a.length - 1);
    this.commitNew(pend.d, pend.before);
  }

  private finishPlacing() {
    const pend = this.pending;
    if (!pend) return;
    this.pending = null;
    const env = this.makeEnv();
    const d = pend.d;
    // discard degenerate drawings (all anchors on the same pixel)
    const P = this.pxPoints(d);
    if (P && P.length >= 2 && P.every((q) => dist(q, P[0]) < 2)) {
      this.changed();
      return;
    }
    if (env && pend.def.complete) d.points = pend.def.complete(d.points, env);
    this.commitNew(d, pend.before);
  }

  private commitNew(d: Drawing, before: string) {
    this.drawings.push(d);
    this.selectedId = d.id;
    this.hoverId = null;
    this.hoverHandle = -1;
    this.pushUndo(before);
    if (!this.stay) this.tool = null;
    this.changed();
  }

  private cancelPending() {
    if (this.pending) {
      this.pending = null;
      this.captured = false;
      this.redraw();
    }
  }

  /* ───────────── drag (move / handle) ───────────── */

  private startDrag(kind: "move" | "handle", d: Drawing, handle: HandleDef | null, p: PointerInfo) {
    const P = this.pxPoints(d);
    if (!P) return;
    const group = kind === "move" && this.sel.includes(d.id) ? this.selectedList().filter((x) => !x.locked) : [d];
    const items: DragItem[] = [];
    for (const g of group) {
      const gp = g === d ? P : this.pxPoints(g);
      if (gp) items.push({ id: g.id, origPts: g.points.map((q) => ({ ...q })), origPx: gp });
    }
    this.drag = {
      kind,
      id: d.id,
      handle,
      items,
      origPts: d.points.map((q) => ({ ...q })),
      origPx: P,
      sx: p.x,
      sy: p.y,
      hx: handle ? handle.x : p.x,
      hy: handle ? handle.y : p.y,
      moved: false,
      before: this.snapshot(),
    };
  }

  private updateDrag(p: PointerInfo) {
    const drag = this.drag;
    const e = this.engine;
    if (!drag || !e) return;
    let dx = p.x - drag.sx;
    let dy = p.y - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < (p.pointerType === "touch" ? 5 : 3)) return;
      drag.moved = true;
      this.clearLongPress();
    }
    if (drag.kind === "move") {
      // Shift keeps the move on one axis
      if (p.shiftKey) {
        const a = snapAxis({ x: 0, y: 0 }, { x: dx, y: dy });
        dx = a.x;
        dy = a.y;
      }
      for (const it of drag.items) {
        const d = this.drawings.find((x) => x.id === it.id);
        if (!d) continue;
        d.points = it.origPts.map((_, i) => {
          const o = it.origPx[i];
          return { t: e.xToTime(o.x + dx), p: e.yToPrice(MAIN, o.y + dy) };
        });
      }
    } else if (drag.handle) {
      const d = this.drawings.find((x) => x.id === drag.id);
      if (!d) return;
      let px: Pt = { x: p.x, y: p.y };
      // Shift keeps the anchor on the horizontal or vertical through where it was picked up
      if (p.shiftKey) px = snapAxis({ x: drag.hx, y: drag.hy }, px);
      const pt = this.magnetPoint(px.x, px.y);
      const pts = drag.origPts.map((q) => ({ ...q }));
      if (drag.handle.drag) drag.handle.drag(pts, pt.t, pt.p);
      else if (drag.handle.idx !== undefined && pts[drag.handle.idx]) pts[drag.handle.idx] = pt;
      d.points = pts;
      getToolDef(d.tool)?.constrain?.(d, drag.handle.idx ?? -1);
    }
    this.redraw();
  }

  /* ───────────── hit testing ───────────── */

  /** Pick radius in px: generous for fingers and pens, still precise for a mouse. */
  private tolFor(type?: string): number {
    return type === "touch" ? 16 : type === "pen" ? 12 : 9;
  }
  private handleHitFor(type?: string): number {
    return type === "touch" ? 22 : type === "pen" ? 14 : 10;
  }

  /** The drawing under the point: what the pointer is on wins (selected first, then topmost), fills only when nothing else is there. */
  private topHit(env: Env, x: number, y: number, type?: string): Drawing | null {
    const tol = this.tolFor(type);
    const order: Drawing[] = [];
    for (let i = this.sel.length - 1; i >= 0; i--) {
      const d = this.drawings.find((q) => q.id === this.sel[i]);
      if (d) order.push(d);
    }
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (!this.sel.includes(d.id)) order.push(d);
    }
    let weak: Drawing | null = null;
    for (const d of order) {
      const lv = this.hitLevel(env, d, x, y, tol);
      if (lv === 2) return d;
      if (lv === 1 && !weak) weak = d;
    }
    return weak;
  }

  /** 2 = on a line, label or text; 1 = inside a translucent fill; 0 = not on it. Follows what the tool actually paints. */
  private hitLevel(env: Env, d: Drawing, x: number, y: number, tol: number): number {
    if (d.hidden || !visibleAt(d, env.intervalMs)) return 0;
    const def = getToolDef(d.tool);
    if (!def) return 0;
    const P = this.pxPoints(d);
    if (!P) return 0;
    let level = 0;
    try {
      if (P.length <= 400) {
        const rec: Recorded = recordDraw((ctx) => def.draw(ctx, env, d, P, NEUTRAL_STATE));
        const r = evalHit(rec, x, y, tol);
        level = r.strong ? 2 : r.weak ? 1 : 0;
      } else if (distToPolyline({ x, y }, P) <= tol + Math.max(1, d.style.width) / 2) {
        level = 2; // long freehand strokes
      }
    } catch {
      level = 0;
    }
    if (level < 2) {
      try {
        if (def.hit(env, d, P, x, y)) level = Math.max(level, 1);
      } catch {
        /* a broken hit test must not block picking */
      }
    }
    return level;
  }

  private handleAt(env: Env, d: Drawing, x: number, y: number, type?: string): (HandleDef & { index: number }) | null {
    const def = getToolDef(d.tool);
    const P = this.pxPoints(d);
    if (!def || !P) return null;
    const hs = defaultHandles(def, env, d, P);
    let bestIdx = -1;
    let bestD = this.handleHitFor(type);
    for (let i = 0; i < hs.length; i++) {
      const dd = Math.hypot(hs[i].x - x, hs[i].y - y);
      if (dd <= bestD) {
        bestD = dd;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? { ...hs[bestIdx], index: bestIdx } : null;
  }

  /* ───────────── coordinates & magnet ───────────── */

  private inMain(p: PointerInfo): boolean {
    return p.region === "plot" && p.paneId === MAIN;
  }

  private pxPoints(d: Drawing): Pt[] | null {
    const e = this.engine;
    if (!e) return null;
    const out: Pt[] = [];
    for (const pt of d.points) {
      const x = e.timeToX(pt.t);
      const y = e.priceToY(MAIN, pt.p);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      out.push({ x, y });
    }
    return out;
  }

  private rawPoint(x: number, y: number): DPoint {
    const e = this.engine!;
    return { t: e.xToTime(x), p: e.yToPrice(MAIN, y) };
  }

  /** Anchor for a pointer position, snapped to the nearest bar's O/H/L/C when a magnet is on. */
  private magnetPoint(x: number, y: number): DPoint {
    const e = this.engine!;
    if (this.magnet !== "off") {
      const candles = e.getCandles();
      const i = Math.round(e.xToIndex(x));
      if (i >= 0 && i < candles.length) {
        const c = candles[i];
        const near = nearestOhlc(c, y, (price) => e.priceToY(MAIN, price));
        const limit = this.magnet === "weak" ? WEAK_MAGNET_PX : Infinity;
        if (near.dist <= limit) return { t: c.t, p: near.price };
      }
    }
    return this.rawPoint(x, y);
  }

  private makeEnv(): Env | null {
    const e = this.engine;
    if (!e) return null;
    const rect = e.getPaneRect(MAIN);
    if (!rect) return null;
    const precision = e.getPrecision();
    const locale = e.opts.locale;
    return {
      w: rect.width,
      h: rect.top + rect.height,
      theme: e.getTheme(),
      font: e.opts.fontFamily,
      intervalMs: e.getIntervalMs(),
      labels: this.labels,
      toX: (t) => e.timeToX(t),
      toY: (p) => e.priceToY(MAIN, p),
      timeAt: (x) => e.xToTime(x),
      priceAt: (y) => e.yToPrice(MAIN, y),
      barsBetween: (a, b) => e.getIndexForTime(b) - e.getIndexForTime(a),
      fmt: (v) => formatPrice(v, precision, locale),
      candles: () => e.getCandles(),
      flow: () => e.flow,
    };
  }

  /* ───────────── history & notifications ───────────── */

  private selected(): Drawing | null {
    if (!this.selectedId) return null;
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
  }

  /** Selected drawings in visual order (bottom to top). */
  private selectedList(): Drawing[] {
    if (this.sel.length === 0) return [];
    const ids = new Set(this.sel);
    return this.drawings.filter((d) => ids.has(d.id));
  }

  private snapshot(): string {
    return JSON.stringify(this.drawings);
  }

  private loadSnapshot(json: string) {
    try {
      const arr: unknown = JSON.parse(json);
      this.drawings = Array.isArray(arr) ? (arr as Drawing[]) : [];
    } catch {
      this.drawings = [];
    }
    if (this.sel.length) this.sel = this.sel.filter((id) => this.drawings.some((d) => d.id === id));
    this.hoverId = null;
    this.hoverHandle = -1;
  }

  private pushUndo(before: string) {
    this.undoStack.push(before);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  private redraw() {
    this.engine?.requestOverlayRedraw();
  }

  private changed() {
    this.redraw();
    for (const cb of [...this.listeners]) {
      try {
        cb();
      } catch {
        /* listener errors must not break the chart */
      }
    }
  }

  /* ───────────── keyboard ───────────── */

  private onKey = (ev: KeyboardEvent) => {
    if (!this.engine || ev.defaultPrevented) return;
    if (isEditable(ev.target as Element | null) || isEditable(typeof document !== "undefined" ? document.activeElement : null)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const code = ev.code;

    if (ev.key === "Enter" && this.pending?.def.variable) {
      // finish a polyline / path
      this.finishVariable(this.pending);
      ev.preventDefault();
      return;
    }
    if (ev.key === "Escape") {
      if (this.marquee) {
        this.marquee = null;
        this.captured = false;
        this.redraw();
      } else if (this.pending) this.cancelPending();
      else if (this.tool) this.setTool(null);
      else if (this.sel.length) {
        this.sel = [];
        this.hoverHandle = -1;
        this.changed();
      } else return;
      ev.preventDefault();
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && !mod && !ev.altKey && this.sel.length) {
      this.removeSelected();
      ev.preventDefault();
      return;
    }

    // tool hotkeys (Alt + letter)
    const hk = toolForHotkey(ev);
    if (hk && getToolDef(hk)) {
      this.setTool(this.tool === hk ? null : hk);
      ev.preventDefault();
      return;
    }

    if (mod && !ev.altKey) {
      if (code === "KeyZ" && !ev.shiftKey) {
        if (this.canUndo()) {
          this.undo();
          ev.preventDefault();
        }
        return;
      }
      if (code === "KeyY" || (code === "KeyZ" && ev.shiftKey)) {
        if (this.canRedo()) {
          this.redo();
          ev.preventDefault();
        }
        return;
      }
      const pageSel = typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "";
      if (code === "KeyC" && this.sel.length && !pageSel) {
        this.copySelected();
        ev.preventDefault();
        return;
      }
      if (code === "KeyX" && this.sel.length && !pageSel) {
        this.cutSelected();
        ev.preventDefault();
        return;
      }
      if (code === "KeyV" && CLIP.length) {
        this.pasteAtPointer();
        ev.preventDefault();
        return;
      }
      if (code === "KeyD" && this.sel.length) {
        this.cloneSelected();
        ev.preventDefault();
      }
      return;
    }

    // arrow keys nudge the selection by a bar / a price tick (Shift = 10)
    if (!mod && !ev.altKey && this.sel.length && (ev.key === "ArrowLeft" || ev.key === "ArrowRight" || ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
      const t = ev.target as HTMLElement | null;
      if (t instanceof HTMLElement && t !== document.body && t !== document.documentElement && t.tagName !== "CANVAS") return;
      const step = ev.shiftKey ? 10 : 1;
      if (ev.key === "ArrowLeft") this.nudgeSelected(-step, 0);
      else if (ev.key === "ArrowRight") this.nudgeSelected(step, 0);
      else if (ev.key === "ArrowUp") this.nudgeSelected(0, step);
      else this.nudgeSelected(0, -step);
      ev.preventDefault();
    }
  };
}

/* ───────────── safe parsing ───────────── */

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const HANDLED_STYLE_KEYS = ["color", "width", "dash", "fill", "fillOpacity", "text"];

function sanitize(raw: unknown): Drawing | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.tool !== "string") return null;
  const def = getToolDef(r.tool);
  if (!def) return null;
  if (!Array.isArray(r.points)) return null;
  const points: DPoint[] = [];
  for (const q of r.points.slice(0, 5000)) {
    if (!q || typeof q !== "object") return null;
    const t = num((q as Record<string, unknown>).t);
    const p = num((q as Record<string, unknown>).p);
    if (t === null || p === null) return null;
    points.push({ t, p });
  }
  if (def.points === 0 || def.variable ? points.length < (def.points || 2) : points.length !== (def.total ?? def.points)) return null;

  const style: DrawingStyle = { ...def.style };
  if (r.style && typeof r.style === "object") {
    const s = r.style as Record<string, unknown>;
    if (typeof s.color === "string" && s.color.length <= 64) style.color = s.color;
    const w = num(s.width);
    if (w !== null) style.width = Math.max(1, Math.min(20, w));
    if (typeof s.dash === "string" && DASHES.includes(s.dash)) style.dash = s.dash;
    if (typeof s.fill === "string" && s.fill.length <= 64) style.fill = s.fill;
    const fo = num(s.fillOpacity);
    if (fo !== null) style.fillOpacity = Math.max(0, Math.min(1, fo));
    if (typeof s.text === "string") style.text = s.text.slice(0, 500);
    // tool-specific properties (property schema keys): plain scalars only
    for (const [k, v] of Object.entries(s)) {
      if (HANDLED_STYLE_KEYS.includes(k) || k === "__proto__" || k === "constructor" || k === "prototype" || k.length > 40) continue;
      if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length <= 200)) (style as unknown as Record<string, unknown>)[k] = v;
    }
  }

  const d: Drawing = {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 64) : newId(),
    tool: def.id,
    points,
    style,
    locked: r.locked === true,
  };
  if (r.hidden === true) d.hidden = true;
  if (typeof r.name === "string" && r.name.trim()) d.name = r.name.trim().slice(0, 80);
  if (r.extra && typeof r.extra === "object" && !Array.isArray(r.extra)) d.extra = r.extra as Record<string, unknown>;
  return d;
}
