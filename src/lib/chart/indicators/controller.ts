import type { ChartEngine } from "../engine";
import type { IndicatorInstance, IndicatorsControllerLike, IndicatorStyle, ParamValue } from "../contracts";
import { defaultParams, getIndicatorDef, sanitizeParams } from "./registry";
import type { IndicatorDef, LineStyleName, Params, PlotShape } from "./registry";
import { IndicatorSeries } from "./series";
import type { LegendParts } from "./series";
import { cloneStyle, sanitizeStyle, tfGroupOf } from "./style";
import { parseRatio, resolveRatios } from "../pane-layout";
import { DEFAULT_WORKSPACE, MAIN_ID, MAX_CHARTS, MAX_WINDOWS, WIN_PANE, WIN_PREFIX, addWindow as wsAdd, chartCount, chartIds, closeWindow as wsClose, dependents, extraIds, hasIndWindow, hasWindow, indIds, isDefault, makeChart as wsMakeChart, makeIndicator as wsMakeIndicator, migrateTree, parseLayout, parseWorkspace, raise as wsRaise, resetKind as wsResetKind, serializeWorkspace, setLink as wsSetLink, setRect as wsSetRect, setSymbol as wsSetSymbol, shrink as wsShrink, windowNumber } from "../windows-layout";
import type { Rect, Workspace } from "../windows-layout";
import { onScriptResult } from "../scripts/compute";
import { subscribeScripts } from "../scripts/store";
import type { ScriptEvent } from "../scripts/store";

interface Item {
  inst: IndicatorInstance;
  def: IndicatorDef;
  series: IndicatorSeries;
  /** Pane the series is currently mounted in: "main", the id of its own pane under the price chart, or WIN_PREFIX + window id. Null: not mounted. */
  pane: string | null;
  /** The engine that draws the series (the price chart or an extra window). */
  host: ChartEngine | null;
  /** Extra window the user put the indicator in (stored; it only counts while that window exists and windows are on). */
  win?: string;
  /** Share of the plot height of the own pane: `d` wide chart, `m` narrow (phone) chart. Undefined: never sized (the default look). */
  ratio: { d?: number; m?: number };
}

const DEFAULT_PANE_RATIO = 0.18;

/** Indicators that are painted by a layer of the price chart (not by their series): they cannot live in another window. */
const LAYER_DRAWN = new Set(["avwap", "vprofile_pro"]);

/**
 * An indicator can live in an extra window when its series draws it: an oscillator gets the pane of the window, one that stands on the price
 * (averages, patterns, waves, zones ...) gets a price pane with the candles of the chart the window follows. Not the ones drawn by a layer of the
 * price chart (their state - anchors, handles - belongs to the price chart).
 */
const windowable = (def: IndicatorDef): boolean => !LAYER_DRAWN.has(def.id);

