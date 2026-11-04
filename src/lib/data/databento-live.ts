/**
 * Databento LIVE stream on the key of the user who asks (server only): the newest minutes the historical API does not have yet.
 * Raw Live API: a TCP connection to <dataset>.lsg.databento.com:13000, the gateway greets with `lsg_version=..` and `cram=<challenge>`, the client
 * answers `auth=<sha256(challenge|key)>-<last 5 of the key>|dataset=..|encoding=json|..`, then subscribes (`schema=ohlcv-1s|stype_in=..|symbols=..`)
 * and sends `start_session`; from then on the gateway sends JSON lines (one record each). The 1-second bars are folded into 1-minute bars that
 * the candle and quote routes lay over the historical ones.
 *
 * One session per (key, dataset), opened by the first request for an instrument and closed after it has been idle for a while. It never throws:
 * a refused key, a missing live licence or a dropped connection leaves the historical data as it was (`state` tells why).
 */
import { createHash } from "node:crypto";
import net from "node:net";
import { keyId } from "./moex-keys";

export interface LiveBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface LiveSpec {
  dataset: string;
  /** the symbol sent to the gateway (ES.c.0, AAPL) */
  symbol: string;
  stype: "continuous" | "raw_symbol";
}

export type LiveState = "connecting" | "live" | "refused" | "closed";

const MIN = 60_000;
const IDLE_MS = 10 * MIN;
const KEEP_MINUTES = 600;
const MAX_SESSIONS = 60;
const MAX_SYMBOLS = 40;
const FIXED = 1e9;
const UNDEF_PRICE = 9.2e18;

interface SymState {
  /** minute start (ms) -> the minute bar so far */
  minutes: Map<number, LiveBar>;
  /** the last 1-second bar's close and time */
  last: number;
  lastAt: number;
  lastUse: number;
}

class Session {
  state: LiveState = "connecting";
  reason = "";
  readonly syms = new Map<string, SymState>();
  /** gateway instrument id -> the symbol we subscribed with */
  private ids = new Map<number, string>();
  private sock: net.Socket | null = null;
  private buf = "";
  private authed = false;
  private started = false;
  private pending: LiveSpec[] = [];
  private lastUse = Date.now();
  private idleTimer: ReturnType<typeof setInterval> | null = null;
  private retryAt = 0;

  constructor(
    private key: string,
    private dataset: string,
    private onClose: () => void,
  ) {
    this.connect();
    this.idleTimer = setInterval(() => {
      if (Date.now() - this.lastUse > IDLE_MS) this.close();
    }, 60_000);
    (this.idleTimer as any).unref?.();
  }

  /** the instrument is wanted: subscribe to it (once) and mark it used */
  want(spec: LiveSpec): SymState | null {
    this.lastUse = Date.now();
    if (this.state === "closed" || this.state === "refused") {
      // a refused key (no live licence yet) is tried again after a while, a dropped line sooner
      if (Date.now() > this.retryAt) this.reopen();
      else return null;
    }
    let st = this.syms.get(spec.symbol);
    if (!st) {
      if (this.syms.size >= MAX_SYMBOLS) return null;
      st = { minutes: new Map(), last: 0, lastAt: 0, lastUse: Date.now() };
      this.syms.set(spec.symbol, st);
      if (this.started) this.subscribe(spec);
      else this.pending.push(spec);
    }
    st.lastUse = Date.now();
    return st;
  }

  private reopen() {
    this.state = "connecting";
    this.authed = false;
    this.started = false;
    this.buf = "";
    // everything wanted before is subscribed again on the new connection
    this.pending = [...this.syms.keys()].map((symbol) => ({ dataset: this.dataset, symbol, stype: /\.[cv]\.\d+$/.test(symbol) ? "continuous" : "raw_symbol" }) as LiveSpec);
    this.connect();
  }

  private connect() {
    // DATABENTO_LIVE_MOCK=127.0.0.1:PORT points the checks at a local mock gateway: the key is never sent to any other address than Databento's own
    const mock = (process.env.DATABENTO_LIVE_MOCK ?? "").match(/^(127\.0\.0\.1|localhost):(\d{2,5})$/);
    const host = mock ? mock[1] : `${this.dataset.toLowerCase().replace(/\./g, "-")}.lsg.databento.com`;
    const s = net.connect({ host, port: mock ? Number(mock[2]) : 13000 });
    this.sock = s;
    s.setEncoding("utf8");
    s.setTimeout(45_000, () => s.destroy()); // the gateway sends heartbeats; silence means a dead line
    s.on("data", (chunk: string) => this.onData(chunk));
    s.on("error", () => {
      /* handled by close */
    });
    s.on("close", () => {
      if (this.state !== "refused") {
        this.state = "closed";
        this.retryAt = Date.now() + 15_000;
      }
      this.sock = null;
    });
  }

  private write(line: string) {
    this.sock?.write(`${line}\n`);
  }

  private subscribe(spec: LiveSpec) {
    this.write(`schema=ohlcv-1s|stype_in=${spec.stype}|symbols=${spec.symbol}|snapshot=0|is_last=1`);
  }

