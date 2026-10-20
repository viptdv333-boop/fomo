import type { ChartEngine } from "./engine";
import type { LayerAxisTag, OverlayLayer, PointerInfo } from "./types";
import { alertLevel, type LineSpec } from "../alerts/evaluate";

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
 */
export class AlertsLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private marks: AlertMark[] = [];
  /** chart time = real UTC ms + offset (see TradingChart: MOEX candles are shifted wall-clock times). */
  private offsetMs = 0;
  private pointerPrice: number | null = null;

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
    this.engine?.requestOverlayRedraw();
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
      const lv = alertLevel({ kind: m.kind, price: m.price, line: m.line }, now);
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
      const lv = alertLevel({ kind: m.kind, price: m.price, line: m.line }, now);
      if (lv.state !== "ok") continue;
      const y = engine.priceToY(MAIN, lv.level);
      if (!Number.isFinite(y) || y < rect.top - 20 || y > rect.top + rect.height + 20) continue;
      const isLine = m.kind === "line";

      if (!isLine) {
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 1;
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
