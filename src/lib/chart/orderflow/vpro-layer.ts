import type { ChartEngine } from "../engine";
import type { IndicatorInstance } from "../contracts";
import type { IndicatorsController } from "../indicators/controller";
import type { OverlayLayer, PointerInfo } from "../types";
import { tfGroupOf } from "../indicators/style";
import { indT } from "../indicators/ind-text";
import { getVpView, readVpCfg, type VpView } from "../indicators/vpro-def";
import { formatChartTime } from "../analysis/vprofile";
import { paintTable, tableRows, type Rect } from "./vpro-table";
import { isNarrowPlot, narrowCorner, VP_TABLE_MIN_WIDTH } from "./vpro-layout";

/* Overlay of the configurable volume profile ("vprofile_pro"): the statistics table (click to collapse), the draggable edges of the
   profile's bar range, and the click-to-place anchor of the "from a point" range (same mechanics as the Anchored VWAP layer).
   The histogram and the level lines are painted by the indicator itself; both read the profile through getVpView(). */

const ID = "vprofile_pro";
/** A plot narrower than this (a phone) gets the compact chip table instead of the full one. */
export { VP_TABLE_MIN_WIDTH };

type Edge = "start" | "end";

interface Hit {
  table: Rect | null;
  /** Screen x of the range edges (null = not draggable / off screen). */
  xs: number | null;
  xe: number | null;
}

