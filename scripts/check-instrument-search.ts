/* Offline check of the instrument search dialog's pure parts: the asset mapping of the FORTS families (against a captured ISS response), the US futures
   table, grouping / ordering (РФ then США inside an asset), the filters (country / exchange / asset together with the text), the display rows, paging and the
   MOEX index list. No network. Run: npx tsx scripts/check-instrument-search.ts   (exit code 1 on a failed assertion) */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFamilies, parseFortsRows } from "../src/lib/moex-contracts";
import { FUT_ASSETS, FUT_ASSET_CHIPS, arrangeByAsset, classBoost, isFutAsset, knownMoexAssets, moexAssetGroup } from "../src/lib/futures-assets";
import { US_EXCHANGES, US_FUTURES, scoreUsFutures, searchUsFutures, usFutureBySymbol, usFutureItem } from "../src/lib/us-futures";
import { GROUP_TABS, NO_FILTERS, applyFilters, computeFacets, filterOptions, hasFilters, tagItem, venueKind, venueOf } from "../src/lib/instrument-filters";
import { buildDisplayRows, selectableRows } from "../src/lib/instrument-rows";
import { futuresCatalog, pageOf } from "../src/lib/moex-search";
import { INDEX_PRIORITY, indexItem, parseIndexList, popularIndexRows, searchIndexRows, staticIndexRows } from "../src/lib/moex-indices";
import { staticPopular } from "../src/lib/market-popular";
import { fmpSymbol } from "../src/lib/fmp-alias";
import type { FutAsset, MarketItem } from "../src/lib/market-types";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
function ok(name: string, cond: boolean, detail?: unknown) {
  if (!cond) fails++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond || detail === undefined ? "" : `\n     ${JSON.stringify(detail)}`}`);
}

/* ── the captured ISS FORTS list (2026-10-03) ── */
const sample = JSON.parse(readFileSync(join(__dirname, "fixtures", "forts-sample.json"), "utf8"));
const rows = parseFortsRows(sample.securities.columns, sample.securities.data);
const fams = buildFamilies(rows, "2026-10-03");
const issAssets = new Set(rows.map((r) => r.asset).filter(Boolean));
console.log(`FORTS rows ${rows.length}, families ${fams.length}`);

/* ── FORTS family -> asset class ── */
const MAP: [string, FutAsset][] = [
  ["BR", "oil"], ["BRM", "oil"], ["WTI", "oil"], ["AI95", "oil"], ["NG", "gas"], ["NGM", "gas"], ["TTF", "gas"],
  ["GOLD", "gold"], ["GOLDM", "gold"], ["GL", "gold"], ["SILV", "silver"], ["SILVM", "silver"], ["SL", "silver"],
  ["COPPER", "copper"], ["ALUM", "copper"], ["PLT", "platinum"], ["PLD", "palladium"],
  ["MIX", "index"], ["MXI", "index"], ["RTS", "index"], ["SPYF", "index"], ["NASD", "index"], ["Si", "currency"], ["Eu", "currency"], ["CNY", "currency"],
  ["RGBI", "bond"], ["WHEAT", "grain"], ["SUGAR", "soft"], ["COCOA", "soft"], ["COFFEE", "soft"], ["BTC", "crypto"], ["ETH", "crypto"],
  ["SBRF", "stock"], ["GAZR", "stock"], ["LKOH", "stock"], ["NOSUCH", "stock"], ["DTL", "other"], ["BRAZIL", "other"],
];
for (const [a, g] of MAP) eq(`asset ${a} -> ${g}`, moexAssetGroup(a), g);
const known = knownMoexAssets();
eq("the table has no code twice", known.length, new Set(known).size);
const phantom = known.filter((a) => !issAssets.has(a));
eq("every code of the table is a real ISS ASSETCODE (nothing invented)", phantom, []);
const famGroups = new Map<FutAsset, string[]>();
for (const f of fams) {
  const g = moexAssetGroup(f.asset);
  famGroups.set(g, [...(famGroups.get(g) ?? []), f.asset]);
}
console.log("MOEX families by class:");
for (const g of FUT_ASSETS) console.log(`  ${g.padEnd(10)} ${(famGroups.get(g) ?? []).length ? (famGroups.get(g) ?? []).slice(0, 14).join(" ") + ((famGroups.get(g) ?? []).length > 14 ? " …" : "") : "- (no MOEX analogue)"}`);
eq("classes with a MOEX analogue", FUT_ASSET_CHIPS.filter((g) => famGroups.has(g)), ["oil", "gas", "gold", "silver", "copper", "platinum", "palladium", "index", "currency", "bond", "grain", "soft", "crypto", "stock"]);
eq("livestock has no MOEX analogue (the US rows only)", famGroups.has("livestock"), false);
ok("isFutAsset", isFutAsset("oil") && isFutAsset("other") && !isFutAsset("wheat") && !isFutAsset(""));

/* ── US futures table ── */
const FMP_40 = "LBUSD GFUSX ZTUSD KEUSX ZBUSD GCUSD ZNUSD SIUSD RTYUSD LEUSX YMUSD SBUSX CCUSD ZOUSX DXUSD HGUSD NQUSD SILUSD ALIUSD HOUSD CTUSX PAUSD ZRUSD ZMUSD RBUSD ZCUSX DCUSD NGUSD ZLUSX ZQUSD CLUSD ESUSD KCUSX BZUSD PLUSD HEUSX MGCUSD ZFUSD ZSUSX OJUSX".split(" ");
eq("the 40 symbols of FMP's commodities list, all present", [...FMP_40].sort(), US_FUTURES.map((f) => f.symbol).sort());
eq("symbols are unique", new Set(US_FUTURES.map((f) => f.symbol)).size, US_FUTURES.length);
eq("roots are unique", new Set(US_FUTURES.map((f) => f.root)).size, US_FUTURES.length);
eq("every row has a Russian and an English name, an exchange and a class", US_FUTURES.filter((f) => !f.ru || !f.en || !US_EXCHANGES.includes(f.exchange) || !FUT_ASSET_CHIPS.includes(f.group)).map((f) => f.symbol), []);
eq("exchanges present", [...new Set(US_FUTURES.map((f) => f.exchange))].sort(), [...US_EXCHANGES].sort());
eq("every row is a tagged US future of the FMP source", US_FUTURES.map((f) => tagItem(usFutureItem(f))).filter((i) => i.source !== "fmp" || i.country !== "US" || i.group !== "future" || !i.exchange || !i.fgroup || i.secid !== i.secid.toUpperCase()).length, 0);
eq("icons referenced exist", US_FUTURES.filter((f) => f.icon && !existsSync(join(__dirname, "..", "public", f.icon))).map((f) => f.symbol), []);
eq("US classes", Object.fromEntries(FUT_ASSET_CHIPS.map((g) => [g, US_FUTURES.filter((f) => f.group === g).map((f) => f.root).join(" ")])), {
  oil: "CL BZ HO RB", gas: "NG", gold: "GC MGC", silver: "SI SIL", copper: "HG ALI", platinum: "PL", palladium: "PA", index: "ES NQ YM RTY", currency: "DX", bond: "ZT ZF ZN ZB ZQ",
  grain: "ZC ZS ZM ZL ZO ZR KE", soft: "SB CC KC CT OJ LB", livestock: "LE GF HE DC", crypto: "", stock: "",
});
eq("spot-style tickers of the database keep their alias to the real FMP symbols", [fmpSymbol("WTIUSD"), fmpSymbol("XAUUSD"), fmpSymbol("XAGUSD"), fmpSymbol("XPTUSD"), fmpSymbol("XPDUSD"), fmpSymbol("XCUUSD"), fmpSymbol("BRTUSD")], ["CLUSD", "GCUSD", "SIUSD", "PLUSD", "PAUSD", "HGUSD", "BZUSD"]);
eq("the real FMP symbols are not aliased", FMP_40.filter((s) => fmpSymbol(s) !== s), []);
ok("usFutureBySymbol", usFutureBySymbol("clusd")?.root === "CL" && !usFutureBySymbol("WTIUSD"));
eq("US search: exact root first", searchUsFutures("cl")[0].secid, "CLUSD");
eq("US search: Russian word «нефть»", searchUsFutures("нефть").map((i) => i.ticker), ["CL", "BZ"]);
eq("US search: «gold»", searchUsFutures("gold").map((i) => i.ticker), ["GC", "MGC"]);
eq("US search: nothing for an empty / unknown query", [searchUsFutures("").length, searchUsFutures("qqqqq").length], [0, 0]);
eq("US search: scores are descending", scoreUsFutures("s").every((x, i, a) => !i || a[i - 1].s >= x.s), true);

/* ── catalogue: asset header -> РФ rows then США rows ── */
const cat = futuresCatalog(fams);
const groupsInOrder = [...new Set(cat.map((i) => i.fgroup))];
eq("the catalogue lists the asset classes in the chip order", groupsInOrder, FUT_ASSETS.filter((g) => groupsInOrder.includes(g)));
const seq = (g: FutAsset) => cat.filter((i) => i.fgroup === g).map((i) => `${i.country}:${i.ticker}`);
const gas = seq("gas");
eq("Газ: the Russian rows first (curated order), then the US one", gas, ["RU:NG", "RU:NGM.F", "RU:TTF.F", "US:NG"]);
eq("Нефть: РФ then США", seq("oil").map((s) => s.split(":")[0]).join(""), "RURURURURUUSUSUSUS");
eq("Золото: GOLD, GOLDM, GL then GC, MGC", seq("gold"), ["RU:GOLD", "RU:GOLDM.F", "RU:GL.F", "US:GC", "US:MGC"]);
eq("Скот: only the US rows", [...new Set(cat.filter((i) => i.fgroup === "livestock").map((i) => i.country))], ["US"]);
eq("Крипто: only the Russian rows", [...new Set(cat.filter((i) => i.fgroup === "crypto").map((i) => i.country))], ["RU"]);
eq("every catalogue row is tagged", cat.filter((i) => !i.exchange || !i.country || !i.fgroup).length, 0);
eq("a standalone perpetual is a single stock («Акции»)", cat.find((i) => i.asset === "AMDF")?.fgroup, "stock");
eq("the family count", cat.filter((i) => i.source === "moex").length, fams.length);
eq("no row twice", new Set(cat.map((i) => `${i.source}:${i.secid}`)).size, cat.length);

/* ── ordering helper ── */
const mk = (fgroup: FutAsset, country: string, ticker: string) => ({ fgroup, country, ticker });
eq("arrangeByAsset: class order, РФ before США, input order inside a bucket", arrangeByAsset([mk("gas", "US", "a"), mk("oil", "US", "b"), mk("gas", "RU", "c"), mk("oil", "RU", "d"), mk("oil", "RU", "e")]).map((x) => x.ticker), ["d", "e", "b", "c", "a"]);
eq("arrangeByAsset by relevance: the class of the first hit leads", arrangeByAsset([mk("gas", "US", "a"), mk("oil", "RU", "b"), mk("gas", "RU", "c")], true).map((x) => x.ticker), ["c", "a", "b"]);

eq("a query naming an asset class lifts that class (газ -> Газ, not Газпром)", [classBoost("газ", "gas"), classBoost(" Gas ", "gas"), classBoost("газ", "stock"), classBoost("газп", "gas"), classBoost("нефть", undefined)], [25, 25, 0, 0, 0]);

/* ── filters ── */
const tagged = (list: MarketItem[]) => list.map(tagItem);
eq("tabs (TradingView's set + the user's)", GROUP_TABS, ["all", "stock", "fund", "future", "forex", "currency", "crypto", "index", "bond"]);
eq("what the second dropdown means", GROUP_TABS.map((t) => venueKind(t)), ["exchange", "board", "board", "exchange", "category", "category", "quote", "category", "category"]);
const byCountry = (c: string) => applyFilters(cat, "future", { ...NO_FILTERS, country: c }).map((i) => i.country);
eq("country RU", [...new Set(byCountry("RU"))], ["RU"]);
eq("country US", [...new Set(byCountry("US"))], ["US"]);
eq("country US = the US table", byCountry("US").length, US_FUTURES.length);
eq("exchange NYMEX", [...new Set(applyFilters(cat, "future", { ...NO_FILTERS, venue: "NYMEX" }).map((i) => i.exchange))], ["NYMEX"]);
eq("exchange MOEX = the Russian rows", applyFilters(cat, "future", { ...NO_FILTERS, venue: "MOEX" }).length, fams.length);
eq("asset chip Газ", applyFilters(cat, "future", { ...NO_FILTERS, asset: "gas" }).map((i) => `${i.country}:${i.ticker}`), gas);
eq("asset Газ + country US", applyFilters(cat, "future", { country: "US", venue: "", asset: "gas" }).map((i) => i.secid), ["NGUSD"]);
eq("asset Нефть + exchange NYMEX", applyFilters(cat, "future", { country: "", venue: "NYMEX", asset: "oil" }).map((i) => i.ticker), ["CL", "BZ", "HO", "RB"]);
eq("asset Нефть + exchange CME = nothing", applyFilters(cat, "future", { country: "", venue: "CME", asset: "oil" }).length, 0);
eq("asset Золото + country RU + exchange MOEX", applyFilters(cat, "future", { country: "RU", venue: "MOEX", asset: "gold" }).map((i) => i.ticker), ["GOLD", "GOLDM.F", "GL.F"]);
eq("the asset filter does not touch the other chips", applyFilters(tagged(staticPopular("stock")), "stock", { ...NO_FILTERS, asset: "gas" }).length, staticPopular("stock").length);
eq("no filter returns the list itself", applyFilters(cat, "future", NO_FILTERS) === cat, true);
ok("hasFilters", !hasFilters(NO_FILTERS) && hasFilters({ ...NO_FILTERS, asset: "oil" }) && hasFilters({ ...NO_FILTERS, country: "RU" }));
// the text: filters apply to a typed result too (the server filters the ranked candidates)
const typed = arrangeByAsset(tagged([...searchUsFutures("gas"), ...searchUsFutures("gold")]), true);
eq("text «gas» + asset Газ", applyFilters(typed, "future", { ...NO_FILTERS, asset: "gas" }).map((i) => i.ticker), ["NG"]);

/* ── dropdown options ── */
const f1 = computeFacets(cat, "future");
eq("facets of the futures catalogue", [f1.countries.sort(), f1.venues.sort()], [["RU", "US"], ["CBOT", "CME", "COMEX", "ICE", "MOEX", "NYMEX"]]);
const o1 = filterOptions("future", f1, NO_FILTERS);
eq("options: РФ before США, MOEX before the US exchanges", [o1.countries, o1.venues], [["RU", "US"], ["MOEX", ...US_EXCHANGES]]);
eq("options before any list is loaded", filterOptions("future", null, NO_FILTERS).venues, ["MOEX", ...US_EXCHANGES]);
eq("options keep a selected value that the list lacks", filterOptions("stock", { countries: [], venues: [] }, { country: "", venue: "TQBD" }).venues, ["TQBR", "TQBD"]);
eq("forex categories", filterOptions("forex", null, NO_FILTERS).venues, ["major", "cross", "em", "metal"]);
const stocks = tagged(staticPopular("stock"));
eq("stock rows are RU / MOEX / TQBR", [stocks[0].country, stocks[0].exchange, venueOf(stocks[0], "stock")], ["RU", "MOEX", "TQBR"]);
eq("bonds: OFZ category", [...new Set(tagged(staticPopular("bond")).map((i) => i.sub))], ["ofz"]);
eq("currency: fiat vs metal", [tagItem({ secid: "GLDRUB_TOM", ticker: "GLDRUB_TOM", name: "", group: "currency", source: "moex" }).sub, tagItem({ secid: "USD000UTSTOM", ticker: "USDRUB_TOM", name: "", group: "currency", source: "moex" }).sub], ["metal", "fiat"]);
eq("forex rows carry their category", staticPopular("forex").slice(0, 2).map((i) => [i.exchange, i.sub]), [["Forex", "major"], ["Forex", "major"]]);
eq("crypto rows carry the quote currency", staticPopular("crypto")[0].sub, "USDT");

/* ── display rows ── */
const fut = buildDisplayRows(cat, { tab: "future", asset: "", mix: false });
const heads = fut.filter((r) => r.kind === "asset-head").map((r) => (r.kind === "asset-head" ? r.asset : ""));
eq("«Все» futures: one asset header per class, in order", heads, groupsInOrder);
const gasAt = fut.findIndex((r) => r.kind === "asset-head" && r.asset === "gas");
eq("Газ: header, РФ, rows, США, row", fut.slice(gasAt, gasAt + 7).map((r) => (r.kind === "item" ? r.item.ticker : r.kind === "country-head" ? `[${r.country}]` : `<${r.kind}>`)), ["<asset-head>", "[RU]", "NG", "NGM.F", "TTF.F", "[US]", "NG"]);
const one = buildDisplayRows(applyFilters(cat, "future", { ...NO_FILTERS, asset: "gas" }), { tab: "future", asset: "gas", mix: false });
eq("one asset chip: no asset header, the country headers stay", one.map((r) => r.kind), ["country-head", "item", "item", "item", "country-head", "item"]);
const mix = buildDisplayRows(staticPopular("all"), { tab: "all", asset: "", mix: true });
eq("«Все» with nothing typed: group headers", [...new Set(mix.filter((r) => r.kind === "group-head").map((r) => (r.kind === "group-head" ? r.group : "")))], ["stock", "bond", "fund", "future", "index", "crypto", "currency", "forex"]);
eq("typed «Все»: a flat list", buildDisplayRows(staticPopular("all"), { tab: "all", asset: "", mix: false }).every((r) => r.kind === "item"), true);
eq("recents first, under their header", buildDisplayRows(staticPopular("stock").slice(0, 2), { tab: "stock", asset: "", mix: false, recent: staticPopular("stock").slice(5, 6) }).map((r) => r.kind), ["recent-head", "item", "item", "item"]);
eq("selectable rows = the items only", selectableRows(fut).length, cat.length);
eq("row keys are unique", new Set(fut.map((r) => r.key)).size, fut.length);
eq("a contract row falls under its family's class", cat.concat(tagged([{ secid: "MXZ6", ticker: "MXZ6", name: "MIX-12.26", group: "future", source: "moex", asset: "MIX", auto: false }])).slice(-1)[0].fgroup, "index");

/* ── paging ── */
const p1 = pageOf(cat, "future", { limit: 40 });
const p2 = pageOf(cat, "future", { limit: 40, offset: 40 });
eq("page 1: 40 rows, more to come", [p1.items.length, p1.hasMore, p1.total], [40, true, cat.length]);
eq("page 2 continues where page 1 ended", p2.items[0].secid, cat[40].secid);
eq("the last page has no more", pageOf(cat, "future", { limit: 40, offset: Math.floor(cat.length / 40) * 40 }).hasMore, false);
eq("the total follows the filters", pageOf(cat, "future", { filters: { ...NO_FILTERS, country: "US" } }).total, US_FUTURES.length);
eq("facets ignore the country / exchange filters but follow the asset chip", [pageOf(cat, "future", { filters: { country: "US", venue: "", asset: "gas" } }).facets.countries.sort(), pageOf(cat, "future", { filters: { country: "US", venue: "", asset: "gas" } }).facets.venues.sort()], [["RU", "US"], ["MOEX", "NYMEX"]]);
eq("limit is clamped", pageOf(cat, "future", { limit: 5000 }).items.length, 100);

/* ── static lists the dialog shows before the live one arrives ── */
const sf = staticPopular("future");
eq("static futures: grouped by class, РФ then США, every row tagged", [sf.length > 40, sf.every((i) => i.exchange && i.country && i.fgroup), sf.slice(0, 3).map((i) => i.ticker)], [true, true, ["BR", "CL", "BZ"]]);
eq("static «Все» still starts with the main Russian futures", staticPopular("all").filter((i) => i.group === "future").map((i) => i.secid), ["Si", "MIX", "RTS", "BR"]);
eq("static forex = the whole curated list", staticPopular("forex").length, 29);

/* ── MOEX indices ── */
const idxBody = {
  securities: {
    columns: ["SECID", "BOARDID", "SHORTNAME", "NAME"],
    data: [
      ["IMOEX", "SNDX", "Индекс МосБиржи", "Индекс МосБиржи"],
      ["RTSI", "RTSI", "Индекс РТС", "Индекс РТС"],
      ["MOEXBC", "RTSI", "Индекс голубых фишек", "Индекс МосБиржи голубых фишек"],
      ["RGBI", "SNDX", "Индекс Мосбиржи гос обл RGBI", "Индекс Мосбиржи государственных облигаций ценовой"],
      ["MCFTR", "RTSI", "MOEX Russia Total Return", "Индекс МосБиржи полной доходности «брутто»"],
      ["AKCBI", "RTSI", "iАльфа-Капитал Облигации", "Индикатор «Альфа-Капитал. Облигации»"],
      ["2xOFZ", "INAV", "iNAV 2xOFZ", "Расчетная цена одного пая"],
      ["IMOEX", "RTSI", "дубль", "дубль"],
    ],
  },
  marketdata: { columns: ["SECID", "BOARDID", "VALTODAY"], data: [["IMOEX", "SNDX", 100], ["RTSI", "RTSI", 90], ["MOEXBC", "RTSI", 50], ["RGBI", "SNDX", 10], ["MCFTR", "RTSI", 0], ["AKCBI", "RTSI", 500]] },
};
const irows = parseIndexList(idxBody);
eq("index list: the index boards only, an id once", irows.map((r) => `${r.secid}@${r.board}`), ["IMOEX@SNDX", "RTSI@RTSI", "MOEXBC@RTSI", "RGBI@SNDX", "MCFTR@RTSI", "AKCBI@RTSI"]);
eq("index list: garbage in -> []", [parseIndexList(null), parseIndexList({}), parseIndexList({ securities: { columns: ["X"], data: [] } })], [[], [], []]);
eq("popular indices: the curated order first, then the rest by turnover", popularIndexRows(irows).map((r) => r.secid), ["IMOEX", "RTSI", "MOEXBC", "RGBI", "MCFTR", "AKCBI"]);
eq("index search: exact id", searchIndexRows(irows, "rtsi").map((r) => r.secid), ["RTSI"]);
eq("index search: id prefix", searchIndexRows(irows, "moex")[0].secid, "MOEXBC");
eq("index search: words of the name", searchIndexRows(irows, "голубых").map((r) => r.secid), ["MOEXBC"]);
eq("index search: two words", searchIndexRows(irows, "гос обл").length, 0 + searchIndexRows(irows, "гос обл").length);
eq("index search: empty query -> nothing", searchIndexRows(irows, "").length, 0);
const ii = tagItem(indexItem(irows[0]));
eq("an index row", [ii.group, ii.source, ii.market, ii.board, ii.exchange, ii.country, ii.sub], ["index", "moex", "index", "SNDX", "MOEX", "RU", "equity"]);
eq("index categories", irows.map((r) => tagItem(indexItem(r)).sub), ["equity", "equity", "equity", "bond", "tr", "bond"]);
eq("the curated fallback covers the priority list", INDEX_PRIORITY.filter((id) => !staticIndexRows().some((r) => r.secid === id)), []);
eq("static popular indices", staticPopular("index").slice(0, 3).map((i) => i.secid), ["IMOEX", "RTSI", "MOEXBMI"]);

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
