import type { ParamValue } from "../contracts";
import { setDynamicResolver } from "../indicators/registry";
import type { IndicatorDef, ParamDef } from "../indicators/registry";
import { deleteUserData, listUserData, saveUserData } from "../userdata";
import { computeScript, fmtOf, paintScriptBack, paintScriptShapes, setMetaSink } from "./compute";
import { SCRIPT_ID_PREFIX, SCRIPT_KIND, SCRIPT_LIMITS } from "./types";
import type { ScriptInputDecl, ScriptMeta, ScriptRecord, WorkerDone } from "./types";

/* Registry of the user's scripts: persistence (per-user `indicator_script` data, localStorage for guests), the
   dynamic IndicatorDef of every script and change notifications. The "effective" record is what the chart runs
   (it includes unsaved edits made in the editor); "saved" is what is stored. */

/** `defaultChanges`: inputs whose default was edited in the code: [old, new]. An instance that still holds the old default follows the new one. */
export type ScriptEvent = { type: "loaded" | "list" | "def" | "code"; id?: string; defaultChanges?: Record<string, [ParamValue, ParamValue]> };

const effective = new Map<string, ScriptRecord>();
const saved = new Map<string, ScriptRecord>();
const defs = new Map<string, IndicatorDef>();
const listeners = new Set<(ev: ScriptEvent) => void>();
let loaded = false;
let loading: Promise<void> | null = null;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emit(ev: ScriptEvent) {
  for (const cb of Array.from(listeners)) {
    try {
      cb(ev);
    } catch {
      /* a broken listener must not block the others */
    }
  }
}

export function subscribeScripts(cb: (ev: ScriptEvent) => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export const isScriptDefId = (id: string) => id.startsWith(SCRIPT_ID_PREFIX);

export function newScriptId(): string {
  let id: string;
  do {
    id = SCRIPT_ID_PREFIX + Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  } while (effective.has(id));
  return id;
}

/* ───────────── definitions ───────────── */

function paramOf(d: ScriptInputDecl): ParamDef | null {
  switch (d.type) {
    case "int":
    case "float": {
      const lo = typeof d.min === "number" ? d.min : -1e9;
      const hi = typeof d.max === "number" ? d.max : 1e9;
      const step = typeof d.step === "number" && d.step > 0 ? d.step : d.type === "int" ? 1 : 0.1;
      return { key: d.key, type: "number", min: lo, max: hi, step, default: Number(d.def) };
    }
    case "bool":
      return { key: d.key, type: "boolean", default: Boolean(d.def) };
    case "string":
      return { key: d.key, type: "text", default: String(d.def) };
    case "select":
      return { key: d.key, type: "select", options: (d.options ?? []).map((o) => ({ value: o.value, label: o.label })), default: String(d.def) };
    case "color":
      return { key: d.key, type: "color", default: String(d.def) };
    default:
      return null;
  }
}

function applyRec(def: IndicatorDef, rec: ScriptRecord) {
  const meta = rec.meta;
  const overlay = !!meta?.overlay;
  const params: ParamDef[] = [];
  const labels: Record<string, string> = {};
  const colorKeys: string[] = [];
  for (const d of meta?.inputs ?? []) {
    const p = paramOf(d);
    if (!p) continue;
    params.push(p);
    labels[d.key] = d.name;
    if (p.type === "color") colorKeys.push(d.key);
  }
  def.label = rec.name || meta?.name || "Script";
  def.paramLabels = labels;
  def.params = params;
  def.styleParams = colorKeys;
  def.pane = overlay ? "overlay" : "own";
  def.fmt = fmtOf(meta, overlay);
  def.paneRatio = meta?.paneRatio || 0.22;
  def.keywords = `${def.label} script user custom`;
  def.loading = false;
}

function titleOf(def: IndicatorDef, p: Record<string, ParamValue>): string {
  const bits: string[] = [];
  for (const d of def.params) {
    if (d.type === "color") continue;
    const v = p[d.key];
    if (v === undefined) continue;
    bits.push(typeof v === "boolean" ? (v ? "✓" : "✗") : String(v));
    if (bits.length >= 4) break;
  }
  return bits.length ? `${def.label ?? "Script"} (${bits.join(", ")})` : (def.label ?? "Script");
}

function makeDef(id: string): IndicatorDef {
  const def: IndicatorDef = {
    id,
    category: "other",
    pane: "own",
    fmt: "osc",
    params: [],
    script: true,
    loading: !loaded,
    label: "…",
    title: (p) => titleOf(def, p),
    compute(candles, p) {
      if (def.loading) return { plots: [], pending: true };
      return computeScript(id, effective.get(id), candles, p);
    },
    drawExtra: (sc, _p, res) => paintScriptBack(sc, res),
    drawTop: (sc, _p, res) => paintScriptShapes(sc, res),
  };
  const rec = effective.get(id);
  if (rec) applyRec(def, rec);
  return def;
}

function defFor(id: string): IndicatorDef {
  let d = defs.get(id);
  if (!d) {
    d = makeDef(id);
    defs.set(id, d);
  }
  return d;
}

/** Registered as the registry's resolver: any `usr_…` id has a definition (a placeholder until the scripts load). */
export function resolveScriptDef(id: string): IndicatorDef | undefined {
  if (!isScriptDefId(id)) return undefined;
  if (!loaded) void ensureScriptsLoaded();
  return defFor(id);
}
setDynamicResolver(resolveScriptDef);

/* ───────────── loading / persistence ───────────── */

interface Stored {
  v?: number;
  name?: unknown;
  code?: unknown;
  meta?: unknown;
}

function validMeta(m: unknown): ScriptMeta | undefined {
  if (!m || typeof m !== "object") return undefined;
  const o = m as Partial<ScriptMeta>;
  if (!Array.isArray(o.inputs)) return undefined;
  const inputs = o.inputs.filter((d): d is ScriptInputDecl => !!d && typeof d === "object" && typeof (d as ScriptInputDecl).key === "string" && typeof (d as ScriptInputDecl).type === "string");
  return {
    name: typeof o.name === "string" ? o.name : "",
    overlay: !!o.overlay,
    format: o.format === "price" || o.format === "volume" || o.format === "percent" ? o.format : "inherit",
    minmax: Array.isArray(o.minmax) && o.minmax.length === 2 ? [Number(o.minmax[0]), Number(o.minmax[1])] : null,
    paneRatio: typeof o.paneRatio === "number" ? o.paneRatio : 0,
    inputs,
  };
}

function clone(r: ScriptRecord): ScriptRecord {
  return { ...r, meta: r.meta ? (JSON.parse(JSON.stringify(r.meta)) as ScriptMeta) : undefined };
}

export function isScriptsLoaded(): boolean {
  return loaded;
}

export function ensureScriptsLoaded(): Promise<void> {
  if (loaded) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const items = await listUserData<Stored>(SCRIPT_KIND);
    for (const it of items) {
      const d = it.data;
      if (!d || typeof d.code !== "string" || effective.has(it.key)) continue;
      const rec: ScriptRecord = { id: it.key, name: typeof d.name === "string" ? d.name.slice(0, 80) : "Script", code: d.code.slice(0, SCRIPT_LIMITS.codeChars), meta: validMeta(d.meta), updatedAt: it.updatedAt };
      effective.set(rec.id, rec);
      saved.set(rec.id, clone(rec));
    }
    loaded = true;
    for (const id of Array.from(defs.keys())) {
      const rec = effective.get(id);
      const def = defs.get(id)!;
      if (rec) applyRec(def, rec);
      else {
        def.loading = false;
        def.label = "Script deleted";
      }
    }
    for (const rec of effective.values()) defFor(rec.id);
    emit({ type: "loaded" });
    emit({ type: "list" });
  })();
  return loading;
}

