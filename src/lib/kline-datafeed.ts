/**
 * Custom MOEX Datafeed for KlineChart Pro.
 * Implements the Datafeed interface to provide MOEX candles + Tinkoff real-time quotes.
 */

import type { KLineData } from "klinecharts";
import type {
  Datafeed,
  SymbolInfo,
  Period,
  DatafeedSubscribeCallback,
} from "@klinecharts/pro";

/** Map KlineChart Pro period to our API interval string */
function periodToInterval(period: Period): string {
  const { multiplier, timespan } = period;
  switch (timespan) {
    case "minute":
      return String(multiplier); // "1", "5", "15", "60"
    case "hour":
      return String(multiplier * 60); // "60", "240"
    case "day":
      return "D";
    case "week":
      return "W";
    case "month":
      return "M";
    default:
      return "D";
  }
}

export class MoexDatafeed implements Datafeed {
  private _pollingTimers = new Map<string, ReturnType<typeof setInterval>>();
  private _symbolsCache: SymbolInfo[] | null = null;

  private _subKey(symbol: SymbolInfo, period: Period): string {
    return `${symbol.ticker}_${period.timespan}_${period.multiplier}`;
  }

  async searchSymbols(search?: string): Promise<SymbolInfo[]> {
    if (!this._symbolsCache) {
      try {
        const r = await fetch("/api/instruments");
        const instruments = await r.json();
        this._symbolsCache = instruments
          .filter((i: any) => i.dataSource && i.dataTicker)
          .map((i: any) => ({
            ticker: i.dataTicker || i.ticker,
            name: i.name,
            shortName: i.ticker || i.dataTicker,
            exchange: i.exchange || "MOEX",
            market: "moex",
            pricePrecision: 2,
            volumePrecision: 0,
            priceCurrency: "rub",
            type: "stock",
          }));
      } catch {
        return [];
      }
    }

    if (!search) return this._symbolsCache || [];

    const q = search.toLowerCase();
    return (this._symbolsCache || []).filter(
      (s) =>
        s.ticker.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.shortName && s.shortName.toLowerCase().includes(q))
    );
  }

  async getHistoryKLineData(
    symbol: SymbolInfo,
    period: Period,
    from: number,
    to: number
  ): Promise<KLineData[]> {
    const interval = periodToInterval(period);
    try {
      const r = await fetch(
        `/api/klines?source=moex&ticker=${encodeURIComponent(symbol.ticker)}&interval=${interval}&limit=500`
      );
      const j = await r.json();
      const c = j.candles ?? j;
      if (!Array.isArray(c) || c.length === 0) return [];

      return c.map((d: any) => ({
        timestamp: d.timestamp,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close,
        volume: d.volume || 0,
      }));
    } catch {
      return [];
    }
  }

  subscribe(
    symbol: SymbolInfo,
    period: Period,
    callback: DatafeedSubscribeCallback
  ): void {
    const key = this._subKey(symbol, period);
    // Clear existing subscription
    this.unsubscribe(symbol, period);

    const interval = periodToInterval(period);
    const isIntraday = ["minute", "hour"].includes(period.timespan);
    const pollMs = isIntraday ? 4000 : 12000;

    let lastBar: KLineData | null = null;

    const poll = async () => {
      try {
        const r = await fetch(
          `/api/quote?source=moex&ticker=${encodeURIComponent(symbol.ticker)}&_t=${Date.now()}`,
          { cache: "no-store" }
        );
        if (!r.ok) return;
        const q = await r.json();
        if (!q.price) return;

        const now = Date.now();
        const curPeriod = getCurrentPeriodTimestamp(interval) * 1000;

        if (!lastBar || curPeriod > lastBar.timestamp) {
          // New candle period
          lastBar = {
            timestamp: curPeriod,
            open: q.price,
            high: q.price,
            low: q.price,
            close: q.price,
            volume: q.volume || 0,
          };
        } else {
          // Update existing candle
          lastBar.close = q.price;
          lastBar.high = Math.max(lastBar.high, q.price);
          lastBar.low = Math.min(lastBar.low, q.price);
          if (q.volume) lastBar.volume = q.volume;
        }

        callback({ ...lastBar });
      } catch {
        /* silent */
      }
    };

    // First poll after short delay
    setTimeout(poll, 1500);
    this._pollingTimers.set(key, setInterval(poll, pollMs));
  }

  unsubscribe(symbol: SymbolInfo, period: Period): void {
    const key = this._subKey(symbol, period);
    const timer = this._pollingTimers.get(key);
    if (timer) {
      clearInterval(timer);
      this._pollingTimers.delete(key);
    }
  }
}

function getCurrentPeriodTimestamp(tf: string): number {
  const now = Date.now();
  const s = Math.floor(now / 1000);
  switch (tf) {
    case "1":
      return Math.floor(s / 60) * 60;
    case "5":
      return Math.floor(s / 300) * 300;
    case "15":
      return Math.floor(s / 900) * 900;
    case "60":
      return Math.floor(s / 3600) * 3600;
    case "240":
      return Math.floor(s / 14400) * 14400;
    case "D": {
      const d = new Date(now);
      const msk = new Date(d.getTime() + 3 * 3600_000);
      msk.setUTCHours(0, 0, 0, 0);
      return Math.floor((msk.getTime() - 3 * 3600_000) / 1000);
    }
    case "W": {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
      return Math.floor(d.getTime() / 1000);
    }
    case "M": {
      const d = new Date(now);
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    }
    default:
      return Math.floor(s / 86400) * 86400;
  }
}
