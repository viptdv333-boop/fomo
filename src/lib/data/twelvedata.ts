/**
 * Twelve Data candles and quotes through the key of the user who asks (server only).
 * Instrument ids of the catalogue: `SAP.XETR` = symbol SAP on the exchange with MIC XETR; an id without a suffix (`SPX`) is the plain symbol.
 */
import { memoized } from "./user-key";

export interface TdCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** why there is no data: the key is not accepted, the per-minute / daily limit is used up, the symbol is not in the user's plan, the provider is down */
export type TdError = "key" | "limit" | "plan" | "symbol" | "network";

export interface TdCandles {
  candles: TdCandle[];
  error?: TdError;
  detail?: string;
}

const BASE = "https://api.twelvedata.com";

const INTERVAL: Record<string, string> = {
  "1": "1min",
  "5": "5min",
  "15": "15min",
  "30": "30min",
  "60": "1h",
  "240": "4h",
  D: "1day",
  W: "1week",
  M: "1month",
};

/** `SAP.XETR` -> symbol + MIC; `SPX` -> symbol only */
export function tdParams(id: string): URLSearchParams {
  const p = new URLSearchParams();
  const dot = id.lastIndexOf(".");
  const mic = dot > 0 ? id.slice(dot + 1) : "";
  if (/^X[A-Z0-9]{3}$/.test(mic)) {
    p.set("symbol", id.slice(0, dot));
    p.set("mic_code", mic);
  } else {
    p.set("symbol", id);
  }
  return p;
}

function classify(code: number, message: string): TdError {
  if (code === 401 || code === 403) return /plan|upgrade|grow|pro|available/i.test(message) && code === 403 ? "plan" : "key";
  if (code === 429) return "limit";
  if (code === 400 && /plan|upgrade|available.*(grow|pro|ultra|enterprise)/i.test(message)) return "plan";
  if (code === 400 || code === 404) return "symbol";
  return "network";
}

async function get(path: string, params: URLSearchParams, key: string): Promise<{ json: any; error?: TdError; detail?: string }> {
  params.set("apikey", key);
  try {
    const res = await fetch(`${BASE}${path}?${params}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!json) return { json: null, error: res.status === 429 ? "limit" : "network" };
    // Twelve Data answers HTTP 200 with {code, message, status:"error"} for most failures
    if (json.status === "error" || (typeof json.code === "number" && json.code >= 400)) {
      const code = Number(json.code) || res.status;
      const message = String(json.message ?? "").replace(/apikey=[^\s&]+/gi, "apikey=***");
      return { json: null, error: classify(code, message), detail: message.slice(0, 200) };
    }
    if (!res.ok) return { json: null, error: res.status === 429 ? "limit" : "network" };
    return { json };
  } catch {
    return { json: null, error: "network" };
  }
}

/** "2026-11-03 18:30:00" (timezone=UTC) or "2026-11-03" -> epoch ms */
function parseTime(s: string): number {
  const t = s.length <= 10 ? `${s}T00:00:00Z` : `${s.replace(" ", "T")}Z`;
  return Date.parse(t);
}

function fmtTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export async function tdCandles(userId: string, key: string, id: string, interval: string, limit: number, toMs?: number): Promise<TdCandles> {
  const td = INTERVAL[interval];
  if (!td) return { candles: [], error: "symbol" };
  const p = tdParams(id);
  p.set("interval", td);
  p.set("outputsize", String(Math.min(Math.max(limit, 1), 5000)));
  p.set("timezone", "UTC");
  p.set("order", "ASC");
  if (toMs !== undefined) p.set("end_date", fmtTime(toMs));
  // a refresh-sized request every minute from one chart must not spend a Twelve Data credit each time more than once in a few seconds
  const ttl = limit <= 5 ? 4_000 : /^[DWM]$/.test(interval) ? 20_000 : 6_000;
  return memoized(
    `td:c:${userId}:${p.toString()}`,
    ttl,
    async () => {
      const r = await get("/time_series", new URLSearchParams(p), key);
      if (r.error || !r.json) return { candles: [], error: r.error ?? "network", detail: r.detail };
      const values: any[] = Array.isArray(r.json.values) ? r.json.values : [];
      const candles: TdCandle[] = [];
      for (const v of values) {
        const timestamp = parseTime(String(v.datetime));
        if (!Number.isFinite(timestamp)) continue;
        candles.push({ timestamp, open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close), volume: Number(v.volume) || 0 });
      }
      candles.sort((a, b) => a.timestamp - b.timestamp);
      return { candles };
    },
    (v) => !v.error
  );
}

export interface TdQuote {
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  time: string;
  ticker: string;
}

export async function tdQuote(userId: string, key: string, id: string): Promise<{ quote: TdQuote | null; error?: TdError }> {
  const p = tdParams(id);
  const r = await memoized(
    `td:q:${userId}:${p.toString()}`,
    5_000,
    () => get("/quote", new URLSearchParams(p), key),
    (v) => !v.error
  );
  const q = r.json;
  if (!q) return { quote: null, error: r.error };
  const price = Number(q.close);
  if (!Number.isFinite(price) || price <= 0) return { quote: null, error: "symbol" };
  const prev = Number(q.previous_close);
  const open = Number(q.open) || price;
  const change = Number.isFinite(Number(q.change)) ? Number(q.change) : Number.isFinite(prev) ? price - prev : 0;
  const pct = Number.isFinite(Number(q.percent_change)) ? Number(q.percent_change) : prev ? (change / prev) * 100 : 0;
  const ts = Number(q.last_quote_at) || Number(q.timestamp);
  return {
    quote: {
      price,
      open,
      high: Number(q.high) || price,
      low: Number(q.low) || price,
      volume: Number(q.volume) || 0,
      change,
      changePercent: pct,
      time: new Date(ts ? ts * 1000 : Date.now()).toISOString(),
      ticker: id,
    },
  };
}
