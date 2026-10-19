/* Live second candles (1s ... 30s). No upstream serves second history (Bybit REST has none, ISS and T-Invest have none), so these bars exist only from the
   moment a chart is opened: the browser subscribes to the exchange's public trade stream and folds the trades into N-second bars. Nothing is invented
   for the time before: the series starts empty and the first trade opens its first bar. A second without a trade has no bar (like TradingView).

   `foldTrades` is pure (scripts/check-timeframes.ts); `BybitTradeStream` is the WebSocket around it (browser only, never throws). */
import type { Candle } from "./types";
import { parseBybitTicker, type BybitCategory } from "../bybit-symbol";

export interface Trade {
  /** trade time, UTC ms */
  t: number;
  p: number;
  v: number;
}

/**
 * Folds trades (ascending, as the exchange delivers them) into `periodMs` bars after `last` (the newest bar of the chart, or undefined for an empty chart).
 * Returns the bars that changed, ascending: the first one may be `last` itself updated. A trade older than the bucket of `last` is dropped (the bar
 * it belongs to is closed), and so is a trade without a usable price.
 */
export function foldTrades(last: Candle | undefined, trades: readonly Trade[], periodMs: number): Candle[] {
  const out: Candle[] = [];
  let cur: Candle | undefined = last ? { ...last } : undefined;
  /** `cur` differs from what the chart already has */
  let dirty = false;
  for (const tr of trades) {
    if (!(tr.p > 0) || !Number.isFinite(tr.t) || !(periodMs > 0)) continue;
    const bucket = Math.floor(tr.t / periodMs) * periodMs;
    const vol = tr.v > 0 ? tr.v : 0;
    if (cur && bucket < cur.t) continue;
    if (cur && bucket === cur.t) {
      cur.h = Math.max(cur.h, tr.p);
      cur.l = Math.min(cur.l, tr.p);
      cur.c = tr.p;
      cur.v += vol;
      dirty = true;
      continue;
    }
    if (cur && dirty) out.push(cur);
    cur = { t: bucket, o: tr.p, h: tr.p, l: tr.p, c: tr.p, v: vol };
    dirty = true;
  }
  if (cur && dirty) out.push(cur);
  return out;
}

export type StreamState = "connecting" | "live" | "error";

const WS_HOSTS: Record<BybitCategory, string> = {
  spot: "wss://stream.bybit.com/v5/public/spot",
  linear: "wss://stream.bybit.com/v5/public/linear",
  inverse: "wss://stream.bybit.com/v5/public/inverse",
};

/** The public trade stream of a Bybit instrument (the terminal ticker: BTCUSDT, BTCUSDT.P, BTCUSD.I ...). Reconnects by itself until stopped. */
export class BybitTradeStream {
  private ws: WebSocket | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failures = 0;
  private readonly category: BybitCategory;
  private readonly symbol: string;

  constructor(
    ticker: string,
    private onTrades: (trades: Trade[]) => void,
    private onState: (s: StreamState) => void,
  ) {
    const bb = parseBybitTicker(ticker);
    this.category = bb.category;
    this.symbol = bb.symbol;
  }

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    if (this.ping) clearInterval(this.ping);
    this.retry = this.ping = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
  }

  private open() {
    if (this.stopped || this.ws) return;
    if (typeof WebSocket === "undefined") {
      this.onState("error");
      return;
    }
    this.onState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_HOSTS[this.category]);
    } catch {
      this.fail();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      try {
        ws.send(JSON.stringify({ op: "subscribe", args: [`publicTrade.${this.symbol}`] }));
      } catch {}
      this.ping = setInterval(() => {
        try {
          ws.send(JSON.stringify({ op: "ping" }));
        } catch {}
      }, 20_000);
    };
    ws.onmessage = (ev) => {
      let msg: { topic?: unknown; data?: unknown };
      try {
        msg = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (typeof msg.topic !== "string" || !msg.topic.startsWith("publicTrade.") || !Array.isArray(msg.data)) return;
      const list: Trade[] = [];
      for (const r of msg.data as { T?: unknown; p?: unknown; v?: unknown }[]) {
        const t = Number(r.T);
        const p = Number(r.p);
        const v = Number(r.v);
        if (t > 0 && p > 0) list.push({ t, p, v: v > 0 ? v : 0 });
      }
      if (list.length === 0) return;
      list.sort((a, b) => a.t - b.t);
      this.failures = 0;
      this.onState("live");
      this.onTrades(list);
    };
    const end = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      if (!this.stopped) this.fail();
    };
    ws.onclose = end;
    ws.onerror = () => {
      try {
        ws.close();
      } catch {}
      end();
    };
  }

  private fail() {
    this.failures++;
    this.onState("error");
    if (this.stopped) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.open();
    }, Math.min(30_000, 2_000 * 2 ** Math.min(this.failures, 4)));
  }
}
