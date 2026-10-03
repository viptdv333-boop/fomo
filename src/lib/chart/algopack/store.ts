/* Client-side holder of the ALGOPACK datasets of the chart (FUTOI, SuperCandles, Mega Alerts, HI2). One store per engine.
   The fetcher (client.ts) fills it from /api/algopack/*; the Promo indicators read it through IndEnv.algo.

   TIME BASIS. The server sends `w`: the exchange's Moscow wall clock read as UTC ms. MOEX candles of the chart carry
   `t = w - tzMs` where tzMs is the server zone offset /api/klines reports (serverTzOffsetMin * 60000): the wall clock was
   parsed in the server's zone. So chart time = w - tzMs, whatever zone the server runs in. */

export type AlgoNeed = "futoi" | "ts" | "os" | "ob" | "alerts" | "hi2";

/** unknown: not asked yet | yes: this requester is served | no: not entitled / no key | na: not a MOEX instrument */
export type AlgoAccess = "unknown" | "yes" | "no" | "na";

export interface AlgoTable {
  n: number;
  /** wall-as-UTC ms as sent */
  w: Float64Array;
  /** chart time of the row (bar start for SuperCandles, snapshot time for FUTOI) */
  t: Float64Array;
  col: Record<string, Float64Array>;
}

export interface AlgoAlert {
  /** chart time */
  t: number;
  w: number;
  type: string;
  dir: 1 | -1 | 0;
  thr: number | null;
  val: number | null;
  price?: number | null;
  ref?: Partial<Record<"m5" | "m15" | "m30" | "h1", (number | null)[]>>;
}

export interface AlgoHi2 {
  metrics: string[];
  /** chart time of the start of each trading day */
  t: Float64Array;
  /** per metric, aligned with t (NaN where the day has no value) */
  vals: Record<string, Float64Array>;
}

export type AlgoDataState = "ok" | "loading" | "denied" | "none" | "unsupported" | "error";

export function tableFrom(cols: string[], rows: (number | null)[][], tzMs: number): AlgoTable {
  const n = rows.length;
  const col: Record<string, Float64Array> = {};
  for (let c = 1; c < cols.length; c++) {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = rows[i][c];
      a[i] = v === null || v === undefined ? NaN : v;
    }
    col[cols[c]] = a;
  }
  const w = new Float64Array(n);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    w[i] = rows[i][0] as number;
    t[i] = w[i] - tzMs;
  }
  return { n, w, t, col };
}

export class AlgoStore {
  version = 0;
  access: AlgoAccess = "unknown";
  /** why the access is "no" (forbidden | unavailable) */
  accessWhy = "";
  /** chart time = w - tzMs */
  tzMs = 0;
  ticker = "";
  /** The SuperCandles bar stamp basis the server detected ("begin" | "end" | "assumed-begin"), for diagnostics */
  basis = "";
  /** Who wants which dataset (indicator ids, the alerts panel ...). */
  readonly needs = new Set<AlgoNeed>();

  futoi: AlgoTable | null = null;
  ts: AlgoTable | null = null;
  os: AlgoTable | null = null;
  ob: AlgoTable | null = null;
  alerts: AlgoAlert[] = [];
  hi2: AlgoHi2 | null = null;
  /** Last failure reason per dataset (cleared on success). */
  readonly reasons: Partial<Record<AlgoNeed, string>> = {};
  private loaded = new Set<AlgoNeed>();
  private listeners = new Set<() => void>();
  private raw: { alerts?: { w: number; rest: Omit<AlgoAlert, "t"> }[]; hi2?: { metrics: string[]; rows: [number, number, number][] } } = {};

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit() {
    this.version++;
    for (const cb of Array.from(this.listeners)) {
      try {
        cb();
      } catch {}
    }
  }

  /** New symbol: forget everything. */
  reset(ticker: string) {
    this.ticker = ticker;
    this.futoi = this.ts = this.os = this.ob = null;
    this.alerts = [];
    this.hi2 = null;
    this.raw = {};
    this.loaded.clear();
    for (const k of Object.keys(this.reasons)) delete this.reasons[k as AlgoNeed];
    this.basis = "";
    this.emit();
  }

  /** The chart's server-zone offset became known / changed: re-base the chart times. */
  setTz(tzMs: number) {
    if (tzMs === this.tzMs) return;
    const d = tzMs - this.tzMs;
    this.tzMs = tzMs;
    for (const tb of [this.futoi, this.ts, this.os, this.ob]) if (tb) for (let i = 0; i < tb.n; i++) tb.t[i] -= d;
    this.alerts = this.alerts.map((a) => ({ ...a, t: a.w - tzMs }));
    if (this.raw.hi2) this.setHi2(this.raw.hi2.metrics, this.raw.hi2.rows, false);
    this.emit();
  }

  setAccess(a: AlgoAccess, why = "") {
    if (this.access === a && this.accessWhy === why) return;
    this.access = a;
    this.accessWhy = why;
    this.emit();
  }

  setTable(need: "futoi" | "ts" | "os" | "ob", cols: string[], rows: (number | null)[][]) {
    this[need] = tableFrom(cols, rows, this.tzMs);
    this.loaded.add(need);
    delete this.reasons[need];
    this.emit();
  }

  setAlerts(rows: { w: number; type: string; dir: 1 | -1 | 0; thr: number | null; val: number | null; price?: number | null; ref?: AlgoAlert["ref"] }[]) {
    this.alerts = rows.map((r) => ({ ...r, t: r.w - this.tzMs }));
    this.loaded.add("alerts");
    delete this.reasons.alerts;
    this.emit();
  }

  setHi2(metrics: string[], rows: [number, number, number][], emit = true) {
    this.raw.hi2 = { metrics, rows };
    const days = [...new Set(rows.map((r) => r[0]))].sort((a, b) => a - b);
    const idx = new Map(days.map((d, i) => [d, i]));
    const vals: Record<string, Float64Array> = {};
    for (const m of metrics) vals[m] = new Float64Array(days.length).fill(NaN);
    for (const [w, mi, v] of rows) vals[metrics[mi]][idx.get(w)!] = v;
    this.hi2 = { metrics, t: Float64Array.from(days, (d) => d - this.tzMs), vals };
    this.loaded.add("hi2");
    delete this.reasons.hi2;
    if (emit) this.emit();
  }

  fail(need: AlgoNeed, reason: string) {
    if (this.reasons[need] === reason) return;
    this.reasons[need] = reason;
    this.loaded.add(need);
    this.emit();
  }

  /** What a consumer should say when there is no data for `need`. */
  state(need: AlgoNeed): AlgoDataState {
    if (this.access === "no") return "denied";
    if (this.access === "na") return "unsupported";
    const has = need === "futoi" ? this.futoi : need === "ts" ? this.ts : need === "os" ? this.os : need === "ob" ? this.ob : need === "alerts" ? (this.alerts.length ? this.alerts : null) : this.hi2;
    if (has) return "ok";
    const r = this.reasons[need];
    if (r) {
      if (/futures-only|unsupported|eq-fo-only|unknown-instrument/.test(r)) return "unsupported";
      if (/http-403|forbidden/.test(r)) return "denied";
      return r === "empty" ? "none" : "error";
    }
    return this.loaded.has(need) ? "none" : "loading";
  }
}
