import type { Candle, SeriesContext } from "../types";
import type { ParamValue } from "../contracts";
import type { IndResult, LevelSpec, PlotSpec, FillSpec, BandSpec, NumFmt } from "../indicators/registry";
import { runInWorker } from "./runtime";
import type { EncColors, FillRef, ScriptExtra, ScriptMeta, ScriptRecord, ScriptShape, ScriptStatus, WorkerDone } from "./types";

/* Glue between the synchronous indicator pipeline (IndicatorDef.compute) and the asynchronous worker:
   compute() returns the cached result (or an empty "pending" one) and schedules a debounced run; when the worker
   answers, listeners are told so that the series recompute (and pick the cached result up). */

interface Want {
  sig: string;
  candles: Candle[];
  params: Record<string, ParamValue>;
  code: string;
}

interface Entry {
  key: string;
  scriptId: string;
  result: IndResult | null;
  doneSig: string;
  want: Want | null;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  lastMs: number;
  lastEnd: number;
  runs: number;
}

const entries = new Map<string, Entry>();
const statuses = new Map<string, ScriptStatus>();
const resultListeners = new Set<(scriptId: string) => void>();
const statusListeners = new Set<(scriptId: string) => void>();
let metaSink: ((scriptId: string, done: WorkerDone) => void) | null = null;

const MIN_GAP_MS = 120;
const MAX_ENTRIES = 60;

export function onScriptResult(cb: (scriptId: string) => void): () => void {
  resultListeners.add(cb);
  return () => {
    resultListeners.delete(cb);
  };
}
export function onScriptStatus(cb: (scriptId: string) => void): () => void {
  statusListeners.add(cb);
  return () => {
    statusListeners.delete(cb);
  };
}
export function setMetaSink(fn: ((scriptId: string, done: WorkerDone) => void) | null): void {
  metaSink = fn;
}
export function getScriptStatus(scriptId: string): ScriptStatus | null {
  return statuses.get(scriptId) ?? null;
}

