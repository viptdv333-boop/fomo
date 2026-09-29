import {
  type Candle,
  type EngineOptions,
  type LegendItem,
  type OverlayLayer,
  type PointerInfo,
  type PointerRegion,
  type Series,
  type SeriesContext,
  DEFAULT_OPTIONS,
} from "./types";
import {
  formatCrosshairTime,
  formatPrice,
  formatTickLabel,
  formatVolume,
  inferPrecision,
  niceTicks,
  tickWeight,
  toHeikinAshi,
} from "./format";

/* ─────────────────────────────────────────────────────────────────────────────
   Own canvas chart engine. No third-party chart code.
   Coordinates are CSS pixels; the context is scaled by devicePixelRatio and
   candle geometry is snapped to whole device pixels so bodies and wicks stay crisp.
   ───────────────────────────────────────────────────────────────────────────── */

interface Pane {
  id: string;
  /** Share of the plot height; the main pane takes what is left. */
  ratio: number;
  series: Series[];
  min: number;
  max: number;
  tMin: number;
  tMax: number;
  manual: boolean;
  top: number;
  height: number;
  ready: boolean;
}

type Region = "plot" | "priceAxis" | "timeAxis" | "separator" | "none";

const MIN_BS = 0.5;
const MAX_BS = 90;
const DEFAULT_BS = 8;
const RIGHT_MARGIN_BARS = 8;
const TIME_AXIS_H = 26;
const MAX_SUB_RATIO = 0.6;

export class ChartEngine {
  private container: HTMLElement;
  private wrap: HTMLDivElement;
  private base: HTMLCanvasElement;
  private over: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private octx: CanvasRenderingContext2D;
  private ro: ResizeObserver;

  private W = 0;
  private H = 0;
  private dpr = 1;
  private axisW = 64;

  opts: EngineOptions;
  private candles: Candle[] = [];
  private display: Candle[] = [];
  private precision = 2;

  private barSpacing = DEFAULT_BS;
  private targetSpacing = DEFAULT_BS;
  /** Logical index at the right edge of the plot (float). */
  private r = 0;
  private zoomAnchor: { index: number; x: number } | null = null;
  private inertiaV = 0;

  private panes: Pane[] = [];
  private hover: { x: number; y: number; index: number; pane: Pane | null } | null = null;

  private raf = 0;
  private lastFrame = 0;
  private dirtyBase = true;
  private dirtyOver = true;
  private destroyed = false;

  private lastRequestedLen = -1;
  hasMoreHistory = true;
  onNeedHistory: (() => void) | null = null;
  onAutoScaleChange: ((auto: boolean) => void) | null = null;
  onViewChange: (() => void) | null = null;

  // pointer state
  private layers: OverlayLayer[] = [];
  private layerCapture: OverlayLayer | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: {
    kind: "pan" | "priceAxis" | "timeAxis" | "separator";
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    pane: Pane | null;
    moved: boolean;
    samples: { t: number; x: number }[];
    paneAbove?: Pane;
  } | null = null;
  private pinch: { dist: number; spacing: number; index: number } | null = null;
  private longPress: ReturnType<typeof setTimeout> | null = null;
  private touchCrosshair = false;

  constructor(container: HTMLElement, opts: Partial<EngineOptions> = {}) {
    this.container = container;
    this.opts = { ...DEFAULT_OPTIONS, ...opts };
    // Canvases live in our own wrapper so the host's positioning is never touched.
    container.style.touchAction = "none";
    container.style.userSelect = "none";
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden";
    container.appendChild(wrap);
    this.wrap = wrap;

    this.base = document.createElement("canvas");
    this.over = document.createElement("canvas");
    for (const c of [this.base, this.over]) {
      c.style.position = "absolute";
      c.style.left = "0";
      c.style.top = "0";
      c.style.width = "100%";
      c.style.height = "100%";
      wrap.appendChild(c);
    }
    this.over.style.touchAction = "none";
    this.bctx = this.base.getContext("2d")!;
    this.octx = this.over.getContext("2d")!;

    this.panes.push({
      id: "main",
      ratio: 1,
      series: [],
      min: 0,
      max: 1,
      tMin: 0,
      tMax: 1,
      manual: false,
      top: 0,
      height: 0,
      ready: false,
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.bindEvents();
    this.resize();
  }

  /* ───────────── public API ───────────── */

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.longPress) clearTimeout(this.longPress);
    this.over.removeEventListener("pointerdown", this.onPointerDown);
    this.over.removeEventListener("pointermove", this.onPointerMove);
    this.over.removeEventListener("pointerup", this.onPointerUp);
    this.over.removeEventListener("pointercancel", this.onPointerUp);
    this.over.removeEventListener("pointerleave", this.onPointerLeave);
    this.over.removeEventListener("wheel", this.onWheel);
    this.over.removeEventListener("dblclick", this.onDblClick);
    this.wrap.remove();
  }

  setOptions(patch: Partial<EngineOptions>) {
    const prevType = this.opts.chartType;
    const prevAuto = this.opts.autoScale;
    Object.assign(this.opts, patch);
    if (patch.chartType && patch.chartType !== prevType) this.rebuildDisplay();
    if (patch.autoScale !== undefined && patch.autoScale !== prevAuto && patch.autoScale) {
      for (const p of this.panes) p.manual = false;
    }
    if (patch.pricePrecision !== undefined) this.precision = patch.pricePrecision;
    this.invalidate();
  }

  getCandles(): Candle[] {
    return this.candles;
  }

  setData(candles: Candle[]) {
    this.candles = candles;
    this.precision = this.opts.pricePrecision ?? inferPrecision(candles);
    this.rebuildDisplay();
    this.hasMoreHistory = true;
    this.lastRequestedLen = -1;
    this.barSpacing = this.targetSpacing = this.opts.chartType === "line" ? 4 : DEFAULT_BS;
    this.zoomAnchor = null;
    this.r = candles.length - 1 + RIGHT_MARGIN_BARS;
    for (const p of this.panes) {
      p.ready = false;
      p.manual = false;
    }
    this.opts.autoScale = true;
    this.onAutoScaleChange?.(true);
    this.invalidate();
  }

