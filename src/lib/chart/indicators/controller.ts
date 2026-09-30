import type { ChartEngine } from "../engine";
import type { IndicatorInstance, IndicatorsControllerLike, IndicatorStyle, ParamValue } from "../contracts";
import { defaultParams, getIndicatorDef, sanitizeParams } from "./registry";
import type { IndicatorDef, LineStyleName, Params, PlotShape } from "./registry";
import { IndicatorSeries } from "./series";
import type { LegendParts } from "./series";
import { cloneStyle, sanitizeStyle, tfGroupOf } from "./style";

interface Item {
  inst: IndicatorInstance;
  def: IndicatorDef;
  series: IndicatorSeries;
  /** Pane the series is currently mounted in. */
  pane: string | null;
}

const DEFAULT_PANE_RATIO = 0.18;

/* What the settings dialog needs to know about the plots of an indicator (from the un-styled result). */
export interface PlotDesc {
  key: string;
  shape: PlotShape;
  color: string;
  width: number;
  lineStyle: LineStyleName;
  /** Colours change per bar: the dialog edits `colorParams` instead of a single colour. */
  perBar: boolean;
  colorParams?: string[];
  priceLine: boolean;
  lastValue: boolean;
  legendValue: boolean;
}
export interface FillDesc { index: number; name: string; color: string }
export interface LevelDesc { index: number; name: string; value: number; color: string; width: number; lineStyle: LineStyleName }
export interface StyleDesc {
  plots: PlotDesc[];
  fills: FillDesc[];
  levels: LevelDesc[];
  band: { color: string } | null;
}

export interface IndicatorLegendInfo extends LegendParts {
  uid: string;
  visible: boolean;
  /** Visible, but switched off for the current timeframe. */
  tfHidden: boolean;
  /** Pane the indicator is drawn in: "main" or the id of its own pane. */
  pane: string;
}

export class IndicatorsController implements IndicatorsControllerLike {
  private engine: ChartEngine | null = null;
  private items: Item[] = [];
  private listeners = new Set<() => void>();
  private dataListeners = new Set<() => void>();
  private seq = 0;
  private externalLegend = false;
  /** Stable snapshot handed out by list(); rebuilt only when something changes (friendly to useSyncExternalStore). */
  private snapshot: IndicatorInstance[] = [];

  /* ───────────── engine binding ───────────── */

  attach(engine: ChartEngine): void {
    if (this.engine && this.engine !== engine) this.unmountAll();
    this.engine = engine;
    for (const it of this.items) this.mount(it);
    this.refresh();
  }

  detach(): void {
    this.unmountAll();
    this.engine = null;
  }

  private paneId(it: Item): string {
    return `ind-${it.inst.uid}`;
  }

  /** True when the indicator sits in a pane of its own (by definition or because the user moved it there). */
  private isOwn(it: Item): boolean {
    if (it.def.pane === "own" || it.def.fixedPane) return it.def.pane === "own";
    return it.inst.style?.pane === "own";
  }

  private mount(it: Item) {
    const eng = this.engine;
    if (!eng) return;
    const own = this.isOwn(it);
    it.series.setOnMain(!own);
    if (own) {
      const pid = this.paneId(it);
      if (!eng.hasPane(pid)) eng.addPane(pid, it.def.paneRatio ?? DEFAULT_PANE_RATIO);
      eng.addSeries(it.series, pid);
      it.pane = pid;
    } else {
      eng.addSeries(it.series, "main");
      it.pane = "main";
    }
  }

  private unmount(it: Item) {
    const eng = this.engine;
    if (!eng) return;
    eng.removeSeries(it.inst.uid);
    if (it.pane && it.pane !== "main") eng.removePane(it.pane);
    it.pane = null;
  }

  private unmountAll() {
    for (const it of this.items) this.unmount(it);
  }

  /* ───────────── state ───────────── */

  private rebuildSnapshot() {
    this.snapshot = this.items.map((it) => {
      const inst: IndicatorInstance = { uid: it.inst.uid, id: it.inst.id, params: { ...it.inst.params }, visible: it.inst.visible };
      if (it.inst.style) inst.style = cloneStyle(it.inst.style);
      return inst;
    });
  }

