// Market data fetchers for MOEX and Bybit

export interface KlineData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ===== MOEX ISS API =====
// Free, no API key needed
// Docs: https://iss.moex.com/iss/reference/

const MOEX_INTERVALS: Record<string, number> = {
  "1": 1,    // 1 min
  "5": 5,
  "15": 15,  // 15 min (10 on MOEX)
  "60": 60,  // 1 hour
  "240": 60, // 4h — MOEX doesn't have 4h, use 1h
  "D": 24,   // Day
  "W": 7,    // Week
  "M": 31,   // Month
};

export async function fetchMoexKlines(
  ticker: string,
  interval: string = "D",
  limit: number = 300
): Promise<KlineData[]> {
  try {
    if (interval === "D" || interval === "W" || interval === "M") {
      // Use history endpoint for daily+
      const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${ticker}/candles.json?interval=${interval === "D" ? 24 : interval === "W" ? 7 : 31}&from=${getDateOffset(limit, interval)}&iss.meta=off`;
      const res = await fetch(url);
      if (!res.ok) {
        // Try currency market
        return fetchMoexCurrencyKlines(ticker, interval, limit);
      }
      const data = await res.json();
      const candles = data.candles?.data;
      if (!candles || candles.length === 0) {
        return fetchMoexCurrencyKlines(ticker, interval, limit);
      }
      return candles.map((c: any[]) => ({
        timestamp: new Date(c[6]).getTime(),
        open: c[0],
        close: c[1],
        high: c[2],
        low: c[3],
        volume: c[5],
      }));
    } else {
      // Intraday
      const moexInterval = MOEX_INTERVALS[interval] || 60;
      const url = `https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/${ticker}/candles.json?interval=${moexInterval}&from=${getDateOffset(5, "D")}&iss.meta=off`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      const candles = data.candles?.data;
      if (!candles) return [];
      return candles.slice(-limit).map((c: any[]) => ({
        timestamp: new Date(c[6]).getTime(),
        open: c[0],
        close: c[1],
        high: c[2],
        low: c[3],
        volume: c[5],
      }));
    }
  } catch {
    return [];
  }
}

async function fetchMoexCurrencyKlines(
  ticker: string,
  interval: string,
  limit: number
): Promise<KlineData[]> {
  try {
    // Try futures market
    const moexInterval = interval === "D" ? 24 : interval === "W" ? 7 : interval === "M" ? 31 : (MOEX_INTERVALS[interval] || 60);
    const url = `https://iss.moex.com/iss/engines/currency/markets/selt/boards/CETS/securities/${ticker}/candles.json?interval=${moexInterval}&from=${getDateOffset(limit, interval)}&iss.meta=off`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const candles = data.candles?.data;
    if (!candles || candles.length === 0) return [];
    return candles.map((c: any[]) => ({
      timestamp: new Date(c[6]).getTime(),
      open: c[0],
      close: c[1],
      high: c[2],
      low: c[3],
      volume: c[5],
    }));
  } catch {
    return [];
  }
}

// ===== BYBIT API =====
// Free, no API key needed for public market data
// Docs: https://bybit-exchange.github.io/docs/v5/market/kline

const BYBIT_INTERVALS: Record<string, string> = {
  "1": "1",
  "5": "5",
  "15": "15",
  "60": "60",
  "240": "240",
  "D": "D",
  "W": "W",
  "M": "M",
};

export async function fetchBybitKlines(
  symbol: string,
  interval: string = "D",
  limit: number = 300
): Promise<KlineData[]> {
  try {
    const bybitInterval = BYBIT_INTERVALS[interval] || "D";
    const url = `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    if (data.retCode !== 0 || !data.result?.list) return [];

    // Bybit returns newest first, reverse for chronological order
    return data.result.list
      .reverse()
      .map((c: string[]) => ({
        timestamp: parseInt(c[0]),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));
  } catch {
    return [];
  }
}

// ===== Helpers =====

function getDateOffset(count: number, interval: string): string {
  const d = new Date();
  switch (interval) {
    case "M": d.setMonth(d.getMonth() - count); break;
    case "W": d.setDate(d.getDate() - count * 7); break;
    case "D": d.setDate(d.getDate() - count); break;
    default: d.setDate(d.getDate() - 5); break; // intraday — last 5 days
  }
  return d.toISOString().slice(0, 10);
}

// ===== Universal fetcher =====

export type DataSource = "moex" | "bybit" | "none";

export async function fetchKlines(
  source: DataSource,
  ticker: string,
  interval: string = "D",
  limit: number = 300
): Promise<KlineData[]> {
  switch (source) {
    case "moex":
      return fetchMoexKlines(ticker, interval, limit);
    case "bybit":
      return fetchBybitKlines(ticker, interval, limit);
    default:
      return [];
  }
}
