/** Server-side bar aggregation shared by the klines API (and its checks). */

export interface KlineBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Yearly bars («1Г», interval "Y") for any source: the monthly bars of that source (ascending) merged by calendar year with the usual OHLCV
 * rule (open = first, close = last, high / low = max / min, volume = sum). `offMs` turns a bar time into the wall clock the exchange prints
 * (MOEX monthly bars are Moscow wall clocks parsed in the server's zone: the zone offset; true UTC bars: 0). The yearly bar keeps the time of
 * its January bar, or Jan 1st 00:00 of that wall clock when January is missing (a mid-year listing).
 * `monthlyTruncated`: the monthly request was cut at its limit, so the oldest year may lack its early months: it is dropped unless its
 * first bar is a January. (+12 h before reading the month: the first of a month at 00:00 stays in its month whatever a DST hour does.)
 */
export function aggregateYearly(monthly: KlineBar[], offMs: number, monthlyTruncated: boolean): KlineBar[] {
  const out: KlineBar[] = [];
  let curYear = NaN;
  let cur: KlineBar | null = null;
  let firstMonth = 0;
  const firstMonthOfYear: number[] = [];
  for (const m of monthly) {
    const wall = new Date(m.timestamp + offMs + 12 * 3_600_000);
    const year = wall.getUTCFullYear();
    if (!cur || year !== curYear) {
      curYear = year;
      firstMonth = wall.getUTCMonth();
      const t = firstMonth === 0 ? m.timestamp : Date.UTC(year, 0, 1) - offMs;
      cur = { timestamp: t, open: m.open, high: m.high, low: m.low, close: m.close, volume: m.volume };
      out.push(cur);
      firstMonthOfYear.push(firstMonth);
    } else {
      cur.high = Math.max(cur.high, m.high);
      cur.low = Math.min(cur.low, m.low);
      cur.close = m.close;
      cur.volume += m.volume;
    }
  }
  if (monthlyTruncated && out.length > 1 && firstMonthOfYear[0] !== 0) out.shift();
  return out;
}
