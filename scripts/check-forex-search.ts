/* Offline check of the forex search (ranking over the curated list, aliases in ru / en, typed crosses), the pip precision and the
   24x5 session clock, no network. Run: npx tsx scripts/check-forex-search.ts */
import { FX_PAIRS, fxDigits, fxMarketOpen, fxName, isForexSymbol, looksLikeForex, pairToItem, parseFxSymbol, searchForex } from "../src/lib/forex-meta";
import { popularMarketPage, searchMarketPage } from "../src/lib/moex-search";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const ids = (q: string, limit = 30, min = 0) => searchForex(q, limit, min).map((i) => i.secid);

eq("curated list size / first / last", [FX_PAIRS.length, FX_PAIRS[0].symbol, FX_PAIRS[FX_PAIRS.length - 1].symbol], [29, "EURUSD", "XAGUSD"]);
eq("no duplicates", new Set(FX_PAIRS.map((p) => p.symbol)).size, FX_PAIRS.length);
eq("majors first", FX_PAIRS.slice(0, 7).map((p) => p.symbol), ["EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD"]);

eq("exact symbol", ids("eurusd"), ["EURUSD"]);
eq("slash form", ids("EUR/USD"), ["EURUSD"]);
eq("space form", ids("eur usd"), ["EURUSD"]);
eq("one code: base first, curated order", ids("eur", 6), ["EURUSD", "EURGBP", "EURJPY", "EURCHF", "EURAUD", "EURCAD"]);
eq("one code, quote side after base side", ids("chf", 4), ["CHFJPY", "USDCHF", "EURCHF", "GBPCHF"]);
eq("ru: евро", ids("евро", 3), ["EURUSD", "EURGBP", "EURJPY"]);
eq("ru: две валюты словами", ids("евро доллар"), ["EURUSD"]);
eq("ru: иена / йена are the same", ids("иена"), ids("йена"));
eq("ru: иена finds every JPY pair", ids("иена").length, 7);
eq("ru: золото -> XAUUSD", ids("золото"), ["XAUUSD"]);
eq("en: gold / code xau", [ids("gold"), ids("xau")], [["XAUUSD"], ["XAUUSD"]]);
eq("ru: тенге / рубль / лира / юань", [ids("тенге"), ids("рубль"), ids("лира"), ids("юань")], [["USDKZT"], ["USDRUB"], ["USDTRY"], ["USDCNH", "USDCNY"]]);
eq("ru: австрал (prefix of a name)", ids("австрал", 3), ["AUDUSD", "AUDJPY", "EURAUD"]);
eq("typed cross outside the list is offered", ids("nzdcad"), ["NZDCAD"]);
eq("typed cross: unknown codes are not", ids("abcdef"), []);
eq("a curated pair is not duplicated by the typed rule", ids("gbpjpy"), ["GBPJPY"]);
eq("one letter / empty -> nothing", [ids("e"), ids("  ")], [[], []]);
eq("no hit", ids("zzzz"), []);
eq("limit", ids("usd", 3).length, 3);
eq("strict (the «Все» tab): codes and exact words only", ids("eur", 4, 75), ["EURUSD", "EURGBP", "EURJPY", "EURCHF"]);
eq("strict: a loose substring is not enough", ids("urus", 4, 75), []);
eq("item shape", pairToItem(FX_PAIRS[0]), { secid: "EURUSD", ticker: "EURUSD", name: "EUR/USD", group: "forex", source: "forex", asset: "EURUSD" });
eq("looksLikeForex", ["eurusd", "EUR/USD", "nzd jpy", "sberbk", "btcusdt", "usd"].map(looksLikeForex), [true, true, true, false, false, false]);
eq("isForexSymbol / parse", [isForexSymbol("EURUSD"), isForexSymbol("NZDCAD"), isForexSymbol("SBERUS"), parseFxSymbol("USDUSD")], [true, true, false, null]);

/* precision: pip precision (5, JPY 3, EM 4 ...) */
eq("digits", ["EURUSD", "USDJPY", "GBPJPY", "NZDJPY", "XAUUSD", "XAGUSD", "USDRUB", "USDKZT", "NZDCAD"].map(fxDigits), [5, 3, 3, 3, 2, 3, 4, 2, 5]);

/* names */
eq("name ru / en / cn", [fxName(FX_PAIRS[0], "ru"), fxName(FX_PAIRS[0], "en"), fxName(FX_PAIRS[0], "cn")], ["Евро / Доллар США", "Euro / US Dollar", "欧元 / 美元"]);

/* 24x5 session: Sunday 21:00 UTC .. Friday 21:00 UTC */
const at = (iso: string) => fxMarketOpen(new Date(iso));
eq("session", [at("2026-10-03T12:00:00Z"), at("2026-10-04T20:59:00Z"), at("2026-10-04T21:00:00Z"), at("2026-10-05T03:00:00Z"), at("2026-10-07T12:00:00Z"), at("2026-10-09T20:59:00Z"), at("2026-10-09T21:00:00Z")], [false, false, true, true, true, true, false]);

async function main() {
  /* the market search wires it: the «forex» group without network, «all» adds a few exact hits */
  eq("popularMarketPage(forex) -> the whole curated list", (await popularMarketPage("forex", { limit: 100 })).items.map((i) => i.secid), FX_PAIRS.map((p) => p.symbol));
  eq("searchMarketPage(forex, 'usdjpy')", (await searchMarketPage("usdjpy", "forex")).items.map((i) => i.secid), ["USDJPY"]);
  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
}
main();
