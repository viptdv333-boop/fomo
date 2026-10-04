/* Offline check of the forex data layer (src/lib/forex.ts): provider fallback (FMP 402 -> Stooq challenge -> Yahoo), the "denied" memory
   (a plan restriction costs one call), response parsing / rounding / 4h bucketing / daily normalisation, caching and metals proxy.
   fetch is replaced by a stub: no network, no key. Run: npx tsx scripts/check-forex-data.ts */
process.env.FMP_API_KEY = "test-key-not-real";
import { __test, FOREX_PROVIDERS, forexDenied, getForexCandles, getForexQuote, getForexQuotes } from "../src/lib/forex";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const T = (iso: string) => Date.parse(iso);
const C = (iso: string, o: number, h: number, l: number, c: number, v = 0) => ({ timestamp: T(iso), open: o, high: h, low: l, close: c, volume: v });
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/* ── pure helpers ── */
eq("wallToUtc New York summer (EDT, UTC-4)", new Date(__test.wallToUtc("2026-10-02 16:59:00", "America/New_York")).toISOString(), "2026-10-02T20:59:00.000Z");
eq("wallToUtc New York winter (EST, UTC-5)", new Date(__test.wallToUtc("2026-12-02 16:59:00", "America/New_York")).toISOString(), "2026-12-02T21:59:00.000Z");
eq("wallToUtc date only", new Date(__test.wallToUtc("2026-10-02", "UTC")).toISOString(), "2026-10-02T00:00:00.000Z");
eq("wallToUtc garbage", Number.isNaN(__test.wallToUtc("x", "UTC")), true);

const daily = [
  C("2026-09-25T00:00:00Z", 1, 2, 0.5, 1.5, 10), // Fri
  C("2026-09-27T00:00:00Z", 1.4, 1.6, 1.3, 1.5, 1), // Sun (short week-open bar)
  C("2026-09-28T00:00:00Z", 1.5, 1.8, 1.4, 1.7, 10), // Mon
  C("2026-10-03T00:00:00Z", 9, 9, 9, 9, 9), // Sat artefact
  C("2026-10-02T00:00:00Z", 1.7, 1.9, 1.6, 1.8, 10), // Fri
];
daily.sort((a, b) => a.timestamp - b.timestamp);
const norm = __test.normalizeFxDaily(daily);
eq(
  "daily: Sunday merged into Monday, Saturday dropped",
  norm.map((c) => [day(c.timestamp), c.open, c.high, c.low, c.close, c.volume]),
  [
    ["2026-09-25", 1, 2, 0.5, 1.5, 10],
    ["2026-09-28", 1.4, 1.8, 1.3, 1.7, 11],
    ["2026-10-02", 1.7, 1.9, 1.6, 1.8, 10],
  ]
);
const wk = __test.aggregatePeriods(norm, "W");
eq("weekly buckets start on Monday", wk.map((c) => day(c.timestamp)), ["2026-09-21", "2026-09-28"]);
eq("weekly OHLC", [wk[1].open, wk[1].high, wk[1].low, wk[1].close, wk[1].volume], [1.4, 1.9, 1.3, 1.8, 21]);
eq("monthly: Sep / Oct", __test.aggregatePeriods(norm, "M").map((c) => day(c.timestamp)), ["2026-09-01", "2026-10-01"]);
const hours = [C("2026-10-02T08:00:00Z", 1, 2, 1, 2), C("2026-10-02T09:00:00Z", 2, 3, 2, 3), C("2026-10-02T11:00:00Z", 3, 4, 0.5, 1), C("2026-10-02T12:00:00Z", 1, 1, 1, 1)];
eq(
  "4h buckets are UTC aligned",
  __test.bucketBars(hours, 4 * 3_600_000).map((c) => [new Date(c.timestamp).toISOString().slice(11, 13), c.open, c.high, c.low, c.close]),
  [["08", 1, 4, 0.5, 1], ["12", 1, 1, 1, 1]]
);