function hashCode(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

function candleSig(cs: Candle[]): string {
  const n = cs.length;
  if (n === 0) return "0";
  const a = cs[0];
  const z = cs[n - 1];
  return `${n}|${a.t}|${z.t}|${z.o}|${z.h}|${z.l}|${z.c}|${z.v}`;
}

/** Bar length in ms from the last bars (the engine's interval is not visible to compute()). */
function estimateInterval(cs: Candle[]): number {
  const n = cs.length;
  if (n < 2) return 0;
  const d: number[] = [];
  for (let i = Math.max(1, n - 24); i < n; i++) d.push(cs[i].t - cs[i - 1].t);
  d.sort((x, y) => x - y);
  return d[Math.floor(d.length / 2)];
}
function estimatePrecision(cs: Candle[]): number {
  const n = cs.length;
  if (n === 0) return 2;
  let p = 0;
  for (let i = Math.max(0, n - 12); i < n; i++) {
    const s = String(cs[i].c);
    const dot = s.indexOf(".");
    if (dot >= 0 && !/e/i.test(s)) p = Math.max(p, Math.min(8, s.length - dot - 1));
  }
  return p;
}

function setStatus(scriptId: string, patch: Partial<ScriptStatus>) {
  const prev = statuses.get(scriptId) ?? { pending: false, ok: true, error: null, logs: [], alerts: [], ms: 0, bars: 0, shapesCut: false, seq: 0 };
  statuses.set(scriptId, { ...prev, ...patch });
  for (const cb of Array.from(statusListeners)) {
    try {
      cb(scriptId);
    } catch {
      /* ignore */
    }
  }
}

/** Entry point used by IndicatorDef.compute of a user script. Always returns immediately. */
export function computeScript(scriptId: string, rec: ScriptRecord | undefined, candles: Candle[], params: Record<string, ParamValue>): IndResult {
  if (!rec) return { plots: [], error: "Script not found" };
  if (candles.length === 0) return { plots: [] };
  const key = scriptId + "|" + JSON.stringify(params);
  let e = entries.get(key);
  if (!e) {
    if (entries.size >= MAX_ENTRIES) {
      const first = entries.keys().next().value;
      if (first !== undefined) entries.delete(first);
    }
    e = { key, scriptId, result: null, doneSig: "", want: null, running: false, timer: null, lastMs: 0, lastEnd: 0, runs: 0 };
    entries.set(key, e);
  }
  const sig = hashCode(rec.code) + "#" + candleSig(candles);
  if (e.doneSig === sig && e.result) return e.result;
  e.want = { sig, candles, params: { ...params }, code: rec.code };
  schedule(e);
  return e.result ? { ...e.result, pending: true } : { plots: [], pending: true };
}

function schedule(e: Entry) {
  if (e.timer || e.running) return;
  const first = e.runs === 0;
  const since = Date.now() - e.lastEnd;
  const gap = first ? 0 : Math.max(MIN_GAP_MS, e.lastMs * 2);
  const wait = Math.max(0, gap - since);
  setStatus(e.scriptId, { pending: true });
  e.timer = setTimeout(() => {
    e.timer = null;
    void start(e);
  }, first ? 15 : wait);
}

async function start(e: Entry) {
  const w = e.want;
  if (!w || e.running) return;
  e.running = true;
  const prevResult = e.result;
  const cs = w.candles;
  const done = await runInWorker({ code: w.code, params: w.params, candles: cs, interval: estimateInterval(cs), precision: estimatePrecision(cs) });
  e.running = false;
  e.runs++;
  e.lastMs = done.ms || 0;
  e.lastEnd = Date.now();
  try {
    if (metaSink && (done.ok || done.meta)) metaSink(e.scriptId, done);
  } catch {
    /* ignore */
  }
  e.result = decode(done, prevResult, cs.length);
  e.doneSig = w.sig;
  const st = statuses.get(e.scriptId);
  setStatus(e.scriptId, {
    pending: !!(e.want && e.want.sig !== e.doneSig),
    ok: done.ok,
    error: done.error,
    logs: done.logs,
    alerts: done.alerts,
    ms: done.ms,
    bars: done.n,
    shapesCut: done.shapesCut,
    seq: (st?.seq ?? 0) + 1,
  });
  for (const cb of Array.from(resultListeners)) {
    try {
      cb(e.scriptId);
    } catch {
      /* ignore */
    }
  }
  if (e.want && e.want.sig !== e.doneSig) schedule(e);
}

/* ───────────── worker answer -> IndResult ───────────── */

function paletteColors(enc: { pal: string[]; idx: Uint16Array | null }, n: number): string[] {
  const out: string[] = new Array(n);
  const idx = enc.idx;
  for (let i = 0; i < n; i++) out[i] = idx ? (idx[i] ? enc.pal[idx[i] - 1] : "") : "";
  return out;
}

function fmtOf(meta: ScriptMeta | null | undefined, overlay: boolean): NumFmt {
  const f = meta?.format ?? "inherit";
  if (f === "price") return "price";
  if (f === "volume") return "vol";
  if (f === "percent") return "osc";
  return overlay ? "price" : "osc";
}

export function decode(done: WorkerDone, prev: IndResult | null, n: number): IndResult {
  if (!done.ok || !done.plots) {
    const msg = done.error ? (done.error.line ? `${done.error.message} (${done.error.line}${done.error.col ? ":" + done.error.col : ""})` : done.error.message) : "Error";
    // keep the last good picture while the code is being edited
    if (prev && !prev.error) return { ...prev, error: msg, pending: false };
    if (prev && prev.plots.length) return { ...prev, error: msg, pending: false };
    return { plots: [], error: msg };
  }
  const overlay = !!done.meta?.overlay;
  const plots: PlotSpec[] = done.plots.map((p) => {
    const shape = p.style;
    const kind: PlotSpec["kind"] = shape === "histogram" || shape === "columns" ? "hist" : shape === "circles" ? "dots" : "line";
    const spec: PlotSpec = { key: p.title, data: p.data, kind, color: p.color, shape };
    if (p.width) spec.width = p.width;
    else if (kind === "line") spec.width = 1.6;
    if (p.offset) spec.offset = p.offset;
    if (p.linestyle !== "solid") spec.lineStyle = p.linestyle;
    if (p.hidden) spec.hidden = true;
    if (p.pricelabel !== null) spec.flag = p.pricelabel;
    if (p.legend !== null) spec.legend = p.legend;
    if (p.connect) spec.connect = true;
    if (p.idx) spec.colors = paletteColors(p, n);
    return spec;
  });

  const levels: LevelSpec[] = (done.hlines ?? []).map((h) => ({ value: h.price, color: h.color, lineStyle: h.linestyle, width: h.width, name: h.title }));

  const fills: FillSpec[] = [];
  const bands: BandSpec[] = [];
  const arr = (r: FillRef): ArrayLike<number> | null => {
    if (r.t === "plot") return plots[r.i]?.data ?? null;
    if (r.t === "ser") return r.data;
    const h = done.hlines?.[r.i];
    if (!h) return null;
    return new Float64Array(n).fill(h.price);
  };
  for (const f of done.fills ?? []) {
    if (f.a.t === "hline" && f.b.t === "hline") {
      const ha = done.hlines![f.a.i];
      const hb = done.hlines![f.b.i];
      if (ha && hb) bands.push({ lo: Math.min(ha.price, hb.price), hi: Math.max(ha.price, hb.price), color: f.color, loLevel: ha.price <= hb.price ? f.a.i : f.b.i, hiLevel: ha.price <= hb.price ? f.b.i : f.a.i });
      continue;
    }
    const a = arr(f.a);
    const b = arr(f.b);
    if (!a || !b) continue;
    if (f.colorUp || f.colorDown) {
      if (f.colorUp) fills.push({ a, b, color: f.colorUp, when: "above", name: f.title + " ▲" });
      if (f.colorDown) fills.push({ a, b, color: f.colorDown, when: "below", name: f.title + " ▼" });
    } else {
      fills.push({ a, b, color: f.color, name: f.title });
    }
  }

  const extra: ScriptExtra = { kind: "script", overlay, shapes: done.shapes ?? [], bg: done.bg ?? [], bar: done.bar ?? [] };
  const res: IndResult = { plots, extra };
  if (levels.length) res.levels = levels;
  if (fills.length) res.fills = fills;
  if (bands.length) res.bands = bands;
  if (!overlay && done.meta?.minmax) res.range = done.meta.minmax;
  return res;
}

export { fmtOf };

/* ───────────── painters (bgcolor / barcolor / plotshape) ───────────── */

function colorAt(enc: EncColors, i: number): string {
  if (!enc.idx) return enc.pal[0] ?? "";
  const k = enc.idx[i];
  return k ? enc.pal[k - 1] : "";
}

function extraOf(res: IndResult | undefined): ScriptExtra | null {
  const ex = res?.extra as ScriptExtra | undefined;
  return ex && ex.kind === "script" ? ex : null;
}

/** Background stripes and recoloured candles: drawn under the plots. */
export function paintScriptBack(sc: SeriesContext, res: IndResult | undefined): void {
  const ex = extraOf(res);
  if (!ex || (ex.bg.length === 0 && ex.bar.length === 0)) return;
  const { ctx } = sc;
  const from = sc.from;
  const to = sc.to;
  const bw = Math.max(1, sc.barSpacing);
  ctx.save();
  for (const layer of ex.bg) {
    let cur = "";
    for (let i = from; i <= to; i++) {
      const c = colorAt(layer, i);
      if (!c) continue;
      if (c !== cur) {
        cur = c;
        ctx.fillStyle = c;
      }
      ctx.fillRect(Math.round(sc.x(i) - bw / 2), 0, Math.ceil(bw), sc.paneHeight);
    }
  }
  if (ex.overlay && ex.bar.length) {
    const body = Math.max(1, Math.floor(sc.barSpacing * 0.72));
    for (let i = from; i <= to; i++) {
      let c = "";
      for (const layer of ex.bar) {
        const k = colorAt(layer, i);
        if (k) c = k;
      }
      const k = sc.candles[i];
      if (!c || !k) continue;
      ctx.fillStyle = c;
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      const x = sc.x(i);
      const xs = Math.round(x) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xs, sc.y(k.h));
      ctx.lineTo(xs, sc.y(k.l));
      ctx.stroke();
      const y1 = sc.y(k.o);
      const y2 = sc.y(k.c);
      ctx.fillRect(Math.round(x - body / 2), Math.min(y1, y2), body, Math.max(1, Math.abs(y2 - y1)));
    }
  }
  ctx.restore();
}

