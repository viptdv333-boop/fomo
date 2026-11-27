/* Upstream candle cache for /api/klines.
   Closed history is immutable — cache it for hours; only the live edge needs seconds of freshness.
   The cache sits BELOW personalization (T-Invest tail, algopack access, guest delay are applied after),
   keyed by the exact upstream request, so no viewer-specific data is ever shared.
   Run: npx tsx scripts/check-kline-cache.ts */
import { TtlCache } from "./fomo-ideas";

/** Live edge: ISS itself is ~15 min behind, the chart refreshes every 60 s — 10 s dedupes bursts without visible staleness. */
export const LIVE_TTL_MS = 10_000;
/** Closed bars never change; 6 h also survives contract rolls (the key carries the resolved contract). */
export const CLOSED_TTL_MS = 6 * 3_600_000;

/** Start of the still-forming period for a MOEX interval (UTC, conservative): intraday/daily → today, weekly → Monday, monthly → the 1st. */
export function issPeriodStart(moexInterval: number, nowMs: number = Date.now()): string {
  const now = new Date(nowMs);
  if (moexInterval === 7) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  }
  if (moexInterval === 31) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  }
  return now.toISOString().slice(0, 10);
}

/** A scroll-back page bounded strictly before the forming period is immutable; anything touching "now" stays live. */
export function issCacheTtl(till: string | undefined, moexInterval: number, nowMs: number = Date.now()): number {
  return till && till < issPeriodStart(moexInterval, nowMs) ? CLOSED_TTL_MS : LIVE_TTL_MS;
}

/** Bybit bucket length for an interval id (numeric = minutes; D/W/M calendar-ish, M conservative at 30 d). */
export function bybitBucketMs(interval: string): number {
  if (interval === "D") return 86_400_000;
  if (interval === "W") return 7 * 86_400_000;
  if (interval === "M") return 30 * 86_400_000;
  const minutes = Number(interval);
  return (Number.isFinite(minutes) && minutes > 0 ? minutes : 1) * 60_000;
}

/** A page whose `end` lies more than two buckets in the past can only hold closed bars. */
export function bybitCacheTtl(endMs: number | undefined, interval: string, nowMs: number = Date.now()): number {
  return endMs !== undefined && endMs < nowMs - 2 * bybitBucketMs(interval) ? CLOSED_TTL_MS : LIVE_TTL_MS;
}

/** TTL cache + single-flight: concurrent identical upstream requests share one fetch; failures are not cached. */
export class UpstreamCache<T> {
  private store: TtlCache<T>;
  private inflight = new Map<string, Promise<T>>();

  constructor(max: number = 300) {
    this.store = new TtlCache<T>(max);
  }

  async get(key: string, ttlMs: number | ((v: T) => number), fetcher: () => Promise<T>, now: number = Date.now()): Promise<T> {
    const hit = this.store.get(key, now);
    if (hit !== undefined) return hit;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = fetcher()
      .then((v) => {
        this.store.set(key, v, typeof ttlMs === "function" ? ttlMs(v) : ttlMs, Date.now());
        return v;
      })
      .finally(() => {
        this.inflight.delete(key);
      });
    this.inflight.set(key, p);
    return p;
  }
}
