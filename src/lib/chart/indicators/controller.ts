import type { ChartEngine } from "../engine";
import type { IndicatorInstance, IndicatorsControllerLike, ParamValue } from "../contracts";
import { defaultParams, getIndicatorDef, sanitizeParams } from "./registry";
import type { IndicatorDef, Params } from "./registry";
import { IndicatorSeries } from "./series";

interface Item {
  inst: IndicatorInstance;
  def: IndicatorDef;
  series: IndicatorSeries;
}

const DEFAULT_PANE_RATIO = 0.18;

export class IndicatorsController implements IndicatorsControllerLike {
  private engine: ChartEngine | null = null;
  private items: Item[] = [];
  private listeners = new Set<() => void>();
  private seq = 0;
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

  private mount(it: Item) {
    const eng = this.engine;
    if (!eng) return;
    if (it.def.pane === "own") {
      const pid = this.paneId(it);
      if (!eng.hasPane(pid)) eng.addPane(pid, it.def.paneRatio ?? DEFAULT_PANE_RATIO);
      eng.addSeries(it.series, pid);
    } else {
      eng.addSeries(it.series, "main");
    }
  }

  private unmount(it: Item) {
    const eng = this.engine;
    if (!eng) return;
    eng.removeSeries(it.inst.uid);
    if (it.def.pane === "own") eng.removePane(this.paneId(it));
  }

  private unmountAll() {
    for (const it of this.items) this.unmount(it);
  }

  /* ───────────── state ───────────── */

  private rebuildSnapshot() {
    this.snapshot = this.items.map((it) => ({ uid: it.inst.uid, id: it.inst.id, params: { ...it.inst.params }, visible: it.inst.visible }));
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
  }

  list(): IndicatorInstance[] {
    return this.snapshot;
  }

  private nextUid(id: string): string {
    let uid: string;
    do {
      uid = `${id}-${++this.seq}`;
    } while (this.items.some((it) => it.inst.uid === uid));
    return uid;
  }

  private create(id: string, params: Record<string, ParamValue> | undefined, visible: boolean): Item | null {
    const def = getIndicatorDef(id);
    if (!def) return null;
    const merged: Params = sanitizeParams(def, { ...defaultParams(def), ...(params ?? {}) });
    const uid = this.nextUid(id);
    const eng = this.engine;
    const series = new IndicatorSeries(
      uid,
      def,
      merged,
      { getCandles: () => (this.engine ? this.engine.getCandles() : []), getPrecision: () => (this.engine ? this.engine.getPrecision() : 2) },
    );
    series.visible = visible;
    const item: Item = { inst: { uid, id, params: merged, visible }, def, series };
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

  update(uid: string, patch: { params?: Record<string, ParamValue>; visible?: boolean }): void {
    const it = this.items.find((x) => x.inst.uid === uid);
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
    this.emit();
    this.engine?.requestRedraw();
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  serialize(): string {
    return JSON.stringify(this.items.map((it) => ({ id: it.inst.id, params: it.inst.params, visible: it.inst.visible })));
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
      const r = raw as { id?: unknown; params?: unknown; visible?: unknown };
      if (typeof r.id !== "string") continue;
      const params = r.params && typeof r.params === "object" ? (r.params as Record<string, ParamValue>) : undefined;
      this.create(r.id, params, r.visible !== false);
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
    if (changed) eng.requestRedraw();
  }
}
