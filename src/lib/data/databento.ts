/**
 * Databento candles and quotes through the key of the user who asks (server only). The historical API serves OHLCV bars up to the newest data
 * the dataset has; a bar of any terminal interval is built here from the 1-minute, 1-hour or daily bars.
 * Instruments of the catalogue: a US stock / ETF (`AAPL`, dataset DBEQ.BASIC) or a futures root (`ES`, continuous front month `ES.c.0` on the
 * dataset of its exchange).
 */
import { liveOf, type LiveBar, type LiveState } from "./databento-live";
import { databentoSpecOf } from "./provider-catalog";
import { memoized } from "./user-key";

export interface DbCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** why there is no data: the key is not accepted, the limit is used up, the dataset / symbol is not in the user's plan, no such symbol, the provider is down */
export type DbError = "key" | "limit" | "plan" | "symbol" | "network";

export interface DbCandles {
  candles: DbCandle[];
  /** the live stream: "live" when its minutes are laid over the history, "refused" when the key has no live licence for the dataset */
  live?: LiveState;
  error?: DbError;
  detail?: string;
}

const BASE = "https://hist.databento.com/v0";
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Schema = "ohlcv-1m" | "ohlcv-1h" | "ohlcv-1d";

/** terminal interval -> the schema it is built from and the bucket (ms, 0 = as is; "W" / "M" / "Y" are calendar buckets of the daily bars) */
const PLAN: Record<string, { schema: Schema; bucket: number | "W" | "M" }> = {
  "1": { schema: "ohlcv-1m", bucket: 0 },
  "5": { schema: "ohlcv-1m", bucket: 5 * MIN },
  "15": { schema: "ohlcv-1m", bucket: 15 * MIN },
  "30": { schema: "ohlcv-1m", bucket: 30 * MIN },
  "60": { schema: "ohlcv-1h", bucket: 0 },
  "240": { schema: "ohlcv-1h", bucket: 4 * HOUR },
  D: { schema: "ohlcv-1d", bucket: 0 },
  W: { schema: "ohlcv-1d", bucket: "W" },
  M: { schema: "ohlcv-1d", bucket: "M" },
};

const auth = (key: string) => `Basic ${Buffer.from(`${key}:`).toString("base64")}`;

function classify(status: number, body: string): DbError {
  const b = body.toLowerCase();
  if (status === 401) return "key";
  if (status === 429) return "limit";
  if (status === 403 || /license|unauthorized|entitle|subscription/.test(b)) return "plan";
  if (status === 422 || status === 400 || status === 404) return /symbol|not found|resolv/.test(b) ? "symbol" : "network";
  return "network";
}

/** the newest data time of a dataset (a request ending later is refused); cached a minute per dataset */
async function datasetEnd(key: string, dataset: string): Promise<number | null> {
  return memoized(
    `db:end:${dataset}`,
    60_000,
    async () => {
      try {
        const res = await fetch(`${BASE}/metadata.get_dataset_range?dataset=${encodeURIComponent(dataset)}`, { headers: { Authorization: auth(key) }, signal: AbortSignal.timeout(12_000), cache: "no-store" });
        if (!res.ok) return null;
        const j = (await res.json()) as { end?: string };
        const t = j.end ? Date.parse(j.end) : NaN;
        return Number.isFinite(t) ? t : null;
      } catch {
        return null;
      }
    },
    (v) => v !== null
  );
}

