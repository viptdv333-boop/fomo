/** Saved chart identity must accept every data source supported by the terminal. */
import type { ChartSource } from "./terminal-data";

const SOURCES: Record<Exclude<ChartSource, "none">, true> = {
  moex:true, fmp:true, bybit:true, binance:true, forex:true, instaforex:true,
  databento:true, twelvedata:true, yahoo:true,
};
const SYMBOL = /^(?:[A-Za-z0-9_^=.-]{1,30}|[A-Za-z][A-Za-z0-9_.]{0,20}[12]!)$/;
export function selectionSource(value: unknown): Exclude<ChartSource,"none"> | null {
  return typeof value === "string" && Object.hasOwn(SOURCES,value) ? value as Exclude<ChartSource,"none"> : null;
}
export interface SavedSelection { symbol:string; source:Exclude<ChartSource,"none"> }
export function savedSelection(raw: string | null): SavedSelection | null {
  try {
    const value=JSON.parse(raw ?? "null");
    const source=selectionSource(value?.source);
    return source && typeof value?.dataTicker === "string" && SYMBOL.test(value.dataTicker)
      ? {symbol:value.dataTicker,source} : null;
  } catch { return null; }
}
/** Account/device state wins over stale URLs written by old releases. */
export function restoredSelection(raw: string | null, search: string): {symbol:string;source:Exclude<ChartSource,"none"> | null} | null {
  const stored=savedSelection(raw);
  if(stored) return stored;
  const params=new URLSearchParams(search), symbol=params.get("symbol")?.trim();
  return symbol && SYMBOL.test(symbol) ? {symbol,source:selectionSource(params.get("source"))} : null;
}
