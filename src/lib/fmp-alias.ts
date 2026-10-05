/** FMP symbols that exist in the instruments table under a name FMP itself does not serve. */
const FMP_ALIAS: Record<string, string> = {
  BRTUSD: "BZUSD", // Brent spot: FMP has no BRTUSD, its Brent series is BZUSD
  // The «(спот)» instruments of the database carry spot-style tickers, but FMP serves only CME/NYMEX/COMEX/ICE futures for them
  // (continuous front month, see /stable/commodities-list): show those series instead of an empty chart.
  WTIUSD: "CLUSD", // WTI crude oil (NYMEX)
  XAUUSD: "GCUSD", // gold (COMEX)
  XAGUSD: "SIUSD", // silver (COMEX)
  XPTUSD: "PLUSD", // platinum (NYMEX)
  XPDUSD: "PAUSD", // palladium (NYMEX)
  XCUUSD: "HGUSD", // copper (COMEX)
};

export function fmpSymbol(ticker: string): string {
  return FMP_ALIAS[ticker.toUpperCase()] ?? ticker;
}
