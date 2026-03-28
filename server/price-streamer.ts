/**
 * Real-time price streaming via Tinkoff Invest API + Socket.IO
 * Polls GetLastPrices every 2 seconds for subscribed tickers,
 * broadcasts updates through Socket.IO rooms.
 */

import { Server as SocketIOServer } from "socket.io";

const PROD_URL = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const TINKOFF_TOKEN = process.env.TINKOFF_TOKEN || "";

// Known ticker → instrumentId mappings
const SHARE_TICKERS = new Set(["SBER", "GAZP", "LKOH", "YDEX", "ROSN", "GMKN", "NVTK", "PLZL", "MGNT", "VTBR", "TCSG", "MTSS", "AFLT", "ALRS", "NLMK"]);
const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", NG: "NG", GOLD: "GD", SILV: "SV", PLT: "PT", PLD: "PD", CU: "CU",
  Si: "Si", Eu: "Eu", CR: "CR", MIX: "MX", RTS: "RI", NASD: "NA", SPYF: "SF",
  BTCF: "BA", WHEAT: "W4", SUGAR: "SA", COCOA: "CC",
};

interface PriceData {
  price: number;
  time: string;
}

function parseQuotation(q: { units?: string; nano?: number } | null): number {
  if (!q) return 0;
  return parseInt(q.units || "0") + (q.nano || 0) / 1_000_000_000;
}

// Resolve ticker to Tinkoff instrumentId format (e.g., "SBER_TQBR", "BRN6_SPBFUT")
function resolveInstrumentIdSync(ticker: string): string {
  if (SHARE_TICKERS.has(ticker)) return `${ticker}_TQBR`;
  if (FUTURES_PREFIX[ticker]) return `${ticker}_SPBFUT`;
  return `${ticker}_TQBR`;
}

export class PriceStreamer {
  private io: SocketIOServer | null = null;
  private prices = new Map<string, PriceData>();
  private subscriberCount = new Map<string, number>(); // ticker → number of subscribers
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private contractCache = new Map<string, { contract: string; resolved: number }>();

  start(io: SocketIOServer) {
    this.io = io;
    console.log("[PriceStreamer] Started");

    // Poll every 2 seconds
    this.intervalId = setInterval(() => this.pollPrices(), 2000);
  }

  stop() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }

  subscribe(socketId: string, tickers: string[]) {
    for (const ticker of tickers) {
      const count = (this.subscriberCount.get(ticker) || 0) + 1;
      this.subscriberCount.set(ticker, count);

      // Send cached price immediately
      const cached = this.prices.get(ticker);
      if (cached && this.io) {
        this.io.to(socketId).emit("price_update", { ticker, ...cached });
      }
    }
  }

  unsubscribe(socketId: string, tickers: string[]) {
    for (const ticker of tickers) {
      const count = Math.max(0, (this.subscriberCount.get(ticker) || 0) - 1);
      if (count === 0) {
        this.subscriberCount.delete(ticker);
      } else {
        this.subscriberCount.set(ticker, count);
      }
    }
  }

  private async pollPrices() {
    if (!this.io || !TINKOFF_TOKEN) return;

    const tickers = [...this.subscriberCount.keys()];
    if (tickers.length === 0) return;

    try {
      // Resolve tickers to instrumentIds, handling futures contracts
      const instrumentIds: string[] = [];
      const tickerMap = new Map<string, string>(); // instrumentId → original ticker

      for (const ticker of tickers) {
        let instrumentId: string;
        if (FUTURES_PREFIX[ticker]) {
          // Try to get active contract
          const contract = await this.findActiveContract(ticker);
          instrumentId = contract ? `${contract}_SPBFUT` : `${ticker}_SPBFUT`;
        } else {
          instrumentId = resolveInstrumentIdSync(ticker);
        }
        instrumentIds.push(instrumentId);
        tickerMap.set(instrumentId, ticker);
      }

      // Batch request — up to 100 instruments per call
      for (let i = 0; i < instrumentIds.length; i += 100) {
        const batch = instrumentIds.slice(i, i + 100);
        const res = await fetch(`${PROD_URL}.MarketDataService/GetLastPrices`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${TINKOFF_TOKEN}`,
          },
          body: JSON.stringify({
            instrumentId: batch,
            lastPriceType: "LAST_PRICE_EXCHANGE",
          }),
          cache: "no-store" as RequestCache,
        });

        if (!res.ok) continue;
        const data = await res.json();

        for (const lp of data?.lastPrices || []) {
          const price = parseQuotation(lp.price);
          if (price <= 0) continue;

          const instrumentId = lp.instrumentUid ? undefined : batch.find(id => true); // fallback
          const ticker = tickerMap.get(lp.figi || "") || tickerMap.get(batch[data.lastPrices.indexOf(lp)] || "") || "";

          // Find ticker by position in batch
          const idx = (data.lastPrices || []).indexOf(lp);
          const originalTicker = tickerMap.get(batch[idx]) || "";
          if (!originalTicker) continue;

          const prev = this.prices.get(originalTicker);
          const newData: PriceData = {
            price,
            time: lp.time || new Date().toISOString(),
          };

          // Only emit if price changed
          if (!prev || prev.price !== newData.price) {
            this.prices.set(originalTicker, newData);
            this.io!.to(`price_${originalTicker}`).emit("price_update", {
              ticker: originalTicker,
              ...newData,
            });
          }
        }
      }
    } catch (err) {
      // Silent fail — next poll will retry
    }
  }

  private async findActiveContract(baseTicker: string): Promise<string | null> {
    const prefix = FUTURES_PREFIX[baseTicker];
    if (!prefix) return null;

    const cached = this.contractCache.get(baseTicker);
    if (cached && Date.now() - cached.resolved < 3600_000) return cached.contract;

    try {
      const url = "https://iss.moex.com/iss/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE";
      const res = await fetch(url, { cache: "no-store" as RequestCache });
      if (!res.ok) return null;
      const data = await res.json();
      const rows = data.securities?.data;
      if (!rows) return null;

      const today = new Date().toISOString().slice(0, 10);
      const candidates = rows
        .filter((r: any[]) => (r[0] as string).startsWith(prefix) && r[0] !== baseTicker && r[2] && (r[2] as string) >= today)
        .sort((a: any[], b: any[]) => (a[2] as string).localeCompare(b[2] as string));

      const contract = candidates.length > 0 ? (candidates[0][0] as string) : null;
      if (contract) this.contractCache.set(baseTicker, { contract, resolved: Date.now() });
      return contract;
    } catch {
      return null;
    }
  }
}

// Singleton
export const priceStreamer = new PriceStreamer();
