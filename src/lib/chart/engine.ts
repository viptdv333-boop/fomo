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
  isTransformedType,
} from "./types";
import {
  formatCrosshairTime,
  formatPrice,
  formatTickLabel,
  formatVolume,
  inferPrecision,
  niceTicks,
  sourcePrice,
  tickWeight,
  toHeikinAshi,
  zoneOffsetMs,
} from "./format";
import { transformBars } from "./transforms";
import { withAlpha } from "./settings";
import { OrderFlowStore } from "./orderflow/store";
import { DEFAULT_FOOTPRINT } from "./orderflow/types";
import { NO_FRAME, drawFootprint, flowLabels, footprintLayout, footprintTip, footprintTotalsHeight, fmtQty, type FootprintFrame, type FootprintHost } from "./orderflow/footprint";

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
/** The footprint needs wide bars to fit the numbers. */
const MAX_BS_FOOTPRINT = 320;
const DEFAULT_BS = 8;
const RIGHT_MARGIN_BARS = 8;
const TIME_AXIS_H = 26;
const MAX_SUB_RATIO = 0.6;

/** A symbol drawn over the main one (Compare). */
interface CompareEntry {
  id: string;
  label: string;
  color: string;
  /** "percent": rebased to the main symbol at the first visible bar; "own": its own scale. */
  mode: "percent" | "own";
  visible: boolean;
  candles: Candle[];
  /** Close per logical bar of the main chart (NaN where the compared symbol has no bar). */
  aligned: number[];
  /** Multiplier that maps the compared prices into main-price units for the current view. */
  k: number;
  /** Visible value range of an own-scale symbol (set while drawing). */
  lo?: number;
  hi?: number;
}

export interface CompareInfo {
  id: string;
  label: string;
  color: string;
  mode: "percent" | "own";
  visible: boolean;
  last: number;
}