  private onData(chunk: string) {
    this.buf += chunk;
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl).trim();
      this.buf = this.buf.slice(nl + 1);
      if (line) this.onLine(line);
    }
    if (this.buf.length > 1_000_000) this.buf = "";
  }

  private onLine(line: string) {
    if (!this.authed) {
      if (line.startsWith("cram=")) {
        const challenge = line.slice(5);
        const hash = createHash("sha256").update(`${challenge}|${this.key}`).digest("hex");
        this.write(`auth=${hash}-${this.key.slice(-5)}|dataset=${this.dataset}|encoding=json|ts_out=0|client=fomo-terminal`);
      } else if (line.startsWith("success=")) {
        const kv = Object.fromEntries(line.split("|").map((p) => p.split("=") as [string, string]));
        if (kv.success === "1") {
          this.authed = true;
          for (const spec of this.pending.splice(0)) this.subscribe(spec);
          this.write("start_session");
          this.started = true;
          this.state = "live";
        } else {
          this.state = "refused";
          this.retryAt = Date.now() + 10 * MIN;
          this.reason = String(kv.error ?? "auth").slice(0, 160);
          this.sock?.destroy();
        }
      }
      return;
    }
    if (line[0] !== "{") return;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      return;
    }
    const hd = r?.hd;
    if (!hd) return;
    // symbol mapping: instrument id -> the symbol we asked for
    if (r.stype_in_symbol !== undefined && hd.instrument_id !== undefined) {
      this.ids.set(Number(hd.instrument_id), String(r.stype_in_symbol));
      return;
    }
    if (r.open === undefined || r.close === undefined) return;
    const sym = this.ids.get(Number(hd.instrument_id));
    const st = sym ? this.syms.get(sym) : undefined;
    if (!st) return;
    const t = tsMs(hd.ts_event);
    const o = px(r.open);
    const h = px(r.high);
    const l = px(r.low);
    const c = px(r.close);
    if (!(t > 0) || !(c > 0) || !(o > 0) || !(h > 0) || !(l > 0)) return;
    const v = Number(r.volume) || 0;
    const m = Math.floor(t / MIN) * MIN;
    const cur = st.minutes.get(m);
    if (!cur) {
      st.minutes.set(m, { timestamp: m, open: o, high: h, low: l, close: c, volume: v });
      if (st.minutes.size > KEEP_MINUTES) for (const k of [...st.minutes.keys()].sort((a, b) => a - b).slice(0, st.minutes.size - KEEP_MINUTES)) st.minutes.delete(k);
    } else {
      cur.high = Math.max(cur.high, h);
      cur.low = Math.min(cur.low, l);
      cur.close = c;
      cur.volume += v;
    }
    st.last = c;
    st.lastAt = t;
  }

  close() {
    this.state = "closed";
    this.retryAt = Date.now() + 15_000;
    if (this.idleTimer) clearInterval(this.idleTimer);
    this.idleTimer = null;
    this.sock?.destroy();
    this.onClose();
  }
}

/** ts_event: nanoseconds since the epoch as a string / number, or an ISO time */
function tsMs(v: unknown): number {
  if (typeof v === "string" && /^\d+$/.test(v)) return Math.floor(Number(v) / 1e6);
  if (typeof v === "number") return Math.floor(v / 1e6);
  const t = Date.parse(String(v ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/** a price: a decimal string, or the gateway's fixed-point integer (1e-9) */
function px(v: unknown): number {
  if (typeof v === "string") {
    if (v.includes(".")) return parseFloat(v);
    const n = Number(v);
    return n >= UNDEF_PRICE ? 0 : n / FIXED;
  }
  if (typeof v === "number") return v >= UNDEF_PRICE ? 0 : Number.isInteger(v) && Math.abs(v) > 1e8 ? v / FIXED : v;
  return 0;
}

const G = globalThis as unknown as { __fomoDbLive?: Map<string, Session> };
const SESSIONS: Map<string, Session> = (G.__fomoDbLive ??= new Map());

/**
 * The live minute bars of an instrument on this key (empty until the gateway has delivered something: the first request only opens the session).
 * `state` says why there is nothing: "refused" (the key has no live licence for the dataset) or "closed".
 */
export function liveOf(key: string, spec: LiveSpec): { bars: LiveBar[]; last: number; lastAt: number; state: LiveState; reason: string } {
  const id = `${keyId(key)}|${spec.dataset}`;
  let s = SESSIONS.get(id);
  if (!s) {
    if (SESSIONS.size >= MAX_SESSIONS) return { bars: [], last: 0, lastAt: 0, state: "closed", reason: "busy" };
    s = new Session(key, spec.dataset, () => {
      if (SESSIONS.get(id) === s) SESSIONS.delete(id);
    });
    SESSIONS.set(id, s);
  }
  const st = s.want(spec);
  if (!st) return { bars: [], last: 0, lastAt: 0, state: s.state, reason: s.reason };
  return { bars: [...st.minutes.values()].sort((a, b) => a.timestamp - b.timestamp), last: st.last, lastAt: st.lastAt, state: s.state, reason: s.reason };
}
