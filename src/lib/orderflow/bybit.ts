import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import { MinuteBook } from "./book";
import type { FlowSource } from "./aggregate";
import type { PrepareResult } from "./types";
import { BigBook, type Big } from "./big";

/* Bybit SPOT trades.
   History: the exchange publishes one gzip CSV per symbol and UTC day at public.bybit.com/spot (about 8 MB for BTCUSDT,
   ready a couple of hours after midnight UTC) with the taker side of every trade. It is parsed once, aggregated per minute
   and price level, and kept in memory.
   Today: a public WebSocket collector (publicTrade) fills the gap while somebody is looking at the chart; it starts empty,
   so the part of today before the first request has no tick data (the client falls back to an approximation there). */

const DAY_MIN = 1440;
const MAX_DAYS = 14;
const FILE_HOST = "https://public.bybit.com/spot";
const WS_URL = "wss://stream.bybit.com/v5/public/spot";
const RETRY_MS = 10 * 60_000;
const LIVE_IDLE_MS = 10 * 60_000;
const SYMBOL_IDLE_MS = 90 * 60_000;
const MAX_SYMBOLS = 4;
const BLOCK_MS = 3 * 3_600_000;

interface DayState {
  status: "loading" | "ready" | "missing";
  book?: MinuteBook;
  big?: BigBook;
  promise?: Promise<void>;
  at: number;
}

interface Seg {
  from: number;
  to: number | null;
}

class LiveCollector {
  book = new MinuteBook();
  /** Largest trades per 3-hour block. */
  bigBlocks = new Map<number, BigBook>();
  segs: Seg[] = [];
  lastUse = Date.now();
  private ws: any = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private lastMinute = 0;
  private closed = false;
  private failures = 0;

  constructor(private symbol: string) {}

  async start() {
    if (this.closed || this.ws) return;
    let Ctor: any = (globalThis as any).WebSocket;
    if (!Ctor) {
      try {
        const mod: any = await import(/* webpackIgnore: true */ "ws");
        Ctor = mod.default ?? mod.WebSocket ?? mod;
      } catch {
        return;
      }
    }
    if (this.closed || this.ws) return;
    let ws: any;
    try {
      ws = new Ctor(WS_URL);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    let firstInSeg = true;
    ws.onopen = () => {
      this.failures = 0;
      try {
        ws.send(JSON.stringify({ op: "subscribe", args: [`publicTrade.${this.symbol}`] }));
      } catch {}
      this.ping = setInterval(() => {
        try {
          ws.send(JSON.stringify({ op: "ping" }));
        } catch {}
      }, 20_000);
    };
    ws.onmessage = (ev: any) => {
      let msg: any;
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      const data = msg?.data;
      if (!Array.isArray(data) || typeof msg.topic !== "string") return;
      for (const tr of data) {
        const T = Number(tr.T);
        const p = Number(tr.p);
        const v = Number(tr.v);
        if (!(T > 0) || !(p > 0) || !(v > 0)) continue;
        const minute = Math.floor(T / 60_000);
        if (firstInSeg) {
          firstInSeg = false;
          // the first minute is partial: coverage starts at the next full one
          this.segs.push({ from: (minute + 1) * 60_000, to: null });
          if (this.segs.length > 4) this.segs.shift();
        }
        this.book.add(minute, p, tr.S === "Buy", v);
        const blk = Math.floor(T / BLOCK_MS);
        let bb = this.bigBlocks.get(blk);
        if (!bb) {
          bb = new BigBook(300);
          this.bigBlocks.set(blk, bb);
          for (const k of this.bigBlocks.keys()) if (k < blk - 24) this.bigBlocks.delete(k);
        }
        bb.add(T, p, v, tr.S === "Buy");
        if (minute > this.lastMinute) {
          this.lastMinute = minute;
          this.book.freezeBefore(minute - 1);
          this.book.dropBefore(minute - 3 * DAY_MIN);
        }
      }
    };
    const onEnd = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      const seg = this.segs[this.segs.length - 1];
      if (seg && seg.to === null) seg.to = Math.max(seg.from, this.lastMinute * 60_000);
      if (!this.closed) this.scheduleRetry();
    };
    ws.onclose = onEnd;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
      onEnd();
    };
  }

  private scheduleRetry() {
    if (this.closed || this.retry) return;
    this.failures++;
    const wait = Math.min(60_000, 1500 * 2 ** Math.min(6, this.failures));
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.start();
    }, wait);
  }

  close() {
    this.closed = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === 1;
  }
}