async function fetchBars(key: string, dataset: string, symbol: string, stype: "continuous" | "raw_symbol", schema: Schema, startMs: number, endMs: number): Promise<{ rows: DbCandle[]; error?: DbError; detail?: string }> {
  const body = new URLSearchParams({
    dataset,
    symbols: symbol,
    schema,
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    encoding: "json",
    stype_in: stype,
    stype_out: "instrument_id",
    pretty_px: "true",
    pretty_ts: "true",
    map_symbols: "false",
  });
  try {
    const res = await fetch(`${BASE}/timeseries.get_range`, {
      method: "POST",
      headers: { Authorization: auth(key), "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) return { rows: [], error: classify(res.status, text), detail: text.replace(/\s+/g, " ").slice(0, 200) };
    const rows: DbCandle[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let r: any;
      try {
        r = JSON.parse(line);
      } catch {
        continue;
      }
      const ts = Date.parse(String(r?.hd?.ts_event ?? "").replace(/(\.\d{3})\d*Z$/, "$1Z"));
      const close = Number(r.close);
      if (!Number.isFinite(ts) || !Number.isFinite(close) || close <= 0) continue;
      rows.push({ timestamp: ts, open: Number(r.open), high: Number(r.high), low: Number(r.low), close, volume: Number(r.volume) || 0 });
    }
    rows.sort((a, b) => a.timestamp - b.timestamp);
    // a futures root can come back as several instrument ids over a roll: one bar per time is kept (the one with most volume)
    const byTs = new Map<number, DbCandle>();
    for (const c of rows) {
      const o = byTs.get(c.timestamp);
      if (!o || c.volume > o.volume) byTs.set(c.timestamp, c);
    }
    return { rows: [...byTs.values()].sort((a, b) => a.timestamp - b.timestamp) };
  } catch {
    return { rows: [], error: "network" };
  }
}

function bucketOf(t: number, bucket: number | "W" | "M"): number {
  if (bucket === "W") {
    const d = new Date(t);
    const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow);
  }
  if (bucket === "M") {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }
  return Math.floor(t / bucket) * bucket;
}

function aggregate(rows: DbCandle[], bucket: number | "W" | "M"): DbCandle[] {
  const out: DbCandle[] = [];
  let cur: DbCandle | null = null;
  for (const c of rows) {
    const b = bucketOf(c.timestamp, bucket);
    if (!cur || cur.timestamp !== b) {
      cur = { timestamp: b, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
      out.push(cur);
    } else {
      cur.high = Math.max(cur.high, c.high);
      cur.low = Math.min(cur.low, c.low);
      cur.close = c.close;
      cur.volume += c.volume;
    }
  }
  return out;
}

/** how many bars of a schema fit in a calendar day (with a margin): sizes the time window of a request */
function perDay(schema: Schema, future: boolean): number {
  if (schema === "ohlcv-1m") return future ? 1380 : 390;
  if (schema === "ohlcv-1h") return future ? 23 : 7;
  return 0.72;
}

/** Bucket start of a live minute for an interval (UTC aligned, like the historical bars). */
function liveBucket(t: number, bucket: number | "W" | "M", schema: Schema): number {
  if (schema === "ohlcv-1d") return bucketOf(t, bucket === 0 ? DAY : bucket);
  return bucket === 0 ? (schema === "ohlcv-1h" ? Math.floor(t / HOUR) * HOUR : Math.floor(t / MIN) * MIN) : bucketOf(t, bucket);
}

/**
 * The live minutes newer than the history laid over its bars: a live minute that falls into the last bar extends it, later ones add bars.
 * `histEnd` is where the historical data stops: nothing before it is added (no minute is counted twice).
 */
function overlayLive(rows: DbCandle[], live: LiveBar[], histEnd: number, bucket: number | "W" | "M", schema: Schema): DbCandle[] {
  const fresh = live.filter((m) => m.timestamp >= histEnd);
  if (fresh.length === 0) return rows;
  const out = rows.map((r) => ({ ...r }));
  for (const m of fresh) {
    const b = liveBucket(m.timestamp, bucket, schema);
    const last = out[out.length - 1];
    if (last && last.timestamp === b) {
      last.high = Math.max(last.high, m.high);
      last.low = Math.min(last.low, m.low);
      last.close = m.close;
      last.volume += m.volume;
    } else if (!last || b > last.timestamp) {
      out.push({ timestamp: b, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume });
    }
  }
  return out;
}

export async function dbCandles(userId: string, key: string, id: string, interval: string, limit: number, toMs?: number): Promise<DbCandles> {
  const spec = databentoSpecOf(id);
  const plan = PLAN[interval];
  if (!spec || !plan) return { candles: [], error: "symbol" };
  const ratio = typeof plan.bucket === "number" && plan.bucket > 0 ? plan.bucket / (plan.schema === "ohlcv-1m" ? MIN : HOUR) : plan.bucket === "W" ? 5 : plan.bucket === "M" ? 22 : 1;
  const want = Math.min(Math.max(limit, 1), 5000);
  const rawNeeded = Math.min(want * ratio + ratio, plan.schema === "ohlcv-1m" ? 30_000 : 20_000);
  const ttl = limit <= 5 ? 4_000 : plan.schema === "ohlcv-1d" ? 20_000 : 6_000;
  return memoized(
    `db:c:${userId}:${id}:${interval}:${want}:${toMs ?? 0}`,
    ttl,
    async () => {
      const avail = await datasetEnd(key, spec.dataset);
      const now = Date.now();
      let end = toMs ?? now;
      if (avail !== null) end = Math.min(end, avail);
      const days = Math.ceil(rawNeeded / perDay(plan.schema, spec.future)) * 1.5 + 4;
      const start = end - Math.min(days, 3650) * DAY;
      if (start >= end) return { candles: [] };
      const r = await fetchBars(key, spec.dataset, spec.symbol, spec.stype, plan.schema, start, end);
      if (r.error) return { candles: [], error: r.error, detail: r.detail };
      let rows = r.rows;
      if (plan.bucket !== 0) rows = aggregate(rows, plan.bucket);
      // the live edge: only for the newest page, never for a scroll-back page ending in the past
      let liveState: LiveState | undefined;
      if (toMs === undefined) {
        const lv = liveOf(key, { dataset: spec.dataset, symbol: spec.symbol, stype: spec.stype });
        liveState = lv.state;
        // the history ends at its last bar's end; the live minutes start where it stops (a minute bar is complete one minute after it starts)
        const histEnd = avail !== null ? Math.floor(avail / MIN) * MIN : rows.length ? (rows[rows.length - 1].timestamp + (plan.schema === "ohlcv-1m" ? MIN : plan.schema === "ohlcv-1h" ? HOUR : DAY)) : 0;
        if (lv.bars.length) rows = overlayLive(rows, lv.bars, histEnd, plan.bucket, plan.schema);
      }
      if (toMs !== undefined) rows = rows.filter((c) => c.timestamp <= toMs);
      return { candles: rows.slice(-want), ...(liveState ? { live: liveState } : {}) };
    },
    (v) => !v.error
  );
}

export interface DbQuote {
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

/** price = the last minute bar; the day = the newest daily bar; the change is against the previous daily close */
export async function dbQuote(userId: string, key: string, id: string): Promise<{ quote: DbQuote | null; error?: DbError }> {
  const spec = databentoSpecOf(id);
  if (!spec) return { quote: null, error: "symbol" };
  return memoized(
    `db:q:${userId}:${id}`,
    5_000,
    async () => {
      const avail = await datasetEnd(key, spec.dataset);
      const end = avail !== null ? Math.min(Date.now(), avail) : Date.now();
      const [day, min] = await Promise.all([
        fetchBars(key, spec.dataset, spec.symbol, spec.stype, "ohlcv-1d", end - 10 * DAY, end),
        fetchBars(key, spec.dataset, spec.symbol, spec.stype, "ohlcv-1m", end - 3 * HOUR, end),
      ]);
      if (day.error && min.error) return { quote: null, error: day.error };
      const d = day.rows.at(-1);
      const prev = day.rows.at(-2);
      const last = min.rows.at(-1) ?? d;
      if (!last) return { quote: null, error: "symbol" as DbError };
      // the live stream, when it has delivered something newer than the history
      const lv = liveOf(key, { dataset: spec.dataset, symbol: spec.symbol, stype: spec.stype });
      const fresher = lv.last > 0 && lv.lastAt > last.timestamp;
      const price = fresher ? lv.last : last.close;
      const base = prev?.close ?? d?.open ?? price;
      const change = price - base;
      return {
        quote: {
          price,
          open: d?.open ?? price,
          high: Math.max(d?.high ?? price, price),
          low: Math.min(d?.low ?? price, price),
          volume: d?.volume ?? 0,
          change,
          changePercent: base ? (change / base) * 100 : 0,
          time: new Date(fresher ? lv.lastAt : last.timestamp).toISOString(),
          ticker: id,
        },
      };
    },
    (v) => !!v.quote
  );
}