  private emit() {
    this.rebuildSnapshot();
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {
        /* a broken listener must not block the others */
      }
    }
    this.emitData();
  }

  private emitData() {
    for (const cb of Array.from(this.dataListeners)) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  list(): IndicatorInstance[] {
    return this.snapshot;
  }

  private find(uid: string): Item | undefined {
    return this.items.find((x) => x.inst.uid === uid);
  }

  private nextUid(id: string): string {
    let uid: string;
    do {
      uid = `${id}-${++this.seq}`;
    } while (this.items.some((it) => it.inst.uid === uid));
    return uid;
  }

  private create(id: string, params: Record<string, ParamValue> | undefined, visible: boolean, style?: IndicatorStyle): Item | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const merged: Params = sanitizeParams(def, { ...defaultParams(def), ...(params ?? {}) });
    const uid = this.nextUid(id);
    const eng = this.engine;
    const st = sanitizeStyle(style);
    const series = new IndicatorSeries(
      uid,
      def,
      merged,
      {
        getCandles: () => (this.engine ? this.engine.getCandles() : []),
        getPrecision: () => (this.engine ? this.engine.getPrecision() : 2),
        getIntervalMs: () => (this.engine ? this.engine.getIntervalMs() : 0),
      },
      st,
    );
    series.visible = visible;
    series.externalLegend = this.externalLegend;
    const inst: IndicatorInstance = { uid, id, params: merged, visible };
    if (st) inst.style = st;
    const item: Item = { inst, def, series, pane: null };
    this.items.push(item);
    if (eng) this.mount(item);
    return item;
  }

  add(id: string, params?: Record<string, ParamValue>): string {
    const item = this.create(id, params, true);
    if (!item) return "";
    this.emit();
    this.engine?.requestRedraw();
    return item.inst.uid;
  }

  remove(uid: string): void {
    const idx = this.items.findIndex((it) => it.inst.uid === uid);
    if (idx < 0) return;
    const [it] = this.items.splice(idx, 1);
    this.unmount(it);
    this.emit();
    this.engine?.requestRedraw();
  }

  update(uid: string, patch: { params?: Record<string, ParamValue>; visible?: boolean; style?: IndicatorStyle | null }): void {
    const it = this.find(uid);
    if (!it) return;
    if (patch.params) {
      const next = sanitizeParams(it.def, { ...it.inst.params, ...patch.params });
      it.inst.params = next;
      it.series.setParams(next);
    }
    if (typeof patch.visible === "boolean") {
      it.inst.visible = patch.visible;
      it.series.visible = patch.visible;
    }
    if (patch.style !== undefined) {
      const st = patch.style ? sanitizeStyle(patch.style) : undefined;
      if (st) it.inst.style = st;
      else delete it.inst.style;
      it.series.setStyle(st);
      // the pane may have changed
      const wantOwn = this.isOwn(it);
      const isOwnNow = it.pane !== null && it.pane !== "main";
      if (this.engine && it.pane !== null && wantOwn !== isOwnNow) {
        this.unmount(it);
        this.mount(it);
      }
    }
    this.emit();
    this.engine?.requestRedraw();
  }

  /** Copy with the same params and style; returns the new uid. */
  clone(uid: string): string {
    const it = this.find(uid);
    if (!it) return "";
    const c = this.create(it.inst.id, it.inst.params, it.inst.visible, cloneStyle(it.inst.style));
    if (!c) return "";
    this.emit();
    this.engine?.requestRedraw();
    return c.inst.uid;
  }

  /** Whether the indicator may switch between the main pane and an own pane. */
  canMove(uid: string): boolean {
    const it = this.find(uid);
    return !!it && it.def.pane === "overlay" && !it.def.fixedPane;
  }

  /** Moves an overlay indicator to a new pane of its own, or back to the main pane. */
  move(uid: string, to: "main" | "own"): void {
    const it = this.find(uid);
    if (!it || !this.canMove(uid)) return;
    const st: IndicatorStyle = { ...(it.inst.style ?? {}) };
    if (to === "own") st.pane = "own";
    else delete st.pane;
    this.update(uid, { style: st });
  }

  /** Pane the indicator is drawn in: "main" or the id of its own pane. */
  paneOf(uid: string): string {
    const it = this.find(uid);
    if (!it) return "main";
    return this.isOwn(it) ? this.paneId(it) : "main";
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Fires when values may have changed (candles recomputed) as well as after any structural change. */
  subscribeData(cb: () => void): () => void {
    this.dataListeners.add(cb);
    return () => {
      this.dataListeners.delete(cb);
    };
  }

  /** The React legend overlay takes over the indicator lines of the canvas legend. */
  setExternalLegend(on: boolean): void {
    this.externalLegend = on;
    for (const it of this.items) it.series.externalLegend = on;
    this.engine?.requestRedraw();
  }

  /** Legend data for one indicator at a bar index. Null when the instance does not exist. */
  legendInfo(uid: string, index: number): IndicatorLegendInfo | null {
    const it = this.find(uid);
    if (!it) return null;
    const candles = this.engine ? this.engine.getCandles() : [];
    const parts = it.series.legendParts(candles, index);
    let tfHidden = false;
    const tf = it.inst.style?.tf;
    if (tf && this.engine) tfHidden = tf[tfGroupOf(this.engine.getIntervalMs())] === false;
    return { ...parts, uid, visible: it.inst.visible, tfHidden, pane: this.paneOf(uid) };
  }

  /** Un-styled plot / fill / level description for the Style tab. */
  describe(uid: string): StyleDesc {
    const out: StyleDesc = { plots: [], fills: [], levels: [], band: null };
    const it = this.find(uid);
    if (!it) return out;
    if (this.engine) it.series.ensure(this.engine.getCandles());
    const r = it.series.getRaw();
    if (!r) return out;
    for (const p of r.plots) {
      const shape: PlotShape = p.shape ?? (p.kind === "hist" ? "columns" : p.kind === "dots" ? "circles" : "line");
      out.plots.push({
        key: p.key,
        shape,
        color: p.color,
        width: p.width ?? 1.6,
        lineStyle: p.lineStyle ?? (p.dashed ? "dashed" : "solid"),
        perBar: !!p.colors,
        colorParams: p.colorParams,
        priceLine: !!p.priceLine,
        lastValue: p.flag ?? (shape !== "histogram" && shape !== "columns" && !p.volBand),
        legendValue: p.legend !== false,
      });
    }
    (r.fills ?? []).forEach((f, i) => out.fills.push({ index: i, name: f.name ?? `#${i + 1}`, color: f.color }));
    (r.levels ?? []).forEach((l, i) =>
      out.levels.push({
        index: i,
        name: l.name ?? l.label ?? "ind2.lvl.level",
        value: l.value,
        color: l.color,
        width: l.width ?? 1,
        lineStyle: l.lineStyle ?? (l.dashed ? "dashed" : "solid"),
      }),
    );
    if (r.bands && r.bands.length) out.band = { color: r.bands[0].color };
    return out;
  }

  serialize(): string {
    return JSON.stringify(
      this.items.map((it) => {
        const o: { id: string; params: Params; visible: boolean; style?: IndicatorStyle } = { id: it.inst.id, params: it.inst.params, visible: it.inst.visible };
        if (it.inst.style) o.style = it.inst.style;
        return o;
      }),
    );
  }

  restore(json: string): void {
    let arr: unknown;
    try {
      arr = JSON.parse(json);
    } catch {
      return;
    }
    if (!Array.isArray(arr)) return;
    for (const it of this.items) this.unmount(it);
    this.items = [];
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as { id?: unknown; params?: unknown; visible?: unknown; style?: unknown };
      if (typeof r.id !== "string") continue;
      const params = r.params && typeof r.params === "object" ? (r.params as Record<string, ParamValue>) : undefined;
      this.create(r.id, params, r.visible !== false, sanitizeStyle(r.style));
    }
    this.emit();
    this.engine?.requestRedraw();
  }

  refresh(): void {
    const eng = this.engine;
    if (!eng) return;
    const candles = eng.getCandles();
    let changed = false;
    for (const it of this.items) if (it.series.ensure(candles)) changed = true;
    if (changed) {
      eng.requestRedraw();
      this.emitData();
    }
  }
}