class Symbol_ {
  days = new Map<number, DayState>();
  live: LiveCollector;
  lastUse = Date.now();
  tick = 0;
  constructor(public symbol: string) {
    this.live = new LiveCollector(symbol);
  }
}

interface BybitState {
  syms: Map<string, Symbol_>;
  queue: Array<() => Promise<void>>;
  running: number;
  timer: ReturnType<typeof setInterval> | null;
}
const G = globalThis as unknown as { __fomoBybitFlow?: BybitState };
const state: BybitState = (G.__fomoBybitFlow ??= { syms: new Map(), queue: [], running: 0, timer: null });

function pump() {
  while (state.running < 2 && state.queue.length) {
    const job = state.queue.shift()!;
    state.running++;
    job().finally(() => {
      state.running--;
      pump();
    });
  }
}

function dayString(dayIdx: number): string {
  return new Date(dayIdx * 86_400_000).toISOString().slice(0, 10);
}

async function loadDay(sym: Symbol_, dayIdx: number, st: DayState): Promise<void> {
  const url = `${FILE_HOST}/${sym.symbol}/${sym.symbol}_${dayString(dayIdx)}.csv.gz`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (res.status === 404 || res.status === 403) {
      st.status = "missing";
      st.at = Date.now();
      return;
    }
    if (!res.ok || !res.body) throw new Error("http " + res.status);
    const book = new MinuteBook();
    const big = new BigBook(500);
    const gunzip = createGunzip();
    Readable.fromWeb(res.body as any).pipe(gunzip);
    let tail = "";
    let prevMinute = -1;
    let header = true;
    for await (const chunk of gunzip as AsyncIterable<Buffer>) {
      const text = tail + chunk.toString("utf8");
      let pos = 0;
      for (;;) {
        const nl = text.indexOf("\n", pos);
        if (nl < 0) break;
        const line = text.slice(pos, nl);
        pos = nl + 1;
        if (header) {
          header = false;
          if (line.startsWith("id")) continue;
        }
        // id,timestamp,price,volume,side,rpi
        const c1 = line.indexOf(",");
        const c2 = line.indexOf(",", c1 + 1);
        const c3 = line.indexOf(",", c2 + 1);
        const c4 = line.indexOf(",", c3 + 1);
        if (c4 < 0) continue;
        const ts = Number(line.slice(c1 + 1, c2));
        const price = Number(line.slice(c2 + 1, c3));
        const vol = Number(line.slice(c3 + 1, c4));
        if (!(ts > 0) || !(price > 0) || !(vol > 0)) continue;
        const buy = line.charCodeAt(c4 + 1) === 98; // "b"uy
        const minute = Math.floor(ts / 60_000);
        if (minute !== prevMinute) {
          if (prevMinute >= 0 && minute > prevMinute) book.freeze(prevMinute);
          prevMinute = minute;
        }
        book.add(minute, price, buy, vol);
        big.add(ts, price, vol, buy);
      }
      tail = text.slice(pos);
    }
    book.freezeBefore(Infinity);
    st.book = book;
    st.big = big;
    st.status = "ready";
    st.at = Date.now();
    const t = book.inferTick();
    if (t > 0 && (sym.tick === 0 || t < sym.tick)) sym.tick = t;
  } catch {
    st.status = "missing";
    st.at = Date.now();
  }
}

function ensureTimer() {
  if (state.timer) return;
  state.timer = setInterval(() => {
    const now = Date.now();
    for (const [k, s] of state.syms) {
      if (now - s.lastUse > LIVE_IDLE_MS && s.live.connected) s.live.close();
      if (now - s.lastUse > SYMBOL_IDLE_MS) {
        s.live.close();
        state.syms.delete(k);
      }
    }
  }, 60_000);
  (state.timer as any).unref?.();
}

function getSymbol(symbol: string): Symbol_ {
  let s = state.syms.get(symbol);
  if (!s) {
    if (state.syms.size >= MAX_SYMBOLS) {
      let oldest: string | null = null;
      for (const [k, v] of state.syms) if (oldest === null || v.lastUse < state.syms.get(oldest)!.lastUse) oldest = k;
      if (oldest) {
        state.syms.get(oldest)!.live.close();
        state.syms.delete(oldest);
      }
    }
    s = new Symbol_(symbol);
    state.syms.set(symbol, s);
    ensureTimer();
  }
  s.lastUse = Date.now();
  return s;
}

