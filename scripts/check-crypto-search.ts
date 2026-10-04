/* Offline check of the Bybit spot search: filtering / ranking over a fixture list (shape of instruments-info, category=spot),
   no network. Run: npx tsx scripts/check-crypto-search.ts */
import { looksLikeCoin, pairToItem, parseSpotList, POPULAR_CRYPTO, searchSpotPairs } from "../src/lib/bybit-spot-search";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

const row = (baseCoin: string, quoteCoin = "USDT", status = "Trading") => ({ symbol: baseCoin + quoteCoin, baseCoin, quoteCoin, status });
const list = parseSpotList({
  retCode: 0,
  result: {
    category: "spot",
    list: [
      row("BTC"), row("BTC", "USDC"), row("WBTC"), row("BTCDOM"), row("ETH"), row("SOL"), row("SOLO"), row("SOLV"), row("PEPE"), row("1INCH"),
      row("DOGE"), row("TON"), row("TONIC"), row("XRP"), row("OLD", "USDT", "Closed"), row("MATIC"), row("POL"),
    ],
  },
});
const syms = (q: string, limit = 30) => searchSpotPairs(list, q, limit).map((p) => p.symbol);

eq("parse keeps trading USDT pairs only", list.map((p) => p.symbol).includes("BTCUSDC") || list.map((p) => p.symbol).includes("OLDUSDT"), false);
eq("parse count", list.length, 15);
eq("exact symbol on top", syms("btcusdt")[0], "BTCUSDT");
eq("exact coin first, then prefix, then contains", syms("btc"), ["BTCUSDT", "BTCDOMUSDT", "WBTCUSDT"]);
eq("sol: exact, then prefixes alphabetically", syms("sol"), ["SOLUSDT", "SOLOUSDT", "SOLVUSDT"]);
eq("name match (en)", syms("bitcoin")[0], "BTCUSDT");
eq("name match (ru)", syms("биткоин"), ["BTCUSDT"]);
eq("name prefix «dogec»", syms("dogec"), ["DOGEUSDT"]);
eq("separators ignored", syms("BTC/USDT")[0], "BTCUSDT");
eq("digits-leading coin", syms("1inch"), ["1INCHUSDT"]);
eq("matic alias finds POL", syms("matic"), ["MATICUSDT", "POLUSDT"]);
eq("limit", syms("so", 2), ["SOLOUSDT", "SOLUSDT"]);
eq("empty query -> nothing (popular list is separate)", syms("  "), []);
eq("no hit", syms("zzzz"), []);
eq("popular is 10 USDT pairs", [POPULAR_CRYPTO.length, POPULAR_CRYPTO[0].symbol], [10, "BTCUSDT"]);
eq("item shape", pairToItem(list[0]), { secid: "BTCUSDT", ticker: "BTCUSDT", name: "Bitcoin", group: "crypto", source: "bybit", asset: "BTC" });
eq("unknown coin name = base", pairToItem({ symbol: "XYZUSDT", base: "XYZ", quote: "USDT" }).name, "XYZ");
eq("looksLikeCoin", ["btc", "sol", "sber.", "b", "сбер", "btcusdt"].map(looksLikeCoin), [true, true, false, false, false, true]);

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
