/* Offline check of the Bybit ticker parsing and contract grouping with a stubbed instruments-info answer (the shape follows
   the Bybit v5 documentation; the real API is not reachable from the development machine).
   Run: npx tsx scripts/check-bybit-contracts.ts */
import { bybitTicker, parseBybitTicker } from "../src/lib/bybit-symbol";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

eq("spot", parseBybitTicker("BTCUSDT"), { category: "spot", symbol: "BTCUSDT", perpetual: false });
eq("linear perpetual", parseBybitTicker("BTCUSDT.P"), { category: "linear", symbol: "BTCUSDT", perpetual: true });
eq("usdc perpetual", parseBybitTicker("BTCPERP.P"), { category: "linear", symbol: "BTCPERP", perpetual: true });
eq("dated linear", parseBybitTicker("BTC-26DEC25"), { category: "linear", symbol: "BTC-26DEC25", perpetual: false });
eq("dated usdt linear", parseBybitTicker("BTCUSDT-27MAR26"), { category: "linear", symbol: "BTCUSDT-27MAR26", perpetual: false });
eq("inverse perpetual", parseBybitTicker("BTCUSD.I"), { category: "inverse", symbol: "BTCUSD", perpetual: true });
eq("inverse dated", parseBybitTicker("BTCUSDZ25.I"), { category: "inverse", symbol: "BTCUSDZ25", perpetual: false });
eq("round trip", [bybitTicker("spot", "BTCUSDT", false), bybitTicker("linear", "BTCUSDT", true), bybitTicker("linear", "BTC-26DEC25", false), bybitTicker("inverse", "BTCUSD", true)], ["BTCUSDT", "BTCUSDT.P", "BTC-26DEC25", "BTCUSD.I"]);

const day = 86_400_000;
const future = (d: number) => String(Date.now() + d * day);
const page = (category: string) => {
  const list: any[] =
    category === "spot"
      ? [
          { symbol: "BTCUSDT", baseCoin: "BTC", quoteCoin: "USDT", status: "Trading" },
          { symbol: "ETHUSDT", baseCoin: "ETH", quoteCoin: "USDT", status: "Trading" },
        ]
      : category === "linear"
        ? [
            { symbol: "BTCUSDT", contractType: "LinearPerpetual", status: "Trading", baseCoin: "BTC", quoteCoin: "USDT", settleCoin: "USDT", deliveryTime: "0" },
            { symbol: "BTCPERP", contractType: "LinearPerpetual", status: "Trading", baseCoin: "BTC", quoteCoin: "USDC", settleCoin: "USDC", deliveryTime: "0" },
            { symbol: "BTC-27DEC30", contractType: "LinearFutures", status: "Trading", baseCoin: "BTC", quoteCoin: "USDC", settleCoin: "USDC", deliveryTime: String(Date.UTC(2030, 11, 27)) },
            { symbol: "BTC-26JUL30", contractType: "LinearFutures", status: "Trading", baseCoin: "BTC", quoteCoin: "USDC", settleCoin: "USDC", deliveryTime: String(Date.UTC(2030, 6, 26)) },
            { symbol: "ETHUSDT", contractType: "LinearPerpetual", status: "Trading", baseCoin: "ETH", quoteCoin: "USDT", settleCoin: "USDT", deliveryTime: "0" },
          ]
        : [
            { symbol: "BTCUSD", contractType: "InversePerpetual", status: "Trading", baseCoin: "BTC", quoteCoin: "USD", settleCoin: "BTC", deliveryTime: "0" },
            { symbol: "BTCUSDZ30", contractType: "InverseFutures", status: "Trading", baseCoin: "BTC", quoteCoin: "USD", settleCoin: "BTC", deliveryTime: future(90) },
          ];
  return { retCode: 0, result: { list, nextPageCursor: "" } };
};
(globalThis as any).fetch = async (url: string) => {
  const cat = new URL(url).searchParams.get("category") ?? "";
  return { ok: true, json: async () => page(cat) };
};

import("../src/lib/bybit-contracts").then(async ({ getBybitContracts }) => {
  const r = await getBybitContracts("BTCUSDT", "ru");
  eq("base coin", r?.asset, "BTC");
  eq("order: spot, linear perps, linear dated by expiry, inverse", r?.contracts.map((c) => c.ticker), ["BTCUSDT", "BTCPERP.P", "BTCUSDT.P", "BTC-26JUL30", "BTC-27DEC30", "BTCUSD.I", "BTCUSDZ30.I"]);
  eq("kinds", r?.contracts.map((c) => c.kind), ["spot", "perpetual", "perpetual", "monthly", "quarterly", "perpetual", "monthly"]);
  eq("dated order", r?.contracts.filter((c) => c.kind !== "perpetual" && c.kind !== "spot").map((c) => [c.ticker, c.order]), [["BTC-26JUL30", 1], ["BTC-27DEC30", 2], ["BTCUSDZ30.I", 1]]);
  const again = await getBybitContracts("BTCUSDT.P", "en");
  eq("same family from a perpetual ticker", again?.asset, "BTC");
  eq("unknown coin has no contracts but spot", (await getBybitContracts("DOGEUSDT"))?.contracts.length, 0);
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
});