/** Whether an indicator may be put in an extra window (the catalogue says so in its rows). */
export function windowableId(id: string): boolean {
  const def = getIndicatorDef(id);
  return !!def && windowable(def);
}

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
  /** Subscriptions to the user-script registry / worker results (only while attached to an engine). */
  private scriptOffs: (() => void)[] = [];
  /** True while many items are built at once (restore / attach): the pane heights are resolved once at the end. */
  private bulk = false;
  /** Workspace of floating windows (null: the classic single chart). The engines of the extra windows are registered by their tiles (attachWindow). */
  private ws: Workspace | null = null;
  /** Engines of the chart windows (the price chart is this.engine): an indicator window follows the engine of its chart. Set by the charts themselves. */
  private chartEngines = new Map<string, ChartEngine>();
  private chartOffs = new Map<string, () => void>();
  /** Changes with every engine that comes or goes, so React sees it. */
  private rev = 0;
  private winSnap: { ws: Workspace; rev: number; max: string | null } = { ws: DEFAULT_WORKSPACE, rev: 0, max: null };
  /** The window that fills the whole area right now (this session only, never stored). */
  private maximized: string | null = null;
  /** The chart the user clicked last (the default link of a new indicator window). */
  private focusChart = MAIN_ID;
  private noticeListeners = new Set<(n: number) => void>();
  private dataRaf = 0;
  private winEngines = new Map<string, ChartEngine>();
  /** The chart area is wide enough for windows (the host reports it); a narrow one shows the one stack of panes as before. */
  private winAvail = false;
  /** New indicators from the catalog go to this window (set while the catalog is opened from a window). */
  private addTarget: string | null = null;
  /** Listeners of the changes that are saved (the others also fire for the way the chart is laid out right now). */
  private savedListeners = new Set<() => void>();
  private layoutListeners = new Set<() => void>();

  /* ───────────── engine binding ───────────── */

  attach(engine: ChartEngine): void {
    if (this.engine && this.engine !== engine) this.unmountAll();
    this.engine = engine;
    this.rev++;
    engine.onPanesResized = (ratios) => this.onPanesResized(ratios);
    engine.onCompactChange = () => this.relayout();
    this.bulk = true;
    for (const it of this.items) this.mount(it);
    this.bulk = false;
    this.relayout();
    this.listenScripts();
    this.syncScripts({ type: "list" });
    this.refresh();
  }

  detach(): void {
    for (const off of this.scriptOffs) off();
    this.scriptOffs = [];
    this.unmountAll();
    if (this.engine) {
      this.engine.onPanesResized = null;
      this.engine.onCompactChange = null;
    }
    this.engine = null;
    this.rev++;
  }

  /* ───────────── pane heights ───────────── */

  private sizeKey(): "d" | "m" {
    return this.engine?.isCompact() ? "m" : "d";
  }

  /** Puts every own pane at its stored share (a pane that was never sized is added the way a new one is: the others give it room in proportion). */
  private relayout(): void {
    const eng = this.engine;
    if (!eng) return;
    const own = this.items.filter((it) => this.isMainOwn(it));
    if (own.length === 0) return;
    const kind = this.sizeKey();
    const alt = kind === "m" ? "d" : "m";
    const out = resolveRatios(own.map((it) => ({ saved: it.ratio[kind] ?? it.ratio[alt], weight: it.def.paneRatio ?? DEFAULT_PANE_RATIO })));
    const map: Record<string, number> = {};
    own.forEach((it, i) => {
      it.ratio[kind] = out[i];
      map[it.pane as string] = out[i];
    });
    eng.setPaneRatios(map);
  }

  /** The user dragged a divider: remember the heights (they are saved with the indicators). */
  private onPanesResized(ratios: Record<string, number>): void {
    const kind = this.sizeKey();
    let any = false;
    for (const it of this.items) {
      const r = it.pane ? ratios[it.pane] : undefined;
      if (typeof r === "number" && isFinite(r) && r > 0) {
        it.ratio[kind] = r;
        any = true;
      }
    }
    if (any) this.emit();
  }

  /* ───────────── user scripts ───────────── */

  private listenScripts() {
    for (const off of this.scriptOffs) off();
    this.scriptOffs = [
      subscribeScripts((ev) => this.syncScripts(ev)),
      onScriptResult((scriptId) => {
        let any = false;
        for (const it of this.items) {
          if (it.inst.id === scriptId) {
            it.series.invalidate();
            any = true;
          }
        }
        if (any) this.refresh();
      }),
    ];
  }

  /** A script changed (code, declarations, list): re-sanitize the params of its instances, move panes, recompute. */
  private syncScripts(ev: ScriptEvent) {
    let touched = false;
    for (const it of this.items) {
      if (!it.def.script || (ev.id && it.inst.id !== ev.id)) continue;
      touched = true;
      let cur = it.inst.params;
      if (ev.defaultChanges) {
        cur = { ...cur };
        for (const [k, [was, now]] of Object.entries(ev.defaultChanges)) if (cur[k] === was) cur[k] = now;
      }
      const next = sanitizeParams(it.def, cur);
      if (JSON.stringify(next) !== JSON.stringify(it.inst.params)) {
        it.inst.params = next;
        it.series.setParams(next);
      } else {
        it.series.invalidate();
      }
      if (this.engine && it.pane !== null && it.pane !== this.targetPane(it)) {
        this.unmount(it);
        this.mount(it);
      }
    }
    if (!touched) return;
    this.emit();
    this.redraw();
    this.refresh();
  }

  private paneId(it: Item): string {
    return `ind-${it.inst.uid}`;
  }

  /** True when the indicator sits in a pane of its own (by definition or because the user moved it there). */
  private isOwn(it: Item): boolean {
    if (it.def.pane === "own" || it.def.fixedPane) return it.def.pane === "own";
    return it.inst.style?.pane === "own";
  }

  /** The engine whose bars the indicator is computed on: that of the chart its window is linked to, else the price chart's. */
  private dataOf(it?: Item): ChartEngine | null {
    if (it) {
      const w = this.winOf(it);
      if (w) return this.chartEngine(this.ws?.wins.find((x) => x.id === w)?.link ?? MAIN_ID);
    }
    return this.engine;
  }

  /** Extra window the indicator is drawn in right now, undefined: on the price chart (its pane or an own pane under it). */
  private winOf(it: Item): string | undefined {
    const w = it.win;
    return w && this.winAvail && hasIndWindow(this.ws, w) ? w : undefined;
  }

  /** Where the indicator belongs now: "main", the id of its own pane or WIN_PREFIX + window id. */
  private targetPane(it: Item): string {
    const w = this.winOf(it);
    // in a window: the pane of the oscillators, or the price pane (candles) for what stands on the price (:p)
    if (w) return WIN_PREFIX + w + (this.isOwn(it) ? "" : ":p");
    return this.isOwn(it) ? this.paneId(it) : "main";
  }

  /** Sits in an own pane under the price chart (not in an extra window). */
  private isMainOwn(it: Item): boolean {
    return !!it.pane && it.pane !== "main" && it.host === this.engine;
  }

  private mount(it: Item) {
    const eng = this.engine;
    if (!eng) return;
    const w = this.winOf(it);
    if (w) {
      const onPrice = !this.isOwn(it);
      it.series.setOnMain(onPrice);
      const weng = this.winEngines.get(w);
      // the tile of the window is still being built: attachWindow mounts the indicator
      if (!weng) return;
      weng.addSeries(it.series, onPrice ? "main" : WIN_PANE);
      it.pane = WIN_PREFIX + w + (onPrice ? ":p" : "");
      it.host = weng;
      this.syncWindowPanes(weng);
      return;
    }
    const own = this.isOwn(it);
    it.series.setOnMain(!own);
    it.host = eng;
    if (own) {
      const pid = this.paneId(it);
      if (!eng.hasPane(pid)) eng.addPane(pid, it.def.paneRatio ?? DEFAULT_PANE_RATIO);
      eng.addSeries(it.series, pid);
      it.pane = pid;
      if (!this.bulk) this.relayout();
    } else {
      eng.addSeries(it.series, "main");
      it.pane = "main";
    }
  }

  private unmount(it: Item) {
    const host = it.host;
    if (!host) {
      it.pane = null;
      return;
    }
    host.removeSeries(it.inst.uid);
    if (host === this.engine && it.pane && it.pane !== "main") host.removePane(it.pane);
    it.pane = null;
    it.host = null;
    if (host !== this.engine) this.syncWindowPanes(host);
  }

  /** A window shows the candles (its price pane) while something stands on the price in it. */
  private syncWindowPanes(eng: ChartEngine): void {
    eng.setPriceView(this.items.some((it) => it.host === eng && !!it.pane && it.pane.endsWith(":p")));
  }

  /** The engines of the price chart and of every extra window need a repaint. */
  private redraw() {
    this.engine?.requestRedraw();
    for (const e of this.winEngines.values()) e.requestRedraw();
  }

  /** Puts every indicator where it belongs now (after the layout changed, or windows became available / unavailable). */
  private replace() {
    if (!this.engine) return;
    this.bulk = true;
    for (const it of this.items) {
      if (it.pane !== null && it.pane === this.targetPane(it)) continue;
      this.unmount(it);
      this.mount(it);
    }
    this.bulk = false;
    this.relayout();
    this.redraw();
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

  /** `saved` false: only the way the chart is laid out right now changed, nothing that is stored. */
  private emit(saved = true) {
    this.rebuildSnapshot();
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {
        /* a broken listener must not block the others */
      }
    }
    if (saved) {
      for (const cb of Array.from(this.savedListeners)) {
        try {
          cb();
        } catch {
          /* ignore */
        }
      }
    }
    this.emitLayout();
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

  private create(id: string, params: Record<string, ParamValue> | undefined, visible: boolean, style?: IndicatorStyle, ratio?: { d?: number; m?: number }, win?: string): Item | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const merged: Params = sanitizeParams(def, { ...defaultParams(def), ...(params ?? {}) });
    const uid = this.nextUid(id);
    const eng = this.engine;
    const st = sanitizeStyle(style);
    // an indicator in a window is computed on the bars of the chart that window is linked to (the price chart otherwise)
    const self: { it?: Item } = {};
    const series = new IndicatorSeries(
      uid,
      def,
      merged,
      {
        getCandles: () => this.dataOf(self.it)?.getCandles() ?? [],
        getPrecision: () => this.dataOf(self.it)?.getPrecision() ?? 2,
        getIntervalMs: () => this.dataOf(self.it)?.getIntervalMs() ?? 0,
        getFlow: () => this.dataOf(self.it)?.flow ?? null,
        getAlgo: () => this.dataOf(self.it)?.algo ?? null,
      },
      st,
    );
    series.visible = visible;
    series.externalLegend = this.externalLegend;
    const inst: IndicatorInstance = { uid, id, params: merged, visible };
    if (st) inst.style = st;
    const item: Item = { inst, def, series, pane: null, host: null, ratio: { ...ratio } };
    self.it = item;
    if (win && win !== MAIN_ID && windowable(def) && hasIndWindow(this.ws, win)) item.win = win;
    this.items.push(item);
    if (eng) this.mount(item);
    return item;
  }

  add(id: string, params?: Record<string, ParamValue>): string {
    const target = this.addTarget && hasIndWindow(this.ws, this.addTarget) ? this.addTarget : undefined;
    const item = this.create(id, params, true, undefined, undefined, target);
    if (!item) return "";
    this.emit();
    this.redraw();
    return item.inst.uid;
  }

  remove(uid: string): void {
    const idx = this.items.findIndex((it) => it.inst.uid === uid);
    if (idx < 0) return;
    const [it] = this.items.splice(idx, 1);
    this.unmount(it);
    this.emit();
    this.redraw();
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
      if (this.engine && it.pane !== null && it.pane !== this.targetPane(it)) {
        this.unmount(it);
        this.mount(it);
      }
    }
    this.emit();
    this.redraw();
  }

  /** Copy with the same params and style; returns the new uid. */
  clone(uid: string): string {
    const it = this.find(uid);
    if (!it) return "";
    const c = this.create(it.inst.id, it.inst.params, it.inst.visible, cloneStyle(it.inst.style), undefined, it.win);
    if (!c) return "";
    this.emit();
    this.redraw();
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
    it.win = undefined;
    this.update(uid, { style: st });
  }

  /** Pane the indicator is drawn in: "main" or the id of its own pane. */
  paneOf(uid: string): string {
    const it = this.find(uid);
    if (!it) return "main";
    return this.targetPane(it);
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Fires after a change that is stored (indicators, their settings, the window layout), not when the chart is only laid out differently (a narrow window). */
  subscribeSaved(cb: () => void): () => void {
    this.savedListeners.add(cb);
    return () => {
      this.savedListeners.delete(cb);
    };
  }

  /** Fires when values may have changed (candles recomputed) as well as after any structural change. */
  subscribeData(cb: () => void): () => void {
    this.dataListeners.add(cb);
    return () => {
      this.dataListeners.delete(cb);
    };
  }

  /** Tells the data listeners (React legend) that values changed outside a recompute, e.g. a painter learned the visible range. */
  notifyData(): void {
    this.emitData();
  }

  /** The React legend overlay takes over the indicator lines of the canvas legend. */
  setExternalLegend(on: boolean): void {
    this.externalLegend = on;
    for (const it of this.items) it.series.externalLegend = on;
    this.redraw();
  }

  /** Legend data for one indicator at a bar index. Null when the instance does not exist. */
  legendInfo(uid: string, index: number): IndicatorLegendInfo | null {
    const it = this.find(uid);
    if (!it) return null;
    const data = this.dataOf(it);
    const candles = data ? data.getCandles() : [];
    const parts = it.series.legendParts(candles, index);
    let tfHidden = false;
    const tf = it.inst.style?.tf;
    if (tf && data) tfHidden = tf[tfGroupOf(data.getIntervalMs())] === false;
    return { ...parts, uid, visible: it.inst.visible, tfHidden, pane: this.paneOf(uid) };
  }

  /** Un-styled plot / fill / level description for the Style tab. */
  describe(uid: string): StyleDesc {
    const out: StyleDesc = { plots: [], fills: [], levels: [], band: null };
    const it = this.find(uid);
    if (!it) return out;
    const data = this.dataOf(it);
    if (data) it.series.ensure(data.getCandles());
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
    const out: unknown[] = this.items.map((it) => {
      const o: { id: string; params: Params; visible: boolean; style?: IndicatorStyle; pr?: number; pm?: number; w?: string } = { id: it.inst.id, params: it.inst.params, visible: it.inst.visible };
      if (it.inst.style) o.style = it.inst.style;
      // height of the own pane (share of the plot height), wide and narrow chart separately
      if (it.ratio.d !== undefined) o.pr = Math.round(it.ratio.d * 10000) / 10000;
      if (it.ratio.m !== undefined) o.pm = Math.round(it.ratio.m * 10000) / 10000;
      // extra window (kept also while this chart is too narrow to show windows: a phone must not wipe the desktop layout)
      if (it.win && hasIndWindow(this.ws, it.win)) o.w = it.win;
      return o;
    });
    // the window layout rides in the same list as one more entry without an indicator id (builds without windows skip it)
    // nothing is stored for the default look (the price chart filling the area); an empty workspace (everything closed) is stored
    if (this.ws) out.push({ ws: serializeWorkspace(this.ws) });
    return JSON.stringify(out);
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
    // the window layout first: the indicators that sit in windows are checked against it
    let stored: { ws?: unknown; lay?: unknown } | null = null;
    for (const raw of arr) {
      if (raw && typeof raw === "object" && typeof (raw as { id?: unknown }).id !== "string" && ("ws" in raw || "lay" in raw)) {
        stored = raw as { ws?: unknown; lay?: unknown };
        break;
      }
    }
    // `ws`: floating windows; `lay`: the tiled layout of the first multi-window build, turned into windows in the same places
    this.ws = stored ? (stored.ws !== undefined ? parseWorkspace(stored.ws) : migrateTree(parseLayout(stored.lay))) : null;
    if (this.addTarget && !hasIndWindow(this.ws, this.addTarget)) this.addTarget = null;
    if (this.maximized && !hasWindow(this.eff(), this.maximized)) this.maximized = null;
    this.bulk = true;
    for (const raw of arr) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as { id?: unknown; params?: unknown; visible?: unknown; style?: unknown; pr?: unknown; pm?: unknown; w?: unknown };
      if (typeof r.id !== "string") continue;
      const params = r.params && typeof r.params === "object" ? (r.params as Record<string, ParamValue>) : undefined;
      this.create(r.id, params, r.visible !== false, sanitizeStyle(r.style), { d: parseRatio(r.pr), m: parseRatio(r.pm) }, typeof r.w === "string" ? r.w : undefined);
    }
    this.bulk = false;
    this.relayout();
    this.emit();
    this.redraw();
  }

  /* ───────────── extra windows ───────────── */

  /** The workspace of floating windows (null: the classic chart). A new object after every change. */
  getWorkspace(): Workspace {
    return this.eff();
  }

  /** The workspace as it is: stored, or the default (the price chart filling the area). */
  private eff(): Workspace {
    return this.ws ?? DEFAULT_WORKSPACE;
  }

  /** Title of a window with indicators: their names and the asset of the chart it follows («RSI 14, MACD · PLT»); `empty` when it has none. */
  windowTitle(id: string, empty: string): string {
    const names = this.items.filter((it) => this.winOf(it) === id).map((it) => {
      // the price source is a detail of the legend ("RSI 14 close"), the title of a window is shorter ("RSI 14")
      const title = it.series.title();
      const src = it.inst.params.source;
      return typeof src === "string" && title.endsWith(" " + src) ? title.slice(0, -(src.length + 1)) : title;
    });
    const link = this.eff().wins.find((w) => w.id === id)?.link ?? MAIN_ID;
    const e = this.chartEngine(link);
    const asset = e ? e.opts.scaleSymbol || e.opts.symbolLabel : (this.eff().wins.find((w) => w.id === link)?.tk ?? "");
    return [names.length ? names.join(", ") : empty, asset].filter(Boolean).join(" · ");
  }

  /** Ids of the windows with indicators in creation order (the ones an indicator can be moved to). */
  windowIds(): string[] {
    return indIds(this.ws);
  }

  /** 1-based number of an indicator window ("Window 2"). */
  windowNumber(id: string): number {
    return windowNumber(this.ws, id);
  }

  /** Every extra window, charts included. */
  windowCount(): number {
    return extraIds(this.ws).length;
  }

  /** One more window with a chart of its own may be added. */
  canAddChart(): boolean {
    return extraIds(this.ws).length < MAX_WINDOWS && chartCount(this.ws) < MAX_CHARTS;
  }

  /** One more window may be added. */
  canAddWindow(): boolean {
    return extraIds(this.ws).length < MAX_WINDOWS;
  }

  /** The window is a window with indicators. */
  isIndicatorWindow(id: string): boolean {
    return hasIndWindow(this.ws, id);
  }

  /** The chart area is wide enough for windows (reported by the chart); a narrow one folds them back into the one stack. */
  windowsAvailable(): boolean {
    return this.winAvail;
  }

  /** The windows are on screen right now. */
  windowsOn(): boolean {
    return this.winAvail;
  }

  setWindowsAvailable(on: boolean): void {
    if (on === this.winAvail) return;
    this.winAvail = on;
    this.replace();
    this.emit(false);
  }

  /** The window an indicator is drawn in right now (undefined: on the price chart). */
  windowOf(uid: string): string | undefined {
    const it = this.find(uid);
    return it ? this.winOf(it) : undefined;
  }

  /** Windows that are not empty (their ids). */
  usedWindows(): Set<string> {
    const out = new Set<string>();
    for (const it of this.items) {
      const w = this.winOf(it);
      if (w) out.add(w);
    }
    return out;
  }

  /** The workspace and the engines of its charts as one snapshot (a new object when either changed). */
  getWinState(): { ws: Workspace; rev: number; max: string | null } {
    const ws = this.eff();
    if (this.winSnap.ws !== ws || this.winSnap.rev !== this.rev || this.winSnap.max !== this.maximized) this.winSnap = { ws, rev: this.rev, max: this.maximized };
    return this.winSnap;
  }

  /** «Shrink»: the window becomes a normal window of a quarter of the area (its real rectangle, stored like any move / resize). */
  shrinkWindow(id: string): void {
    const cur = this.eff();
    if (!hasWindow(cur, id)) return;
    const wasMax = this.maximized === id;
    if (wasMax) this.maximized = null;
    const next = wsShrink(cur, id);
    if (next !== cur) {
      this.ws = isDefault(next) ? null : next;
      this.emit();
    } else if (wasMax) this.emitLayout();
  }

  /** The window that fills the whole area (null: none). Session only. */
  maximizedId(): string | null {
    return this.maximized && hasWindow(this.eff(), this.maximized) ? this.maximized : null;
  }

  /** Fills the whole area with a window / puts it back where it was (its stored rectangle is never touched). */
  toggleMaximize(id: string): void {
    if (!hasWindow(this.eff(), id)) return;
    this.maximized = this.maximized === id ? null : id;
    this.emitLayout();
  }

  /** The engine of a chart (the price chart or a chart window), null while it does not exist. */
  chartEngine(id: string): ChartEngine | null {
    return id === MAIN_ID ? this.engine : (this.chartEngines.get(id) ?? null);
  }

  /** A chart window's engine appeared (or went away: null). The indicator windows linked to that chart follow it. */
  setChartEngine(id: string, engine: ChartEngine | null): void {
    this.chartOffs.get(id)?.();
    this.chartOffs.delete(id);
    if (engine) {
      this.chartEngines.set(id, engine);
      // the legend values of a window follow the bars of its chart (repaint of that chart = maybe new numbers)
      this.chartOffs.set(
        id,
        engine.addViewListener(() => {
          if (this.dataRaf || typeof requestAnimationFrame === "undefined" || !this.items.some((it) => this.linkOf(it) === id)) return;
          this.dataRaf = requestAnimationFrame(() => {
            this.dataRaf = 0;
            this.emitData();
          });
        }),
      );
    } else this.chartEngines.delete(id);
    this.rev++;
    this.emitLayout();
  }

  private linkOf(it: Item): string | undefined {
    const w = this.winOf(it);
    return w ? this.ws?.wins.find((x) => x.id === w)?.link : undefined;
  }

  /** The chart the user clicked last: a new window opens linked to it. */
  setFocusChart(id: string): void {
    this.focusChart = chartIds(this.ws).includes(id) ? id : MAIN_ID;
  }

  /** Told when windows were moved to the price chart because their chart went away (the number of windows). */
  subscribeNotice(cb: (n: number) => void): () => void {
    this.noticeListeners.add(cb);
    return () => {
      this.noticeListeners.delete(cb);
    };
  }

  /** Puts a changed workspace in place: indicators that sat in a window that is no longer an indicator window go back to the chart. */
  private setWs(next: Workspace | null, chartGone?: string): void {
    const moved = chartGone && chartGone !== MAIN_ID ? dependents(this.eff(), chartGone).length : 0;
    this.ws = next && !isDefault(next) ? next : null;
    const eff = this.eff();
    if (this.maximized && !hasWindow(eff, this.maximized)) this.maximized = null;
    for (const it of this.items) if (it.win && !hasIndWindow(next, it.win)) it.win = undefined;
    if (this.addTarget && !hasIndWindow(next, this.addTarget)) this.addTarget = null;
    this.replace();
    this.emit();
    if (moved > 0) for (const cb of Array.from(this.noticeListeners)) cb(moved);
  }

  /** Adds a window (the first one switches the workspace on): "new" - the user chooses what it shows; "ind" - an indicator window linked to the chart clicked last. Returns its id, "" when there are too many windows. */
  addWindow(kind: "new" | "ind" = "new"): string {
    const r = wsAdd(this.ws, undefined, this.focusChart);
    if (!r) return "";
    // the new window opens on top: whatever filled the area gives it back
    this.maximized = null;
    this.setWs(kind === "ind" ? wsMakeIndicator(r.ws, r.id) : r.ws);
    return r.id;
  }

  /** The window becomes a chart of its own on this instrument (data source + data ticker). */
  makeChart(id: string, src: string, tk: string): void {
    const cur = this.eff();
    const next = wsMakeChart(cur, id, src, tk);
    if (next !== cur) this.setWs(next, id);
  }

  /** The window becomes an indicator window (linked to the chart it was opened for). */
  makeIndicator(id: string): void {
    const cur = this.eff();
    const next = wsMakeIndicator(cur, id);
    if (next !== cur) this.setWs(next, id);
  }

  /** The window goes back to «what do you want here?» (its indicators go back to the chart, windows that followed it move to the price chart). */
  resetKind(id: string): void {
    const cur = this.eff();
    const next = wsResetKind(cur, id);
    if (next !== cur) this.setWs(next, id);
  }

  /** An indicator window follows another chart: its candles, time scale, crosshair, instrument and timeframe. */
  setLink(id: string, chart: string): void {
    const cur = this.eff();
    const next = wsSetLink(cur, id, chart);
    if (next !== cur) this.setWs(next);
  }

  /** The user picked another instrument in a chart window (the indicator windows linked to it follow by themselves). */
  setChartSymbol(id: string, src: string, tk: string): void {
    const cur = this.eff();
    const next = wsSetSymbol(cur, id, src, tk);
    if (next !== cur) this.setWs(next);
  }

  /** Closes a window: its indicators go back to the price chart; indicator windows that followed a closed chart move to the price chart. */
  closeWindow(id: string): void {
    const cur = this.eff();
    if (!hasWindow(cur, id)) return;
    this.setWs(wsClose(cur, id), id);
  }

  /** Back to the classic single chart: every window is closed, its indicators return to the price chart. */
  resetWindows(): void {
    if (!this.ws && !this.maximized) return;
    for (const it of this.items) it.win = undefined;
    this.ws = null;
    this.maximized = null;
    this.addTarget = null;
    this.replace();
    this.emit();
  }

  /** Whether the indicator may live in an extra window. */
  canWindow(uid: string): boolean {
    const it = this.find(uid);
    return !!it && windowable(it.def);
  }

  /** Moves an indicator to a window ("new": a new floating one; null: back to the price chart, to its own pane or the main pane as the indicator is set). */
  moveToWindow(uid: string, to: string | "new" | null): void {
    const it = this.find(uid);
    if (!it || (to !== null && !windowable(it.def))) return;
    let target: string | undefined;
    if (to === "new") {
      const id = this.addWindow("ind");
      if (!id) return;
      target = id;
    } else if (to !== null) {
      if (!hasIndWindow(this.ws, to)) return;
      target = to;
    }
    it.win = target;
    // a window that lost its last indicator stays (empty windows are allowed: the user closes them)
    if (this.engine && it.pane !== this.targetPane(it)) {
      this.unmount(it);
      this.mount(it);
    }
    this.relayout();
    this.emit();
    this.redraw();
  }

  /**
   * A window was moved / resized: new rectangle (fractions of the area). `commit` false while the pointer is still down (only the layout
   * listeners hear it, nothing is saved); the last call has `commit` true.
   */
  setRect(id: string, r: Rect, commit = true): void {
    const cur = this.eff();
    const next = wsSetRect(cur, id, r);
    if (next === cur) return;
    this.ws = isDefault(next) ? null : next;
    if (commit) this.emit();
    else this.emitLayout();
  }

  /** A window was clicked: it goes to the front (stored). */
  raise(id: string): void {
    const cur = this.eff();
    const next = wsRaise(cur, id);
    if (next === cur) return;
    this.ws = isDefault(next) ? null : next;
    this.emit();
  }

  /** The drag of a window is over: the layout is stored. */
  commitLayout(): void {
    this.emit();
  }

  /** New indicators from the catalog land in this window (null: the price chart as usual). */
  setAddTarget(id: string | null): void {
    this.addTarget = id && hasIndWindow(this.ws, id) ? id : null;
  }

  /** The tile of an extra window has an engine: the indicators of that window are drawn in it. */
  attachWindow(id: string, engine: ChartEngine): void {
    this.winEngines.set(id, engine);
    for (const it of this.items) {
      if (this.winOf(it) !== id || it.host === engine) continue;
      this.unmount(it);
      this.mount(it);
    }
    engine.requestRedraw();
    this.emit(false);
  }

  /** The tile is gone (closed, or the windows folded away): its indicators are unmounted, the layout decides where they go next. */
  detachWindow(id: string, engine: ChartEngine): void {
    if (this.winEngines.get(id) === engine) this.winEngines.delete(id);
    for (const it of this.items) if (it.host === engine) this.unmount(it);
  }

  /** The price chart and the windows that are on screen, back to front (the screenshot puts them together the way they overlap). */
  windowStack(): { engine: ChartEngine; z: number }[] {
    const out: { engine: ChartEngine; z: number }[] = [];
    const z = (id: string) => this.eff().wins.find((w) => w.id === id)?.z ?? 0;
    if (this.engine) out.push({ engine: this.engine, z: z(MAIN_ID) });
    for (const [id, engine] of this.winEngines) out.push({ engine, z: z(id) });
    return out.sort((a, b) => a.z - b.z);
  }

  private emitLayout(): void {
    for (const cb of Array.from(this.layoutListeners)) {
      try {
        cb();
      } catch {
        /* ignore */
      }
    }
  }

  /** Fires for every change of the layout, also while a divider is being dragged. */
  subscribeLayout(cb: () => void): () => void {
    this.layoutListeners.add(cb);
    return () => {
      this.layoutListeners.delete(cb);
    };
  }

  refresh(): void {
    const eng = this.engine;
    if (!eng) return;
    let changed = false;
    for (const it of this.items) {
      const data = this.dataOf(it);
      if (data && it.series.ensure(data.getCandles())) changed = true;
    }
    if (changed) {
      this.redraw();
      this.emitData();
    }
  }
}