export function bybitSupported(ticker: string): boolean {
  return /^[A-Z0-9]{2,20}$/.test(ticker);
}

export async function prepareBybit(ticker: string, fromMs: number, toMs: number): Promise<PrepareResult> {
  const sym = getSymbol(ticker);
  sym.lastUse = Date.now();
  if (!sym.live.connected) void sym.live.start();
  sym.live.lastUse = Date.now();

  const now = Date.now();
  const todayIdx = Math.floor(now / 86_400_000);
  const d0 = Math.max(Math.floor(fromMs / 86_400_000), todayIdx - MAX_DAYS);
  const d1 = Math.min(Math.floor(toMs / 86_400_000), todayIdx);
  let pending = false;
  let newest: Promise<void> | null = null;
  for (let d = d1; d >= d0; d--) {
    if (d >= todayIdx) continue;
    let st = sym.days.get(d);
    if (st && st.status === "missing" && now - st.at > RETRY_MS) st = undefined;
    if (!st) {
      const created: DayState = { status: "loading", at: now };
      created.promise = new Promise<void>((resolve) => {
        state.queue.push(async () => {
          await loadDay(sym, d, created);
          resolve();
        });
      });
      sym.days.set(d, created);
      st = created;
      pump();
    }
    if (st.status === "loading") {
      pending = true;
      if (!newest && st.promise) newest = st.promise;
    }
  }
  if (newest) await Promise.race([newest, new Promise((r) => setTimeout(r, 6000))]);
  // re-evaluate after the wait
  pending = false;
  for (let d = d0; d <= d1; d++) if (d < todayIdx && sym.days.get(d)?.status === "loading") pending = true;

  // evict old day books
  for (const [d] of sym.days) if (d < todayIdx - MAX_DAYS - 1) sym.days.delete(d);

  const cov: [number, number][] = [];
  for (const [d, st] of sym.days) if (st.status === "ready") cov.push([d * 86_400_000, (d + 1) * 86_400_000]);
  for (const s of sym.live.segs) cov.push([s.from, s.to ?? now]);

  if (sym.tick === 0) {
    for (const st of sym.days.values()) {
      if (st.book) {
        const t = st.book.inferTick();
        if (t > 0) {
          sym.tick = t;
          break;
        }
      }
    }
    if (sym.tick === 0) {
      const t = sym.live.book.inferTick();
      if (t > 0) sym.tick = t;
    }
  }

  const source: FlowSource = {
    minute(minute, cb) {
      const st = sym.days.get(Math.floor(minute / DAY_MIN));
      if (st && st.status === "ready" && st.book) {
        if (st.book.has(minute)) {
          st.book.each(minute, cb);
          return true;
        }
        return false;
      }
      if (sym.live.book.has(minute)) {
        sym.live.book.each(minute, cb);
        return true;
      }
      return false;
    },
  };
  const big = (from: number, to: number, limit: number): Big[] => {
    const out: Big[] = [];
    for (let d = Math.floor(from / 86_400_000); d <= Math.floor(to / 86_400_000); d++) {
      const st = sym.days.get(d);
      if (st && st.status === "ready" && st.big) out.push(...st.big.range(from, to, limit));
      else for (const bb of sym.live.bigBlocks.values()) out.push(...bb.range(Math.max(from, d * 86_400_000), Math.min(to, (d + 1) * 86_400_000), limit));
    }
    out.sort((a, b) => b.v - a.v);
    out.length = Math.min(out.length, limit);
    return out.sort((a, b) => a.t - b.t);
  };
  return { source, big, nativeTick: sym.tick, cov: mergeCov(cov), pending, live: sym.live.connected, bounds: [(todayIdx - MAX_DAYS - 1) * DAY_MIN, Math.floor(now / 60_000)] };
}

export function mergeCov(list: [number, number][]): [number, number][] {
  const a = list.filter((x) => x[1] > x[0]).sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const c of a) {
    const last = out[out.length - 1];
    if (last && c[0] <= last[1] + 60_000) last[1] = Math.max(last[1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}