function shapePath(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number) {
  ctx.beginPath();
  switch (kind) {
    case "triangleup":
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.8);
      ctx.lineTo(x - r, y + r * 0.8);
      ctx.closePath();
      break;
    case "triangledown":
      ctx.moveTo(x, y + r);
      ctx.lineTo(x + r, y - r * 0.8);
      ctx.lineTo(x - r, y - r * 0.8);
      ctx.closePath();
      break;
    case "arrowup":
      ctx.moveTo(x, y - r * 1.2);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.4, y);
      ctx.lineTo(x + r * 0.4, y + r * 1.2);
      ctx.lineTo(x - r * 0.4, y + r * 1.2);
      ctx.lineTo(x - r * 0.4, y);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "arrowdown":
      ctx.moveTo(x, y + r * 1.2);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x + r * 0.4, y);
      ctx.lineTo(x + r * 0.4, y - r * 1.2);
      ctx.lineTo(x - r * 0.4, y - r * 1.2);
      ctx.lineTo(x - r * 0.4, y);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "square":
      ctx.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7);
      break;
    case "diamond":
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "cross":
      ctx.moveTo(x - r, y);
      ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r);
      ctx.lineTo(x, y + r);
      break;
    case "xcross":
      ctx.moveTo(x - r * 0.8, y - r * 0.8);
      ctx.lineTo(x + r * 0.8, y + r * 0.8);
      ctx.moveTo(x + r * 0.8, y - r * 0.8);
      ctx.lineTo(x - r * 0.8, y + r * 0.8);
      break;
    case "flag":
      ctx.moveTo(x - r * 0.6, y + r);
      ctx.lineTo(x - r * 0.6, y - r);
      ctx.lineTo(x + r, y - r * 0.4);
      ctx.lineTo(x - r * 0.6, y + r * 0.2);
      break;
    default:
      ctx.arc(x, y, r * 0.9, 0, Math.PI * 2);
  }
}