  /** Older bars, ascending, all earlier than the current first bar. The view does not move. */
  prependCandles(older: Candle[]) {
    if (older.length === 0) {
      this.hasMoreHistory = false;
      return;
    }
    const first = this.candles[0]?.t ?? Infinity;
    const fresh = older.filter((c) => c.t < first);
    if (fresh.length === 0) {
      this.hasMoreHistory = false;
      return;
    }
    this.candles = fresh.concat(this.candles);
    this.r += fresh.length;
    this.rebuildDisplay();
    this.invalidate();
  }

  /** Replace the last bar or append a newer one. */
  upsertCandle(c: Candle) {
    const n = this.candles.length;
    if (n === 0) return;
    const last = this.candles[n - 1];
    const atLatest = this.r >= n - 1 - 0.5 && this.r <= n - 1 + this.plotW() / this.barSpacing;
    if (c.t === last.t) {
      this.candles[n - 1] = c;
    } else if (c.t > last.t) {
      this.candles.push(c);
      if (atLatest) this.r += 1;
    } else {
      return;
    }
    this.rebuildDisplay();
    this.invalidate();
  }

  resetView() {
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.targetSpacing = this.barSpacing = DEFAULT_BS;
    this.r = this.candles.length - 1 + RIGHT_MARGIN_BARS;
    this.setAutoScale(true);
    this.invalidate();
  }

  scrollToLatest() {
    this.zoomAnchor = null;
    this.r = this.candles.length - 1 + RIGHT_MARGIN_BARS;
    this.invalidate();
  }

  setAutoScale(auto: boolean) {
    this.opts.autoScale = auto;
    if (auto) for (const p of this.panes) p.manual = false;
    this.onAutoScaleChange?.(auto);
    this.invalidate();
  }

  addSeries(series: Series, paneId = "main") {
    const pane = this.panes.find((p) => p.id === paneId);
    if (!pane) return;
    pane.series = pane.series.filter((s) => s.id !== series.id);
    pane.series.push(series);
    this.invalidate();
  }

  removeSeries(id: string) {
    for (const p of this.panes) p.series = p.series.filter((s) => s.id !== id);
    this.invalidate();
  }

  addPane(id: string, ratio = 0.2) {
    if (this.panes.some((p) => p.id === id)) return;
    this.panes.push({ id, ratio, series: [], min: 0, max: 1, tMin: 0, tMax: 1, manual: false, top: 0, height: 0, ready: false });
    this.invalidate();
  }

  removePane(id: string) {
    if (id === "main") return;
    this.panes = this.panes.filter((p) => p.id !== id);
    this.invalidate();
  }

  hasPane(id: string) {
    return this.panes.some((p) => p.id === id);
  }

  /** PNG of the chart as currently shown. */
  screenshot(): string {
    const out = document.createElement("canvas");
    out.width = this.base.width;
    out.height = this.base.height;
    const c = out.getContext("2d")!;
    c.drawImage(this.base, 0, 0);
    c.drawImage(this.over, 0, 0);
    return out.toDataURL("image/png");
  }

  /* coordinate helpers for drawings and other overlays */
  indexToX(i: number) {
    return this.plotW() - (this.r - i) * this.barSpacing;
  }
  xToIndex(x: number) {
    return this.r - (this.plotW() - x) / this.barSpacing;
  }
  timeToX(t: number) {
    return this.indexToX(this.timeToIndex(t));
  }
  xToTime(x: number) {
    return this.indexToTime(this.xToIndex(x));
  }
  priceToY(paneId: string, price: number) {
    const p = this.panes.find((q) => q.id === paneId);
    return p ? p.top + this.paneY(p, price) : NaN;
  }
  yToPrice(paneId: string, y: number) {
    const p = this.panes.find((q) => q.id === paneId);
    return p ? this.paneP(p, y - p.top) : NaN;
  }

  /* overlay layers (drawing tools and similar) */
  addLayer(layer: OverlayLayer) {
    if (!this.layers.includes(layer)) this.layers.push(layer);
    this.invalidateOver();
  }
  removeLayer(layer: OverlayLayer) {
    this.layers = this.layers.filter((l) => l !== layer);
    if (this.layerCapture === layer) this.layerCapture = null;
    this.invalidateOver();
  }
  requestOverlayRedraw() {
    this.invalidateOver();
  }
  requestRedraw() {
    this.invalidate();
  }

  /* read-only view state for layers and toolbars */
  getPaneIds(): string[] {
    return this.panes.map((p) => p.id);
  }
  getPaneRect(id: string): { top: number; height: number; width: number } | null {
    const p = this.panes.find((q) => q.id === id);
    return p ? { top: p.top, height: p.height, width: this.plotW() } : null;
  }
  getPaneAtY(y: number): string | null {
    for (const p of this.panes) if (y >= p.top && y <= p.top + p.height) return p.id;
    return null;
  }
  getPlotSize(): { width: number; height: number } {
    return { width: this.plotW(), height: this.plotH() };
  }
  getBarSpacing(): number {
    return this.barSpacing;
  }
  getVisibleRange(): { from: number; to: number } {
    return this.visibleRange();
  }
  getPrecision(): number {
    return this.precision;
  }
  getTheme() {
    return this.opts.theme;
  }
  getIntervalMs(): number {
    return this.opts.intervalMs;
  }
  /** Bar index (fractional between bars) at a time; extrapolates before the first and after the last bar. */
  getIndexForTime(t: number): number {
    return this.timeToIndex(t);
  }
  getTimeForIndex(i: number): number {
    return this.indexToTime(i);
  }

  /* ───────────── internals: layout & data ───────────── */

  private plotW() {
    return Math.max(10, this.W - this.axisW);
  }
  private plotH() {
    return Math.max(10, this.H - TIME_AXIS_H);
  }

  private rebuildDisplay() {
    this.display = this.opts.chartType === "heikin" ? toHeikinAshi(this.candles) : this.candles;
  }

