import type { ChartEngine } from "../engine";
import type { IndicatorInstance } from "../contracts";
import type { IndicatorsController } from "../indicators/controller";
import type { OverlayLayer, PointerInfo } from "../types";
import { indexAtOrAfter } from "./vwapcalc";

/* Anchored VWAP placement on the chart. An "avwap" indicator without an anchor waits for a click (placing mode); afterwards its
   anchor marker can be dragged along the bars. Several instances = several anchors. Esc cancels a placement in progress. */

const ID = "avwap";

export class AnchoredVwapLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private off: (() => void) | null = null;
  private hoverX = -1;
  private drag: { uid: string; last: number } | null = null;
  private hoverUid: string | null = null;
  private keyOn = false;
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
    this.engine?.removeLayer(this);
    this.engine = null;
  }

  private list(): IndicatorInstance[] {
    return this.controller.list().filter((i) => i.id === ID);
  }

  private pending(): IndicatorInstance | null {
    return this.list().find((i) => i.visible && !(Number(i.params.anchorTime) > 0)) ?? null;
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
    this.controller.remove(p.uid);
  };

  private setKey(on: boolean) {
    if (on === this.keyOn) return;
    this.keyOn = on;
    if (on) document.addEventListener("keydown", this.onKey, true);
    else document.removeEventListener("keydown", this.onKey, true);
  }

  private snapTime(x: number): number | null {
    const eng = this.engine;
    if (!eng) return null;
    const cs = eng.getCandles();
    if (cs.length === 0) return null;
    const i = Math.max(0, Math.min(cs.length - 1, Math.round(eng.xToIndex(x))));
    return cs[i].t;
  }

  private markerAt(x: number, y: number, touch: boolean): IndicatorInstance | null {
    const eng = this.engine;
    if (!eng) return null;
    const cs = eng.getCandles();
    const r = touch ? 16 : 9;
    for (const it of this.list()) {
      if (!it.visible) continue;
      const t0 = Number(it.params.anchorTime);
      if (!(t0 > 0)) continue;
      const i = indexAtOrAfter(cs, t0);
      if (i >= cs.length) continue;
      const c = cs[i];
      const mx = eng.indexToX(i);
      const my = eng.priceToY("main", (c.h + c.l + c.c) / 3);
      if (Math.hypot(mx - x, my - y) <= r) return it;
    }
    return null;
  }

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    const cs = engine.getCandles();
    if (cs.length === 0) return;
    const w = engine.getPlotSize().width;
    for (const it of this.list()) {
      if (!it.visible) continue;
      const t0 = Number(it.params.anchorTime);
      if (!(t0 > 0)) continue;
      const i = indexAtOrAfter(cs, t0);
      if (i >= cs.length) continue;
      const c = cs[i];
      const x = engine.indexToX(i);
      if (x < -10 || x > w + 10) continue;
      const y = engine.priceToY("main", (c.h + c.l + c.c) / 3);
      const active = this.hoverUid === it.uid || this.drag?.uid === it.uid;
      ctx.save();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, active ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = String(it.params.color || "#ff9800");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = engine.getTheme().bg;
      ctx.stroke();
      ctx.restore();
    }
    const p = this.pending();
    if (p && this.hoverX >= 0) {
      const i = Math.max(0, Math.min(cs.length - 1, Math.round(engine.xToIndex(this.hoverX))));
      const x = engine.indexToX(i);
      const h = engine.getPlotSize().height;
      ctx.save();
      ctx.strokeStyle = String(p.params.color || "#ff9800");
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
      ctx.stroke();
      ctx.restore();
    }
    if (p && this.hint) {
      ctx.save();
      ctx.font = `600 12px ${engine.opts.fontFamily}`;
      const tw = ctx.measureText(this.hint).width + 20;
      const x = Math.max(8, (w - tw) / 2);
      ctx.fillStyle = "rgba(41,98,255,0.92)";
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(x, 10, tw, 26, 6);
      else ctx.rect(x, 10, tw, 26);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(this.hint, x + 10, 23.5);
      ctx.restore();
    }
  }

  pointerDown(p: PointerInfo): boolean {
    if (p.region !== "plot" || p.paneId !== "main" || p.button > 0) return false;
    const pend = this.pending();
    if (pend) {
      const t = this.snapTime(p.x);
      if (t === null) return false;
      this.controller.update(pend.uid, { params: { anchorTime: t } });
      return true;
    }
    const m = this.markerAt(p.x, p.y, p.pointerType === "touch");
    if (m) {
      this.drag = { uid: m.uid, last: Number(m.params.anchorTime) };
      return true;
    }
    return false;
  }

  pointerMove(p: PointerInfo): boolean {
    if (this.drag) {
      const t = this.snapTime(p.x);
      if (t !== null && t !== this.drag.last) {
        this.drag.last = t;
        this.controller.update(this.drag.uid, { params: { anchorTime: t } });
      }
      return true;
    }
    if (this.pending()) {
      this.hoverX = p.region === "plot" ? p.x : -1;
      this.engine?.requestOverlayRedraw();
      return false;
    }
    const m = p.region === "plot" && p.paneId === "main" ? this.markerAt(p.x, p.y, false) : null;
    const uid = m ? m.uid : null;
    if (uid !== this.hoverUid) {
      this.hoverUid = uid;
      this.engine?.requestOverlayRedraw();
    }
    return false;
  }

  pointerUp(): void {
    this.drag = null;
    this.engine?.requestOverlayRedraw();
  }

  cursor(): string | null {
    if (this.drag) return "grabbing";
    if (this.pending()) return "crosshair";
    return this.hoverUid ? "grab" : null;
  }
}
