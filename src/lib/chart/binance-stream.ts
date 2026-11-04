/* The public trade stream of a Binance spot pair (browser WebSocket, never throws): the same shape as BybitTradeStream (seconds-feed.ts), so the chart
   draws the forming bar of Binance charts tick by tick. Reconnects by itself until stopped. */
import type { StreamState, Trade } from "./seconds-feed";

const HOSTS = ["wss://data-stream.binance.vision/ws", "wss://stream.binance.com:9443/ws"];

export class BinanceTradeStream {
  private ws: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private failures = 0;
  private readonly symbol: string;

  constructor(
    ticker: string,
    private onTrades: (trades: Trade[]) => void,
    private onState: (s: StreamState) => void,
  ) {
    this.symbol = ticker.trim().toLowerCase();
  }

  start() {
    this.stopped = false;
    this.open();
  }

  stop() {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {}
  }

  private open() {
    if (this.stopped || this.ws) return;
    if (typeof WebSocket === "undefined" || !/^[a-z0-9]{2,20}$/.test(this.symbol)) {
      this.onState("error");
      return;
    }
    this.onState("connecting");
    let ws: WebSocket;
    try {
      // the market-data-only host first, the main one when it does not answer
      ws = new WebSocket(`${HOSTS[this.failures % HOSTS.length]}/${this.symbol}@trade`);
    } catch {
      this.fail();
      return;
    }
    this.ws = ws;
    ws.onmessage = (ev) => {
      let m: { e?: unknown; T?: unknown; p?: unknown; q?: unknown };
      try {
        m = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data));
      } catch {
        return;
      }
      if (m.e !== "trade") return;
      const t = Number(m.T);
      const p = Number(m.p);
      const v = Number(m.q);
      if (!(t > 0) || !(p > 0)) return;
      this.failures = 0;
      this.onState("live");
      this.onTrades([{ t, p, v: v > 0 ? v : 0 }]);
    };
    const end = () => {
      if (this.ws !== ws) return;
      this.ws = null;
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
    }, Math.min(30_000, 1_500 * 2 ** Math.min(this.failures, 4)));
  }
}
