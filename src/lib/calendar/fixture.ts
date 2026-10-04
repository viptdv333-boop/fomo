/**
 * DEV / TEST ONLY fixture in the shape of FMP stable/economic-calendar rows (hand-built from the documented shape, NOT a recording:
 * the key available while developing had no access to this endpoint). Served by the API route only when
 * ECON_CALENDAR_MOCK is set AND NODE_ENV is not production; also used by scripts/check-econ-calendar.ts.
 */

interface Tpl {
  /** Weekdays (0 = Monday) the release repeats on. */
  days: number[];
  /** UTC "HH:MM". */
  at: string;
  country: string;
  currency: string;
  event: string;
  impact: "High" | "Medium" | "Low" | "None";
  prev: number;
  /** Typical forecast step (the actual = forecast +/- step * k). */
  step: number;
  decimals?: number;
}

const T: Tpl[] = [
  { days: [4], at: "12:30", country: "US", currency: "USD", event: "Non Farm Payrolls", impact: "High", prev: 227000, step: 15000, decimals: 0 },
  { days: [4], at: "12:30", country: "US", currency: "USD", event: "Unemployment Rate", impact: "High", prev: 4.1, step: 0.1 },
  { days: [4], at: "12:30", country: "US", currency: "USD", event: "Average Hourly Earnings MoM", impact: "Medium", prev: 0.3, step: 0.1 },
  { days: [1], at: "12:30", country: "US", currency: "USD", event: "Core CPI MoM", impact: "High", prev: 0.3, step: 0.1 },
  { days: [1], at: "12:30", country: "US", currency: "USD", event: "CPI YoY", impact: "High", prev: 2.9, step: 0.1 },
  { days: [3], at: "12:30", country: "US", currency: "USD", event: "Initial Jobless Claims", impact: "Medium", prev: 219000, step: 6000, decimals: 0 },
  { days: [2], at: "18:00", country: "US", currency: "USD", event: "Fed Interest Rate Decision", impact: "High", prev: 4.5, step: 0.25 },
  { days: [2], at: "18:30", country: "US", currency: "USD", event: "Fed Press Conference", impact: "High", prev: 0, step: 0 },
  { days: [2], at: "14:30", country: "US", currency: "USD", event: "EIA Crude Oil Stocks Change", impact: "Medium", prev: -1200, step: 900, decimals: 0 },
  { days: [0, 3], at: "14:00", country: "US", currency: "USD", event: "ISM Manufacturing PMI", impact: "High", prev: 50.3, step: 0.6 },
  { days: [4], at: "14:00", country: "US", currency: "USD", event: "Michigan Consumer Sentiment", impact: "Low", prev: 71.1, step: 1.2 },
  { days: [2], at: "17:00", country: "US", currency: "USD", event: "10-Year Note Auction", impact: "Low", prev: 4.18, step: 0.03 },
  { days: [3], at: "09:00", country: "EU", currency: "EUR", event: "ECB Interest Rate Decision", impact: "High", prev: 2.9, step: 0.25 },
  { days: [2], at: "09:00", country: "EU", currency: "EUR", event: "Inflation Rate YoY", impact: "High", prev: 2.4, step: 0.1 },
  { days: [0], at: "08:00", country: "EU", currency: "EUR", event: "HCOB Manufacturing PMI", impact: "Medium", prev: 46.1, step: 0.5 },
  { days: [1], at: "07:00", country: "DE", currency: "EUR", event: "Industrial Production MoM", impact: "Medium", prev: 1.5, step: 0.4 },
  { days: [3], at: "07:00", country: "DE", currency: "EUR", event: "Balance of Trade", impact: "Low", prev: 20.8, step: 1.5 },
  { days: [2], at: "07:00", country: "DE", currency: "EUR", event: "Unemployment Change", impact: "Medium", prev: 11000, step: 6000, decimals: 0 },
  { days: [1], at: "07:45", country: "FR", currency: "EUR", event: "Inflation Rate YoY", impact: "Medium", prev: 1.7, step: 0.1 },
  { days: [3], at: "07:00", country: "GB", currency: "GBP", event: "BoE Interest Rate Decision", impact: "High", prev: 4.5, step: 0.25 },
  { days: [1], at: "06:00", country: "GB", currency: "GBP", event: "Unemployment Rate", impact: "Medium", prev: 4.4, step: 0.1 },
  { days: [2], at: "06:00", country: "GB", currency: "GBP", event: "GDP Growth Rate QoQ", impact: "High", prev: 0.1, step: 0.1 },
  { days: [0], at: "23:50", country: "JP", currency: "JPY", event: "Tankan Large Manufacturers Index", impact: "Medium", prev: 12, step: 2, decimals: 0 },
  { days: [3], at: "03:00", country: "JP", currency: "JPY", event: "BoJ Interest Rate Decision", impact: "High", prev: 0.5, step: 0.25 },
  { days: [4], at: "23:30", country: "JP", currency: "JPY", event: "National Core CPI YoY", impact: "Medium", prev: 3.2, step: 0.1 },
  { days: [0], at: "01:45", country: "CN", currency: "CNY", event: "Caixin Manufacturing PMI", impact: "Medium", prev: 50.8, step: 0.4 },
  { days: [1, 3], at: "01:30", country: "CN", currency: "CNY", event: "CPI YoY", impact: "Medium", prev: 0.5, step: 0.2 },
  { days: [2], at: "02:00", country: "CN", currency: "CNY", event: "GDP Growth Rate YoY", impact: "High", prev: 5.2, step: 0.2 },
  { days: [4], at: "11:30", country: "RU", currency: "RUB", event: "Inflation Rate YoY", impact: "High", prev: 8.9, step: 0.2 },
  { days: [3], at: "10:30", country: "RU", currency: "RUB", event: "Key Rate Decision", impact: "High", prev: 16, step: 1 },
  { days: [1], at: "07:00", country: "RU", currency: "RUB", event: "Unemployment Rate", impact: "Medium", prev: 2.4, step: 0.1 },
  { days: [2], at: "09:00", country: "RU", currency: "RUB", event: "Industrial Production YoY", impact: "Low", prev: 1.2, step: 0.5 },
  { days: [4], at: "12:30", country: "CA", currency: "CAD", event: "Employment Change", impact: "High", prev: 91000, step: 12000, decimals: 0 },
  { days: [2], at: "14:00", country: "CA", currency: "CAD", event: "BoC Interest Rate Decision", impact: "High", prev: 3, step: 0.25 },
  { days: [3], at: "00:30", country: "AU", currency: "AUD", event: "Unemployment Rate", impact: "High", prev: 4.1, step: 0.1 },
  { days: [1], at: "03:30", country: "AU", currency: "AUD", event: "RBA Interest Rate Decision", impact: "High", prev: 4.1, step: 0.25 },
  { days: [3], at: "07:30", country: "CH", currency: "CHF", event: "SNB Interest Rate Decision", impact: "High", prev: 0.5, step: 0.25 },
  { days: [0], at: "06:30", country: "CH", currency: "CHF", event: "Retail Sales YoY", impact: "Low", prev: 1.2, step: 0.4 },
  { days: [2], at: "08:30", country: "IN", currency: "INR", event: "RBI Interest Rate Decision", impact: "Medium", prev: 6.25, step: 0.25 },
  { days: [3], at: "12:00", country: "BR", currency: "BRL", event: "Inflation Rate MoM", impact: "Low", prev: 0.4, step: 0.1 },
  { days: [4], at: "11:00", country: "TR", currency: "TRY", event: "Current Account", impact: "None", prev: -1.2, step: 0.5 },
  { days: [0, 1, 2, 3, 4], at: "13:00", country: "DE", currency: "EUR", event: "Bundesbank Speaks", impact: "None", prev: 0, step: 0 },
];

