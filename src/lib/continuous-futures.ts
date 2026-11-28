/** Synthetic series only. Dated contracts never pass through this module. */
/** Any FORTS continuous symbol: {ASSET}{rank}! — NG1!, GOLD1!, BR2!, Si1!, MIX1! … The asset is the family code (not the dated-contract prefix). */
export function continuousSymbol(ticker: string): { asset: string; rank: 1 | 2 } | null {
  const m = /^([A-Za-z]{1,8})([12])!$/.exec(ticker);
  return m ? { asset: m[1], rank: Number(m[2]) as 1 | 2 } : null;
}
export function continuousRank(ticker: string): 1 | 2 | null {
  return continuousSymbol(ticker)?.rank ?? null;
}
/** @deprecated use continuousRank */
export function ngContinuousRank(ticker: string): 1 | 2 | null {
  return continuousRank(ticker);
}
export function continuousDay(ms = Date.now()): string {
  return new Date(ms + 3 * 3600000).toISOString().slice(0, 10);
}

export interface ChainContract { secid: string; first: string; expiry: string }
export interface ChainSegment { contract: ChainContract; from: string; till: string }
export interface ChainBar { timestamp: number; open: number; high: number; low: number; close: number; volume: number }
export type ChainLoader = (secid: string, interval: number, from: string, till: string) => Promise<ChainBar[]>;

export function nextDay(day: string, n = 1): string {
  return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
}
/** MOEX's existing candle API carries exchange wall time in server-local timestamps. */
export function wallDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function chainSegments(contracts: ChainContract[], rank: 1 | 2, today: string): ChainSegment[] {
  const sorted = [...contracts].sort((a, b) => a.expiry.localeCompare(b.expiry));
  const out: ChainSegment[] = [];
  for (let i = 0; i + rank - 1 < sorted.length; i++) {
    const contract = sorted[i + rank - 1];
    const from = i ? nextDay(sorted[i - 1].expiry) : sorted[0].first;
    if (from > today) break;
    // Both ranks roll AFTER the front contract's last trading day, including weekends/holidays.
    out.push({ contract, from: from > contract.first ? from : contract.first, till: sorted[i].expiry < today ? sorted[i].expiry : today });
  }
  return out.filter((s) => s.from <= s.till);
}

export function rollDelta(oldBars: ChainBar[], newBars: ChainBar[], expiry: string): number {
  const newClose = new Map(newBars.filter((b) => wallDay(b.timestamp) <= expiry).map((b) => [wallDay(b.timestamp), b.close]));
  for (const b of [...oldBars].sort((a, b) => b.timestamp - a.timestamp)) {
    const day = wallDay(b.timestamp);
    const close = newClose.get(day);
    if (day <= expiry && close !== undefined) return close - b.close;
  }
  throw new Error("No common daily close for B-ADJ at " + expiry);
}

export function shiftBar(b: ChainBar, delta: number): ChainBar {
  const add = (n: number) => Number((n + delta).toFixed(10));
  return { ...b, open: add(b.open), high: add(b.high), low: add(b.low), close: add(b.close) };
}

/** Calendar bars are formed AFTER stitching daily bars, so a roll midweek/month is not duplicated. */
export function aggregateChain(bars: ChainBar[], interval: string): ChainBar[] {
  if (interval === "D" || ["1", "10", "60"].includes(interval)) return bars;
  const buckets = new Map<number, ChainBar>();
  let sessionDay = "", sessionStart = 0;
  for (const b of bars) {
    const d = new Date(b.timestamp);
    let key: number;
    if (["W", "M", "Y"].includes(interval)) {
      d.setHours(0, 0, 0, 0);
      if (interval === "W") d.setDate(d.getDate() - (d.getDay() + 6) % 7);
      if (interval === "M") d.setDate(1);
      if (interval === "Y") { d.setMonth(0); d.setDate(1); }
      key = d.getTime();
    } else {
      const ms = Number(interval) * 60000;
      if (!Number.isFinite(ms) || ms <= 0) throw new Error("Unsupported continuous interval");
      const day = wallDay(b.timestamp);
      if (day !== sessionDay) { sessionDay = day; sessionStart = b.timestamp; }
      const anchor = interval === "240" ? sessionStart : new Date(day + "T00:00:00").getTime();
      key = anchor + Math.floor((b.timestamp - anchor) / ms) * ms;
    }
    const prev = buckets.get(key);
    if (!prev) buckets.set(key, { ...b, timestamp: key });
    else { prev.high = Math.max(prev.high, b.high); prev.low = Math.min(prev.low, b.low); prev.close = b.close; prev.volume += b.volume; }
  }
  return [...buckets.values()];
}

