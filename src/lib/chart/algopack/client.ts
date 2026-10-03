import type { ChartEngine } from "../engine";
import type { AlgoNeed } from "./store";

/* Keeps the engine's AlgoStore filled: asks /api/algopack/* for the datasets the indicators / panels registered in
   `store.needs`, and refreshes them at the cadence of the product (SuperCandles / FUTOI 5-min bars, Mega Alerts 1 min, HI2
   daily). The server decides who is entitled; a 403/404 switches the store to "no access" and the consumers show a note. */

const POLL_MS = 5000;
/** how often each dataset is refreshed while it is needed */
const EVERY: Record<AlgoNeed, number> = { futoi: 60_000, ts: 30_000, os: 30_000, ob: 30_000, alerts: 30_000, hi2: 15 * 60_000 };
const RECHECK_ACCESS_MS = 5 * 60_000;

export interface AlgoClientDeps {
  engine: ChartEngine;
  source: string;
  ticker: string;
  /** server-zone offset of the chart's candles (serverTzOffsetMin * 60000) */
  getTzMs(): number;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Wall-as-UTC ms -> "YYYY-MM-DD" */
export function wallDate(w: number): string {
  const d = new Date(w);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export class AlgoClient {
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private busy = false;
  private last = new Map<AlgoNeed, number>();
  private from = new Map<AlgoNeed, string>();
  private deniedAt = 0;
  private gen = 0;

  constructor(private d: AlgoClientDeps) {}

  start() {
    const { engine, source, ticker } = this.d;
    const store = engine.algo;
    store.setTz(this.d.getTzMs());
    store.reset(ticker);
    if (source !== "moex") {
      store.setAccess("na");
      return;
    }
    store.setAccess("unknown");
    this.timer = setInterval(() => void this.cycle(), POLL_MS);
    this.kick(200);
  }

  stop() {
    this.stopped = true;
    this.gen++;
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
  }

  /** The set of needed datasets or the symbol changed: look again soon. */
  kick(delay = 300) {
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.cycle(), delay);
  }

  private async getJson(url: string): Promise<{ status: number; j: any } | null> {
    try {
      const res = await fetch(url, { cache: "no-store" });
      let j: any = null;
      try {
        j = await res.json();
      } catch {}
      return { status: res.status, j };
    } catch {
      return null;
    }
  }

  private async checkAccess(): Promise<boolean> {
    const { engine } = this.d;
    const store = engine.algo;
    const r = await this.getJson("/api/algopack/status");
    if (this.stopped) return false;
    if (!r || r.status !== 200 || !r.j) {
      // transient: try again at the next cycle
      return false;
    }
    if (r.j.allowed) {
      store.setAccess("yes");
      return true;
    }
    this.deniedAt = Date.now();
    store.setAccess("no", String(r.j.why ?? "denied"));
    return false;
  }

  async cycle() {
    if (this.stopped || this.busy) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const { engine, ticker } = this.d;
    const store = engine.algo;
    if (store.needs.size === 0 || store.access === "na") return;
    const candles = engine.getCandles();
    if (candles.length === 0) return;
    store.setTz(this.d.getTzMs());

    if (store.access === "no" && Date.now() - this.deniedAt < RECHECK_ACCESS_MS) return;
    this.busy = true;
    const gen = this.gen;
    try {
      if (store.access !== "yes" && !(await this.checkAccess())) return;
      if (gen !== this.gen) return;

      const now = Date.now();
      const wantFrom = wallDate(candles[0].t + store.tzMs);
      const due = (n: AlgoNeed) => {
        const f = this.from.get(n);
        // history scrolled further back than what was fetched, or the refresh period elapsed
        return !f || wantFrom < f || now - (this.last.get(n) ?? 0) >= EVERY[n];
      };
      const sets = (["ts", "os", "ob"] as const).filter((n) => store.needs.has(n) && due(n));
      const jobs: Promise<void>[] = [];
      if (sets.length) jobs.push(this.fetchSuper(sets, wantFrom, gen, ticker));
      if (store.needs.has("futoi") && due("futoi")) jobs.push(this.fetchSimple("futoi", `/api/algopack/futoi?ticker=${encodeURIComponent(ticker)}&from=${wantFrom}`, wantFrom, gen));
      if (store.needs.has("alerts") && due("alerts")) jobs.push(this.fetchSimple("alerts", `/api/algopack/alerts?ticker=${encodeURIComponent(ticker)}&from=${wantFrom}`, wantFrom, gen));
      if (store.needs.has("hi2") && due("hi2")) jobs.push(this.fetchSimple("hi2", `/api/algopack/hi2?ticker=${encodeURIComponent(ticker)}&from=${wantFrom}`, wantFrom, gen));
      await Promise.all(jobs);
    } finally {
      this.busy = false;
    }
  }

  private denied(status: number, gen: number): boolean {
    if (status === 403 || status === 404) {
      if (gen === this.gen) {
        this.deniedAt = Date.now();
        this.d.engine.algo.setAccess("no", status === 404 ? "unavailable" : "forbidden");
      }
      return true;
    }
    return false;
  }

  private async fetchSuper(sets: ("ts" | "os" | "ob")[], from: string, gen: number, ticker: string) {
    const store = this.d.engine.algo;
    const r = await this.getJson(`/api/algopack/supercandles?ticker=${encodeURIComponent(ticker)}&from=${from}&sets=${sets.join(",")}`);
    if (gen !== this.gen || this.stopped) return;
    for (const s of sets) this.last.set(s, Date.now());
    if (!r) {
      for (const s of sets) store.fail(s, "network");
      return;
    }
    if (this.denied(r.status, gen)) return;
    const j = r.j;
    if (j?.basis) store.basis = String(j.basis);
    for (const s of sets) {
      const tb = j?.[s];
      if (tb && Array.isArray(tb.rows) && Array.isArray(tb.cols)) {
        this.from.set(s, from);
        if (tb.rows.length) store.setTable(s, tb.cols, tb.rows);
        else store.fail(s, "empty");
      } else store.fail(s, String(j?.reasons?.[s] ?? j?.reason ?? "error"));
    }
  }

  private async fetchSimple(need: "futoi" | "alerts" | "hi2", url: string, from: string, gen: number) {
    const store = this.d.engine.algo;
    const r = await this.getJson(url);
    if (gen !== this.gen || this.stopped) return;
    this.last.set(need, Date.now());
    if (!r) {
      store.fail(need, "network");
      return;
    }
    if (this.denied(r.status, gen)) return;
    const j = r.j;
    if (!j?.ok) {
      store.fail(need, String(j?.reason ?? "error"));
      return;
    }
    this.from.set(need, from);
    if (need === "futoi") {
      if (Array.isArray(j.rows) && j.rows.length) store.setTable("futoi", j.cols, j.rows);
      else store.fail("futoi", "empty");
    } else if (need === "alerts") {
      store.setAlerts(Array.isArray(j.alerts) ? j.alerts : []);
      if (!store.alerts.length) store.fail("alerts", "empty");
    } else {
      if (Array.isArray(j.rows) && j.rows.length) store.setHi2(j.metrics, j.rows);
      else store.fail("hi2", "empty");
    }
  }
}
