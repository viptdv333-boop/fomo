/**
 * Bybit instrument category carried inside the terminal ticker (so saved layouts, watchlists and alerts keep one string id):
 *
 *   BTCUSDT            spot (as always)
 *   BTCUSDT.P          USDT / USDC linear perpetual   -> category=linear, symbol=BTCUSDT
 *   BTCPERP.P          USDC linear perpetual          -> category=linear, symbol=BTCPERP
 *   BTCUSDT-26DEC25    dated linear future            -> category=linear, symbol as is ("-" is Bybit's own format)
 *   BTC-26DEC25        dated USDC future              -> category=linear, symbol as is
 *   BTCUSD.I           inverse perpetual              -> category=inverse, symbol=BTCUSD
 *   BTCUSDZ25.I        dated inverse future           -> category=inverse, symbol=BTCUSDZ25
 *
 * Pure, safe on the client and the server.
 */

export type BybitCategory = "spot" | "linear" | "inverse";

export interface BybitTicker {
  category: BybitCategory;
  /** the symbol the Bybit API expects */
  symbol: string;
  /** perpetual (no expiry) */
  perpetual: boolean;
}

export function parseBybitTicker(ticker: string): BybitTicker {
  const t = ticker.trim();
  if (/\.P$/i.test(t)) return { category: "linear", symbol: t.slice(0, -2).toUpperCase(), perpetual: true };
  if (/\.I$/i.test(t)) {
    const symbol = t.slice(0, -2).toUpperCase();
    // dated inverse symbols end in <month letter><yy> (BTCUSDZ25), perpetual ones in USD
    return { category: "inverse", symbol, perpetual: !/[FGHJKMNQUVXZ]\d{2}$/.test(symbol) };
  }
  if (/^[A-Za-z0-9]+-\d{1,2}[A-Za-z]{3}\d{2}/.test(t)) return { category: "linear", symbol: t.toUpperCase(), perpetual: false };
  return { category: "spot", symbol: t, perpetual: false };
}

/** The terminal ticker of a Bybit instrument. */
export function bybitTicker(category: BybitCategory, symbol: string, perpetual: boolean): string {
  if (category === "spot") return symbol;
  if (category === "linear") return perpetual ? `${symbol}.P` : symbol;
  return `${symbol}.I`;
}
