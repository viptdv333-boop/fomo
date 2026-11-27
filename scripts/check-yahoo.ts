/* Yahoo source (src/lib/data/yahoo.ts): interval mapping, symbol rules, window caps, live quantisation,
   pence normalisation, null holes, scroll-back cut, upstream cache and error answers. Offline (fetch mocked).
   Run: npx tsx scripts/check-yahoo.ts   (exit code 1 on a failed assertion) */
import assert from "node:assert/strict";
import { yahooUrl, yahooWindowSeconds, parseYahooChart, yahooCandles, YAHOO_INTERVAL } from "../src/lib/data/yahoo";

let passes = 0;
function ok(cond: boolean, label: string) {
  assert.ok(cond, label);
  passes++;
}
const near = (a: number, b: number) => ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// --- interval mapping & symbol rules ---------------------------------------
ok(YAHOO_INTERVAL["60"] === "60m" && YAHOO_INTERVAL["D"] === "1d" && YAHOO_INTERVAL["M"] === "1mo", "interval ids map to Yahoo names");
ok(yahooUrl("sap.de", "D", 100)!.includes("SAP.DE"), "symbol uppercased");
ok(yahooUrl("^GSPC", "D", 100)!.includes("%5EGSPC"), "index caret encoded");
ok(yahooUrl("ES=F", "D", 100)!.includes("ES%3DF"), "futures equals encoded");
ok(yahooUrl("BRK-B", "D", 100)!.includes("BRK-B"), "dash class allowed");
ok(yahooUrl("bad symbol!", "D", 100) === null, "invalid symbol rejected");
ok(yahooUrl("AAPL", "3", 100) === null, "unsupported interval rejected");

// --- live quantisation & scroll-back ---------------------------------------
const NOW = Date.UTC(2026, 10, 27, 8, 15, 37, 400);
const live = yahooUrl("AAPL", "60", 300, undefined, NOW)!;
const p2 = Number(new URL(live, "https://x").searchParams.get("period2"));
ok(p2 % 10 === 0 && p2 <= Math.floor(NOW / 1000), "live period2 quantised to the 10 s bucket");
const to = Date.UTC(2025, 0, 15, 12, 0, 0);
const back = yahooUrl("AAPL", "D", 300, to)!;
ok(Number(new URL(back, "https://x").searchParams.get("period2")) === Math.floor(to / 1000), "scroll-back period2 = to");

// --- window caps ------------------------------------------------------------
ok(yahooWindowSeconds("1", 5000) <= 7 * 86_400, "1m window capped at 7 days");
ok(yahooWindowSeconds("15", 5000) <= 60 * 86_400, "15m window capped at 60 days");
ok(yahooWindowSeconds("60", 5000) <= 730 * 86_400, "60m window capped at 730 days");
ok(yahooWindowSeconds("D", 300) >= 300 * 86_400, "daily window covers the asked bars");

// --- parsing ----------------------------------------------------------------
const fixture = {
  chart: {
    result: [{
      meta: { symbol: "SHEL.L", currency: "GBp", fullExchangeName: "LSE" },
      timestamp: [1_700_000_000, 1_700_000_060, 1_700_000_120],
      indicators: { quote: [{ open: [2500, null, 2520], high: [2510, null, 2530], low: [2490, null, 2510], close: [2505, null, 2525], volume: [1000, null, 1200] }] },
    }],
    error: null,
  },
};
const parsed = parseYahooChart(fixture)!;
ok(parsed.candles.length === 2, "null hole dropped");
near(parsed.candles[0].close, 25.05); // pence → pounds
near(parsed.candles[1].open, 25.2);
ok(parsed.candles[0].timestamp === 1_700_000_000_000, "seconds → milliseconds");
ok(parsed.exchange === "LSE" && parsed.currency === "GBp", "meta carried");
ok(parseYahooChart({ chart: { result: null, error: { code: "Not Found" } } }) === null, "error answer parses to null");
const usd = parseYahooChart({ chart: { result: [{ meta: { symbol: "AAPL", currency: "USD" }, timestamp: [1], indicators: { quote: [{ open: [100], high: [101], low: [99], close: [100.5], volume: [5] }] } }] } })!;
near(usd.candles[0].close, 100.5); // no pence scaling for USD

// --- fetch path: cache, scroll-back cut, error --------------------------------
async function main() {
  const realFetch = globalThis.fetch;
  let calls = 0;
  let lastUrl = "";
  globalThis.fetch = (async (url: string) => {
    calls++;
    lastUrl = String(url);
    return { ok: true, json: async () => fixture } as Response;
  }) as typeof fetch;
  try {
    const a = await yahooCandles("SHEL.L", "D", 100);
    const b = await yahooCandles("SHEL.L", "D", 100);
    ok(calls === 1, "identical live requests share one upstream fetch (cache)");
    ok(a.candles.length === 2 && b.candles.length === 2, "cached answer served");
    ok(lastUrl.includes("query1.finance.yahoo.com") || lastUrl.includes("query2.finance.yahoo.com"), "Yahoo host used");

    // scroll-back: bars after `to` are cut
    const cut = await yahooCandles("SHEL.L", "D", 100, 1_700_000_060_000);
    ok(cut.candles.length === 1 && cut.candles[0].timestamp === 1_700_000_000_000, "scroll-back cuts bars after to");

    // upstream failure → empty, not cached for hours
    globalThis.fetch = (async () => ({ ok: false, json: async () => ({}) }) as Response) as typeof fetch;
    const bad = await yahooCandles("NOPEx", "D", 100);
    ok(bad.candles.length === 0, "failed upstream yields empty candles");
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(`check-yahoo: ${passes} passed, 0 failed`);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