export class VpLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private off: (() => void) | null = null;
  private keyOn = false;
  private hoverX = -1;
  private hits = new Map<string, Hit>();
  private hoverEdge: { uid: string; edge: Edge } | null = null;
  private hoverTable: string | null = null;
  /** Narrow (phone) plots show the compact table open by default; the uids whose table the user folded into a chip (not saved with the indicator). */
  private narrowClosed = new Set<string>();
  private drag: { uid: string; edge: Edge; last: number } | null = null;
  private legendSig = new Map<string, string>();
  private notifyRaf = 0;
  hint = "";

  constructor(private controller: IndicatorsController) {}

  attach(engine: ChartEngine) {
    this.engine = engine;
    engine.addLayer(this);
    this.off = this.controller.subscribe(() => this.sync());
    this.sync();
  }

  detach() {
    this.off?.();
    this.off = null;
    this.setKey(false);
    if (this.notifyRaf) cancelAnimationFrame(this.notifyRaf);
    this.notifyRaf = 0;
    this.engine?.removeLayer(this);
    this.engine = null;
  }

  private list(): IndicatorInstance[] {
    return this.controller.list().filter((i) => i.id === ID);
  }

  private pending(): IndicatorInstance | null {
    return this.list().find((i) => i.visible && i.params.vpRange === "anchor" && !(Number(i.params.vpAnchorTime) > 0)) ?? null;
  }

  private sync() {
    this.setKey(!!this.pending());
    this.engine?.requestOverlayRedraw();
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const p = this.pending();
    if (!p) return;
    e.preventDefault();
    e.stopPropagation();
    // no anchor was chosen: fall back to the last N bars
    this.controller.update(p.uid, { params: { vpRange: "lastN" } });
  };

  private setKey(on: boolean) {
    if (on === this.keyOn) return;
    this.keyOn = on;
    if (on) document.addEventListener("keydown", this.onKey, true);
    else document.removeEventListener("keydown", this.onKey, true);
  }

  private shown(it: IndicatorInstance, eng: ChartEngine): boolean {
    if (!it.visible) return false;
    const tf = it.style?.tf;
    if (tf && tf[tfGroupOf(eng.getIntervalMs())] === false) return false;
    return true;
  }

  private viewOf(it: IndicatorInstance, eng: ChartEngine): VpView | null {
    const cs = eng.getCandles();
    if (cs.length === 0) return null;
    return getVpView(it.params, cs, eng.flow, eng.getVisibleRange(), eng.flow.precision);
  }

  private notifyLegend(uid: string, sig: string) {
    if (this.legendSig.get(uid) === sig) return;
    this.legendSig.set(uid, sig);
    if (this.notifyRaf) return;
    this.notifyRaf = requestAnimationFrame(() => {
      this.notifyRaf = 0;
      this.controller.notifyData();
    });
  }

  /* ───────────── painting ───────────── */

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    if (engine.isTransformed()) {
      this.hits.clear();
      return;
    }
    const cs = engine.getCandles();
    if (cs.length === 0) return;
    const { width: W, height: H } = engine.getPlotSize();
    const theme = engine.getTheme();
    const font = engine.opts.fontFamily || "Inter, system-ui, sans-serif";
    const spacing = engine.getBarSpacing();
    const stack: Record<string, number> = { tr: 0, tl: 0, br: 0, bl: 0 };
    const all = this.controller.list();
    const mainCount = all.filter((i) => this.controller.paneOf(i.uid) === "main").length;
    // legend: the OHLC status line, the collapse button row, one row per indicator
    const insetTop = Math.max(engine.getStatusBottom(), 40) + 30 + Math.min(mainCount, 12) * 18;
    const seen = new Set<string>();
    let idx = 0;
    for (const it of this.list()) {
      if (!this.shown(it, engine)) continue;
      seen.add(it.uid);
      const cfg = readVpCfg(it.params);
      const view = this.viewOf(it, engine);
      this.notifyLegend(it.uid, view ? view.legendSig : "-");
      const hit: Hit = { table: null, xs: null, xe: null };
      this.hits.set(it.uid, hit);
      if (!view) continue;
      const [a, b] = view.range;
      /* range edges */
      if (cfg.handles && (cfg.range === "fixed" || cfg.range === "lastN" || cfg.range === "anchor")) {
        const xs = engine.indexToX(a) - spacing / 2;
        const xe = engine.indexToX(b) + spacing / 2;
        const yMid = H * 0.5 + idx * 26;
        if (xs >= -2 && xs <= W + 2) {
          hit.xs = xs;
          this.paintEdge(ctx, xs, H, yMid, this.hoverEdge?.uid === it.uid && this.hoverEdge.edge === "start", this.drag?.uid === it.uid && this.drag.edge === "start");
        }
        if (cfg.range === "fixed" && xe >= -2 && xe <= W + 2) {
          hit.xe = xe;
          this.paintEdge(ctx, xe, H, yMid, this.hoverEdge?.uid === it.uid && this.hoverEdge.edge === "end", this.drag?.uid === it.uid && this.drag.edge === "end");
        }
      }
      /* statistics table */
      if (cfg.table) {
        const narrow = isNarrowPlot(W);
        const rows = tableRows(cfg, view, engine.opts.locale, narrow);
        const title = narrow ? `VP ${cfg.opts.valueArea}%` : `${indT("vp.t.title", "Volume Profile")} · ${cfg.opts.valueArea}%`;
        // phone: the compact table is shown right away and folds into a chip on tap (the saved "collapsed" flag is for the wide table), on the side away from the histogram
        const tcfg = narrow ? { ...cfg, tblCollapsed: this.narrowClosed.has(it.uid), tblPos: narrowCorner(cfg.tblPos, cfg.placement) } : cfg;
        const corner = tcfg.tblPos;
        const rect = paintTable(ctx, theme, font, tcfg, rows, title, { W, H, insetTop, stack: stack[corner], narrow });
        stack[corner] += rect.h + 6;
        hit.table = rect;
      }
      idx++;
    }
    for (const k of Array.from(this.hits.keys())) if (!seen.has(k)) this.hits.delete(k);
    for (const k of Array.from(this.narrowClosed)) if (!seen.has(k)) this.narrowClosed.delete(k);

    /* anchor placement in progress */
    const p = this.pending();
    if (p && this.hoverX >= 0) {
      const i = Math.max(0, Math.min(cs.length - 1, Math.round(engine.xToIndex(this.hoverX))));
      const x = engine.indexToX(i);
      ctx.save();
      ctx.strokeStyle = "#2962ff";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, H);
      ctx.stroke();
      ctx.restore();
    }
    if (p) {
      const text = this.hint || indT("vp.pick", "Click the chart to set where the volume profile starts (Esc to cancel)");
      ctx.save();
      ctx.font = `600 12px ${font}`;
      const tw = ctx.measureText(text).width + 20;
      const x = Math.max(8, (W - tw) / 2);
      ctx.fillStyle = "rgba(41,98,255,0.92)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, 10, tw, 26, 6);
      else ctx.rect(x, 10, tw, 26);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 10, 23.5);
      ctx.restore();
    }
  }

  private paintEdge(ctx: CanvasRenderingContext2D, x: number, H: number, yMid: number, hover: boolean, dragging: boolean) {
    const active = hover || dragging;
    const px = Math.round(x) + 0.5;
    ctx.save();
    ctx.strokeStyle = active ? "#2962ff" : "rgba(120,123,134,0.6)";
    ctx.lineWidth = active ? 1.5 : 1;
    ctx.setLineDash(active ? [] : [5, 4]);
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
    ctx.setLineDash([]);
    // grip
    ctx.fillStyle = active ? "#2962ff" : "rgba(120,123,134,0.85)";
    const gw = 7;
    const gh = 24;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(px - gw / 2, yMid - gh / 2, gw, gh, 3);
    else ctx.rect(px - gw / 2, yMid - gh / 2, gw, gh);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px - 1, yMid - 5);
    ctx.lineTo(px - 1, yMid + 5);
    ctx.moveTo(px + 1.5, yMid - 5);
    ctx.lineTo(px + 1.5, yMid + 5);
    ctx.stroke();
    ctx.restore();
  }

  /* ───────────── pointer ───────────── */

  private snapIndex(x: number, edge: Edge | null): number {
    const eng = this.engine;
    if (!eng) return 0;
    const n = eng.getCandles().length;
    const half = eng.getBarSpacing() / 2;
    // the edge lines sit on the outer sides of the first / last bar
    const xi = edge === "start" ? x + half : edge === "end" ? x - half : x;
    return Math.max(0, Math.min(n - 1, Math.round(eng.xToIndex(xi))));
  }

  private edgeAt(x: number, y: number, touch: boolean): { uid: string; edge: Edge } | null {
    const r = touch ? 14 : 6;
    let best: { uid: string; edge: Edge; d: number } | null = null;
    for (const [uid, h] of this.hits) {
      if (h.xs !== null && Math.abs(h.xs - x) <= r && (!best || Math.abs(h.xs - x) < best.d)) best = { uid, edge: "start", d: Math.abs(h.xs - x) };
      if (h.xe !== null && Math.abs(h.xe - x) <= r && (!best || Math.abs(h.xe - x) < best.d)) best = { uid, edge: "end", d: Math.abs(h.xe - x) };
    }
    void y;
    return best ? { uid: best.uid, edge: best.edge } : null;
  }

  private tableAt(x: number, y: number): string | null {
    for (const [uid, h] of this.hits) {
      const t = h.table;
      // a finger needs a bigger target than a mouse: the phone chip is only ~16 px high
      const pad = this.engine && isNarrowPlot(this.engine.getPlotSize().width) ? 8 : 0;
      if (t && x >= t.x - pad && x <= t.x + t.w + pad && y >= t.y - pad && y <= t.y + t.h + pad) return uid;
    }
    return null;
  }

  /** Moves the dragged edge to bar `idx`: the parameters of the instance follow the range mode. */
  private applyEdge(uid: string, edge: Edge, idx: number) {
    const eng = this.engine;
    const inst = this.list().find((i) => i.uid === uid);
    if (!eng || !inst) return;
    const cs = eng.getCandles();
    const last = cs.length - 1;
    const view = this.viewOf(inst, eng);
    const mode = String(inst.params.vpRange);
    const range = view ? view.range : ([0, last] as [number, number]);
    let from = range[0];
    let to = range[1];
    if (edge === "start") from = Math.min(idx, to);
    else to = Math.max(idx, from);
    if (mode === "lastN") {
      if (edge === "start") this.controller.update(uid, { params: { vpLastN: Math.max(2, last - from + 1) } });
    } else if (mode === "anchor") {
      if (edge === "start") this.controller.update(uid, { params: { vpAnchorTime: cs[from].t } });
    } else if (mode === "fixed") {
      // both ends are written as times, so the range stays put while new bars arrive
      this.controller.update(uid, {
        params: { vpFromIso: formatChartTime(cs[from].t), vpFromBack: last - from, vpToIso: to >= last ? "" : formatChartTime(cs[to].t), vpToBack: last - to },
      });
    }
  }

  pointerDown(p: PointerInfo): boolean {
    if (p.region !== "plot" || p.paneId !== "main" || p.button > 0) return false;
    const eng = this.engine;
    if (!eng || eng.isTransformed()) return false;
    const pend = this.pending();
    if (pend) {
      const cs = eng.getCandles();
      if (cs.length === 0) return false;
      const i = this.snapIndex(p.x, null);
      this.controller.update(pend.uid, { params: { vpAnchorTime: cs[i].t } });
      return true;
    }
    const touch = p.pointerType === "touch";
    const uidT = this.tableAt(p.x, p.y);
    if (uidT) {
      const inst = this.list().find((i) => i.uid === uidT);
      if (inst && eng && isNarrowPlot(eng.getPlotSize().width)) {
        if (!this.narrowClosed.delete(uidT)) this.narrowClosed.add(uidT);
        eng.requestOverlayRedraw();
      } else if (inst) this.controller.update(uidT, { params: { vpTblCollapsed: !inst.params.vpTblCollapsed } });
      return true;
    }
    const e = this.edgeAt(p.x, p.y, touch);
    if (e) {
      this.drag = { uid: e.uid, edge: e.edge, last: -1 };
      return true;
    }
    return false;
  }

  pointerMove(p: PointerInfo): boolean {
    if (this.drag) {
      const i = this.snapIndex(p.x, this.drag.edge);
      if (i !== this.drag.last) {
        this.drag.last = i;
        this.applyEdge(this.drag.uid, this.drag.edge, i);
      }
      return true;
    }
    if (this.pending()) {
      this.hoverX = p.region === "plot" ? p.x : -1;
      this.engine?.requestOverlayRedraw();
      return false;
    }
    let changed = false;
    if (p.region === "plot" && p.paneId === "main") {
      const e = this.edgeAt(p.x, p.y, false);
      const t = e ? null : this.tableAt(p.x, p.y);
      if (e?.uid !== this.hoverEdge?.uid || e?.edge !== this.hoverEdge?.edge) {
        this.hoverEdge = e;
        changed = true;
      }
      if (t !== this.hoverTable) {
        this.hoverTable = t;
        changed = true;
      }
    } else if (this.hoverEdge || this.hoverTable) {
      this.hoverEdge = null;
      this.hoverTable = null;
      changed = true;
    }
    if (changed) this.engine?.requestOverlayRedraw();
    return false;
  }

  pointerUp(): void {
    this.drag = null;
    this.engine?.requestOverlayRedraw();
  }

  cursor(): string | null {
    if (this.drag) return "ew-resize";
    if (this.pending()) return "crosshair";
    if (this.hoverEdge) return "ew-resize";
    if (this.hoverTable) return "pointer";
    return null;
  }
}
