import type { DrawingSelection, DrawingsControllerLike, DrawingStyle, DrawingToolId } from "../contracts";
import type { ChartEngine } from "../engine";
import { formatPrice } from "../format";
import type { OverlayLayer, PointerInfo } from "../types";
import { dist, nearestOhlc } from "./geometry";
import { CURSOR_TOOLS, defaultHandles, getToolDef, isCursorTool, isDrawingTool, type Env, type HandleDef, type ToolDef } from "./tools";
import { DEFAULT_LABELS, type DPoint, type Drawing, type DrawLabels, type Magnet, type Pt, type SerializedDrawings } from "./types";

const MAIN = "main";
const HANDLE_R = 4.5;
const HANDLE_HIT = 8;
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

interface DragState {
  kind: "move" | "handle";
  id: string;
  handle: HandleDef | null;
  origPts: DPoint[];
  origPx: Pt[];
  sx: number;
  sy: number;
  moved: boolean;
  before: string;
}

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
  private selectedId: string | null = null;
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

  /* ───────────── lifecycle ───────────── */

  attach(engine: ChartEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    engine.addLayer(this);
    if (typeof document !== "undefined") document.addEventListener("keydown", this.onKey);
    engine.requestOverlayRedraw();
  }

  detach(): void {
    if (typeof document !== "undefined") document.removeEventListener("keydown", this.onKey);
    this.pending = null;
    this.drag = null;
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
    return { id: d.id, tool: d.tool, style: { ...d.style }, locked: d.locked };
  }

  getDrawingsCount(): number {
    return this.drawings.length;
  }

  /* ───────────── edits ───────────── */

  removeSelected(): void {
    const d = this.selected();
    if (!d) return;
    const before = this.snapshot();
    this.drawings = this.drawings.filter((x) => x.id !== d.id);
    this.selectedId = null;
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
    const next: DrawingStyle = { ...d.style };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete (next as unknown as Record<string, unknown>)[k];
      else (next as unknown as Record<string, unknown>)[k] = v;
    }
    if (typeof next.width === "number") next.width = Math.max(1, Math.min(20, next.width));
    d.style = next;
    this.changed();
  }

  toggleSelectedLock(): void {
    const d = this.selected();
    if (!d) return;
    this.pushUndo(this.snapshot());
    d.locked = !d.locked;
    this.changed();
  }

  cloneSelected(): void {
    const d = this.selected();
    if (!d) return;
    const e = this.engine;
    const before = this.snapshot();
    const copy = cloneDrawing(d);
    copy.id = newId();
    copy.locked = false;
    const dx = 16;
    const dy = 16;
    if (e) {
      copy.points = d.points.map((pt) => {
        const x = e.timeToX(pt.t) + dx;
        const y = e.priceToY(MAIN, pt.p) + dy;
        return { t: e.xToTime(x), p: e.yToPrice(MAIN, y) };
      });
    } else {
      copy.points = d.points.map((pt) => ({ t: pt.t + 86_400_000, p: pt.p }));
    }
    const def = getToolDef(copy.tool);
    if (def?.constrain) def.constrain(copy, -1);
    this.drawings.push(copy);
    this.selectedId = copy.id;
    this.pushUndo(before);
    this.changed();
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
      this.paint(ctx, env, d, { selected: d.id === this.selectedId, hover: d.id === this.hoverId && d.id !== this.selectedId, preview: false });
    }

    const sel = this.selected();
    if (sel && !sel.locked && !this.lockedAll) {
      const def = getToolDef(sel.tool);
      const P = this.pxPoints(sel);
      if (def && P) {
        const hs = defaultHandles(def, env, sel, P);
        hs.forEach((h, i) => this.paintHandle(ctx, env, h.x, h.y, sel.style.color, i === this.hoverHandle));
      }
    }

    const pend = this.pending;
    if (pend) {
      this.paint(ctx, env, pend.d, { selected: false, hover: false, preview: true });
      const P = this.pxPoints(pend.d);
      if (P) for (let i = 0; i < pend.fixed && i < P.length; i++) this.paintHandle(ctx, env, P[i].x, P[i].y, pend.d.style.color, false);
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
    } catch {
      /* a broken drawing must not take the chart down */
    }
    ctx.restore();
  }

  private paintHandle(ctx: CanvasRenderingContext2D, env: Env, x: number, y: number, color: string, hot: boolean) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, y, hot ? HANDLE_R + 1.5 : HANDLE_R, 0, Math.PI * 2);
    ctx.fillStyle = hot ? color : env.theme.bg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
  }

  /* ───────────── overlay layer: pointer ───────────── */

  pointerDown(p: PointerInfo): boolean {
    const e = this.engine;
    if (!e || p.button !== 0 || p.pointerType === "touch") return false;
    if (!this.inMain(p)) return false;

    // placing
    if (this.pending) {
      this.captured = true;
      return this.placeClick(p);
    }
    if (this.tool) {
      const def = getToolDef(this.tool);
      if (!def) return false;
      this.captured = true;
      this.startPlacing(def, p);
      return true;
    }

    // cursor mode: select / move / edit
    if (this.hidden || this.lockedAll) return false;
    const env = this.makeEnv();
    if (!env) return false;
    const sel = this.selected();
    if (sel && !sel.locked) {
      const h = this.handleAt(env, sel, p.x, p.y);
      if (h) {
        this.startDrag("handle", sel, h, p);
        this.captured = true;
        return true;
      }
    }
    const hit = this.topHit(env, p.x, p.y);
    if (!hit) {
      if (this.selectedId) {
        this.selectedId = null;
        this.hoverHandle = -1;
        this.changed();
      }
      return false;
    }
    if (this.selectedId !== hit.id) {
      this.selectedId = hit.id;
      this.changed();
    }
    if (hit.locked) return false;
    this.startDrag("move", hit, null, p);
    this.captured = true;
    return true;
  }

  pointerMove(p: PointerInfo): boolean {
    const e = this.engine;
    if (!e) return false;
    const inMain = this.inMain(p);

    // captured gestures
    if (this.captured) {
      if (this.pending) {
        this.updatePending(p);
      } else if (this.drag) {
        this.updateDrag(p);
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
        if (sel && !sel.locked) {
          const h = this.handleAt(env, sel, p.x, p.y);
          if (h) {
            hoverId = sel.id;
            hoverHandle = h.index;
          }
        }
        if (!hoverId) hoverId = this.topHit(env, p.x, p.y)?.id ?? null;
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
    const pend = this.pending;
    if (pend) {
      if (pend.def.points === 0) {
        this.finishBrush();
      } else if (pend.firstGesture && pend.moved) {
        pend.firstGesture = false;
        const pt = this.magnetPoint(p.x, p.y);
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
    const drag = this.drag;
    if (drag) {
      this.drag = null;
      if (drag.moved && this.snapshot() !== drag.before) {
        this.pushUndo(drag.before);
        this.changed();
      } else {
        this.redraw();
      }
    }
  }

  cursor(p: PointerInfo): string | null {
    if (!this.engine || !this.inMain(p)) return null;
    if (this.pending || this.tool) return "crosshair";
    if (this.hoverHandle >= 0) return "pointer";
    if (this.hoverId) {
      const d = this.drawings.find((x) => x.id === this.hoverId);
      return d?.locked ? "default" : "move";
    }
    if (this.cursorStyle === "cursor_dot") return DOT_CURSOR;
    if (this.cursorStyle === "cursor_arrow") return "default";
    return null;
  }

  /* ───────────── placement ───────────── */

  private startPlacing(def: ToolDef, p: PointerInfo) {
    const env = this.makeEnv();
    if (!env) return;
    const pt = def.points === 0 ? this.rawPoint(p.x, p.y) : this.magnetPoint(p.x, p.y);
    const d: Drawing = { id: newId(), tool: def.id, points: [pt], style: { ...def.style }, locked: false };
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
    const n = pend.def.points;
    for (let i = pend.fixed; i < n; i++) pend.d.points[i] = { ...pt };
  }

  private placeClick(p: PointerInfo): boolean {
    const pend = this.pending;
    if (!pend) return false;
    if (pend.def.points === 0) {
      this.finishBrush();
      return true;
    }
    const pt = this.magnetPoint(p.x, p.y);
    pend.d.points[pend.fixed] = pt;
    pend.fixed += 1;
    pend.firstGesture = false;
    this.padPoints(pend, pt);
    if (pend.fixed >= pend.def.points) this.finishPlacing();
    else this.redraw();
    return true;
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
      const pt = this.magnetPoint(p.x, p.y);
      for (let i = pend.fixed; i < pend.def.points; i++) pend.d.points[i] = { ...pt };
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
    this.drag = {
      kind,
      id: d.id,
      handle,
      origPts: d.points.map((q) => ({ ...q })),
      origPx: P,
      sx: p.x,
      sy: p.y,
      moved: false,
      before: this.snapshot(),
    };
  }

  private updateDrag(p: PointerInfo) {
    const drag = this.drag;
    const e = this.engine;
    if (!drag || !e) return;
    const d = this.drawings.find((x) => x.id === drag.id);
    if (!d) return;
    const dx = p.x - drag.sx;
    const dy = p.y - drag.sy;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < 3) return;
      drag.moved = true;
    }
    if (drag.kind === "move") {
      d.points = drag.origPts.map((_, i) => {
        const o = drag.origPx[i];
        return { t: e.xToTime(o.x + dx), p: e.yToPrice(MAIN, o.y + dy) };
      });
    } else if (drag.handle) {
      const pt = this.magnetPoint(p.x, p.y);
      const pts = drag.origPts.map((q) => ({ ...q }));
      if (drag.handle.drag) drag.handle.drag(pts, pt.t, pt.p);
      else if (drag.handle.idx !== undefined && pts[drag.handle.idx]) pts[drag.handle.idx] = pt;
      d.points = pts;
      getToolDef(d.tool)?.constrain?.(d, drag.handle.idx ?? -1);
    }
    this.redraw();
  }

  /* ───────────── hit testing ───────────── */

  private topHit(env: Env, x: number, y: number): Drawing | null {
    const sel = this.selected();
    if (sel && this.hits(env, sel, x, y)) return sel;
    for (let i = this.drawings.length - 1; i >= 0; i--) {
      const d = this.drawings[i];
      if (d === sel) continue;
      if (this.hits(env, d, x, y)) return d;
    }
    return null;
  }

  private hits(env: Env, d: Drawing, x: number, y: number): boolean {
    const def = getToolDef(d.tool);
    if (!def) return false;
    const P = this.pxPoints(d);
    if (!P) return false;
    try {
      return def.hit(env, d, P, x, y);
    } catch {
      return false;
    }
  }

  private handleAt(env: Env, d: Drawing, x: number, y: number): (HandleDef & { index: number }) | null {
    const def = getToolDef(d.tool);
    const P = this.pxPoints(d);
    if (!def || !P) return null;
    const hs = defaultHandles(def, env, d, P);
    let bestIdx = -1;
    let bestD = HANDLE_HIT;
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
    };
  }

  /* ───────────── history & notifications ───────────── */

  private selected(): Drawing | null {
    if (!this.selectedId) return null;
    return this.drawings.find((d) => d.id === this.selectedId) ?? null;
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
    if (this.selectedId && !this.drawings.some((d) => d.id === this.selectedId)) this.selectedId = null;
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

    if (ev.key === "Escape") {
      if (this.pending) this.cancelPending();
      else if (this.tool) this.setTool(null);
      else if (this.selectedId) {
        this.selectedId = null;
        this.changed();
      } else return;
      ev.preventDefault();
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && !mod && this.selectedId) {
      this.removeSelected();
      ev.preventDefault();
      return;
    }
    if (mod && ev.code === "KeyZ" && !ev.shiftKey) {
      if (this.canUndo()) {
        this.undo();
        ev.preventDefault();
      }
      return;
    }
    if (mod && (ev.code === "KeyY" || (ev.code === "KeyZ" && ev.shiftKey))) {
      if (this.canRedo()) {
        this.redo();
        ev.preventDefault();
      }
    }
  };
}

/* ───────────── safe parsing ───────────── */

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

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
  if (def.points === 0 ? points.length < 2 : points.length !== (def.total ?? def.points)) return null;

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
  }

  const d: Drawing = {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 64) : newId(),
    tool: def.id,
    points,
    style,
    locked: r.locked === true,
  };
  if (r.extra && typeof r.extra === "object" && !Array.isArray(r.extra)) d.extra = r.extra as Record<string, unknown>;
  return d;
}
