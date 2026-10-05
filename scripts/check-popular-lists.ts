/* Offline check of the «popular» lists of the search chips: the ISS board parsing / turnover ranking, the curated priority + fallbacks and the
   «Все» mix. No network. Run: npx tsx scripts/check-popular-lists.ts */
import { ALL_MIX, FX_PRIORITY, FUND_PRIORITY, FUTURES_PRIORITY, bondItem, currencyItem, mixAll, parseBoard, pickBonds, pickCurrency, pickFunds, pickStocks, staticPopular, type BoardRow } from "../src/lib/market-popular";

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}

type R = [string, string, string, string, string, number | null];
/** an ISS board answer from [secid, shortname, secname, isin, sectype, turnover] */
function body(rows: R[]) {
  return {
    securities: { columns: ["SECID", "SHORTNAME", "SECNAME", "ISIN", "SECTYPE"], data: rows.map((r) => r.slice(0, 5)) },
    marketdata: { columns: ["SECID", "VALTODAY_RUR", "VALTODAY"], data: rows.map((r) => [r[0], r[5], r[5]]) },
  };
}
const ids = (rows: BoardRow[]) => rows.map((r) => r.secid);

// ── parsing ──
const shares = parseBoard(
  body([
    ["GAZP", "Газпром", "Газпром ао", "RU0007661625", "1", 500],
    ["LKOH", "ЛУКОЙЛ", "ЛУКОЙЛ ао", "RU0009024277", "1", 900],
    ["SBER", "Сбербанк", "Сбербанк ао", "RU0009029540", "1", 700],
    ["SBERP", "Сбербанк-п", "Сбербанк ап", "RU0009029557", "2", 300],
    ["YDEX", "Яндекс", "Яндекс", "RU000A107T19", "1", 100],
    ["OZON", "Озон", "Озон", "RU000A10CW95", "1", 200],
    ["AKMM", "AKMM ETF", "БПИФ Альфа ДР", "RU000A104X08", "J", 5000],
    ["TMOS", "TMOS ETF", "БПИФ Т", "RU000A101X76", "J", 10],
    ["SBMX", "SBMX ETF", "БПИФ С", "RU000A1007G1", "J", 20],
    ["LQDT", "LQDT ETF", "БПИФ Л", "RU000A1014L8", "J", 400],
    ["RU000A105TU1", "Облигация", "", "RU000A105TU1", "9", 9999],
    ["NULLT", "Нет оборота", "", "", "1", null],
  ])
);
eq("parse: rows / fields", [shares.length, shares[0]], [12, { secid: "GAZP", shortname: "Газпром", name: "Газпром ао", isin: "RU0007661625", sectype: "1", turnover: 500 }]);
eq("parse: null turnover is 0", shares.find((r) => r.secid === "NULLT")?.turnover, 0);
eq("parse: garbage in -> []", [parseBoard(null), parseBoard({}), parseBoard({ securities: { columns: ["X"], data: [] } }), parseBoard("x")], [[], [], [], []]);
eq("parse: VALTODAY used when VALTODAY_RUR is missing", parseBoard({ securities: { columns: ["SECID"], data: [["A"]] }, marketdata: { columns: ["SECID", "VALTODAY"], data: [["A", 7]] } })[0].turnover, 7);

// ── shares ──
eq("stocks: by turnover, funds and ISIN-ids are out", ids(pickStocks(shares, 15)), ["LKOH", "SBER", "GAZP", "SBERP", "OZON", "YDEX"]);
eq("stocks: limited", ids(pickStocks(shares, 3)), ["LKOH", "SBER", "GAZP"]);
eq("stocks: no turnover at all (market closed) -> [] (the caller falls back)", pickStocks(shares.map((r) => ({ ...r, turnover: 0 }))), []);
eq("stocks: too few rows -> []", pickStocks(shares.slice(0, 3)), []);

// ── funds ──
eq("funds: curated priority first (TMOS, SBMX, LQDT), then the biggest by turnover", ids(pickFunds(shares, 12)), ["TMOS", "SBMX", "LQDT", "AKMM"]);
eq("funds: limit cuts the tail", ids(pickFunds(shares, 2)), ["TMOS", "SBMX"]);
eq("funds: a priority ticker that is not listed is skipped, the fill is by turnover", ids(pickFunds(shares.filter((r) => r.secid !== "TMOS"), 3)), ["SBMX", "LQDT", "AKMM"]);
eq("funds: fewer than 3 funds -> []", pickFunds(shares.filter((r) => r.sectype !== "J" || r.secid === "TMOS")), []);
eq("funds: priority list has no duplicates", new Set(FUND_PRIORITY).size, FUND_PRIORITY.length);