  private timeToIndex(t: number): number {
    const c = this.candles;
    const n = c.length;
    if (n === 0) return 0;
    if (t <= c[0].t) return 0 - (c[0].t - t) / this.opts.intervalMs;
    if (t >= c[n - 1].t) return n - 1 + (t - c[n - 1].t) / this.opts.intervalMs;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (c[mid].t <= t) lo = mid;
      else hi = mid;
    }
    return lo + (t - c[lo].t) / Math.max(1, c[hi].t - c[lo].t);
  }

  private indexToTime(i: number): number {
    const c = this.candles;
    const n = c.length;
    if (n === 0) return 0;
    if (i <= 0) return c[0].t + i * this.opts.intervalMs;
    if (i >= n - 1) return c[n - 1].t + (i - (n - 1)) * this.opts.intervalMs;
    const lo = Math.floor(i);
    return c[lo].t + (i - lo) * (c[lo + 1].t - c[lo].t);
  }

  private clampView() {
    const n = this.candles.length;
    const bars = this.plotW() / this.barSpacing;
    const rMax = n - 1 + bars * 0.5;
    const rMin = Math.min(3, Math.max(0, n - 1));
    if (this.r > rMax) this.r = rMax;
    if (this.r < rMin) this.r = rMin;
  }

  private visibleRange(): { from: number; to: number } {
    const n = this.candles.length;
    if (n === 0) return { from: 0, to: -1 };
    const bars = this.plotW() / this.barSpacing;
    const from = Math.max(0, Math.floor(this.r - bars) - 1);
    const to = Math.min(n - 1, Math.ceil(this.r) + 1);
    return { from, to };
  }

  private paneY(p: Pane, price: number): number {
    if (this.opts.logScale && p.id === "main" && p.min > 0) {
      const a = Math.log(p.min);
      const b = Math.log(p.max);
      const v = Math.log(Math.max(price, 1e-12));
      return ((b - v) / (b - a || 1)) * p.height;
    }
    return ((p.max - price) / (p.max - p.min || 1)) * p.height;
  }

  private paneP(p: Pane, y: number): number {
    const f = y / (p.height || 1);
    if (this.opts.logScale && p.id === "main" && p.min > 0) {
      const a = Math.log(p.min);
      const b = Math.log(p.max);
      return Math.exp(b - f * (b - a));
    }
    return p.max - f * (p.max - p.min);
  }

  private layoutPanes() {
    const plotH = this.plotH();
    const subs = this.panes.slice(1);
    let subSum = subs.reduce((s, p) => s + p.ratio, 0);
    const scale = subSum > MAX_SUB_RATIO ? MAX_SUB_RATIO / subSum : 1;
    subSum = Math.min(subSum, MAX_SUB_RATIO);
    const mainH = plotH * (1 - subSum);
    let top = 0;
    this.panes[0].top = 0;
    this.panes[0].height = mainH;
    top = mainH;
    for (const p of subs) {
      p.top = top;
      p.height = plotH * p.ratio * scale;
      top += p.height;
    }
  }

  private updateAutoScale(dt: number, immediate: boolean): boolean {
    const { from, to } = this.visibleRange();
    let animating = false;
    for (const p of this.panes) {
      if (p.manual || to < from) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of p.series) {
        const rg = s.range?.(this.candles, from, to);
        if (rg) {
          lo = Math.min(lo, rg[0]);
          hi = Math.max(hi, rg[1]);
        }
      }
      if (p.id === "main") {
        for (let i = from; i <= to; i++) {
          const c = this.display[i];
          if (!c) continue;
          if (this.opts.chartType === "line" || this.opts.chartType === "area") {
            lo = Math.min(lo, c.c);
            hi = Math.max(hi, c.c);
          } else {
            lo = Math.min(lo, c.l);
            hi = Math.max(hi, c.h);
          }
        }
      }
      if (!isFinite(lo) || !isFinite(hi)) continue;
      if (hi - lo < 1e-9) {
        const d = Math.abs(hi) * 0.01 || 1;
        lo -= d;
        hi += d;
      }
      const topPad = 0.08;
      const botPad = 0.08 + (p.id === "main" && this.opts.showVolume ? 0.14 : 0);
      if (this.opts.logScale && p.id === "main" && lo > 0) {
        const a = Math.log(lo);
        const b = Math.log(hi);
        const r = b - a;
        lo = Math.exp(a - r * botPad);
        hi = Math.exp(b + r * topPad);
      } else {
        const r = hi - lo;
        lo -= r * botPad;
        hi += r * topPad;
      }
      p.tMin = lo;
      p.tMax = hi;
      if (!p.ready || immediate) {
        p.min = lo;
        p.max = hi;
        p.ready = true;
      } else {
        const k = 1 - Math.exp(-dt / 60);
        const range = p.tMax - p.tMin;
        p.min += (p.tMin - p.min) * k;
        p.max += (p.tMax - p.max) * k;
        if (Math.abs(p.tMin - p.min) > range * 1e-4 || Math.abs(p.tMax - p.max) > range * 1e-4) animating = true;
        else {
          p.min = p.tMin;
          p.max = p.tMax;
        }
      }
    }
    return animating;
  }

  /* ───────────── render loop ───────────── */

  private invalidate() {
    this.dirtyBase = true;
    this.dirtyOver = true;
    this.schedule();
  }

  private invalidateOver() {
    this.dirtyOver = true;
    this.schedule();
  }

  private schedule() {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame((now) => {
      this.raf = 0;
      this.frame(now);
    });
  }

  private resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(1, Math.floor(rect.width));
    const H = Math.max(1, Math.floor(rect.height));
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W;
    this.H = H;
    this.dpr = dpr;
    for (const c of [this.base, this.over]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    this.bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.invalidate();
  }

  private frame(now: number) {
    if (this.destroyed) return;
    const dt = this.lastFrame ? Math.min(64, now - this.lastFrame) : 16;
    this.lastFrame = now;
    let more = false;

    // smooth zoom
    if (Math.abs(this.targetSpacing - this.barSpacing) > 0.005) {
      const k = 1 - Math.exp(-dt / 55);
      this.barSpacing += (this.targetSpacing - this.barSpacing) * k;
      if (Math.abs(this.targetSpacing - this.barSpacing) < 0.005) this.barSpacing = this.targetSpacing;
      if (this.zoomAnchor) this.r = this.zoomAnchor.index + (this.plotW() - this.zoomAnchor.x) / this.barSpacing;
      this.dirtyBase = this.dirtyOver = true;
      more = true;
    } else if (this.barSpacing !== this.targetSpacing) {
      this.barSpacing = this.targetSpacing;
    }

    // inertia after a fling
    if (Math.abs(this.inertiaV) > 0.008 && !this.drag) {
      this.r -= (this.inertiaV * dt) / this.barSpacing;
      this.inertiaV *= Math.exp(-dt / 320);
      this.dirtyBase = this.dirtyOver = true;
      more = true;
    } else if (!this.drag) {
      this.inertiaV = 0;
    }

    this.clampView();
    this.layoutPanes();

    const immediate = !!this.drag && this.drag.kind === "pan";
    if (this.dirtyBase || more) {
      if (this.updateAutoScale(dt, immediate)) more = true;
      this.drawBase();
      this.dirtyBase = false;
      this.dirtyOver = true;
      this.notifyView();
    }
    if (this.dirtyOver) {
      this.drawOver();
      this.dirtyOver = false;
    }
    if (more) this.schedule();
  }

  private notifyView() {
    this.onViewChange?.();
    const { from } = this.visibleRange();
    const n = this.candles.length;
    if (n > 0 && from < 40 && this.hasMoreHistory && this.lastRequestedLen !== n && this.onNeedHistory) {
      this.lastRequestedLen = n;
      this.onNeedHistory();
    }
  }

  /* ───────────── drawing: base layer ───────────── */

  private seriesContext(pane: Pane, from: number, to: number): SeriesContext {
    return {
      ctx: this.bctx,
      dpr: this.dpr,
      candles: this.display,
      from,
      to,
      x: (i) => this.indexToX(i),
      y: (price) => this.paneY(pane, price),
      barSpacing: this.barSpacing,
      paneWidth: this.plotW(),
      paneHeight: pane.height,
      theme: this.opts.theme,
      options: this.opts,
    };
  }

  private drawBase() {
    const ctx = this.bctx;
    const th = this.opts.theme;
    const W = this.W;
    const H = this.H;
    const plotW = this.plotW();
    const plotH = this.plotH();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    const n = this.candles.length;
    if (n === 0) {
      ctx.fillStyle = th.textMuted;
      ctx.font = `13px ${this.opts.fontFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("…", plotW / 2, plotH / 2);
      return;
    }
    const { from, to } = this.visibleRange();
    const main = this.panes[0];

    // watermark
    if (this.opts.showWatermark && this.opts.symbolLabel) {
      ctx.save();
      ctx.fillStyle = th.watermark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const size = Math.max(28, Math.min(84, plotW / 9));
      ctx.font = `700 ${size}px ${this.opts.fontFamily}`;
      ctx.fillText(this.opts.symbolLabel, plotW / 2, main.height / 2 - size * 0.2);
      ctx.font = `600 ${size * 0.34}px ${this.opts.fontFamily}`;
      ctx.fillText(this.opts.intervalLabel, plotW / 2, main.height / 2 + size * 0.45);
      ctx.restore();
    }

    // time ticks (shared by every pane)
    const timeTicks = this.computeTimeTicks(from, to);

    // vertical grid
    if (this.opts.showGrid) {
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const tk of timeTicks) {
        const x = this.snap(tk.x);
        ctx.moveTo(x, 0);
        ctx.lineTo(x, plotH);
      }
      ctx.stroke();
    }

    let maxLabelW = 0;
    ctx.font = `11px ${this.opts.fontFamily}`;
    for (const pane of this.panes) {
      const sc = this.seriesContext(pane, from, to);
      // horizontal grid + price labels are collected here and drawn on the axis afterwards
      const ticks = this.priceTicks(pane);
      if (this.opts.showGrid) {
        ctx.strokeStyle = th.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const v of ticks) {
          const y = pane.top + this.snap(this.paneY(pane, v));
          ctx.moveTo(0, y);
          ctx.lineTo(plotW, y);
        }
        ctx.stroke();
      }

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, plotW, pane.height);
      ctx.clip();
      ctx.translate(0, pane.top);
      if (pane.id === "main") {
        if (this.opts.showVolume) this.drawVolume(sc);
        this.drawPriceSeries(sc);
      }
      for (const s of pane.series) s.draw(sc);
      ctx.restore();

      // labels
      ctx.fillStyle = th.textMuted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const prec = pane.id === "main" ? this.precision : this.paneTickPrecision(pane);
      for (const v of ticks) {
        const y = pane.top + this.paneY(pane, v);
        if (y < pane.top + 6 || y > pane.top + pane.height - 6) continue;
        const text = formatPrice(v, prec, this.opts.locale);
        maxLabelW = Math.max(maxLabelW, ctx.measureText(text).width);
        ctx.fillText(text, plotW + 8, y);
      }

      // pane border
      ctx.strokeStyle = th.paneBorder;
      ctx.beginPath();
      const by = this.snap(pane.top + pane.height);
      ctx.moveTo(0, by);
      ctx.lineTo(W, by);
      ctx.stroke();
    }

    // axis borders
    ctx.strokeStyle = th.axisBorder;
    ctx.beginPath();
    const ax = this.snap(plotW);
    ctx.moveTo(ax, 0);
    ctx.lineTo(ax, plotH);
    ctx.stroke();

    // time labels
    ctx.fillStyle = th.textMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `11px ${this.opts.fontFamily}`;
    for (const tk of timeTicks) {
      ctx.font = `${tk.weight >= 50 ? "600" : "400"} 11px ${this.opts.fontFamily}`;
      ctx.fillText(tk.label, tk.x, plotH + TIME_AXIS_H / 2);
    }

    this.drawLastPrice();
    this.drawSeriesAxisLabels(ctx);

    // keep the axis wide enough for the widest label
    const need = Math.max(52, Math.ceil(maxLabelW + 18));
    if (Math.abs(need - this.axisW) > 6) {
      this.axisW = need;
      this.dirtyBase = true;
      this.schedule();
    }
  }

  private paneTickPrecision(pane: Pane): number {
    const range = pane.max - pane.min;
    if (range >= 100) return 0;
    if (range >= 10) return 1;
    return 2;
  }

  private priceTicks(pane: Pane): number[] {
    const target = Math.max(2, Math.floor(pane.height / 48));
    return niceTicks(pane.min, pane.max, target);
  }

  private computeTimeTicks(from: number, to: number) {
    const out: { x: number; weight: number; label: string }[] = [];
    if (to < from) return out;
    const c = this.candles;
    const cand: { i: number; w: number }[] = [];
    // weight of a bar is measured against its predecessor, so start one bar earlier
    for (let i = Math.max(0, from); i <= to; i++) {
      const w = tickWeight(c[i].t, i > 0 ? c[i - 1].t : null, this.opts.timeShiftMs);
      cand.push({ i, w });
    }
    // future bars past the last one (empty right margin) are labelled by extrapolated time
    const plotW = this.plotW();
    const lastVisibleIndex = Math.floor(this.xToIndex(plotW));
    for (let i = to + 1; i <= lastVisibleIndex; i++) {
      const t = this.indexToTime(i);
      const pt = this.indexToTime(i - 1);
      cand.push({ i, w: tickWeight(t, pt, this.opts.timeShiftMs) });
    }
    const minGap = 78;
    cand.sort((a, b) => b.w - a.w || a.i - b.i);
    const placed: number[] = [];
    for (const k of cand) {
      const x = this.indexToX(k.i);
      if (x < 20 || x > plotW - 14) continue;
      if (placed.every((px) => Math.abs(px - x) >= minGap)) {
        placed.push(x);
        const t = this.indexToTime(k.i);
        out.push({ x, weight: k.w, label: formatTickLabel(t, k.w, this.opts.timeShiftMs, this.opts.locale) });
      }
    }
    out.sort((a, b) => a.x - b.x);
    return out;
  }

  private snap(v: number): number {
    const d = this.dpr;
    return Math.round(v * d) / d + 0.5 / d;
  }

  private drawVolume(sc: SeriesContext) {
    const { ctx, from, to, dpr } = sc;
    const th = this.opts.theme;
    const c = this.candles;
    let maxV = 0;
    for (let i = from; i <= to; i++) maxV = Math.max(maxV, c[i].v);
    if (maxV <= 0) return;
    const band = sc.paneHeight * 0.2;
    const bwD = this.bodyWidthDevice();
    for (const up of [true, false]) {
      ctx.fillStyle = up ? th.volUp : th.volDown;
      for (let i = from; i <= to; i++) {
        const b = c[i];
        if ((b.c >= b.o) !== up) continue;
        const h = Math.max(1, Math.round((b.v / maxV) * band * dpr));
        const cx = Math.round(sc.x(i) * dpr);
        const left = cx - (bwD - 1) / 2;
        ctx.fillRect(left / dpr, (Math.round(sc.paneHeight * dpr) - h) / dpr, bwD / dpr, h / dpr);
      }
    }
  }

  private bodyWidthDevice(): number {
    let bw = Math.max(1, Math.floor(this.barSpacing * this.dpr * 0.72));
    if (bw % 2 === 0) bw = Math.max(1, bw - 1);
    return bw;
  }

  private drawPriceSeries(sc: SeriesContext) {
    const { ctx, from, to, dpr, x, y } = sc;
    const d = this.display;
    const th = this.opts.theme;
    const type = this.opts.chartType;

    if (type === "line" || type === "area") {
      ctx.beginPath();
      let started = false;
      for (let i = from; i <= to; i++) {
        const px = x(i);
        const py = y(d[i].c);
        if (!started) {
          ctx.moveTo(px, py);
          started = true;
        } else ctx.lineTo(px, py);
      }
      if (type === "area" && started) {
        const g = ctx.createLinearGradient(0, 0, 0, sc.paneHeight);
        g.addColorStop(0, th.areaTop);
        g.addColorStop(1, th.areaBottom);
        ctx.save();
        ctx.lineTo(x(to), sc.paneHeight);
        ctx.lineTo(x(from), sc.paneHeight);
        ctx.closePath();
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
        // stroke again on top (path was closed above)
        ctx.beginPath();
        started = false;
        for (let i = from; i <= to; i++) {
          if (!started) {
            ctx.moveTo(x(i), y(d[i].c));
            started = true;
          } else ctx.lineTo(x(i), y(d[i].c));
        }
      }
      ctx.strokeStyle = th.line;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      ctx.stroke();
      return;
    }

    const bwD = this.bodyWidthDevice();
    const thin = bwD <= 2;
    const D = (v: number) => Math.round(v * dpr);
    for (const up of [true, false]) {
      ctx.fillStyle = up ? th.up : th.down;
      for (let i = from; i <= to; i++) {
        const c = d[i];
        if ((c.c >= c.o) !== up) continue;
        const cx = D(x(i));
        const yh = D(y(c.h));
        const yl = D(y(c.l));
        const yo = D(y(c.o));
        const yc = D(y(c.c));
        if (type === "bars") {
          ctx.fillRect(cx / dpr, yh / dpr, 1 / dpr, Math.max(1, yl - yh) / dpr);
          const tick = Math.max(1, Math.floor(this.barSpacing * dpr * 0.36));
          ctx.fillRect((cx - tick) / dpr, yo / dpr, tick / dpr, 1 / dpr);
          ctx.fillRect((cx + 1) / dpr, yc / dpr, tick / dpr, 1 / dpr);
          continue;
        }
        ctx.fillRect(cx / dpr, yh / dpr, 1 / dpr, Math.max(1, yl - yh) / dpr);
        if (thin) continue;
        const top = Math.min(yo, yc);
        const h = Math.max(1, Math.abs(yc - yo));
        const left = cx - (bwD - 1) / 2;
        if (type === "hollow" && up && bwD > 2) {
          ctx.fillRect(left / dpr, top / dpr, bwD / dpr, h / dpr);
          if (h > 2) {
            ctx.fillStyle = th.bg;
            ctx.fillRect((left + 1) / dpr, (top + 1) / dpr, (bwD - 2) / dpr, (h - 2) / dpr);
            ctx.fillStyle = th.up;
          }
        } else {
          ctx.fillRect(left / dpr, top / dpr, bwD / dpr, h / dpr);
        }
      }
    }
  }

  private drawLastPrice() {
    const n = this.display.length;
    if (n === 0) return;
    const main = this.panes[0];
    const ctx = this.bctx;
    const th = this.opts.theme;
    const last = this.candles[n - 1];
    const prev = n > 1 ? this.candles[n - 2] : last;
    const up = last.c >= prev.c;
    const y = this.paneY(main, this.display[n - 1].c);
    if (y < 0 || y > main.height) return;
    const color = up ? th.up : th.down;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    const yy = this.snap(y);
    ctx.moveTo(0, yy);
    ctx.lineTo(this.plotW(), yy);
    ctx.stroke();
    ctx.restore();
    this.axisLabel(ctx, formatPrice(this.display[n - 1].c, this.precision, this.opts.locale), y, color, "#fff");
  }

  private drawSeriesAxisLabels(ctx: CanvasRenderingContext2D) {
    const n = this.candles.length;
    if (n === 0) return;
    for (const pane of this.panes) {
      const seen: number[] = [];
      for (const s of pane.series) {
        const labels = s.axisLabels?.(this.candles, n - 1);
        if (!labels) continue;
        for (const l of labels) {
          if (!isFinite(l.price)) continue;
          let y = pane.top + this.paneY(pane, l.price);
          if (y < pane.top || y > pane.top + pane.height) continue;
          // nudge a label down when it would sit on top of one already placed
          for (let guard = 0; guard < 6 && seen.some((sy) => Math.abs(sy - y) < 17); guard++) y += 18;
          seen.push(y);
          this.axisLabel(ctx, l.text, y, l.color, l.textColor ?? "#fff", pane);
        }
      }
    }
  }

  private axisLabel(ctx: CanvasRenderingContext2D, text: string, y: number, bg: string, fg: string, pane?: Pane) {
    ctx.save();
    ctx.font = `600 11px ${this.opts.fontFamily}`;
    const h = 18;
    const lo = pane ? pane.top : 0;
    const hi = pane ? pane.top + pane.height : this.plotH();
    const top = Math.max(lo, Math.min(hi - h, y - h / 2));
    ctx.fillStyle = bg;
    ctx.fillRect(this.plotW(), top, this.axisW, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, this.plotW() + 8, top + h / 2 + 0.5);
    ctx.restore();
  }

  /* ───────────── drawing: overlay layer (crosshair + legend) ───────────── */

  private drawOver() {
    const ctx = this.octx;
    const th = this.opts.theme;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const n = this.candles.length;
    if (n === 0) return;
    const plotW = this.plotW();
    const plotH = this.plotH();

    const hv = this.hover;
    let index = n - 1;
    if (hv) index = Math.max(0, Math.min(n - 1, hv.index));

    // layers (drawings) sit under the legends and the crosshair
    if (this.layers.length) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, plotW, plotH);
      ctx.clip();
      for (const l of this.layers) l.draw?.(ctx, this);
      ctx.restore();
    }

    // legends
    for (const pane of this.panes) this.drawLegend(ctx, pane, index, pane.id === "main" && !hv);

    if (!hv || hv.x < 0 || hv.x > plotW || hv.y < 0 || hv.y > plotH) return;

    const cx = this.snap(this.indexToX(hv.index));
    ctx.save();
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, plotH);
    const cy = this.snap(hv.y);
    ctx.moveTo(0, cy);
    ctx.lineTo(plotW, cy);
    ctx.stroke();
    ctx.restore();

    // price label
    if (hv.pane) {
      const price = this.paneP(hv.pane, hv.y - hv.pane.top);
      const prec = hv.pane.id === "main" ? this.precision : this.paneTickPrecision(hv.pane);
      this.axisLabel(ctx, formatPrice(price, prec, this.opts.locale), hv.y, th.labelBg, th.labelText);
    }

    // time label
    const t = this.indexToTime(hv.index);
    const intraday = this.opts.intervalMs < 86_400_000;
    const text = formatCrosshairTime(t, this.opts.timeShiftMs, this.opts.locale, intraday);
    ctx.save();
    ctx.font = `600 11px ${this.opts.fontFamily}`;
    const w = ctx.measureText(text).width + 16;
    const x = Math.max(0, Math.min(plotW - w, cx - w / 2));
    ctx.fillStyle = th.labelBg;
    ctx.fillRect(x, plotH, w, TIME_AXIS_H - 4);
    ctx.fillStyle = th.labelText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, plotH + (TIME_AXIS_H - 4) / 2 + 0.5);
    ctx.restore();
  }

  private drawLegend(ctx: CanvasRenderingContext2D, pane: Pane, index: number, isLast: boolean) {
    const th = this.opts.theme;
    const c = this.candles[index];
    if (!c) return;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let x = 10;
    const y = pane.top + 8;
    const put = (text: string, color: string, weight = 400, size = 12) => {
      ctx.font = `${weight} ${size}px ${this.opts.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(text, x, y + (size === 12 ? 0 : 0));
      x += ctx.measureText(text).width + 8;
    };
    let line2Y = y + 18;
    if (pane.id === "main") {
      put(`${this.opts.symbolLabel}${this.opts.intervalLabel ? " · " + this.opts.intervalLabel : ""}`, th.text, 700, 13);
      const prev = index > 0 ? this.candles[index - 1] : c;
      const up = c.c >= prev.c;
      const col = up ? th.up : th.down;
      const p = (v: number) => formatPrice(v, this.precision, this.opts.locale);
      x = 10;
      ctx.font = `12px ${this.opts.fontFamily}`;
      const put2 = (label: string, val: string) => {
        ctx.font = `12px ${this.opts.fontFamily}`;
        ctx.fillStyle = th.textMuted;
        ctx.fillText(label, x, line2Y);
        x += ctx.measureText(label).width + 3;
        ctx.fillStyle = col;
        ctx.fillText(val, x, line2Y);
        x += ctx.measureText(val).width + 9;
      };
      put2("O", p(c.o));
      put2("H", p(c.h));
      put2("L", p(c.l));
      put2("C", p(c.c));
      const diff = c.c - prev.c;
      const pct = prev.c ? (diff / prev.c) * 100 : 0;
      const sign = diff >= 0 ? "+" : "";
      ctx.fillStyle = col;
      const chg = `${sign}${formatPrice(diff, this.precision, this.opts.locale)} (${sign}${pct.toFixed(2)}%)`;
      ctx.fillText(chg, x, line2Y);
      x += ctx.measureText(chg).width + 12;
      if (this.opts.showVolume) {
        ctx.fillStyle = th.textMuted;
        ctx.fillText("Vol", x, line2Y);
        x += ctx.measureText("Vol").width + 3;
        ctx.fillStyle = col;
        ctx.fillText(formatVolume(c.v, this.opts.locale), x, line2Y);
      }
      line2Y += 18;
      void isLast;
    }
    // series legends (indicators)
    let ly = pane.id === "main" ? line2Y : y;
    for (const s of pane.series) {
      const items: LegendItem[] | undefined = s.legend?.(this.candles, index);
      if (!items || items.length === 0) continue;
      let lx = 10;
      ctx.font = `12px ${this.opts.fontFamily}`;
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.fillText(it.text, lx, ly);
        lx += ctx.measureText(it.text).width + 10;
      }
      ly += 16;
    }
    ctx.restore();
  }

  /* ───────────── interaction ───────────── */

  private bindEvents() {
    this.over.addEventListener("pointerdown", this.onPointerDown);
    this.over.addEventListener("pointermove", this.onPointerMove);
    this.over.addEventListener("pointerup", this.onPointerUp);
    this.over.addEventListener("pointercancel", this.onPointerUp);
    this.over.addEventListener("pointerleave", this.onPointerLeave);
    this.over.addEventListener("wheel", this.onWheel, { passive: false });
    this.over.addEventListener("dblclick", this.onDblClick);
  }

  private local(e: PointerEvent | WheelEvent | MouseEvent) {
    const r = this.over.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private regionAt(x: number, y: number): { region: Region; pane: Pane | null } {
    const plotW = this.plotW();
    const plotH = this.plotH();
    if (y >= plotH) return { region: "timeAxis", pane: null };
    let pane: Pane | null = null;
    for (const p of this.panes) if (y >= p.top && y <= p.top + p.height) pane = p;
    if (x >= plotW) return { region: "priceAxis", pane };
    for (let i = 1; i < this.panes.length; i++) {
      if (Math.abs(y - this.panes[i].top) <= 4) return { region: "separator", pane: this.panes[i] };
    }
    return { region: "plot", pane };
  }

  private pointerInfo(e: PointerEvent, x: number, y: number): PointerInfo {
    const { region, pane } = this.regionAt(x, y);
    return {
      x,
      y,
      paneId: pane?.id ?? null,
      region: region as PointerRegion,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
      altKey: e.altKey,
      button: e.button,
      pointerType: e.pointerType,
    };
  }

  private setCursor(region: Region) {
    this.over.style.cursor =
      region === "priceAxis" || region === "separator" ? "ns-resize" : region === "timeAxis" ? "ew-resize" : this.drag?.moved ? "grabbing" : "crosshair";
  }

  private setHover(x: number, y: number, pane: Pane | null) {
    this.hover = { x, y, index: Math.round(this.xToIndex(x)), pane };
    this.invalidateOver();
  }

  private onPointerDown = (e: PointerEvent) => {
    this.over.setPointerCapture(e.pointerId);
    const { x, y } = this.local(e);
    this.pointers.set(e.pointerId, { x, y });
    this.inertiaV = 0;

    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = (a.x + b.x) / 2;
      this.pinch = { dist, spacing: this.barSpacing, index: this.xToIndex(mid) };
      this.drag = null;
      this.hover = null;
      if (this.longPress) clearTimeout(this.longPress);
      return;
    }

    // overlay layers get the first chance to take the gesture
    if (this.layers.length && e.pointerType !== "touch") {
      const info = this.pointerInfo(e, x, y);
      for (let i = this.layers.length - 1; i >= 0; i--) {
        if (this.layers[i].pointerDown?.(info)) {
          this.layerCapture = this.layers[i];
          this.drag = null;
          this.invalidateOver();
          return;
        }
      }
    }
    const { region, pane } = this.regionAt(x, y);
    const kind = region === "priceAxis" ? "priceAxis" : region === "timeAxis" ? "timeAxis" : region === "separator" ? "separator" : "pan";
    this.drag = {
      kind,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      pane,
      moved: false,
      samples: [{ t: performance.now(), x }],
    };
    if (kind === "separator") this.drag.paneAbove = this.panes[this.panes.indexOf(pane!) - 1];

    if (e.pointerType === "touch") {
      this.touchCrosshair = false;
      if (this.longPress) clearTimeout(this.longPress);
      this.longPress = setTimeout(() => {
        if (this.drag && !this.drag.moved) {
          this.touchCrosshair = true;
          this.drag = null;
          this.setHover(x, y, pane);
        }
      }, 380);
    }
  };

  private onPointerMove = (e: PointerEvent) => {
    const { x, y } = this.local(e);
    const known = this.pointers.get(e.pointerId);
    if (known) {
      known.x = x;
      known.y = y;
    }

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = (a.x + b.x) / 2;
      const bs = Math.max(MIN_BS, Math.min(MAX_BS, this.pinch.spacing * (dist / this.pinch.dist)));
      this.barSpacing = this.targetSpacing = bs;
      this.r = this.pinch.index + (this.plotW() - mid) / bs;
      this.invalidate();
      return;
    }

    if (this.touchCrosshair) {
      this.setHover(x, y, this.regionAt(x, y).pane);
      return;
    }

    if (this.layerCapture) {
      this.layerCapture.pointerMove?.(this.pointerInfo(e, x, y));
      this.hover = { x, y, index: Math.round(this.xToIndex(x)), pane: this.regionAt(x, y).pane };
      this.invalidateOver();
      return;
    }

    const d = this.drag;
    if (!d && this.layers.length && e.pointerType !== "touch") {
      const info = this.pointerInfo(e, x, y);
      let handled = false;
      let cursor: string | null = null;
      for (let i = this.layers.length - 1; i >= 0; i--) {
        if (this.layers[i].pointerMove?.(info)) handled = true;
        cursor = cursor ?? this.layers[i].cursor?.(info) ?? null;
      }
      if (cursor) this.over.style.cursor = cursor;
      if (handled) {
        this.hover = { x, y, index: Math.round(this.xToIndex(x)), pane: this.regionAt(x, y).pane };
        this.invalidateOver();
        return;
      }
    }
    if (!d) {
      const { region, pane } = this.regionAt(x, y);
      this.setCursor(region);
      if (region === "plot") this.setHover(x, y, pane);
      else if (this.hover) {
        this.hover = null;
        this.invalidateOver();
      }
      return;
    }

    const dx = x - d.lastX;
    const dy = y - d.lastY;
    if (!d.moved && Math.hypot(x - d.startX, y - d.startY) > 3) {
      d.moved = true;
      if (this.longPress) clearTimeout(this.longPress);
      this.over.style.cursor = d.kind === "pan" ? "grabbing" : this.over.style.cursor;
    }
    if (!d.moved) return;

    if (d.kind === "pan") {
      this.r -= dx / this.barSpacing;
      const pane = d.pane ?? this.panes[0];
      if (Math.abs(dy) > 0 && pane.height > 0) {
        const rangeMove = (dy / pane.height) * (pane.max - pane.min);
        if (Math.abs(y - d.startY) > 4 || pane.manual) {
          pane.min += rangeMove;
          pane.max += rangeMove;
          pane.tMin = pane.min;
          pane.tMax = pane.max;
          if (!pane.manual) {
            pane.manual = true;
            if (pane.id === "main") {
              this.opts.autoScale = false;
              this.onAutoScaleChange?.(false);
            }
          }
        }
      }
      d.samples.push({ t: performance.now(), x });
      if (d.samples.length > 6) d.samples.shift();
      this.hover = { x, y, index: Math.round(this.xToIndex(x)), pane: d.pane };
      this.invalidate();
    } else if (d.kind === "priceAxis") {
      const pane = d.pane ?? this.panes[0];
      const mid = (pane.min + pane.max) / 2;
      const half = ((pane.max - pane.min) / 2) * Math.exp(dy * 0.006);
      pane.min = mid - half;
      pane.max = mid + half;
      pane.tMin = pane.min;
      pane.tMax = pane.max;
      if (!pane.manual) {
        pane.manual = true;
        if (pane.id === "main") {
          this.opts.autoScale = false;
          this.onAutoScaleChange?.(false);
        }
      }
      this.invalidate();
    } else if (d.kind === "timeAxis") {
      const bs = Math.max(MIN_BS, Math.min(MAX_BS, this.barSpacing * Math.exp(dx * 0.006)));
      this.barSpacing = this.targetSpacing = bs;
      this.zoomAnchor = null;
      this.invalidate();
    } else if (d.kind === "separator" && d.pane) {
      const total = this.plotH();
      const ratioDelta = -dy / total;
      d.pane.ratio = Math.max(0.08, Math.min(0.5, d.pane.ratio + ratioDelta));
      this.invalidate();
    }
    d.lastX = x;
    d.lastY = y;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (this.layerCapture) {
      const { x, y } = this.local(e);
      const layer = this.layerCapture;
      this.layerCapture = null;
      this.pointers.delete(e.pointerId);
      layer.pointerUp?.(this.pointerInfo(e, x, y));
      this.invalidateOver();
      return;
    }
    this.pointers.delete(e.pointerId);
    if (this.longPress) clearTimeout(this.longPress);
    if (this.pinch && this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    if (d && d.kind === "pan" && d.moved && d.samples.length >= 2) {
      const a = d.samples[0];
      const b = d.samples[d.samples.length - 1];
      const dt = b.t - a.t;
      if (dt > 0 && performance.now() - b.t < 80) {
        const v = (b.x - a.x) / dt;
        if (Math.abs(v) > 0.05) {
          this.inertiaV = v;
          this.schedule();
        }
      }
    }
    this.drag = null;
    if (e.pointerType === "touch" && !this.touchCrosshair) {
      this.hover = null;
      this.invalidateOver();
    }
    this.touchCrosshair = this.touchCrosshair && this.pointers.size > 0;
    if (!this.touchCrosshair && e.pointerType === "touch") {
      this.hover = null;
      this.invalidateOver();
    }
  };

  private onPointerLeave = () => {
    if (this.drag || this.touchCrosshair) return;
    this.hover = null;
    this.invalidateOver();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { x, y } = this.local(e);
    const { region, pane } = this.regionAt(x, y);
    let dy = e.deltaY;
    let dx = e.deltaX;
    if (e.deltaMode === 1) {
      dy *= 16;
      dx *= 16;
    } else if (e.deltaMode === 2) {
      dy *= 400;
      dx *= 400;
    }

    if (region === "priceAxis" && pane) {
      const mid = (pane.min + pane.max) / 2;
      const half = ((pane.max - pane.min) / 2) * Math.exp(dy * 0.0012);
      pane.min = mid - half;
      pane.max = mid + half;
      pane.tMin = pane.min;
      pane.tMax = pane.max;
      pane.manual = true;
      if (pane.id === "main") {
        this.opts.autoScale = false;
        this.onAutoScaleChange?.(false);
      }
      this.invalidate();
      return;
    }

    // horizontal scroll (shift+wheel or trackpad sideways) pans
    if (e.shiftKey || (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 0)) {
      const amount = Math.abs(dx) > 0 ? dx : dy;
      this.r += amount / this.barSpacing;
      this.zoomAnchor = null;
      this.invalidate();
      return;
    }

    const coeff = e.ctrlKey ? 0.009 : 0.0016;
    const factor = Math.exp(-dy * coeff);
    const anchorX = region === "timeAxis" ? this.plotW() : Math.min(x, this.plotW());
    this.targetSpacing = Math.max(MIN_BS, Math.min(MAX_BS, this.targetSpacing * factor));
    this.zoomAnchor = { index: this.xToIndex(anchorX), x: anchorX };
    this.invalidate();
  };

  private onDblClick = (e: MouseEvent) => {
    const { x, y } = this.local(e);
    const { region } = this.regionAt(x, y);
    if (region === "priceAxis") this.setAutoScale(true);
    else if (region === "timeAxis") this.resetView();
  };
}