const pad = (n: number) => String(n).padStart(2, "0");

function h(s: string): number {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

const round = (v: number, dec: number) => Math.round(v * 10 ** dec) / 10 ** dec;

/** FMP-shaped raw rows for [from, to] (inclusive YYYY-MM-DD, UTC) as of `nowMs`: past releases have an actual, future ones do not. */
export function mockFmpRows(from: string, to: string, nowMs: number): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  let date = from;
  let guard = 0;
  while (date <= to && guard++ < 62) {
    const [y, m, d] = date.split("-").map(Number);
    const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
    for (const t of T) {
      if (!t.days.includes(wd)) continue;
      const dateStr = `${date} ${t.at}:00`;
      const ts = Date.UTC(y, m - 1, d, +t.at.slice(0, 2), +t.at.slice(3, 5));
      const dec = t.decimals ?? 2;
      const seed = h(`${t.country}${t.event}${date}`);
      const prev = round(t.prev + (((seed >> 3) % 5) - 2) * t.step * 0.5, dec);
      const est = t.step === 0 ? null : round(prev + (((seed >> 7) % 3) - 1) * t.step, dec);
      const past = ts < nowMs;
      const k = ((seed >> 11) % 3) - 1; // -1 worse-or-lower, 0 in line, +1 higher
      const actual = past && est !== null ? round(est + k * t.step, dec) : null;
      rows.push({
        date: dateStr,
        country: t.country,
        event: t.event,
        currency: t.currency,
        previous: t.step === 0 ? null : prev,
        estimate: est,
        actual,
        change: actual !== null ? round(actual - prev, dec) : null,
        impact: t.impact,
        changePercentage: actual !== null && prev !== 0 ? round(((actual - prev) / Math.abs(prev)) * 100, 2) : null,
      });
    }
    date = addDays(date, 1);
  }
  // quirks the normaliser has to survive
  const mid = addDays(from, 2);
  rows.push({ date: `${mid} 00:00:00`, country: "JP", event: "Bank Holiday", currency: "JPY", previous: null, estimate: null, actual: null, change: null, impact: "None", changePercentage: null });
  rows.push({ date: mid, country: "US", event: "Fed Chair Speech (date only)", currency: "USD", impact: "high" });
  rows.push({ date: `${mid}T12:30:00Z`, country: "us", event: "Garbage Row", currency: "USD", previous: "n/a", estimate: "1,5%", actual: "", impact: "Moderate" });
  if (rows.length > 3) rows.push({ ...rows[0] }); // exact duplicate
  rows.push({ date: "not a date", country: "US", event: "Broken", impact: "High" });
  rows.push(null as unknown as Record<string, unknown>);
  return rows;
}