function payload(rec: ScriptRecord): Stored {
  return { v: 1, name: rec.name, code: rec.code, meta: rec.meta };
}

export function listScripts(): ScriptRecord[] {
  return Array.from(effective.values()).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.name.localeCompare(b.name));
}
export function getScript(id: string): ScriptRecord | undefined {
  return effective.get(id);
}
export function getSavedScript(id: string): ScriptRecord | undefined {
  return saved.get(id);
}
export function isPersisted(id: string): boolean {
  return saved.has(id);
}
/** True when the effective record differs from the stored one (or was never stored). */
export function hasUnsaved(id: string): boolean {
  const e = effective.get(id);
  const s = saved.get(id);
  if (!e) return false;
  if (!s) return true;
  return e.code !== s.code || e.name !== s.name;
}

/** A new, not yet stored script (kept in memory so that it can be previewed on the chart). */
export function createDraftScript(name: string, code: string): ScriptRecord {
  const rec: ScriptRecord = { id: newScriptId(), name: name.slice(0, 80) || "Script", code: code.slice(0, SCRIPT_LIMITS.codeChars) };
  effective.set(rec.id, rec);
  const d = defFor(rec.id);
  applyRec(d, rec);
  emit({ type: "list" });
  return rec;
}

/** Live edit (not stored): the chart re-runs the script with this code. */
export function setScriptCode(id: string, code: string): void {
  const rec = effective.get(id);
  if (!rec || rec.code === code) return;
  rec.code = code.slice(0, SCRIPT_LIMITS.codeChars);
  emit({ type: "code", id });
}
export function setScriptName(id: string, name: string): void {
  const rec = effective.get(id);
  if (!rec) return;
  rec.name = name.slice(0, 80);
  const d = defs.get(id);
  if (d) applyRec(d, rec);
  emit({ type: "def", id });
}

export async function saveScript(id: string): Promise<boolean> {
  const rec = effective.get(id);
  if (!rec) return false;
  rec.updatedAt = new Date().toISOString();
  const ok = await saveUserData(SCRIPT_KIND, id, payload(rec));
  if (ok) {
    saved.set(id, clone(rec));
    emit({ type: "list" });
  }
  return ok;
}

