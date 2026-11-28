/** Public InstaForex quote/history feed. No broker account, no shared API credentials. */
import { instaInstrument, type InstaInstrument } from "./instaforex-meta";

export interface InstaCandle { timestamp: number; open: number; high: number; low: number; close: number; volume: number }
export interface InstaQuote { price: number; change: number; changePercent: number; volume: number; time: string }
const QUOTES = "https://quotes.instaforex.com/api/quotesTick";
const CHARTS = "http://client-api.instaforex.com/SoapServices/charts.svc";
const IV: Record<string, [string, number]> = { "1": ["M1", 60], "5": ["M5", 300], "15": ["M15", 900], "30": ["M30", 1800], "60": ["H1", 3600], "240": ["H4", 14400], D: ["D1", 86400], W: ["W1", 604800], M: ["MN", 2678400] };
const cache = new Map<string, { at: number; data: unknown }>();
const flights = new Map<string, Promise<unknown>>();
async function memo<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data as T;
  const running = flights.get(key); if (running) return running as Promise<T>;
  const job = load().then(data => { if (cache.size >= 500) cache.delete(cache.keys().next().value!); cache.set(key, { at: Date.now(), data }); return data; }).finally(() => flights.delete(key));
  flights.set(key, job); return job;
}
const symbolsOf = (r: InstaInstrument) => [r.symbol, ...(r.alternatives ?? [])];
export async function getInstaQuote(id: string): Promise<InstaQuote | null> {
  const row = instaInstrument(id); if (!row) return null;
  return memo(`q:${row.id}`, 8000, async () => {
    try {
      const symbols = symbolsOf(row);
      let data:any[] = [];
      try {
        const r = await fetch(`${QUOTES}?${new URLSearchParams({ q: symbols.join(",") })}`, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0" } });
        if (r.ok) data = await r.json();
      } catch { /* a blocked legacy endpoint must not block the modern public feed */ }
      if (!Array.isArray(data)) data = [];
      if (!data.some((t:any)=>symbols.includes(t.symbol) && +t.lasttime > Date.now()/1000-7*86400)) {
        const modern = await fetch("https://api2-webtrader.ifxdb.com/api/public/quotes/extraData?" + new URLSearchParams({server:"usa2",symbol:row.symbol}), {cache:"no-store",signal:AbortSignal.timeout(10000)});
        data = modern.ok ? await modern.json() : [];
      }
      if (!Array.isArray(data)) return null;
      const ticks = data.filter(t => symbols.some(s => s.toUpperCase() === String(t.symbol).toUpperCase()) && +t.bid > 0 && +t.ask > 0).sort((a,b) => +b.lasttime - +a.lasttime);
      const tick = ticks[0]; if (!tick || +tick.lasttime < Date.now()/1000-7*86400) return null;
      const price = +((+tick.bid + +tick.ask) / 2).toFixed(row.digits);
      const change = Number(tick.change24h) || (Number(tick.open_price)>0 ? price-Number(tick.open_price) : 0), previous = price - change;
      return { price, change, changePercent: previous > 0 ? change / previous * 100 : 0, volume: 0, time: new Date(+tick.lasttime * 1000).toISOString() };
    } catch { return null; }
  });
}

/** XML parser accepts prefixed tags, rejects invalid OHLC and keeps unavailable volume at zero. */
export function parseInstaCandles(xml: string): InstaCandle[] {
  const rows = new Map<number, InstaCandle>();
  for (const match of xml.matchAll(/<(?:\w+:)?Candle\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Candle>/gi)) {
    const field = (name: string) => Number(new RegExp(`<(?:\\w+:)?${name}[^>]*>([^<]+)<\\/(?:\\w+:)?${name}>`, "i").exec(match[1])?.[1]);
    const timestamp = field("Timestamp") * 1000;
    const open = field("Open"), high = field("High"), low = field("Low"), close = field("Close");
    if (!(timestamp > 0) || ![open,high,low,close].every(v => Number.isFinite(v) && v > 0) || high < Math.max(open,close,low) || low > Math.min(open,close)) continue;
    const volume = field("Volume");
    rows.set(timestamp, { timestamp, open, high, low, close, volume: Number.isFinite(volume) && volume > 0 ? volume : 0 });
  }
  return [...rows.values()].sort((a,b) => a.timestamp - b.timestamp);
}

export async function getInstaCandles(id: string, interval: string, limit = 600, to?: number, from?: number): Promise<{ candles: InstaCandle[]; volume: "tick" | "none" }> {
  const row = instaInstrument(id), iv = IV[interval];
  if (!row || !iv) return { candles: [], volume: "none" };
  limit = Math.max(1, Math.min(5000, limit));
  return memo(`c:${row.id}:${interval}:${limit}:${to ?? ""}:${from ?? ""}`, to ? 300000 : 15000, async () => {
    const end = Math.floor((to ?? Date.now()) / 1000);
    // Both timestamps are epoch seconds on the wire; keep enough calendar days for exchange sessions.
    const start = Math.floor((from ?? (end * 1000 - Math.max(limit * iv[1] * 3, 7 * 86400) * 1000)) / 1000);
    for (const symbol of symbolsOf(row)) {
      try {
        const url = new URL("https://charts.ifxdb.com/datafeed/history");
        url.search = new URLSearchParams({symbol,server:"usa2",from:String(start),to:String(end),resolution:({D:"1D",W:"1W",M:"1M"} as Record<string,string>)[interval] ?? interval}).toString();
        const r = await fetch(url, {cache:"no-store",signal:AbortSignal.timeout(10000)});
        const d = r.ok ? await r.json() : null;
        if (d?.s === "ok" && Array.isArray(d.t)) {
          const candles: InstaCandle[] = d.t.map((t:number,i:number)=>({timestamp:t*1000,open:+d.o[i],high:+d.h[i],low:+d.l[i],close:+d.c[i],volume:Number(d.v?.[i])||0}))
            .filter((c:InstaCandle)=>Number.isFinite(c.timestamp) && c.timestamp>0 && c.timestamp<=end*1000 && (from===undefined||c.timestamp>=from) && [c.open,c.high,c.low,c.close].every(v=>Number.isFinite(v)&&v>0) && c.high>=Math.max(c.open,c.close,c.low) && c.low<=Math.min(c.open,c.close)).slice(-limit);
          if (candles.length) return {candles,volume:candles.some(c=>c.volume>0)?"tick" as const:"none" as const};
        }
      } catch { /* the older official chart endpoint remains a fallback */ }
      // Symbols originate in the checked provider catalogue, never user XML.
      const escaped = symbol.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetCharts xmlns="http://quotesservice"><chartRequest><From>${start}</From><Symbol>${escaped}</Symbol><To>${end}</To><Type>${iv[0]}</Type></chartRequest></GetCharts></s:Body></s:Envelope>`;
      try {
        const r = await fetch(CHARTS, { method: "POST", body, cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"http://quotesservice/IChartService/GetCharts"' } });
        if (!r.ok) continue;
        const candles = parseInstaCandles(await r.text()).filter(c => c.timestamp <= end * 1000 && (from === undefined || c.timestamp >= from)).slice(-limit);
        if (candles.length) return { candles, volume: candles.some(c=>c.volume>0) ? "tick" as const : "none" as const };
      } catch { /* try the other public symbol of this same instrument */ }
    }
    return { candles: [], volume: "none" as const };
  });
}
