import type { Candle } from "../types";
import type { ParamValue } from "../contracts";
import { SCRIPT_LIMITS } from "./types";
import type { ScriptError, WorkerDone } from "./types";
import { WORKER_SRC } from "./worker-src";

/* Client side of the script sandbox: one Web Worker built from a Blob, jobs run one at a time, every job has a hard
   timeout after which the worker is terminated and recreated (an infinite loop in a script can never freeze the page). */

export interface RunRequest {
  code: string;
  params: Record<string, ParamValue>;
  candles: Candle[];
  interval: number;
  precision: number;
}

interface Job {
  id: number;
  req: RunRequest;
  resolve: (r: WorkerDone) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

let worker: Worker | null = null;
let blobUrl: string | null = null;
let current: Job | null = null;
const queue: Job[] = [];
let seq = 0;

function fail(id: number, error: ScriptError): WorkerDone {
  return { type: "done", id, ok: false, error, logs: [], inputs: [], meta: null, ms: 0, n: 0, alerts: [], shapesCut: false };
}

function spawn(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined" || typeof Blob === "undefined") return null;
  try {
    if (!blobUrl) blobUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: "text/javascript" }));
    const w = new Worker(blobUrl);
    w.onmessage = (ev: MessageEvent) => {
      const m = ev.data as WorkerDone | { type: "ready" };
      if (!m || m.type !== "done") return;
      const job = current;
      if (!job || job.id !== m.id) return;
      finish(job, m);
    };
    w.onerror = (ev: ErrorEvent) => {
      ev.preventDefault();
      const job = current;
      killWorker();
      if (job) finish(job, fail(job.id, { message: ev.message || "Worker error", line: null, col: null, kind: "worker" }), true);
      else pump();
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

function killWorker() {
  if (worker) {
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
    worker = null;
  }
}

function finish(job: Job, res: WorkerDone, alreadyKilled = false) {
  if (job.timer) clearTimeout(job.timer);
  if (current === job) current = null;
  void alreadyKilled;
  job.resolve(res);
  pump();
}

function pump() {
  if (current || queue.length === 0) return;
  const job = queue.shift()!;
  const w = spawn();
  if (!w) {
    job.resolve(fail(job.id, { message: "Web Workers are not available in this browser", line: null, col: null, kind: "worker" }));
    pump();
    return;
  }
  current = job;
  const cs = job.req.candles;
  const n = cs.length;
  const t = new Float64Array(n);
  const o = new Float64Array(n);
  const h = new Float64Array(n);
  const l = new Float64Array(n);
  const c = new Float64Array(n);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = cs[i];
    t[i] = k.t;
    o[i] = k.o;
    h[i] = k.h;
    l[i] = k.l;
    c[i] = k.c;
    v[i] = k.v;
  }
  job.timer = setTimeout(() => {
    if (current !== job) return;
    killWorker();
    finish(job, fail(job.id, { message: `Script timed out (over ${SCRIPT_LIMITS.timeoutMs / 1000} s): possible infinite loop`, line: null, col: null, kind: "timeout" }));
  }, SCRIPT_LIMITS.timeoutMs);
  try {
    w.postMessage(
      { type: "run", id: job.id, code: job.req.code, params: job.req.params, interval: job.req.interval, precision: job.req.precision, t, o, h, l, c, v, limits: SCRIPT_LIMITS },
      [t.buffer, o.buffer, h.buffer, l.buffer, c.buffer, v.buffer],
    );
  } catch (e) {
    killWorker();
    finish(job, fail(job.id, { message: String((e as Error)?.message ?? e), line: null, col: null, kind: "worker" }));
  }
}

/** Runs one script over the candles. Never rejects: failures come back as { ok:false, error }. */
export function runInWorker(req: RunRequest): Promise<WorkerDone> {
  return new Promise((resolve) => {
    queue.push({ id: ++seq, req, resolve, timer: null });
    pump();
  });
}

/** True when the browser can run scripts at all. */
export function scriptsSupported(): boolean {
  return typeof Worker !== "undefined" && typeof Blob !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}