/** Stores a copy under a new id (Save as…). */
export async function saveScriptAs(id: string, name: string): Promise<ScriptRecord | null> {
  const src = effective.get(id);
  if (!src) return null;
  const rec: ScriptRecord = { ...clone(src), id: newScriptId(), name: name.slice(0, 80) || src.name, updatedAt: new Date().toISOString() };
  effective.set(rec.id, rec);
  const d = defFor(rec.id);
  applyRec(d, rec);
  const ok = await saveUserData(SCRIPT_KIND, rec.id, payload(rec));
  if (!ok) {
    effective.delete(rec.id);
    defs.delete(rec.id);
    return null;
  }
  saved.set(rec.id, clone(rec));
  emit({ type: "list" });
  return rec;
}

/** Drops unsaved edits: back to the stored version, or forgets a script that was never stored. */
export function revertScript(id: string): void {
  const s = saved.get(id);
  if (!s) {
    effective.delete(id);
    emit({ type: "list" });
    return;
  }
  const e = effective.get(id);
  if (!e) return;
  e.code = s.code;
  e.name = s.name;
  e.meta = s.meta;
  const d = defs.get(id);
  if (d) applyRec(d, e);
  emit({ type: "def", id });
  emit({ type: "code", id });
}

export async function deleteScript(id: string): Promise<void> {
  const t = persistTimers.get(id);
  if (t) clearTimeout(t);
  persistTimers.delete(id);
  effective.delete(id);
  saved.delete(id);
  const d = defs.get(id);
  if (d) {
    d.label = "Script deleted";
    d.params = [];
  }
  emit({ type: "list" });
  emit({ type: "def", id });
  await deleteUserData(SCRIPT_KIND, id);
}

/* ───────────── meta coming back from runs ───────────── */

function queuePersist(id: string) {
  if (persistTimers.has(id)) return;
  persistTimers.set(
    id,
    setTimeout(() => {
      persistTimers.delete(id);
      const s = saved.get(id);
      const e = effective.get(id);
      if (!s || !e || s.code !== e.code) return; // unsaved edits: the user saves explicitly
      void saveUserData(SCRIPT_KIND, id, payload({ ...e, name: s.name }));
    }, 2500),
  );
}

setMetaSink((id: string, done: WorkerDone) => {
  const rec = effective.get(id);
  if (!rec || !done.ok || !done.meta) return;
  const m = done.meta;
  const next: ScriptMeta = { name: m.name || rec.name, overlay: !!m.overlay, format: m.format, minmax: m.minmax, paneRatio: m.paneRatio || 0, inputs: done.inputs };
  if (JSON.stringify(rec.meta) === JSON.stringify(next)) return;
  const defaultChanges: Record<string, [ParamValue, ParamValue]> = {};
  for (const d of next.inputs) {
    const o = rec.meta?.inputs.find((x) => x.key === d.key && x.type === d.type);
    if (o && o.def !== d.def) defaultChanges[d.key] = [o.def, d.def];
  }
  rec.meta = next;
  const s = saved.get(id);
  if (s && s.code === rec.code) {
    s.meta = next;
    queuePersist(id);
  }
  const d = defs.get(id);
  if (d) applyRec(d, rec);
  emit({ type: "def", id, defaultChanges: Object.keys(defaultChanges).length ? defaultChanges : undefined });
});

/* ───────────── import / export ───────────── */

const EXPORT_FORMAT = "fomo-indicator-script";

export function exportScriptJson(id: string): { filename: string; text: string } | null {
  const rec = effective.get(id);
  if (!rec) return null;
  const text = JSON.stringify({ format: EXPORT_FORMAT, v: 1, name: rec.name, code: rec.code, meta: rec.meta }, null, 2);
  return { filename: safeFile(rec.name) + ".json", text };
}
export function exportScriptJs(id: string): { filename: string; text: string } | null {
  const rec = effective.get(id);
  if (!rec) return null;
  return { filename: safeFile(rec.name) + ".js", text: `// @name ${rec.name}\n${rec.code}` };
}
function safeFile(name: string): string {
  return (name || "script").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "script";
}

/** Reads an exported .json or a plain .js/.txt file. Returns null when it is not a script. */
export function parseImported(text: string, filename: string): { name: string; code: string } | null {
  const base = filename.replace(/\.[^.]+$/, "");
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("{")) {
    try {
      const j = JSON.parse(t) as { format?: unknown; name?: unknown; code?: unknown };
      if (typeof j.code === "string") return { name: typeof j.name === "string" && j.name ? j.name.slice(0, 80) : base, code: j.code.slice(0, SCRIPT_LIMITS.codeChars) };
    } catch {
      /* not json: treat as code */
    }
  }
  const m = /^\s*\/\/\s*@name\s+(.+)$/m.exec(text);
  let code = text;
  let name = base;
  if (m) {
    name = m[1].trim().slice(0, 80);
    if (text.trimStart().startsWith(m[0].trim())) code = text.replace(/^\s*\/\/\s*@name.*\r?\n?/, "");
  }
  return { name: name || "Script", code: code.slice(0, SCRIPT_LIMITS.codeChars) };
}