// ── bonds ──
const ofz = parseBoard(body(Array.from({ length: 14 }, (_, i) => [`SU260${i}RMFS${i}`, `ОФЗ 260${i}`, `ОФЗ-ПД 260${i}`, `RU000A10${i}`, "3", (i + 1) * 10] as R)));
const corp = parseBoard(
  body([
    ["RU000A10C8A4", "ПолиплП2Б8", "Полипласт", "RU000A10C8A4", "3", 900],
    ["RU000A10DS74", "Сбер Sb51R", "Сбербанк 001Р", "RU000A10DS74", "3", 500],
    ["RU000A10AZ45", "РЖД 1Р-37R", "РЖД БО", "RU000A10AZ45", "3", 400],
    ["RU000A10F7R7", "Сбер Sb56R", "Сбербанк 001Р", "RU000A10F7R7", "3", 300],
    ["RU000A10G5K5", "ГПН005Р-12", "Газпром нефть", "RU000A10G5K5", "3", 200],
    ["RU000A10FFFF", "ТБ-11_А2", "СФО", "RU000A10FFFF", "3", 100],
    ["RU000A10XXXX", "Сбер Sb99R", "Сбербанк", "RU000A10XXXX", "3", 0],
  ])
);
const bonds = pickBonds(ofz, corp);
eq("bonds: 12 OFZ by turnover + 3 big issuers (small ones and zero turnover out)", [bonds.length, bonds.filter((b) => !b.corp).length, ids(bonds.filter((b) => b.corp).map((b) => b.row))], [15, 12, ["RU000A10DS74", "RU000A10AZ45", "RU000A10F7R7"]]);
eq("bonds: the most traded OFZ first", bonds[0].row.shortname, "ОФЗ 26013");
eq("bonds: no OFZ turnover -> []", pickBonds(ofz.map((r) => ({ ...r, turnover: 0 })), corp), []);
eq("bonds: a failed corporate board still gives the OFZ", pickBonds(ofz, []).length, 12);
const bi = bondItem(ofz[13], "TQOB");
eq("bond item: readable ticker for a SU id, % unit, board", [bi.ticker, bi.secid, bi.unit, bi.group, bi.market, bi.board], ["ОФЗ 26013", "SU26013RMFS13", "%", "bond", "bonds", "TQOB"]);
eq("bond item: an ISIN id gets the short name too", bondItem(corp[1], "TQCB").ticker, "Сбер Sb51R");

// ── currency ──
const cets = parseBoard(
  body([
    ["EUR_RUB__TOM", "EURRUB_TOM", "EURRUB_TOM - EUR/РУБ", "", "", null],
    ["USD000UTSTOM", "USDRUB_TOM", "USDRUB_TOM - USD/РУБ", "", "", null],
    ["CNYRUB_TOM", "CNYRUB_TOM", "CNY/RUB_TOM - CNY/РУБ", "", "", null],
    ["AMDRUB_TOM", "AMDRUB_TOM", "AMD/RUB", "", "", null],
    ["SLVRUB_TOM", "SLVRUB_TOM", "SLV/RUB_TOM - SLV/РУБ", "", "", null],
  ])
);
eq("currency: curated order, only what is listed", ids(pickCurrency(cets)), ["USD000UTSTOM", "EUR_RUB__TOM", "CNYRUB_TOM", "SLVRUB_TOM"]);
eq("currency item: readable ticker, real secid", ((i) => [i.ticker, i.secid, i.engine, i.market, i.board])(currencyItem(pickCurrency(cets)[0])), ["USDRUB_TOM", "USD000UTSTOM", "currency", "selt", "CETS"]);
eq("currency: nearly nothing listed -> []", pickCurrency(cets.slice(3)), []);
eq("currency priority has no duplicates", new Set(FX_PRIORITY).size, FX_PRIORITY.length);

// ── static fallbacks: never empty, valid shape ──
for (const g of ["stock", "bond", "fund", "future", "currency", "crypto", "forex", "all"] as const) {
  const l = staticPopular(g);
  eq(`static ${g}: not empty, unique, shaped`, [l.length > 0, new Set(l.map((i) => `${i.source}:${i.secid}`)).size === l.length, l.every((i) => i.secid && i.ticker && i.name && i.source)], [true, true, true]);
}
eq("static: sizes", [staticPopular("stock").length, staticPopular("bond").length, staticPopular("fund").length, staticPopular("future").length, staticPopular("currency").length], [15, 12, 12, 55, 12]);
const sfut = staticPopular("future");
const sru = sfut.filter((i) => i.source === "moex");
eq("static futures: the Russian rows are auto rows without a contract count, the US table follows its classes", [sru.every((i) => i.auto && i.group === "future" && i.contracts === undefined), sfut.filter((i) => i.source === "fmp").length], [true, 40]);
eq("static futures: same Russian underlyings as the live priority list", sru.map((i) => i.asset).sort(), [...FUTURES_PRIORITY].sort());
eq("static funds start with the priority list", staticPopular("fund").map((i) => i.secid), FUND_PRIORITY);
eq("static bonds are OFZ ids with readable tickers", staticPopular("bond").slice(0, 2).map((i) => [i.secid, i.ticker, i.unit]), [["SU26254RMFS1", "ОФЗ 26254", "%"], ["SU26238RMFS4", "ОФЗ 26238", "%"]]);

// ── «Все» mix ──
const mix = staticPopular("all");
eq("all: the mix size is the sum of the per-group counts", mix.length, ALL_MIX.reduce((a, [, n]) => a + n, 0));
eq("all: groups appear in chip order", [...new Set(mix.map((i) => i.group))], ALL_MIX.map(([g]) => g));
eq("all: per group counts", ALL_MIX.map(([g]) => mix.filter((i) => i.group === g).length), ALL_MIX.map(([, n]) => n));
eq("all: duplicates across groups are dropped", mixAll(() => [staticPopular("stock")[0]]).length, 1);
eq("all: a group with fewer rows than asked just gives what it has", mixAll((g) => (g === "stock" ? staticPopular("stock").slice(0, 2) : [])).length, 2);

console.log(fails ? `\n${fails} FAILED` : "\nall ok");
process.exit(fails ? 1 : 0);