/** plotshape markers: drawn on top of the plots. */
export function paintScriptShapes(sc: SeriesContext, res: IndResult | undefined): void {
  const ex = extraOf(res);
  if (!ex || ex.shapes.length === 0) return;
  const { ctx } = sc;
  const from = sc.from;
  const to = sc.to;
  ctx.save();
  ctx.font = `600 10px ${sc.options.fontFamily}`;
  ctx.textAlign = "center";
  const firstPlot = res?.plots.find((p) => !p.hidden);
  const gap = 6;
  for (const s of ex.shapes as ScriptShape[]) {
    if (s.i < from || s.i > to) continue;
    const k = sc.candles[s.i];
    let base = NaN;
    if (s.l === "x") base = s.p;
    else if (ex.overlay && k) base = s.l === "a" ? k.h : k.l;
    else if (Number.isFinite(s.p)) base = s.p;
    else if (firstPlot) base = firstPlot.data[s.i - (firstPlot.offset ?? 0)];
    if (!Number.isFinite(base)) continue;
    const r = s.z;
    const x = sc.x(s.i);
    const yBase = sc.y(base);
    const isLabel = s.s === "label";
    const size = isLabel ? r + 5 : r;
    let y = yBase;
    if (s.l === "a") y = yBase - gap - size;
    else if (s.l === "b") y = yBase + gap + size;
    if (y < -20 || y > sc.paneHeight + 20) continue;
    ctx.fillStyle = s.c;
    ctx.strokeStyle = s.c;
    ctx.lineWidth = s.s === "cross" || s.s === "xcross" || s.s === "flag" ? 1.6 : 1;
    if (isLabel) {
      const text = s.t || "•";
      const w = Math.max(16, ctx.measureText(text).width + 10);
      const h = 16;
      const up = s.l === "a";
      const top = up ? y - h / 2 - 2 : y - h / 2 + 2;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top, w, h, 4);
      ctx.fill();
      ctx.beginPath();
      if (up) {
        ctx.moveTo(x - 4, top + h);
        ctx.lineTo(x, top + h + 4);
        ctx.lineTo(x + 4, top + h);
      } else {
        ctx.moveTo(x - 4, top);
        ctx.lineTo(x, top - 4);
        ctx.lineTo(x + 4, top);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = s.tc || "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, top + h / 2 + 0.5);
      continue;
    }
    shapePath(ctx, s.s, x, y, r);
    if (s.s === "cross" || s.s === "xcross" || s.s === "flag") ctx.stroke();
    else ctx.fill();
    if (s.t) {
      ctx.fillStyle = s.tc || s.c;
      ctx.textBaseline = s.l === "b" ? "top" : "bottom";
      ctx.fillText(s.t, x, s.l === "b" ? y + r + 3 : y - r - 3);
    }
  }
  ctx.restore();
}
