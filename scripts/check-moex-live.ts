/* Live check (needs internet to iss.moex.com): resolver, ISS quote fallback, search, contracts loader.
   Run: npx tsx scripts/check-moex-live.ts */
import { getFortsFamilies, resolveFuturesTicker } from "../src/lib/moex-contracts";
import { issQuote, resolveMoex } from "../src/lib/moex-resolve";
import { lookupMarket, searchMarketPage } from "../src/lib/moex-search";

let fails = 0;
function ok(name: string, cond: boolean, extra?: unknown) {
  if (!cond) fails++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${extra !== undefined ? "  " + JSON.stringify(extra) : ""}`);
}

(async () => {
  const fams = await getFortsFamilies();
  ok("FORTS families loaded", fams.length > 100, fams.length);

  for (const t of ["MIX", "BR", "Si", "RTS", "GOLD", "COCOA", "NG", "SBRF.F", "MXZ6", "IMOEXF", "USDRUBF"]) {
    const r = await resolveFuturesTicker(t);
    ok(`futures ${t}`, !!r, r);
  }

  const cash: [string, string, string][] = [
    ["SBER", "TQBR", "stock"],
    ["SU26238RMFS4", "TQOB", "bond"],
    ["RU000A10DS74", "TQCB", "bond"],
    ["SBMX", "TQBR", "stock"],
    ["USD000UTSTOM", "CETS", "currency"],
    ["IMOEXF", "RFUD", "future"],
  ];
  for (const [id, board, group] of cash) {
    const s = await resolveMoex(id);
    ok(`resolve ${id}`, !!s && s.board === board && s.group === group, s && { secid: s.secid, board: s.board, group: s.group, unit: s.unit, cls: s.classCode });
  }
  const nope = await resolveMoex("NOSUCHSEC1");
  ok("unknown id -> null", nope === null);

  for (const id of ["SBER", "SU26238RMFS4", "IMOEXF", "MIX", "USD000UTSTOM", "IMOEX", "RTSI", "RGBI"]) {
    const s = await resolveMoex(id);
    const q = s && (await issQuote(s));
    ok(`iss quote ${id}`, !!q && q.price > 0, q && { p: q.price, ch: +q.change.toFixed(4), pct: +q.changePercent.toFixed(2) });
  }

  for (const [q, group] of [["сбер", "stock"], ["26238", "bond"], ["TMOS", "fund"], ["USD", "currency"], ["MIX", "future"], ["MOEXBC", "index"], ["нефть", "future"], ["MXZ6", "all"], ["IMOEXF", "all"], ["SBER", "all"], ["золото", "all"]] as const) {
    const r = (await searchMarketPage(q, group, { limit: 12 })).items;
    ok(`search "${q}" [${group}]`, r.length > 0 || q === "золото", r.slice(0, 5).map((i) => `${i.group}:${i.secid}${i.contracts ? "×" + i.contracts : ""}`));
  }
  const l = await lookupMarket("SU26238RMFS4");
  ok("lookup bond", l?.group === "bond" && l.unit === "%", l && { t: l.ticker, n: l.name });
  const l2 = await lookupMarket("MXH7");
  ok("lookup contract", l2?.group === "future" && l2.order === 2, l2 && { o: l2.order, k: l2.kind });
  console.log(fails ? `\n${fails} FAILED` : "\nall passed");
  process.exit(fails ? 1 : 0);
})();
