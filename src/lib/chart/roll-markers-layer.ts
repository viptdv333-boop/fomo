import type { ChartEngine } from "./engine";
import type { OverlayLayer, PointerInfo } from "./types";
import { snapToBar, toChartTime, utcSpan } from "../calendar/overlay";

const MAIN = "main";
const ROLL_COLOR = "#8b5cf6";
/** Beyond this many days on screen the markers would smear into a line: nothing is drawn. */
const MAX_VISIBLE_DAYS = 400;

interface Roll { t: number; from: string; to: string; expiry: string }

/**
 * Roll marks on a continuous futures series (NG1!, BR2!, …): a small badge just above the time axis at each point where the
 * chain switched contracts, snapped to the bar that contains it; hovering shows the outgoing → incoming contract and the expiry.
 * The roll points come from /api/continuous-rolls (the live MOEX catalogue), fetched once per symbol. Chart time = real UTC ms + offsetMs.
 */
export class RollMarkersLayer implements OverlayLayer {
  private engine: ChartEngine | null = null;
  private offsetMs = 0;
  private ticker = "";
  private rolls: Roll[] = [];
  private marks: { x: number; y: number; roll: Roll }[] = [];
  private hover: number | null = null;
  private gen = 0;
  private label = "склейка";

  attach(engine: ChartEngine): void {
    if (this.engine === engine) return;
    this.detach();
    this.engine = engine;
    engine.addLayer(this);
  }

  detach(): void {
    this.gen++;
    const e = this.engine;
    this.engine = null;
    if (e) e.removeLayer(this);
  }

  setLabel(s: string): void { this.label = s; }

  setTimeOffset(ms: number): void {
    this.offsetMs = ms;
    this.redraw();
  }

  /** Point the layer at a symbol; a continuous MOEX future loads its roll points, anything else clears them. */
  setSeries(ticker: string, source: string): void {
    const continuous = source === "moex" && /^[A-Z]{1,6}[12]!$/.test(ticker);
    const key = continuous ? ticker : "";
    if (key === this.ticker) return;
    this.ticker = key;
    this.rolls = [];
    this.hover = null;
    this.gen++;
    const gen = this.gen;
    if (!key) { this.redraw(); return; }
    void (async () => {
      try {
        const res = await fetch(`/api/continuous-rolls?ticker=${encodeURIComponent(key)}`);
        const j = await res.json().catch(() => ({}));
        if (gen !== this.gen || !this.engine) return;
        this.rolls = Array.isArray(j.rolls) ? (j.rolls as Roll[]).sort((a, b) => a.t - b.t) : [];
        this.redraw();
      } catch { /* no marks without the catalogue */ }
    })();
  }

  private redraw() { this.engine?.requestOverlayRedraw(); }

  /* ───────── interaction ───────── */

  pointerMove(p: PointerInfo): boolean {
    const prev = this.hover;
    this.hover = p.region === "plot" ? this.hit(p.x, p.y) : null;
    if (prev !== this.hover) this.redraw();
    return false;
  }

  pointerLeave(): void {
    if (this.hover !== null) { this.hover = null; this.redraw(); }
  }

  cursor(p: PointerInfo): string | null {
    return p.region === "plot" && this.hit(p.x, p.y) !== null ? "pointer" : null;
  }

  private hit(x: number, y: number): number | null {
    let best: number | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i];
      const dx = Math.abs(x - m.x);
      const dy = Math.abs(y - m.y);
      if (dx <= 11 && dy <= 11 && dx + dy < bestD) { bestD = dx + dy; best = i; }
    }
    return best;
  }

  /* ───────── drawing ───────── */

  draw(ctx: CanvasRenderingContext2D, engine: ChartEngine): void {
    this.marks = [];
    if (engine !== this.engine || this.rolls.length === 0) return;
    const rect = engine.getPaneRect(MAIN);
    if (!rect || engine.getBars().length === 0) return;
    const vis = engine.getVisibleTimeRange();
    const span = utcSpan(vis.from, vis.to, this.offsetMs);
    if (!(span.to > span.from) || span.to - span.from > MAX_VISIBLE_DAYS * 86_400_000) return;

    const bars = engine.getBars();
    const interval = engine.getIntervalMs();
    const snap = !engine.isTransformed();
    const pad = 3 * 86_400_000;
    const xOf = (utc: number) => {
      const ct = toChartTime(utc, this.offsetMs);
      return engine.timeToX(snap ? snapToBar(bars, ct, interval) : ct);
    };
    const y = rect.top + rect.height - 10;
    const theme = engine.getTheme();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, rect.top, rect.width, rect.height);
    ctx.clip();
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";

    for (const roll of this.rolls) {
      if (roll.t < span.from - pad || roll.t > span.to + pad) continue;
      const x = xOf(roll.t);
      if (x < -12 || x > rect.width + 12) continue;
      const i = this.marks.length;
      this.marks.push({ x, y, roll });
      const hot = i === this.hover;
      // a faint vertical guide through the splice
      ctx.beginPath();
      ctx.setLineDash([2, 3]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = hot ? ROLL_COLOR : `${ROLL_COLOR}59`;
      ctx.moveTo(Math.round(x) + 0.5, rect.top);
      ctx.lineTo(Math.round(x) + 0.5, y - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      // the badge: a circle with the splice arrows
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = ROLL_COLOR;
      ctx.fill();
      ctx.lineWidth = hot ? 2 : 1;
      ctx.strokeStyle = hot ? theme.text : theme.bg;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 9px ${engine.opts.fontFamily}`;
      ctx.fillText("⇄", x, y + 0.5);
    }

    if (this.hover !== null && this.marks[this.hover]) this.drawTooltip(ctx, engine, this.marks[this.hover], rect.width, rect.top);
    ctx.restore();
  }

  private drawTooltip(ctx: CanvasRenderingContext2D, engine: ChartEngine, m: { x: number; y: number; roll: Roll }, plotW: number, plotTop: number) {
    const theme = engine.getTheme();
    const ff = engine.opts.fontFamily;
    const title = `${m.roll.from} → ${m.roll.to}`;
    const sub = `${this.label} · ${m.roll.expiry}`;
    ctx.font = `600 11px ${ff}`;
    const w = Math.min(Math.max(ctx.measureText(title).width, ctx.measureText(sub).width) + 20, plotW - 12);
    const h = 40;
    let x0 = Math.max(6, Math.min(m.x - w / 2, plotW - w - 6));
    let y0 = m.y - 14 - h;
    if (y0 < plotTop + 4) y0 = plotTop + 4;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.35)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    rrect(ctx, x0, y0, w, h, 6);
    ctx.fillStyle = theme.labelBg;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1;
    ctx.strokeStyle = theme.axisBorder;
    ctx.beginPath();
    rrect(ctx, x0, y0, w, h, 6);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillStyle = theme.labelText;
    ctx.font = `600 11px ${ff}`;
    ctx.fillText(title, x0 + 10, y0 + 13);
    ctx.fillStyle = theme.textMuted;
    ctx.font = `500 10px ${ff}`;
    ctx.fillText(sub, x0 + 10, y0 + 28);
    ctx.textAlign = "center";
  }
}

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}