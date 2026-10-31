import type { ChartEngine } from "./engine";
import type { LayerAxisTag, OverlayLayer, PointerInfo } from "./types";
import { alertLevel, type LineLevel, type LineSpec } from "../alerts/evaluate";

const MAIN = "main";
const COLOR = "#f59e0b";

/** The slice of an alert the chart needs to paint it. */
export interface AlertMark {
  id: string;
  kind: string;
  price: number | null;
  line: LineSpec | null;
}

/**
 * Active alerts of the current symbol: dashed price lines (fixed level), and for line alerts a dot at the line's level right now.
 * The bell tag with the level sits on the price scale (axisTags: the engine writes «Alert» above it and keeps it off the other tags).
 * Also remembers the price under the pointer for the Alt+A shortcut.
 * A fixed-level alert is dragged with the mouse (like in TradingView): grab its line, move it, release: `onMove` saves the new level.
 */
export class AlertsLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private marks: AlertMark[] = [];
  /** chart time = real UTC ms + offset (see TradingChart: MOEX candles are shifted wall-clock times). */
  private offsetMs = 0;
  private pointerPrice: number | null = null;
  /** Saves a dragged alert's new level; false = it was not saved (the line goes back). Set by the chart. */
  onMove: ((id: string, price: number) => Promise<boolean>) | null = null;
  /** The alert under the pointer / being dragged, and the level its line is drawn at while it is dragged or waiting to be saved. */
  private hoverId: string | null = null;
  private dragId: string | null = null;
  private dragPrice = 0;

  attach(engine: ChartEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    engine.addLayer(this);
  }

  detach(): void {
    const e = this.engine;
    this.engine = null;
    if (e) e.removeLayer(this);
  }

  setMarks(marks: AlertMark[]): void {
    this.marks = marks;
    // the saved levels arrived: nothing is held back any more (unless the pointer is still dragging)
    if (this.dragId && !this.dragging) this.dragId = null;
    this.engine?.requestOverlayRedraw();
  }

  private dragging = false;

  /** Level an alert is shown at: the dragged one follows the pointer, the others sit on their own level. */
  private levelOf(m: AlertMark, now: number): LineLevel {
    if (m.id === this.dragId) return { state: "ok", level: this.dragPrice };
    return alertLevel({ kind: m.kind, price: m.price, line: m.line }, now);
  }

  /** The fixed-level alert whose line is within a few px of the pointer (mouse / pen only: a finger pans the chart). */
  private hit(p: PointerInfo): AlertMark | null {
    const e = this.engine;
    if (!e || p.pointerType === "touch" || p.region !== "plot" || p.paneId !== MAIN) return null;
    const now = Date.now();
    let best: AlertMark | null = null;
    let bestD = 7;
    for (const m of this.marks) {
      if (m.kind === "line") continue;
      const lv = this.levelOf(m, now);
      if (lv.state !== "ok") continue;
      const d = Math.abs(e.priceToY(MAIN, lv.level) - p.y);
      if (d <= bestD) {
        best = m;
        bestD = d;
      }
    }
    return best;
  }

  pointerDown(p: PointerInfo): boolean {
    if (p.button !== 0) return false;
    const m = this.hit(p);
    if (!m || !this.engine) return false;
    const lv = this.levelOf(m, Date.now());
    if (lv.state !== "ok") return false;
    this.dragId = m.id;
    this.dragging = true;
    this.dragPrice = lv.level;
    return true;
  }

  pointerUp(p: PointerInfo): void {
    const e = this.engine;
    const id = this.dragId;
    if (!this.dragging || !id) return;
    this.dragging = false;
    const mark = this.marks.find((m) => m.id === id);
    const price = this.dragPrice;
    const old = mark?.price;
    if (!e || !this.onMove || !Number.isFinite(price) || price <= 0 || (old !== null && old !== undefined && Math.abs(old - price) < 1e-12)) {
      this.dragId = null;
      e?.requestOverlayRedraw();
      return;
    }
    // the line stays where it was dropped until the server confirms (setMarks) or refuses
    void this.onMove(id, price).then((ok) => {
      if (!ok && this.dragId === id && !this.dragging) {
        this.dragId = null;
        this.engine?.requestOverlayRedraw();
      }
    });
    void p;
  }

  pointerLeave(): void {
    if (this.hoverId) {
      this.hoverId = null;
      this.engine?.requestOverlayRedraw();
    }
  }

  cursor(p: PointerInfo): string | null {
    return this.dragging || this.hit(p) ? "ns-resize" : null;
  }

  setTimeOffset(ms: number): void {
    this.offsetMs = ms;
    this.engine?.requestOverlayRedraw();
  }

  /** Price at the pointer when it was last over the main pane, else null. */
  getPointerPrice(): number | null {
    return this.pointerPrice;
  }

  pointerMove(p: PointerInfo): boolean {
    const e = this.engine;
    if (this.dragging && e) {
      const raw = e.yToPrice(MAIN, p.y);
      if (Number.isFinite(raw) && raw > 0) this.dragPrice = Number(raw.toFixed(e.getPrecision()));
      this.pointerPrice = this.dragPrice;
      e.requestOverlayRedraw();
      return true;
    }
    const over = this.hit(p);
    if ((over?.id ?? null) !== this.hoverId) {
      this.hoverId = over?.id ?? null;
      e?.requestOverlayRedraw();
    }
    if (over) return true; // the pointer is on an alert line: the layer owns the hover (crosshair hidden, «ns-resize» cursor)
    if (e && p.region === "plot" && p.paneId === MAIN) {
      const price = e.yToPrice(MAIN, p.y);
      this.pointerPrice = Number.isFinite(price) ? price : null;
    } else if (p.region !== "plot") {
      this.pointerPrice = null;
    }
    return false;
  }

  axisTags(engine: ChartEngine): LayerAxisTag[] {
    if (engine !== this.engine || this.marks.length === 0) return [];
    const now = Date.now();
    const out: LayerAxisTag[] = [];
    for (const m of this.marks) {
      const lv = this.levelOf(m, now);
      if (lv.state !== "ok" || !Number.isFinite(lv.level)) continue;
      out.push({ price: lv.level, kind: "alert", color: COLOR, textColor: "#1f2937", icon: "bell" });
    }
    return out;
  }

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    if (engine !== this.engine || this.marks.length === 0) return;
    const rect = engine.getPaneRect(MAIN);
    if (!rect) return;
    const theme = engine.getTheme();
    const now = Date.now();

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rect.top, rect.width, rect.height);
    ctx.clip();
    ctx.font = `600 11px ${engine.opts.fontFamily}`;
    ctx.textBaseline = "middle";

    for (const m of this.marks) {
      const lv = this.levelOf(m, now);
      if (lv.state !== "ok") continue;
      const y = engine.priceToY(MAIN, lv.level);
      if (!Number.isFinite(y) || y < rect.top - 20 || y > rect.top + rect.height + 20) continue;
      const isLine = m.kind === "line";

      if (!isLine) {
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = m.id === this.dragId || m.id === this.hoverId ? 2 : 1;
        ctx.strokeStyle = COLOR;
        const sy = Math.round(y) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(rect.width, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const x = engine.timeToX(now + this.offsetMs);
        if (Number.isFinite(x) && x >= -6 && x <= rect.width + 6) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fillStyle = COLOR;
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = theme.bg;
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
}