export interface ChainRequest { ticker: string; interval: string; limit: number; to?: number; adjusted: boolean; today: string }
export async function buildContinuous(
  contracts: ChainContract[], request: ChainRequest, load: ChainLoader,
  delta: (oldId: string, newId: string, expiry: string) => Promise<number>,
): Promise<ChainBar[]> {
  const rank = ngContinuousRank(request.ticker);
  if (!rank) throw new Error("Not a continuous symbol");
  const segments = chainSegments(contracts, rank, request.today);
  const calendar = ["D", "W", "M", "Y"].includes(request.interval);
  const native = calendar ? 24 : request.interval === "240" ? 60 : request.interval === "10" ? 10 : request.interval === "60" ? 60 : 1;
  const endDay = request.to === undefined ? request.today : wallDay(request.to);
  const prefetched = new Map<number, ChainBar[]>();
  if (calendar && request.limit >= 20) {
    const daysPerBar = request.interval === "D" ? 1.6 : request.interval === "W" ? 8 : request.interval === "M" ? 32 : 370;
    const startDay = nextDay(endDay, -Math.ceil((request.limit + 1) * daysPerBar));
    const queue = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.from <= endDay && s.till >= startDay);
    // Daily windows of different contracts are independent. Four requests at once, not one request per month in series.
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (;;) {
        const item = queue.shift();
        if (!item) break;
        const { s, i } = item;
        prefetched.set(i, await load(s.contract.secid, native, s.from, s.till < endDay ? s.till : endDay));
      }
    }));
  }
  const selected = new Map<number, ChainBar[]>();
  let gathered: ChainBar[] = [];
  // A bounded recent window for minutes; older windows are fetched only if bars are still needed.
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s.from > endDay) continue;
    let till = s.till < endDay ? s.till : endDay;
    const rows: ChainBar[] = [];
    while (till >= s.from) {
      const start = calendar ? s.from : nextDay(till, request.limit <= 5 ? 0 : native === 1 ? -1 : -3);
      const from = start > s.from ? start : s.from;
      const batch = (prefetched.get(i) ?? await load(s.contract.secid, native, from, till)).filter((b) => wallDay(b.timestamp) >= from && wallDay(b.timestamp) <= till && (request.to === undefined || b.timestamp <= request.to));
      rows.unshift(...batch);
      gathered = [...rows, ...[...selected.entries()].sort((a, b) => a[0] - b[0]).flatMap(([, v]) => v)];
      // One extra bucket guarantees that the first returned bucket is complete.
      if (aggregateChain(gathered, request.interval).length > request.limit) break;
      till = nextDay(from, -1);
    }
    selected.set(i, rows);
    if (aggregateChain(gathered, request.interval).length > request.limit) break;
  }
  if (!selected.size) return [];
  const earliest = Math.min(...selected.keys());
  const rollChanges = new Map<number, number>();
  if (request.adjusted) {
    const queue = segments.map((_, i) => i).filter((i) => i >= earliest && i < segments.length - 1);
    await Promise.all(Array.from({ length: 4 }, async () => {
      for (;;) {
        const i = queue.shift();
        if (i === undefined) break;
        rollChanges.set(i, await delta(segments[i].contract.secid, segments[i + 1].contract.secid, segments[i].till));
      }
    }));
  }
  let offset = 0;
  const result: ChainBar[] = [];
  // Anchor at TODAY, never at the historical page's end. Separate pages use identical prices.
  for (let i = segments.length - 1; i >= earliest; i--) {
    if (request.adjusted && i < segments.length - 1) {
      offset += rollChanges.get(i)!;
    }
    result.unshift(...(selected.get(i) ?? []).map((b) => shiftBar(b, offset)));
  }
  const unique = [...new Map(result.map((b) => [b.timestamp, b])).values()].sort((a, b) => a.timestamp - b.timestamp);
  return aggregateChain(unique, request.interval).slice(-request.limit);
}