/* ── stubbed upstreams ── */
const calls: Record<string, number> = { fmp: 0, stooq: 0, yahoo: 0 };
const BASE = 1790960400; // 2026-10-02 ~16:20 UTC, seconds
const yahooResult = (sym: string, from: number, n: number, step: number) => ({
  chart: {
    result: [
      {
        meta: { symbol: sym, gmtoffset: 3600, regularMarketPrice: 1.12575123456, regularMarketDayHigh: 1.1288, regularMarketDayLow: 1.12246, regularMarketTime: 1790976587 },
        timestamp: Array.from({ length: n }, (_, i) => from + i * step),
        indicators: {
          quote: [
            {
              open: Array.from({ length: n }, (_, i) => (i === 2 ? null : 1.1257000207901 + i * 0.0001)),
              high: Array.from({ length: n }, (_, i) => (i === 2 ? null : 1.1262000207901 + i * 0.0001)),
              low: Array.from({ length: n }, (_, i) => (i === 2 ? null : 1.1251000207901 + i * 0.0001)),
              close: Array.from({ length: n }, (_, i) => (i === 2 ? null : 1.1259000207901 + i * 0.0001)),
              volume: Array.from({ length: n }, () => 0),
            },
          ],
        },
      },
    ],
    error: null,
  },
});
const urls: string[] = [];
const fmpMode = { v: "ok" as "ok" | "429" };
(globalThis as any).fetch = async (input: string | URL) => {
  const url = String(input);
  urls.push(url);
  const res = (status: number, body: string, type = "application/json") => new Response(body, { status, headers: { "content-type": type } });
  if (url.includes("financialmodelingprep.com")) {
    calls.fmp++;
    if (fmpMode.v === "429") return res(429, "Limit Reach");
    if (url.includes("historical-chart")) return res(402, "Restricted Endpoint: This endpoint is not available under your current subscription");
    if (/symbol=(USDRUB|XAUUSD|NZDCAD)/.test(url)) return res(402, "Premium Query Parameter: Special Endpoint : This value set for 'symbol' is not available");
    if (url.includes("/quote")) return res(200, JSON.stringify([{ symbol: "EURUSD", price: 1.12545, open: 1.12, dayHigh: 1.13, dayLow: 1.12, volume: 100, change: 0.001, changePercentage: 0.09, timestamp: 1790976000 }]));
    if (url.includes("historical-price-eod")) {
      return res(200, JSON.stringify([{ date: "2026-10-02", open: 1.1, high: 1.2, low: 1.0, close: 1.15, volume: 5 }, { date: "2026-10-01", open: 1.0, high: 1.1, low: 0.9, close: 1.1, volume: 4 }]));
    }
    return res(402, "Restricted Endpoint");
  }
  if (url.includes("stooq.com")) {
    calls.stooq++;
    return res(200, "<!DOCTYPE html><html><body>This site requires JavaScript to verify your browser.</body></html>", "text/html");
  }
  if (url.includes("finance.yahoo.com")) {
    calls.yahoo++;
    const sym = decodeURIComponent(url.split("/chart/")[1].split("?")[0]);
    const daily1 = /interval=1d/.test(url);
    return res(200, JSON.stringify(yahooResult(sym, daily1 ? BASE - 5 * 86400 : BASE, daily1 ? 5 : 6, daily1 ? 86400 : 3600)));
  }
  return res(404, "");
};

