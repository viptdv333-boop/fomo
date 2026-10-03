/** FMP symbols that exist in the instruments table under a name FMP itself does not serve. */
const FMP_ALIAS: Record<string, string> = {
  BRTUSD: "BZUSD", // Brent spot: FMP has no BRTUSD, its Brent series is BZUSD
};

export function fmpSymbol(ticker: string): string {
  return FMP_ALIAS[ticker.toUpperCase()] ?? ticker;
}