function logTicks(min: number, max: number, target: number): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const sets = [[1, 2, 5], [1, 5], [1]];
  for (const mant of sets) {
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(min)) - 1; e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of mant) {
        const v = m * Math.pow(10, e);
        if (v >= min && v <= max) out.push(v);
      }
    }
    if (out.length <= Math.max(3, target * 1.5)) return out;
  }
  return [];
}

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
  /** Logical bars: the candles, or Renko / Kagi / ... bars built from them. Every x mapping is in this index space. */
  private bars: Candle[] = [];
  private display: Candle[] = [];
  private precision = 2;
  private transformBox = 0;
  private compares: CompareEntry[] = [];
  /** Base price for percent / indexed scales: close of the first visible bar. */
  private scaleBase = 0;
  private statusBottom = 44;
  private countdownTimer: ReturnType<typeof setInterval> | null = null;

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
  /** Order flow of this chart (footprint, volume profile, CVD ...). Filled by lib/chart/orderflow/client. */
  readonly flow = new OrderFlowStore();
  private viewListeners = new Set<() => void>();
  /** Layout of the last footprint frame (cell step, level of detail), used by the crosshair tooltip. */
  private fpFrame: FootprintFrame = NO_FRAME;
  /** Right click on a price scale (client coordinates); when set the browser menu is suppressed there. */
  onPriceAxisMenu: ((info: { clientX: number; clientY: number; paneId: string }) => void) | null = null;
  /** The baseline chart's base level was dragged (percent of the pane height from the bottom). */
  onBaselineChange: ((percent: number) => void) | null = null;
  /** The crosshair moved to a chart time (null = it left the chart); used to link several charts. */
  onCrosshairMove: ((time: number | null) => void) | null = null;
  private lastCrossT: number | null = null;
  /** A crosshair time coming from another chart, drawn as a vertical line. */
  private externalT: number | null = null;

  // pointer state
  private layers: OverlayLayer[] = [];
  private layerCapture: OverlayLayer | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: {
    kind: "pan" | "priceAxis" | "timeAxis" | "separator" | "baseline";
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
    this.flow.subscribe(() => this.invalidate());
  }

  /** Called after every repaint of the base layer (pan, zoom, new data); returns an unsubscribe function. */
  addViewListener(cb: () => void): () => void {
    this.viewListeners.add(cb);
    return () => this.viewListeners.delete(cb);
  }

  /** Visible price range and height of a pane. */
  getPaneRange(id: string): { min: number; max: number; height: number } | null {
    const p = this.panes.find((q) => q.id === id);
    return p && p.ready ? { min: p.min, max: p.max, height: p.height } : null;
  }

  /** Zooms in (around the right edge) until bars are at least `bs` px apart. */
  ensureMinSpacing(bs: number) {
    if (this.targetSpacing >= bs) return;
    this.targetSpacing = Math.min(this.maxBs(), bs);
    this.zoomAnchor = { index: this.xToIndex(this.plotW()), x: this.plotW() };
    this.invalidate();
  }

  /** Footprint cell step of the last frame (0 while the chart type is not a footprint or the bars are too narrow). */
  getFootprintStep(): number {
    return this.opts.chartType === "footprint" && this.fpFrame.cells ? this.fpFrame.step : 0;
  }

  /* ───────────── public API ───────────── */

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.longPress) clearTimeout(this.longPress);
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.over.removeEventListener("contextmenu", this.onContextMenu);
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
    const prevTransform = JSON.stringify(this.opts.transform);
    const prevMode = this.opts.scaleMode;
    // the old boolean and the scale mode describe the same thing
    if (patch.logScale !== undefined && patch.scaleMode === undefined) {
      patch = { ...patch, scaleMode: patch.logScale ? "log" : this.opts.scaleMode === "log" ? "regular" : this.opts.scaleMode };
    }
    Object.assign(this.opts, patch);
    this.opts.logScale = this.opts.scaleMode === "log";
    const transformChanged = patch.transform !== undefined && JSON.stringify(patch.transform) !== prevTransform;
    if ((patch.chartType && patch.chartType !== prevType) || (transformChanged && this.transformed())) {
      const n0 = this.bars.length;
      this.rebuildDisplay();
      if (this.candles.length > 0) {
        // keep the view on the newest bars when the bar count changes with the chart type
        if (patch.chartType && patch.chartType !== prevType && (isTransformedType(patch.chartType) || isTransformedType(prevType))) {
          this.r = this.bars.length - 1 + this.margin();
          this.zoomAnchor = null;
        } else this.r += this.bars.length - n0;
      }
    }
    if (patch.autoScale !== undefined && patch.autoScale !== prevAuto && patch.autoScale) {
      for (const p of this.panes) p.manual = false;
    }
    if ("pricePrecision" in patch) this.precision = patch.pricePrecision ?? inferPrecision(this.candles);
    if (patch.scaleMode !== undefined && patch.scaleMode !== prevMode) for (const p of this.panes) p.ready = false;
    if (patch.showCountdown !== undefined) this.syncCountdown();
    this.invalidate();
  }

  private syncCountdown() {
    if (this.opts.showCountdown && !this.countdownTimer) this.countdownTimer = setInterval(() => this.invalidateOver(), 1000);
    else if (!this.opts.showCountdown && this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  private margin(): number {
    const m = this.opts.rightOffset;
    return isFinite(m) ? Math.max(0, m) : RIGHT_MARGIN_BARS;
  }

  /** Bar spacing after loading data / resetting the view. */
  private defaultSpacing(): number {
    const t = this.opts.chartType;
    return t === "line" ? 4 : t === "footprint" ? 64 : DEFAULT_BS;
  }

  /** Widest allowed bar spacing: the footprint needs room for its numbers. */
  private maxBs(): number {
    return this.opts.chartType === "footprint" ? MAX_BS_FOOTPRINT : MAX_BS;
  }

  private transformed(): boolean {
    return isTransformedType(this.opts.chartType);
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
    this.barSpacing = this.targetSpacing = this.defaultSpacing();
    this.zoomAnchor = null;
    this.r = this.bars.length - 1 + this.margin();
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
    const before = this.bars.length;
    this.candles = fresh.concat(this.candles);
    this.rebuildDisplay();
    this.r += this.bars.length - before;
    this.invalidate();
  }

  /** Replace the last bar or append a newer one. */
  upsertCandle(c: Candle) {
    const n = this.candles.length;
    if (n === 0) return;
    const last = this.candles[n - 1];
    const nb = this.bars.length;
    const atLatest = this.r >= nb - 1 - 0.5 && this.r <= nb - 1 + this.plotW() / this.barSpacing;
    if (c.t === last.t) {
      this.candles[n - 1] = c;
    } else if (c.t > last.t) {
      this.candles.push(c);
    } else {
      return;
    }
    this.rebuildDisplay();
    if (atLatest && this.bars.length > nb) this.r += this.bars.length - nb;
    this.invalidate();
  }

  resetView() {
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.targetSpacing = this.barSpacing = this.defaultSpacing();
    this.r = this.bars.length - 1 + this.margin();
    this.setAutoScale(true);
    this.invalidate();
  }

  /** Zoom so that the last `bars` bars fill the plot (range buttons); the view is pinned to the newest bar. */
  showLastBars(bars: number) {
    const n = this.bars.length;
    if (n === 0) return;
    const spacing = this.plotW() / (Math.max(1, bars) + this.margin());
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.targetSpacing = this.barSpacing = Math.min(this.maxBs(), Math.max(MIN_BS, spacing));
    this.r = n - 1 + this.margin();
    this.setAutoScale(true);
    this.invalidate();
  }

  /** Scrolls so that time `t` is in the middle of the plot; with a manual price scale `price` is centred too. */
  centerOn(t: number, price?: number) {
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.r = this.timeToIndex(t) + this.plotW() / 2 / this.barSpacing;
    const main = this.panes[0];
    if (price !== undefined && Number.isFinite(price) && main.manual && main.min > 0 === main.max > 0) {
      if (this.opts.logScale && main.min > 0 && price > 0) {
        const mid = (Math.log(main.min) + Math.log(main.max)) / 2;
        const k = Math.exp(Math.log(price) - mid);
        main.min *= k;
        main.max *= k;
      } else {
        const shift = price - (main.min + main.max) / 2;
        main.min += shift;
        main.max += shift;
      }
      main.tMin = main.min;
      main.tMax = main.max;
    }
    this.invalidate();
  }

  scrollToLatest() {
    this.zoomAnchor = null;
    this.r = this.bars.length - 1 + this.margin();
    this.invalidate();
  }

  scrollToStart() {
    this.zoomAnchor = null;
    this.r = this.plotW() / this.barSpacing - 2;
    this.invalidate();
  }

  /** Scroll by whole bars (positive = towards newer bars). */
  scrollBy(bars: number) {
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.r += bars;
    this.invalidate();
  }

  /** Zoom around the right edge by a factor (> 1 zooms in). */
  zoomBy(factor: number) {
    this.targetSpacing = Math.max(MIN_BS, Math.min(this.maxBs(), this.targetSpacing * factor));
    this.zoomAnchor = { index: this.xToIndex(this.plotW()), x: this.plotW() };
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

  /** Symbols drawn over the main one. `candles` are in chart time (same clock as the main candles). */
  addCompare(entry: { id: string; label: string; color: string; mode: "percent" | "own"; candles: Candle[] }) {
    this.compares = this.compares.filter((c) => c.id !== entry.id);
    const e: CompareEntry = { ...entry, visible: true, aligned: [], k: NaN };
    this.alignCompare(e);
    this.compares.push(e);
    this.invalidate();
  }
  setCompareData(id: string, candles: Candle[]) {
    const e = this.compares.find((c) => c.id === id);
    if (!e) return;
    e.candles = candles;
    this.alignCompare(e);
    this.invalidate();
  }
  updateCompare(id: string, patch: { visible?: boolean; color?: string; label?: string; mode?: "percent" | "own" }) {
    const e = this.compares.find((c) => c.id === id);
    if (!e) return;
    Object.assign(e, patch);
    this.invalidate();
  }
  removeCompare(id: string) {
    this.compares = this.compares.filter((c) => c.id !== id);
    this.invalidate();
  }
  getCompares(): CompareInfo[] {
    return this.compares.map((c) => ({ id: c.id, label: c.label, color: c.color, mode: c.mode, visible: c.visible, last: c.candles.length ? c.candles[c.candles.length - 1].c : NaN }));
  }

  private alignCompare(e: CompareEntry) {
    const bars = this.bars;
    const cs = e.candles;
    const out = new Array<number>(bars.length).fill(NaN);
    if (cs.length > 0) {
      const iv = this.opts.intervalMs;
      const half = iv / 2;
      let j = 0;
      for (let i = 0; i < bars.length; i++) {
        const t = bars[i].t;
        while (j + 1 < cs.length && cs[j + 1].t <= t + half) j++;
        if (cs[j].t <= t + half && t + half - cs[j].t < iv * 1.5) out[i] = cs[j].c;
      }
    }
    e.aligned = out;
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
  /** Logical bars (candles, or Renko / Kagi / ... bars). */
  getBars(): Candle[] {
    return this.bars;
  }
  /** True for chart types whose bars are built from the candles (indicators cannot be drawn on them). */
  isTransformed(): boolean {
    return this.transformed();
  }
  getTransformBox(): number {
    return this.transformBox;
  }
  /** x offset of the plot inside the canvas (non-zero with the price scale on the left); DOM overlays should add it. */
  getPlotOffsetX(): number {
    return this.plotX();
  }
  /** y of the bottom of the OHLC status line in the main pane (where an indicator legend can start). */
  getStatusBottom(): number {
    return this.statusBottom;
  }
  getScaleBase(): number {
    return this.scaleBase;
  }
  /** Chart times at the left and right edges of the plot. */
  getVisibleTimeRange(): { from: number; to: number } {
    return { from: this.indexToTime(this.xToIndex(0)), to: this.indexToTime(this.xToIndex(this.plotW())) };
  }
  /** Fit the plot to a time span (another chart's view). */
  setVisibleTimeRange(from: number, to: number) {
    if (this.bars.length === 0 || !(to > from)) return;
    const i0 = this.timeToIndex(from);
    const i1 = this.timeToIndex(to);
    if (!(i1 > i0)) return;
    const bs = Math.max(MIN_BS, Math.min(this.maxBs(), this.plotW() / (i1 - i0)));
    this.zoomAnchor = null;
    this.inertiaV = 0;
    this.targetSpacing = this.barSpacing = bs;
    this.r = i1;
    this.invalidate();
  }
  /** Show (or hide with null) the crosshair position of another chart. */
  setExternalCrosshair(t: number | null) {
    if (this.externalT === t) return;
    this.externalT = t;
    this.invalidateOver();
  }
  /** Offset (ms) added to a chart time before reading it with UTC getters, for the time zone in use. */
  getTimeShiftAt(t: number): number {
    return this.shiftFor(t);
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
  /** Canvas x of the plot's left edge. */
  private plotX() {
    return this.opts.scaleSide === "left" ? this.axisW : 0;
  }
  /** Left edge of the price scale strip in plot coordinates. */
  private axisEdge() {
    return this.opts.scaleSide === "left" ? -this.axisW : this.plotW();
  }
  private shiftFor(t: number): number {
    const z = this.opts.timeZone;
    if (!z) return this.opts.timeShiftMs;
    const off = this.opts.clockOffsetMs;
    return zoneOffsetMs(z, t - off) - off;
  }

  private rebuildDisplay() {
    const t = this.opts.chartType;
    if (isTransformedType(t)) {
      const res = transformBars(t, this.candles, this.opts.transform);
      this.bars = res.bars;
      this.transformBox = res.box;
    } else {
      this.bars = this.candles;
      this.transformBox = 0;
    }
    this.display = t === "heikin" ? toHeikinAshi(this.bars) : this.bars;
    for (const e of this.compares) this.alignCompare(e);
  }

  private timeToIndex(t: number): number {
    const c = this.bars;
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
    const c = this.bars;
    const n = c.length;
    if (n === 0) return 0;
    if (i <= 0) return c[0].t + i * this.opts.intervalMs;
    if (i >= n - 1) return c[n - 1].t + (i - (n - 1)) * this.opts.intervalMs;
    const lo = Math.floor(i);
    return c[lo].t + (i - lo) * (c[lo + 1].t - c[lo].t);
  }

  private clampView() {
    const n = this.bars.length;
    const bars = this.plotW() / this.barSpacing;
    const rMax = n - 1 + bars * 0.5;
    const rMin = Math.min(3, Math.max(0, n - 1));
    if (this.r > rMax) this.r = rMax;
    if (this.r < rMin) this.r = rMin;
  }

  private visibleRange(): { from: number; to: number } {
    const n = this.bars.length;
    if (n === 0) return { from: 0, to: -1 };
    const bars = this.plotW() / this.barSpacing;
    const from = Math.max(0, Math.floor(this.r - bars) - 1);
    const to = Math.min(n - 1, Math.ceil(this.r) + 1);
    return { from, to };
  }

  private isLog(p: Pane): boolean {
    return this.opts.scaleMode === "log" && p.id === "main" && p.min > 0;
  }
  private isInverted(p: Pane): boolean {
    return this.opts.invertScale && p.id === "main";
  }

  private paneY(p: Pane, price: number): number {
    let f: number;
    if (this.isLog(p)) {
      const a = Math.log(p.min);
      const b = Math.log(p.max);
      f = (b - Math.log(Math.max(price, 1e-12))) / (b - a || 1);
    } else {
      f = (p.max - price) / (p.max - p.min || 1);
    }
    return (this.isInverted(p) ? 1 - f : f) * p.height;
  }

  private paneP(p: Pane, y: number): number {
    let f = y / (p.height || 1);
    if (this.isInverted(p)) f = 1 - f;
    if (this.isLog(p)) {
      const a = Math.log(p.min);
      const b = Math.log(p.max);
      return Math.exp(b - f * (b - a));
    }
    return p.max - f * (p.max - p.min);
  }

  /** Scale a pane's price range around its middle (k > 1 zooms out). */
  private zoomPaneRange(p: Pane, k: number) {
    if (this.isLog(p)) {
      const a = Math.log(p.min);
      const b = Math.log(p.max);
      const mid = (a + b) / 2;
      const half = ((b - a) / 2) * k;
      p.min = Math.exp(mid - half);
      p.max = Math.exp(mid + half);
    } else {
      const mid = (p.min + p.max) / 2;
      const half = ((p.max - p.min) / 2) * k;
      p.min = mid - half;
      p.max = mid + half;
    }
    p.tMin = p.min;
    p.tMax = p.max;
  }

  /** Move a pane's price range by `dy` pixels of drag. */
  private shiftPaneRange(p: Pane, dy: number) {
    const sign = this.isInverted(p) ? -1 : 1;
    if (this.isLog(p)) {
      const k = Math.exp(sign * (dy / p.height) * (Math.log(p.max) - Math.log(p.min)));
      p.min *= k;
      p.max *= k;
    } else {
      const m = sign * (dy / p.height) * (p.max - p.min);
      p.min += m;
      p.max += m;
    }
    p.tMin = p.min;
    p.tMax = p.max;
  }

  private layoutPanes() {
    const plotH = this.plotH();
    // indicator panes cannot be drawn on bars that are built from the candles
    const hideSubs = this.transformed();
    const subs = hideSubs ? [] : this.panes.slice(1);
    let subSum = subs.reduce((s, p) => s + p.ratio, 0);
    const scale = subSum > MAX_SUB_RATIO ? MAX_SUB_RATIO / subSum : 1;
    subSum = Math.min(subSum, MAX_SUB_RATIO);
    const mainH = plotH * (1 - subSum);
    let top = 0;
    this.panes[0].top = 0;
    this.panes[0].height = mainH;
    top = mainH;
    for (const p of this.panes.slice(1)) {
      p.top = top;
      p.height = hideSubs ? 0 : plotH * p.ratio * scale;
      top += p.height;
    }
  }

  /** Price a single-price chart type plots for a bar. */
  private priceOf(c: Candle): number {
    return this.opts.chartType === "columns" ? c.c : sourcePrice(c, this.opts.priceSource);
  }
  private singlePriceType(): boolean {
    const t = this.opts.chartType;
    return t === "line" || t === "area" || t === "linemarkers" || t === "step" || t === "baseline" || t === "columns";
  }

  /** Base price of the percent / indexed scales and the rebasing factors of compared symbols for the current view. */
  private updateBase() {
    const n = this.display.length;
    if (n === 0) {
      this.scaleBase = 0;
      return;
    }
    const i0 = Math.max(0, Math.min(n - 1, Math.ceil(this.xToIndex(0))));
    const b = this.display[i0]?.c ?? 0;
    this.scaleBase = b > 0 ? b : 0;
    for (const e of this.compares) {
      e.k = NaN;
      for (let i = i0; i < e.aligned.length; i++) {
        const v = e.aligned[i];
        if (isFinite(v) && v > 0) {
          e.k = this.scaleBase / v;
          break;
        }
      }
    }
  }

  private updateAutoScale(dt: number, immediate: boolean): boolean {
    let { from, to } = this.visibleRange();
    if (this.opts.chartType === "footprint") {
      // wide bars: bars that are entirely off screen must not stretch the scale
      from = Math.max(from, Math.ceil(this.xToIndex(0) - 0.5));
      to = Math.min(to, Math.floor(this.xToIndex(this.plotW()) + 0.5));
    }
    const transformed = this.transformed();
    let animating = false;
    for (const p of this.panes) {
      if (p.height <= 0 && p.id !== "main") continue;
      if (p.manual || to < from || (this.opts.lockScale && p.ready)) continue;
      let lo = Infinity;
      let hi = -Infinity;
      if (!transformed) {
        for (const s of p.series) {
          const rg = s.range?.(this.candles, from, to);
          if (rg) {
            lo = Math.min(lo, rg[0]);
            hi = Math.max(hi, rg[1]);
          }
        }
      }
      if (p.id === "main") {
        const single = this.singlePriceType();
        for (let i = from; i <= to; i++) {
          const c = this.display[i];
          if (!c) continue;
          if (single) {
            const v = this.priceOf(c);
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          } else {
            lo = Math.min(lo, c.l);
            hi = Math.max(hi, c.h);
          }
        }
        for (const e of this.compares) {
          if (!e.visible || e.mode !== "percent" || !isFinite(e.k)) continue;
          for (let i = from; i <= to; i++) {
            const v = e.aligned[i] * e.k;
            if (isFinite(v)) {
              lo = Math.min(lo, v);
              hi = Math.max(hi, v);
            }
          }
        }
      }
      if (!isFinite(lo) || !isFinite(hi)) continue;
      if (hi - lo < 1e-9) {
        const d = Math.abs(hi) * 0.01 || 1;
        lo -= d;
        hi += d;
      }
      const topPad = Math.max(0, this.opts.marginTop) / 100;
      const fpBottom =
        p.id === "main" && this.opts.chartType === "footprint" && p.height > 0
          ? (footprintTotalsHeight(this.opts.footprint ?? DEFAULT_FOOTPRINT) + 8) / p.height
          : 0;
      const botPad = Math.max(0, this.opts.marginBottom) / 100 + (p.id === "main" && this.opts.showVolume && this.opts.chartType !== "footprint" ? 0.14 : 0) + fpBottom;
      if (this.isLogRange(p, lo)) {
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

  private isLogRange(p: Pane, lo: number): boolean {
    return this.opts.scaleMode === "log" && p.id === "main" && lo > 0;
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
      this.updateBase();
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
    for (const cb of this.viewListeners) cb();
    const { from } = this.visibleRange();
    const n = this.candles.length;
    const wantMore = !this.transformed() || this.bars.length < 300;
    if (n > 0 && from < 40 && wantMore && this.hasMoreHistory && this.lastRequestedLen !== n && this.onNeedHistory) {
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
      flow: this.flow,
    };
  }

  private drawBase() {
    const ctx = this.bctx;
    const th = this.opts.theme;
    const W = this.W;
    const H = this.H;
    const plotW = this.plotW();
    const plotH = this.plotH();
    const px = this.plotX();
    const fs = this.opts.scaleFontSize;
    const ff = this.opts.fontFamily;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (th.bgTop && th.bgBottom) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, th.bgTop);
      g.addColorStop(1, th.bgBottom);
      ctx.fillStyle = g;
    } else ctx.fillStyle = th.bg;
    ctx.fillRect(0, 0, W, H);

    const n = this.bars.length;
    if (n === 0) {
      ctx.fillStyle = th.textMuted;
      ctx.font = `13px ${ff}`;
      ctx.textAlign = "center";
      ctx.fillText("…", plotW / 2, plotH / 2);
      return;
    }
    const { from, to } = this.visibleRange();
    const main = this.panes[0];
    const transformed = this.transformed();

    ctx.save();
    ctx.translate(px, 0);

    // watermark
    if (this.opts.showWatermark && this.opts.symbolLabel) {
      ctx.save();
      ctx.fillStyle = th.watermark;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const size = Math.max(28, Math.min(84, plotW / 9));
      ctx.font = `700 ${size}px ${ff}`;
      ctx.fillText(this.opts.symbolLabel, plotW / 2, main.height / 2 - size * 0.2);
      ctx.font = `600 ${size * 0.34}px ${ff}`;
      ctx.fillText(this.opts.intervalLabel, plotW / 2, main.height / 2 + size * 0.45);
      ctx.restore();
    }

    // time ticks (shared by every pane)
    const timeTicks = this.computeTimeTicks(from, to);

    // vertical grid
    if (this.opts.showGrid && this.opts.gridV) {
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

    // session breaks: a dashed line where a new trading day starts
    if (this.opts.sessionBreaks && this.opts.intervalMs < 86_400_000) {
      ctx.save();
      ctx.strokeStyle = th.paneBorder;
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (let i = Math.max(1, from); i <= to; i++) {
        const t = this.bars[i].t;
        if (tickWeight(t, this.bars[i - 1].t, this.shiftFor(t)) >= 50) {
          const x = this.snap(this.indexToX(i) - this.barSpacing / 2);
          ctx.moveTo(x, 0);
          ctx.lineTo(x, plotH);
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    let maxLabelW = 0;
    for (const pane of this.panes) {
      if (pane.height <= 0) continue;
      const sc = this.seriesContext(pane, from, to);
      // horizontal grid + price labels are collected here and drawn on the axis afterwards
      const ticks = this.priceTicks(pane);
      if (this.opts.showGrid && this.opts.gridH) {
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
        if (this.opts.showVolume && this.opts.chartType !== "footprint") this.drawVolume(sc);
        this.drawPriceSeries(sc);
        this.drawCompares(sc);
      }
      if (!transformed) for (const s of pane.series) s.draw(sc);
      ctx.restore();

      // labels
      ctx.font = `${fs}px ${ff}`;
      ctx.fillStyle = th.textMuted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const ax = this.axisEdge() + 8;
      for (const v of ticks) {
        const y = pane.top + this.paneY(pane, v);
        if (y < pane.top + 6 || y > pane.top + pane.height - 6) continue;
        const text = this.fmtAxis(pane, v);
        maxLabelW = Math.max(maxLabelW, ctx.measureText(text).width);
        ctx.fillText(text, ax, y);
      }

      // pane border
      ctx.strokeStyle = th.paneBorder;
      ctx.beginPath();
      const by = this.snap(pane.top + pane.height);
      ctx.moveTo(-px, by);
      ctx.lineTo(W - px, by);
      ctx.stroke();
    }

    this.drawMainExtras(ctx, from, to);

    // axis border
    ctx.strokeStyle = th.axisBorder;
    ctx.beginPath();
    const abx = this.snap(this.opts.scaleSide === "left" ? 0 : plotW);
    ctx.moveTo(abx, 0);
    ctx.lineTo(abx, plotH);
    ctx.stroke();

    // time labels
    ctx.fillStyle = th.textMuted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const tk of timeTicks) {
      ctx.font = `${tk.weight >= 50 ? "600" : "400"} ${fs}px ${ff}`;
      ctx.fillText(tk.label, tk.x, plotH + TIME_AXIS_H / 2);
    }

    this.drawLastPrice();
    if (!transformed) this.drawSeriesAxisLabels(ctx);
    this.drawCompareLabels(ctx);

    ctx.restore();

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

  /** Text of a price on a pane's scale: the price itself, or percent / index points on the main pane. */
  private fmtAxis(pane: Pane, price: number): string {
    const loc = this.opts.locale;
    if (pane.id !== "main") return formatPrice(price, this.paneTickPrecision(pane), loc);
    const m = this.opts.scaleMode;
    const b = this.scaleBase;
    if ((m === "percent" || m === "indexed") && b > 0) {
      const v = m === "percent" ? (price / b - 1) * 100 : (price / b) * 100;
      const range = Math.abs(((pane.max - pane.min) / b) * 100);
      const dec = range >= 60 ? 0 : range >= 6 ? 1 : range >= 0.6 ? 2 : 3;
      return formatPrice(v, dec, loc) + (m === "percent" ? "%" : "");
    }
    return formatPrice(price, this.precision, loc);
  }

  private priceTicks(pane: Pane): number[] {
    const target = Math.max(2, Math.floor(pane.height / (this.opts.scaleFontSize >= 13 ? 56 : 48)));
    if (pane.id === "main") {
      const m = this.opts.scaleMode;
      const b = this.scaleBase;
      if ((m === "percent" || m === "indexed") && b > 0) {
        const f = (p: number) => (m === "percent" ? (p / b - 1) * 100 : (p / b) * 100);
        const inv = (v: number) => (m === "percent" ? b * (1 + v / 100) : (v * b) / 100);
        return niceTicks(f(pane.min), f(pane.max), target).map(inv);
      }
      if (this.isLog(pane)) {
        const lt = logTicks(pane.min, pane.max, target);
        if (lt.length >= 2) return lt;
      }
    }
    return niceTicks(pane.min, pane.max, target);
  }

  private computeTimeTicks(from: number, to: number) {
    const out: { x: number; weight: number; label: string }[] = [];
    if (to < from) return out;
    const c = this.bars;
    const cand: { i: number; w: number }[] = [];
    // weight of a bar is measured against its predecessor, so start one bar earlier
    for (let i = Math.max(0, from); i <= to; i++) {
      const w = tickWeight(c[i].t, i > 0 ? c[i - 1].t : null, this.shiftFor(c[i].t));
      cand.push({ i, w });
    }
    // future bars past the last one (empty right margin) are labelled by extrapolated time
    const plotW = this.plotW();
    const lastVisibleIndex = Math.floor(this.xToIndex(plotW));
    for (let i = to + 1; i <= lastVisibleIndex; i++) {
      const t = this.indexToTime(i);
      const pt = this.indexToTime(i - 1);
      cand.push({ i, w: tickWeight(t, pt, this.shiftFor(t)) });
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
        out.push({ x, weight: k.w, label: formatTickLabel(t, k.w, this.shiftFor(t), this.opts.locale) });
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
    const c = this.bars;
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

  /* ── chart types ── */

  private candleColors(up: boolean) {
    const th = this.opts.theme;
    const cs = this.opts.candleStyle;
    const body = (up ? cs.upBody : cs.downBody) || (up ? th.up : th.down);
    const border = (up ? cs.upBorder : cs.downBorder) || body;
    const wick = (up ? cs.upWick : cs.downWick) || body;
    return { body, border, wick };
  }

  /** Whether the bar at display index i is "up" (close vs open, or vs the previous close). */
  private isUp(i: number): boolean {
    const d = this.display;
    const c = d[i];
    if (this.opts.candleStyle.byPrevClose && i > 0) return c.c >= d[i - 1].c;
    return c.c >= c.o;
  }

  private drawPriceSeries(sc: SeriesContext) {
    const type = this.opts.chartType;
    switch (type) {
      case "line":
      case "area":
      case "linemarkers":
      case "step":
      case "baseline":
        return this.drawLineFamily(sc, type);
      case "columns":
        return this.drawColumns(sc);
      case "highlow":
        return this.drawHighLow(sc);
      case "kagi":
        return this.drawKagi(sc);
      case "pnf":
        return this.drawPnf(sc);
      case "footprint":
        return this.drawFootprintBars(sc);
      default:
        return this.drawBodies(sc, type);
    }
  }

  private drawLineFamily(sc: SeriesContext, type: "line" | "area" | "linemarkers" | "step" | "baseline") {
    const { ctx, from, to, x, y } = sc;
    const d = this.display;
    const th = this.opts.theme;
    if (to < from) return;
    const pts: number[] = [];
    for (let i = from; i <= to; i++) pts.push(x(i), y(this.priceOf(d[i])));
    const trace = () => {
      ctx.beginPath();
      for (let k = 0; k < pts.length; k += 2) {
        if (k === 0) ctx.moveTo(pts[0], pts[1]);
        else if (type === "step") {
          ctx.lineTo(pts[k], pts[k - 1]);
          ctx.lineTo(pts[k], pts[k + 1]);
        } else ctx.lineTo(pts[k], pts[k + 1]);
      }
    };
    ctx.lineJoin = "round";
    ctx.lineWidth = this.opts.lineWidth;

    if (type === "baseline") {
      const yb = sc.paneHeight * (1 - this.opts.baselinePercent / 100);
      const paint = (y0: number, y1: number, color: string, above: boolean) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-2, y0, sc.paneWidth + 4, y1 - y0);
        ctx.clip();
        trace();
        ctx.lineTo(pts[pts.length - 2], yb);
        ctx.lineTo(pts[0], yb);
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yb, 0, above ? 0 : sc.paneHeight);
        g.addColorStop(0, withAlpha(color, 0.03));
        g.addColorStop(1, withAlpha(color, 0.38));
        ctx.fillStyle = g;
        ctx.fill();
        trace();
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.restore();
      };
      paint(-2, yb, this.candleColors(true).body, true);
      paint(yb, sc.paneHeight + 2, this.candleColors(false).body, false);
      ctx.save();
      ctx.strokeStyle = th.textMuted;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      const by = Math.round(yb) + 0.5;
      ctx.moveTo(0, by);
      ctx.lineTo(sc.paneWidth, by);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (type === "area") {
      const g = ctx.createLinearGradient(0, 0, 0, sc.paneHeight);
      g.addColorStop(0, th.areaTop);
      g.addColorStop(1, th.areaBottom);
      ctx.save();
      trace();
      ctx.lineTo(pts[pts.length - 2], sc.paneHeight);
      ctx.lineTo(pts[0], sc.paneHeight);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
    }
    trace();
    ctx.strokeStyle = th.line;
    ctx.stroke();

    if (type === "linemarkers") {
      const r = Math.max(2, Math.min(4.5, this.barSpacing * 0.3));
      ctx.fillStyle = th.line;
      ctx.beginPath();
      for (let k = 0; k < pts.length; k += 2) {
        ctx.moveTo(pts[k] + r, pts[k + 1]);
        ctx.arc(pts[k], pts[k + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
  }

  private drawColumns(sc: SeriesContext) {
    const { ctx, from, to, dpr, x, y } = sc;
    const d = this.display;
    const bwD = this.bodyWidthDevice();
    const D = (v: number) => Math.round(v * dpr);
    const bottom = D(sc.paneHeight);
    for (const up of [true, false]) {
      ctx.fillStyle = this.candleColors(up).body;
      for (let i = from; i <= to; i++) {
        const c = d[i];
        const u = i > 0 ? c.c >= d[i - 1].c : c.c >= c.o;
        if (u !== up) continue;
        const cx = D(x(i));
        const top = D(y(c.c));
        if (bottom <= top) continue;
        ctx.fillRect((cx - (bwD - 1) / 2) / dpr, top / dpr, bwD / dpr, (bottom - top) / dpr);
      }
    }
  }

  private drawHighLow(sc: SeriesContext) {
    const { ctx, from, to, dpr, x, y } = sc;
    const d = this.display;
    const bwD = this.bodyWidthDevice();
    const D = (v: number) => Math.round(v * dpr);
    for (const up of [true, false]) {
      ctx.fillStyle = this.candleColors(up).body;
      for (let i = from; i <= to; i++) {
        if (this.isUp(i) !== up) continue;
        const c = d[i];
        const cx = D(x(i));
        const yh = D(y(c.h));
        const yl = D(y(c.l));
        ctx.fillRect((cx - (bwD - 1) / 2) / dpr, yh / dpr, bwD / dpr, Math.max(1, yl - yh) / dpr);
      }
    }
  }

  /** Candles, hollow candles, bars, Heikin Ashi, volume candles, Renko, line break, range bars. */
  private drawBodies(sc: SeriesContext, type: string) {
    const { ctx, from, to, dpr, x, y } = sc;
    const d = this.display;
    const cs = this.opts.candleStyle;
    const D = (v: number) => Math.round(v * dpr);
    const brick = type === "renko" || type === "linebreak";
    let bwD = brick ? Math.max(1, Math.floor(this.barSpacing * dpr * 0.94)) : this.bodyWidthDevice();
    if (bwD % 2 === 0) bwD = Math.max(1, bwD - 1);
    const thin = bwD <= 2;
    const wickOn = cs.wickOn && !brick;
    let maxV = 0;
    if (type === "volcandles") for (let i = from; i <= to; i++) maxV = Math.max(maxV, d[i].v);

    for (const up of [true, false]) {
      const col = this.candleColors(up);
      for (let i = from; i <= to; i++) {
        if (this.isUp(i) !== up) continue;
        const c = d[i];
        const cx = D(x(i));
        const yh = D(y(c.h));
        const yl = D(y(c.l));
        const yo = D(y(c.o));
        const yc = D(y(c.c));
        if (type === "bars") {
          ctx.fillStyle = col.body;
          ctx.fillRect(cx / dpr, yh / dpr, 1 / dpr, Math.max(1, yl - yh) / dpr);
          const tick = Math.max(1, Math.floor(this.barSpacing * dpr * 0.36));
          ctx.fillRect((cx - tick) / dpr, yo / dpr, tick / dpr, 1 / dpr);
          ctx.fillRect((cx + 1) / dpr, yc / dpr, tick / dpr, 1 / dpr);
          continue;
        }
        let w = bwD;
        if (type === "volcandles" && maxV > 0) {
          w = Math.max(3, Math.round(bwD * (0.3 + 0.7 * (c.v / maxV))));
          if (w % 2 === 0) w++;
        }
        const top = Math.min(yo, yc);
        const h = Math.max(1, Math.abs(yc - yo));
        const left = cx - (w - 1) / 2;
        const hollowBody = (type === "hollow" && up) || !cs.bodyOn;
        // wick (not through a hollow body)
        if (wickOn || (thin && !brick)) {
          ctx.fillStyle = col.wick;
          if (hollowBody && !thin) {
            if (top > yh) ctx.fillRect(cx / dpr, yh / dpr, 1 / dpr, (top - yh) / dpr);
            if (yl > top + h) ctx.fillRect(cx / dpr, (top + h) / dpr, 1 / dpr, (yl - top - h) / dpr);
          } else ctx.fillRect(cx / dpr, yh / dpr, 1 / dpr, Math.max(1, yl - yh) / dpr);
        }
        if (thin && !brick) continue;
        const outline = (color: string) => {
          ctx.fillStyle = color;
          if (h <= 2 || w <= 2) {
            ctx.fillRect(left / dpr, top / dpr, w / dpr, h / dpr);
            return;
          }
          ctx.fillRect(left / dpr, top / dpr, w / dpr, 1 / dpr);
          ctx.fillRect(left / dpr, (top + h - 1) / dpr, w / dpr, 1 / dpr);
          ctx.fillRect(left / dpr, (top + 1) / dpr, 1 / dpr, (h - 2) / dpr);
          ctx.fillRect((left + w - 1) / dpr, (top + 1) / dpr, 1 / dpr, (h - 2) / dpr);
        };
        if (hollowBody) outline(cs.borderOn ? col.border : col.body);
        else {
          ctx.fillStyle = col.body;
          ctx.fillRect(left / dpr, top / dpr, w / dpr, h / dpr);
          if (cs.borderOn) outline(col.border);
        }
      }
    }
  }

  private footprintHost(): FootprintHost {
    return {
      bars: this.display,
      store: this.flow,
      settings: this.opts.footprint ?? DEFAULT_FOOTPRINT,
      colors: (up) => this.candleColors(up),
      isUp: (i) => this.isUp(i),
      fontFamily: this.opts.fontFamily,
      locale: this.opts.locale,
    };
  }

  /** Footprint chart: numbers per price level; plain candles while the bars are too narrow for them. */
  private drawFootprintBars(sc: SeriesContext) {
    this.flow.precision = this.precision;
    const host = this.footprintHost();
    const layout = footprintLayout(host, sc);
    if (!layout.cells) {
      this.fpFrame = layout;
      this.drawBodies(sc, "candles");
      this.drawBadge(sc.ctx, flowLabels(this.opts.locale).zoom, false, 22);
      return;
    }
    this.fpFrame = drawFootprint(host, sc, layout);
    this.drawFootprintBadge(sc.ctx, this.fpFrame);
  }

  /** Small note in the corner: where the numbers come from. */
  private drawFootprintBadge(ctx: CanvasRenderingContext2D, f: FootprintFrame) {
    const th = this.opts.theme;
    const L = flowLabels(this.opts.locale);
    const total = f.approxBars + f.realBars;
    if (total === 0) return;
    let text = "";
    let warn = false;
    if (f.realBars === 0) {
      text = this.flow.avail === "unknown" || this.flow.pending ? `${L.approxShort} …` : this.flow.delayed && this.flow.size > 0 ? L.delayed : L.approx;
      warn = true;
    } else if (f.approxBars > 0) {
      text = this.flow.delayed ? L.delayed : L.partial;
      warn = true;
    } else text = this.flow.live ? L.live : "";
    if (!text) return;
    this.drawBadge(ctx, text, warn, f.totalsH + 22);
  }

  /** Small right-aligned note near the bottom of the main pane. */
  private drawBadge(ctx: CanvasRenderingContext2D, text: string, warn: boolean, fromBottom: number) {
    const th = this.opts.theme;
    ctx.save();
    ctx.font = `600 10px ${this.opts.fontFamily}`;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 12;
    const x = this.plotW() - w - 8;
    const y = this.panes[0].height - fromBottom;
    ctx.fillStyle = warn ? "rgba(245,166,35,0.16)" : "rgba(38,166,154,0.14)";
    ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = warn ? "#f5a623" : th.textMuted;
    ctx.fillText(text, x + w - 6, y + 8.5);
    ctx.restore();
  }

  private drawKagi(sc: SeriesContext) {
    const { ctx, from, to, x, y } = sc;
    const d = this.display;
    const th = this.opts.theme;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    for (let i = Math.max(0, from - 1); i <= to; i++) {
      const c = d[i];
      if (!c) continue;
      const thick = c.k === 1;
      ctx.strokeStyle = thick ? this.candleColors(true).body : this.candleColors(false).body;
      ctx.lineWidth = thick ? Math.max(2, Math.min(4, this.barSpacing * 0.3)) : 1.2;
      const cx = x(i);
      ctx.beginPath();
      ctx.moveTo(cx, y(c.o));
      ctx.lineTo(cx, y(c.c));
      if (i < d.length - 1) ctx.lineTo(x(i + 1), y(c.c));
      ctx.stroke();
    }
    void th;
  }

  private drawPnf(sc: SeriesContext) {
    const { ctx, from, to, x, y } = sc;
    const d = this.display;
    const B = this.transformBox;
    if (!(B > 0)) return;
    const cellW = this.barSpacing * 0.9;
    ctx.lineCap = "round";
    for (let i = from; i <= to; i++) {
      const c = d[i];
      if (!c) continue;
      const isX = c.k === 1;
      const color = this.candleColors(isX).body;
      const nBox = Math.max(1, Math.round((c.h - c.l) / B));
      const cx = x(i);
      const hh = Math.abs(y(c.l) - y(c.h)) / nBox;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      if (hh < 3 || cellW < 3) {
        ctx.fillRect(cx - Math.max(1, cellW / 2), y(c.h), Math.max(2, cellW), Math.max(1, y(c.l) - y(c.h)));
        continue;
      }
      const s = Math.max(1.2, Math.min(cellW, hh) * 0.4);
      ctx.lineWidth = Math.max(1, Math.min(2, s / 3));
      ctx.beginPath();
      for (let b = 0; b < nBox; b++) {
        const p0 = c.l + b * B;
        const ym = (y(p0) + y(p0 + B)) / 2;
        if (isX) {
          ctx.moveTo(cx - s, ym - s);
          ctx.lineTo(cx + s, ym + s);
          ctx.moveTo(cx - s, ym + s);
          ctx.lineTo(cx + s, ym - s);
        } else {
          ctx.moveTo(cx + s, ym);
          ctx.arc(cx, ym, s, 0, Math.PI * 2);
        }
      }
      ctx.stroke();
    }
  }

  /** Compared symbols on the main pane (drawn in the pane's translated, clipped context). */
  private drawCompares(sc: SeriesContext) {
    const { ctx, from, to, x } = sc;
    if (to < from) return;
    for (const e of this.compares) {
      if (!e.visible) continue;
      let map: (v: number) => number;
      if (e.mode === "percent") {
        if (!isFinite(e.k)) continue;
        const k = e.k;
        map = (v) => sc.y(v * k);
      } else {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = from; i <= to; i++) {
          const v = e.aligned[i];
          if (isFinite(v)) {
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
          }
        }
        if (!isFinite(lo)) continue;
        if (hi - lo < 1e-12) hi = lo + Math.abs(lo) * 0.01 + 1e-9;
        e.lo = lo;
        e.hi = hi;
        const top = sc.paneHeight * (this.opts.marginTop / 100 + 0.02);
        const bot = sc.paneHeight * (1 - this.opts.marginBottom / 100 - (this.opts.showVolume ? 0.14 : 0));
        map = (v) => bot - ((v - lo) / (hi - lo)) * (bot - top);
      }
      ctx.beginPath();
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = "round";
      let pen = false;
      for (let i = Math.max(0, from - 1); i <= to; i++) {
        const v = e.aligned[i];
        if (!isFinite(v)) {
          pen = false;
          continue;
        }
        const py = map(v);
        if (!pen) {
          ctx.moveTo(x(i), py);
          pen = true;
        } else ctx.lineTo(x(i), py);
      }
      ctx.stroke();
    }
  }

  /** Price-scale flags of the compared symbols (last value, at the line's height). */
  private drawCompareLabels(ctx: CanvasRenderingContext2D) {
    const main = this.panes[0];
    const { to } = this.visibleRange();
    for (const e of this.compares) {
      if (!e.visible || e.candles.length === 0) continue;
      let idx = Math.min(e.aligned.length - 1, to);
      while (idx >= 0 && !isFinite(e.aligned[idx])) idx--;
      if (idx < 0) continue;
      const v = e.aligned[idx];
      let y: number;
      if (e.mode === "percent") {
        if (!isFinite(e.k)) continue;
        y = this.paneY(main, v * e.k);
      } else {
        if (e.lo === undefined || e.hi === undefined) continue;
        const top = main.height * (this.opts.marginTop / 100 + 0.02);
        const bot = main.height * (1 - this.opts.marginBottom / 100 - (this.opts.showVolume ? 0.14 : 0));
        y = bot - ((v - e.lo) / (e.hi - e.lo)) * (bot - top);
      }
      if (y < 0 || y > main.height) continue;
      const last = e.candles[e.candles.length - 1].c;
      const dec = Math.min(6, Math.max(2, (String(last).split(".")[1] || "").length));
      this.axisLabel(ctx, formatPrice(last, dec, this.opts.locale), y, e.color, "#fff", main);
    }
  }

  /** Real (unadjusted) last traded price of the symbol. */
  private lastPriceValue(): number | null {
    const n = this.candles.length;
    if (n === 0) return null;
    if (this.transformed()) return this.candles[n - 1].c;
    const d = this.display;
    return d.length ? d[d.length - 1].c : this.candles[n - 1].c;
  }

  /** Close of the previous session (intraday) or of the previous bar. */
  private prevCloseValue(): number | null {
    const cs = this.candles;
    const n = cs.length;
    if (n < 2) return null;
    if (this.opts.intervalMs >= 86_400_000) return cs[n - 2].c;
    const dayOf = (t: number) => Math.floor((t + this.shiftFor(t)) / 86_400_000);
    const day = dayOf(cs[n - 1].t);
    for (let i = n - 2; i >= 0; i--) if (dayOf(cs[i].t) !== day) return cs[i].c;
    return null;
  }

  /** Extras drawn over the main pane's series: previous close line and the highest / lowest labels. */
  private drawMainExtras(ctx: CanvasRenderingContext2D, from: number, to: number) {
    const main = this.panes[0];
    const th = this.opts.theme;
    const plotW = this.plotW();
    const fs = this.opts.scaleFontSize;
    let pcY = -1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, plotW, main.height);
    ctx.clip();
    if (this.opts.showPrevCloseLine) {
      const pc = this.prevCloseValue();
      if (pc !== null) {
        pcY = this.paneY(main, pc);
        if (pcY >= 0 && pcY <= main.height) {
          ctx.strokeStyle = th.textMuted;
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 1;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          const yy = this.snap(pcY);
          ctx.moveTo(0, yy);
          ctx.lineTo(plotW, yy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }
    }
    if (this.opts.showHighLow && to >= from) {
      const single = this.singlePriceType();
      const i0 = Math.max(from, Math.ceil(this.xToIndex(0)));
      const i1 = Math.min(to, Math.floor(this.xToIndex(plotW)));
      let hi = -Infinity;
      let lo = Infinity;
      let hiI = -1;
      let loI = -1;
      for (let i = i0; i <= i1; i++) {
        const c = this.display[i];
        if (!c) continue;
        const h = single ? this.priceOf(c) : c.h;
        const l = single ? this.priceOf(c) : c.l;
        if (h > hi) {
          hi = h;
          hiI = i;
        }
        if (l < lo) {
          lo = l;
          loI = i;
        }
      }
      ctx.font = `600 ${fs}px ${this.opts.fontFamily}`;
      ctx.fillStyle = th.text;
      ctx.textAlign = "center";
      const put = (i: number, price: number, above: boolean) => {
        const x = Math.max(36, Math.min(plotW - 36, this.indexToX(i)));
        const y = this.paneY(main, price);
        ctx.textBaseline = above ? "bottom" : "top";
        ctx.fillText(formatPrice(price, this.precision, this.opts.locale), x, above ? y - 5 : y + 5);
      };
      if (hiI >= 0) put(hiI, hi, !this.opts.invertScale);
      if (loI >= 0 && loI !== hiI) put(loI, lo, this.opts.invertScale);
    }
    ctx.restore();
    if (this.opts.showPrevCloseLine && pcY >= 0 && pcY <= main.height) {
      const pc = this.prevCloseValue();
      if (pc !== null) this.axisLabel(ctx, this.fmtAxis(main, pc), pcY, th.labelBg, th.labelText, main);
    }
  }

  private drawLastPrice() {
    const price = this.lastPriceValue();
    if (price === null) return;
    const n = this.candles.length;
    const main = this.panes[0];
    const ctx = this.bctx;
    const last = this.candles[n - 1];
    const prev = n > 1 ? this.candles[n - 2] : last;
    const up = last.c >= prev.c;
    const y = this.paneY(main, price);
    if (y < 0 || y > main.height) return;
    const color = this.candleColors(up).body;
    if (this.opts.showPriceLine) {
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
    }
    if (this.opts.showLastPriceLabel) {
      this.axisLabel(ctx, this.fmtAxis(main, price), y, color, "#fff");
      if (this.opts.showSymbolLabel) {
        const h = Math.max(18, this.opts.scaleFontSize + 7);
        this.axisLabel(ctx, this.opts.scaleSymbol || this.opts.symbolLabel, y - h - 1, this.opts.theme.labelBg, this.opts.theme.labelText, main);
      }
    }
  }

  private drawSeriesAxisLabels(ctx: CanvasRenderingContext2D) {
    const n = this.candles.length;
    if (n === 0) return;
    for (const pane of this.panes) {
      if (pane.height <= 0) continue;
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
    const fs = this.opts.scaleFontSize;
    ctx.font = `600 ${fs}px ${this.opts.fontFamily}`;
    const h = Math.max(18, fs + 7);
    const lo = pane ? pane.top : 0;
    const hi = pane ? pane.top + pane.height : this.plotH();
    const top = Math.max(lo, Math.min(hi - h, y - h / 2));
    const x0 = this.axisEdge();
    ctx.fillStyle = bg;
    ctx.fillRect(x0, top, this.axisW, h);
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x0 + 8, top + h / 2 + 0.5);
    ctx.restore();
  }

  /* ───────────── drawing: overlay layer (crosshair + legend) ───────────── */

  private drawOver() {
    const ctx = this.octx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.bars.length === 0) return;
    ctx.save();
    ctx.translate(this.plotX(), 0);
    this.drawOverPlot(ctx);
    ctx.restore();
  }

  private drawCountdown(ctx: CanvasRenderingContext2D) {
    if (!this.opts.showCountdown) return;
    const n = this.candles.length;
    const price = this.lastPriceValue();
    if (n === 0 || price === null) return;
    const main = this.panes[0];
    const y = this.paneY(main, price);
    if (y < 0 || y > main.height) return;
    const last = this.candles[n - 1];
    let end = last.t + this.opts.intervalMs;
    if (this.opts.intervalMs >= 28 * 86_400_000) {
      const d = new Date(last.t);
      end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    }
    const rem = end - (Date.now() + this.opts.clockOffsetMs);
    if (rem <= 0) return;
    const secs = Math.floor(rem / 1000);
    const hh = Math.floor(secs / 3600);
    const p = (v: number) => String(v).padStart(2, "0");
    const text = `${p(hh)}:${p(Math.floor((secs % 3600) / 60))}:${p(secs % 60)}`;
    const h = Math.max(18, this.opts.scaleFontSize + 7);
    const th = this.opts.theme;
    this.axisLabel(ctx, text, y + h, th.labelBg, th.labelText, main);
  }

  private drawOverPlot(ctx: CanvasRenderingContext2D) {
    const th = this.opts.theme;
    const n = this.bars.length;
    const plotW = this.plotW();
    const plotH = this.plotH();

    const hv = this.hover;
    let index = n - 1;
    if (hv) index = Math.max(0, Math.min(n - 1, hv.index));

    // tell linked charts where the crosshair is
    if (this.onCrosshairMove) {
      const ct = hv && hv.x >= 0 && hv.x <= plotW && hv.y >= 0 && hv.y <= plotH ? this.indexToTime(hv.index) : null;
      if (ct !== this.lastCrossT) {
        this.lastCrossT = ct;
        this.onCrosshairMove(ct);
      }
    }

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
    this.drawCountdown(ctx);

    if (!hv || hv.x < 0 || hv.x > plotW || hv.y < 0 || hv.y > plotH) {
      if (this.externalT !== null) this.drawExternalCrosshair(ctx);
      return;
    }
    const ch = this.opts.crosshair;

    const cx = this.snap(this.indexToX(hv.index));
    ctx.save();
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = ch.width;
    ctx.setLineDash(ch.style === "solid" ? [] : ch.style === "dotted" ? [1.5, 3] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, plotH);
    const cy = this.snap(hv.y);
    ctx.moveTo(0, cy);
    ctx.lineTo(plotW, cy);
    ctx.stroke();
    ctx.restore();

    if (this.opts.chartType === "footprint" && hv.pane?.id === "main") this.drawFootprintTip(ctx, hv);

    // price label
    if (hv.pane && ch.priceLabel && hv.pane.height > 0) {
      const price = this.paneP(hv.pane, hv.y - hv.pane.top);
      this.axisLabel(ctx, this.fmtAxis(hv.pane, price), hv.y, th.labelBg, th.labelText);
    }

    // time label
    if (ch.timeLabel) {
      const t = this.indexToTime(hv.index);
      const intraday = this.opts.intervalMs < 86_400_000;
      const text = formatCrosshairTime(t, this.shiftFor(t), this.opts.locale, intraday);
      ctx.save();
      ctx.font = `600 ${this.opts.scaleFontSize}px ${this.opts.fontFamily}`;
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
  }

  /** Tooltip with the numbers of the cell under the pointer (footprint). */
  private drawFootprintTip(ctx: CanvasRenderingContext2D, hv: { x: number; y: number; index: number; pane: Pane | null }) {
    const f = this.fpFrame;
    if (!f.cells || !hv.pane) return;
    const idx = Math.max(0, Math.min(this.bars.length - 1, hv.index));
    const price = this.paneP(hv.pane, hv.y - hv.pane.top);
    const host = this.footprintHost();
    const tip = footprintTip(host, idx, price, f.step);
    if (!tip) return;
    const L = flowLabels(this.opts.locale);
    const p = (v: number) => formatPrice(v, this.precision, this.opts.locale);
    const d = tip.ask - tip.bid;
    const bd = tip.barAsk - tip.barBid;
    const lines: [string, string][] = [
      [`${L.price} ${p(tip.lo)} – ${p(tip.hi)}`, this.opts.theme.text],
      [`Bid ${fmtQty(tip.bid)}  ×  Ask ${fmtQty(tip.ask)}`, this.opts.theme.text],
      [`${L.delta} ${d > 0 ? "+" : ""}${fmtQty(d)}   ${L.vol} ${fmtQty(tip.bid + tip.ask)}`, d >= 0 ? this.candleColors(true).body : this.candleColors(false).body],
      [`Σ ${fmtQty(tip.barBid + tip.barAsk)}   Δ ${bd > 0 ? "+" : ""}${fmtQty(bd)}   POC ${p(tip.poc)}`, this.opts.theme.textMuted],
    ];
    if (!tip.real) lines.push([L.approx, "#f5a623"]);
    ctx.save();
    ctx.font = `12px ${this.opts.fontFamily}`;
    let w = 0;
    for (const l of lines) w = Math.max(w, ctx.measureText(l[0]).width);
    w += 16;
    const h = lines.length * 16 + 10;
    const plotW = this.plotW();
    let x = hv.x + 16;
    if (x + w > plotW - 4) x = hv.x - w - 16;
    let y = hv.y + 14;
    if (y + h > this.plotH() - 4) y = hv.y - h - 10;
    x = Math.max(4, x);
    y = Math.max(4, y);
    ctx.fillStyle = this.opts.theme.labelBg;
    ctx.globalAlpha = 0.94;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 5);
    else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    lines.forEach((l, k) => {
      ctx.fillStyle = l[1] === this.opts.theme.text || l[1] === this.opts.theme.textMuted ? this.opts.theme.labelText : l[1];
      ctx.globalAlpha = l[1] === this.opts.theme.textMuted ? 0.75 : 1;
      ctx.fillText(l[0], x + 8, y + 6 + k * 16);
    });
    ctx.restore();
  }

  private drawExternalCrosshair(ctx: CanvasRenderingContext2D) {
    const t = this.externalT;
    if (t === null) return;
    const th = this.opts.theme;
    const ch = this.opts.crosshair;
    const plotW = this.plotW();
    const plotH = this.plotH();
    const x = this.indexToX(this.timeToIndex(t));
    if (x < 0 || x > plotW) return;
    const cx = this.snap(x);
    ctx.save();
    ctx.strokeStyle = th.crosshair;
    ctx.lineWidth = ch.width;
    ctx.setLineDash(ch.style === "solid" ? [] : ch.style === "dotted" ? [1.5, 3] : [4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, plotH);
    ctx.stroke();
    ctx.restore();
    if (ch.timeLabel) {
      const intraday = this.opts.intervalMs < 86_400_000;
      const text = formatCrosshairTime(t, this.shiftFor(t), this.opts.locale, intraday);
      ctx.save();
      ctx.font = `600 ${this.opts.scaleFontSize}px ${this.opts.fontFamily}`;
      const w = ctx.measureText(text).width + 16;
      const lx = Math.max(0, Math.min(plotW - w, cx - w / 2));
      ctx.fillStyle = th.labelBg;
      ctx.fillRect(lx, plotH, w, TIME_AXIS_H - 4);
      ctx.fillStyle = th.labelText;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, lx + w / 2, plotH + (TIME_AXIS_H - 4) / 2 + 0.5);
      ctx.restore();
    }
  }

  private drawLegend(ctx: CanvasRenderingContext2D, pane: Pane, index: number, isLast: boolean) {
    if (pane.height <= 0) return;
    const th = this.opts.theme;
    const st = this.opts.status;
    const c = this.bars[index];
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
    let ly = y;
    if (pane.id === "main") {
      let cy = y;
      if (st.symbol) {
        put(`${this.opts.symbolLabel}${this.opts.intervalLabel ? " · " + this.opts.intervalLabel : ""}`, th.text, 700, 13);
        cy += 18;
      }
      const prev = index > 0 ? this.bars[index - 1] : c;
      const up = c.c >= prev.c;
      const col = (up ? this.candleColors(true) : this.candleColors(false)).body;
      const p = (v: number) => formatPrice(v, this.precision, this.opts.locale);
      const showVol = st.volume && this.opts.showVolume;
      if (st.ohlc || st.barChange || st.change || showVol) {
        x = 10;
        ctx.font = `12px ${this.opts.fontFamily}`;
        const put2 = (label: string, val: string) => {
          ctx.font = `12px ${this.opts.fontFamily}`;
          ctx.fillStyle = th.textMuted;
          ctx.fillText(label, x, cy);
          x += ctx.measureText(label).width + 3;
          ctx.fillStyle = col;
          ctx.fillText(val, x, cy);
          x += ctx.measureText(val).width + 9;
        };
        if (st.ohlc) {
          put2("O", p(c.o));
          put2("H", p(c.h));
          put2("L", p(c.l));
          put2("C", p(c.c));
        }
        if (st.barChange || st.change) {
          const diff = c.c - prev.c;
          const pct = prev.c ? (diff / prev.c) * 100 : 0;
          const sign = diff >= 0 ? "+" : "";
          ctx.fillStyle = col;
          const parts: string[] = [];
          if (st.barChange) parts.push(`${sign}${formatPrice(diff, this.precision, this.opts.locale)}`);
          if (st.change) parts.push(st.barChange ? `(${sign}${pct.toFixed(2)}%)` : `${sign}${pct.toFixed(2)}%`);
          const chg = parts.join(" ");
          ctx.font = `12px ${this.opts.fontFamily}`;
          ctx.fillText(chg, x, cy);
          x += ctx.measureText(chg).width + 12;
        }
        if (showVol) {
          ctx.fillStyle = th.textMuted;
          ctx.fillText("Vol", x, cy);
          x += ctx.measureText("Vol").width + 3;
          ctx.fillStyle = col;
          ctx.fillText(formatVolume(c.v, this.opts.locale), x, cy);
        }
        cy += 18;
      }
      void isLast;
      ly = cy;
      this.statusBottom = cy - pane.top;
    }
    // series legends (indicators)
    if (!this.transformed() && (st.indTitles || st.indValues)) {
      for (const s of pane.series) {
        let items: LegendItem[] | undefined = s.legend?.(this.candles, index);
        if (!items || items.length === 0) continue;
        if (!st.indTitles) items = items.slice(1).length ? items.slice(1) : items;
        else if (!st.indValues) items = items.slice(0, 1);
        let lx = 10;
        ctx.font = `12px ${this.opts.fontFamily}`;
        for (const it of items) {
          ctx.fillStyle = it.color;
          ctx.fillText(it.text, lx, ly);
          lx += ctx.measureText(it.text).width + 10;
        }
        ly += 16;
      }
    }
    ctx.restore();
  }

  /* ───────────── interaction ───────────── */

  private onContextMenu = (e: MouseEvent) => {
    if (!this.onPriceAxisMenu) return;
    const { x, y } = this.local(e);
    const { region, pane } = this.regionAt(x, y);
    if (region !== "priceAxis") return;
    e.preventDefault();
    e.stopPropagation();
    this.onPriceAxisMenu({ clientX: e.clientX, clientY: e.clientY, paneId: pane?.id ?? "main" });
  };

  private bindEvents() {
    this.over.addEventListener("contextmenu", this.onContextMenu);
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
    // plot coordinates: with the price scale on the left the plot starts to the right of it
    return { x: e.clientX - r.left - this.plotX(), y: e.clientY - r.top };
  }

  private regionAt(x: number, y: number): { region: Region; pane: Pane | null } {
    const plotW = this.plotW();
    const plotH = this.plotH();
    if (y >= plotH) return { region: "timeAxis", pane: null };
    let pane: Pane | null = null;
    for (const p of this.panes) if (p.height > 0 && y >= p.top && y <= p.top + p.height) pane = p;
    if (this.opts.scaleSide === "left" ? x < 0 : x >= plotW) return { region: "priceAxis", pane };
    for (let i = 1; i < this.panes.length; i++) {
      if (this.panes[i].height > 0 && Math.abs(y - this.panes[i].top) <= 4) return { region: "separator", pane: this.panes[i] };
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

  /** True when y (plot coordinates) is on the draggable base level of the baseline chart. */
  private nearBaseline(y: number): boolean {
    if (this.opts.chartType !== "baseline") return false;
    const main = this.panes[0];
    const yb = main.top + main.height * (1 - this.opts.baselinePercent / 100);
    return Math.abs(y - yb) <= 5;
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

    // overlay layers get the first chance to take the gesture (mouse, pen and touch alike)
    if (this.layers.length) {
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
    let kind: "pan" | "priceAxis" | "timeAxis" | "separator" | "baseline" =
      region === "priceAxis" ? "priceAxis" : region === "timeAxis" ? "timeAxis" : region === "separator" ? "separator" : "pan";
    if (kind === "pan" && e.pointerType !== "touch" && this.nearBaseline(y)) kind = "baseline";
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
      const bs = Math.max(MIN_BS, Math.min(this.maxBs(), this.pinch.spacing * (dist / this.pinch.dist)));
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
      if (region === "plot" && this.nearBaseline(y)) this.over.style.cursor = "ns-resize";
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
      if (Math.abs(dy) > 0 && pane.height > 0 && !this.opts.lockScale) {
        if (Math.abs(y - d.startY) > 4 || pane.manual) {
          this.shiftPaneRange(pane, dy);
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
      if (this.opts.lockScale) return;
      this.zoomPaneRange(pane, Math.exp(dy * 0.006));
      if (!pane.manual) {
        pane.manual = true;
        if (pane.id === "main") {
          this.opts.autoScale = false;
          this.onAutoScaleChange?.(false);
        }
      }
      this.invalidate();
    } else if (d.kind === "timeAxis") {
      const bs = Math.max(MIN_BS, Math.min(this.maxBs(), this.barSpacing * Math.exp(dx * 0.006)));
      this.barSpacing = this.targetSpacing = bs;
      this.zoomAnchor = null;
      this.invalidate();
    } else if (d.kind === "baseline") {
      const main = this.panes[0];
      const pct = Math.max(5, Math.min(95, (1 - (y - main.top) / (main.height || 1)) * 100));
      this.opts.baselinePercent = pct;
      this.onBaselineChange?.(pct);
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
      if (this.opts.lockScale) return;
      this.zoomPaneRange(pane, Math.exp(dy * 0.0012));
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
    this.targetSpacing = Math.max(MIN_BS, Math.min(this.maxBs(), this.targetSpacing * factor));
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