async function main() {
  /* quotes: Yahoo first by default (FMP free plan cannot sustain polling), rounding to pip precision, cached */
  const q1 = await getForexQuote("EURUSD");
  eq("quote: provider yahoo, rounded to 5 decimals", [q1?.provider, q1?.quote.price], ["yahoo", 1.12575]);
  const q1b = await getForexQuote("eurusd");
  eq("quote: second call is cached (one upstream call)", [calls.yahoo, calls.fmp, q1b?.provider], [1, 0, "yahoo"]);
  eq("quote: unknown symbol -> null, no upstream call", [await getForexQuote("SBERUS"), calls.yahoo], [null, 1]);
  const qj = await getForexQuote("USDJPY");
  eq("quote: JPY rounds to 3 decimals", qj?.quote.price, 1.126);
  const qm = await getForexQuote("XAUUSD");
  eq("quote: metals come with a proxy label", [qm?.provider, !!qm?.proxy && /GC=F/.test(qm.proxy)], ["yahoo", true]);
  const many = await getForexQuotes(["EURUSD", "GBPUSD", "USDJPY", "nonsense"]);
  eq("quotes: batch skips unknown, serves the rest", Object.keys(many).sort(), ["EURUSD", "GBPUSD", "USDJPY"]);

  /* candles daily: FMP first */
  const d = await getForexCandles("EURUSD", "D", undefined, undefined, 600);
  eq("daily: FMP (official) first, tick volume", [d.provider, d.volume, d.candles.length, d.candles[1].volume], ["fmp", "tick", 2, 5]);
  const w = await getForexCandles("EURUSD", "W", undefined, undefined, 600);
  eq("weekly from the same FMP daily series (no second call)", [w.provider, calls.fmp], ["fmp", 1]);

  /* intraday: FMP says Restricted Endpoint (plan) -> remembered, Stooq (daily only) skipped, Yahoo serves */
  const callsBefore = calls.fmp;
  const h = await getForexCandles("EURUSD", "60", undefined, undefined, 600);
  eq("intraday: falls back to Yahoo, no volume", [h.provider, h.volume], ["yahoo", "none"]);
  eq("intraday: null rows dropped, values rounded", [h.candles.length, h.candles[0].open], [5, 1.1257]);
  eq("intraday: FMP was asked once and is now denied", [calls.fmp - callsBefore, Object.keys(forexDenied()).includes("fmp|intraday|*")], [1, true]);
  await getForexCandles("EURUSD", "15", undefined, undefined, 600);
  await getForexCandles("GBPUSD", "5", undefined, undefined, 600);
  eq("intraday: further requests do not call FMP again", calls.fmp - callsBefore, 1);
  const h4 = await getForexCandles("EURUSD", "240", undefined, undefined, 600);
  eq("4h from hourly, UTC aligned", h4.candles.length > 0 && h4.candles.every((c) => c.timestamp % (4 * 3_600_000) === 0), true);

  /* symbol-level denial (a pair outside the plan) */
  const ru = await getForexCandles("USDRUB", "D", undefined, undefined, 600);
  eq("pair outside the FMP plan: daily goes to Yahoo (Stooq challenge detected)", [ru.provider, ru.candles.length > 0], ["yahoo", true]);
  eq("Stooq browser check is remembered (switched off)", Object.keys(forexDenied()).includes("stooq|daily|*"), true);
  const fmpCallsNow = calls.fmp;
  await getForexCandles("USDRUB", "W", undefined, undefined, 600);
  eq("USDRUB is denied on FMP: not asked again", calls.fmp, fmpCallsNow);
  eq("daily bars at UTC midnight (Yahoo gmtoffset applied)", ru.candles.every((c) => c.timestamp % 86_400_000 === 0), true);

  /* metals: proxy flag on candles */
  const au = await getForexCandles("XAUUSD", "60", undefined, undefined, 600);
  eq("metals candles: proxy label, from Yahoo futures", [au.provider, /GC=F/.test(au.proxy ?? "")], ["yahoo", true]);

  /* scroll-back window passes `to` */
  const to = T("2026-10-02T10:00:00Z");
  const before = urls.length;
  await getForexCandles("AUDUSD", "60", undefined, to, 500);
  const u = urls.slice(before).find((x) => x.includes("yahoo"));
  eq("scroll-back: period2 = to (+1 s)", u ? new URL(u).searchParams.get("period2") : null, String(Math.ceil((to + 1000) / 1000)));

  /* provider order override */
  process.env.FOREX_CANDLE_PROVIDERS = "yahoo";
  const y = await getForexCandles("EURGBP", "D", undefined, undefined, 50);
  eq("FOREX_CANDLE_PROVIDERS=yahoo skips FMP", y.provider, "yahoo");

  /* every provider failing: empty, never throws, reason says why */
  process.env.FOREX_CANDLE_PROVIDERS = "stooq";
  const none = await getForexCandles("EURCAD", "D", undefined, undefined, 50);
  eq("all providers failed: empty + reason", [none.provider, none.candles.length, typeof none.reason], ["none", 0, "string"]);
  delete process.env.FOREX_CANDLE_PROVIDERS;
  eq("unknown symbol: empty", (await getForexCandles("FOO", "D")).reason, "unknown-symbol");

  /* FMP 429 switches the provider off for a minute (not the symbol) */
  fmpMode.v = "429";
  process.env.FOREX_QUOTE_PROVIDERS = "fmp,yahoo";
  const q429 = await getForexQuote("EURJPY");
  eq("quote: FMP 429 -> Yahoo, FMP rate-limited as a whole", [q429?.provider, (forexDenied()["fmp|*|*"] ?? 0) > 0], ["yahoo", true]);
  delete process.env.FOREX_QUOTE_PROVIDERS;

  eq("provider registry", Object.keys(FOREX_PROVIDERS).sort(), ["fmp", "stooq", "yahoo"]);
  console.log(`\nupstream calls: fmp=${calls.fmp} stooq=${calls.stooq} yahoo=${calls.yahoo}`);
  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}
main();
