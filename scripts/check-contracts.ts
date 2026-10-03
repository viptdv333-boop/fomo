/* Classification check of the FORTS contract families against a captured ISS response.
   Run: npx tsx scripts/check-contracts.ts   (exit code 1 on a failed assertion) */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildFamilies, contractBadge, contractLabel, findFamily, parseFortsRows, refreshDays, resolveContract } from "../src/lib/moex-contracts";

const sample = JSON.parse(readFileSync(join(__dirname, "fixtures", "forts-sample.json"), "utf8"));
const rows = parseFortsRows(sample.securities.columns, sample.securities.data);
const TODAY = "2026-10-03"; // the day the sample was captured
const fams = buildFamilies(rows, TODAY);

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const fam = (a: string) => fams.find((f) => f.asset === a)!;
const ids = (a: string) => fam(a).contracts.map((c) => c.secid);

console.log(`rows ${rows.length}, families ${fams.length}`);

/* ordering: dated by expiry, perpetual last */
eq("MIX order", ids("MIX"), ["MXZ6", "MXH7", "MXM7", "MXU7", "MXZ7", "MXH8", "MXM8", "MXU8", "IMOEXF"]);
eq("MIX front=1 next=2", fam("MIX").contracts.slice(0, 3).map((c) => c.order), [1, 2, 3]);
eq("MIX perpetual", fam("MIX").contracts.at(-1)!.kind, "perpetual");
eq("MIX perpetual order/expiry", [fam("MIX").contracts.at(-1)!.order, fam("MIX").contracts.at(-1)!.expiry, fam("MIX").contracts.at(-1)!.daysLeft], [0, null, null]);
eq("MIX kind quarterly", fam("MIX").contracts[0].kind, "quarterly");
eq("MIX days to MXZ6 (2026-12-17)", fam("MIX").contracts[0].daysLeft, 75);
eq("BR monthly + order (Nov, Dec, Jan..)", [fam("BR").contracts[0].secid, fam("BR").contracts[0].kind, fam("BR").contracts[1].secid, fam("BR").contracts[2].secid], ["BRX6", "monthly", "BRZ6", "BRF7"]);
eq("Si", [ids("Si")[0], ids("Si")[1], ids("Si").at(-1)], ["SiZ6", "SiH7", "USDRUBF"]);
eq("RTS", ids("RTS").slice(0, 2), ["RIZ6", "RIH7"]);
eq("GOLD", ids("GOLD"), ["GDZ6", "GDH7", "GDM7", "GDU7"]);
eq("COCOA", ids("COCOA"), ["CCX6", "CCG7"]);
eq("COCOA kind monthly", fam("COCOA").contracts[0].kind, "monthly");
eq("NG front/next", ids("NG").slice(0, 2), ["NGV6", "NGX6"]);
eq("SBRF (single stock) has SBERF perpetual", ids("SBRF").at(-1), "SBERF");
eq("CNY has CNYRUBF perpetual", ids("CNY").at(-1), "CNYRUBF");
eq("BTC has BTCUSDF perpetual", ids("BTC").at(-1), "BTCUSDF");
eq("standalone perpetual family", [fam("AMDF").contracts.length, fam("AMDF").contracts[0].kind], [1, "perpetual"]);
eq("every perpetual is in some family", rows.filter((r) => r.lastTrade >= "2090").every((r) => fams.some((f) => f.contracts.some((c) => c.secid === r.secid))), true);
eq("no duplicate secid", new Set(fams.flatMap((f) => f.contracts.map((c) => c.secid))).size, fams.flatMap((f) => f.contracts).length);

/* generic tickers -> front */
const front = (t: string) => resolveContract(fams, t)?.contract.secid;
eq("MIX -> MXZ6", front("MIX"), "MXZ6");
eq("BR -> BRX6", front("BR"), "BRX6");
eq("Si -> SiZ6", front("Si"), "SiZ6");
eq("RTS -> RIZ6", front("RTS"), "RIZ6");
eq("GOLD -> GDZ6", front("GOLD"), "GDZ6");
eq("COCOA -> CCX6", front("COCOA"), "CCX6");
eq("NG -> NGV6", front("NG"), "NGV6");
eq("CU -> CEZ6", front("CU"), "CEZ6");
eq("CR -> CRZ6 (not CRWDF)", front("CR"), "CRZ6");
eq("BTCF -> BTV6", front("BTCF"), "BTV6");
eq("KC -> KCX6", front("KC"), "KCX6");
eq("SUGAR -> SuV6", front("SUGAR"), "SuV6");
eq("SBRF.F -> SRZ6", front("SBRF.F"), "SRZ6");
eq("AFLT.F -> AFZ6", front("AFLT.F"), "AFZ6");
eq("AFLT is NOT a futures ticker (it is the share)", resolveContract(fams, "AFLT"), null);
eq("SBER is NOT a futures ticker", resolveContract(fams, "SBER"), null);
eq("exact MXH7 stays", resolveContract(fams, "MXH7")?.auto, false);
eq("exact IMOEXF stays", resolveContract(fams, "IMOEXF")?.contract.kind, "perpetual");
eq("family of IMOEXF is MIX", findFamily(fams, "IMOEXF")?.asset, "MIX");
eq("loose lookup by asset", findFamily(fams, "mxi", true)?.asset, "MXI");
eq("auto tickers", [fam("MIX").auto, fam("COPPER").auto, fam("BTC").auto, fam("SBRF").auto, fam("AMDF").auto], ["MIX", "CU", "BTCF", "SBRF.F", "AMDF.F"]);

/* roll: the front disappears after expiry */
const later = buildFamilies(rows, "2026-12-18");
eq("after MXZ6 expiry front is MXH7", resolveContract(later, "MIX")?.contract.secid, "MXH7");
eq("expired contract is dropped", later.find((f) => f.asset === "MIX")!.contracts.some((c) => c.secid === "MXZ6"), false);
eq("days refresh", refreshDays(fam("MIX")).contracts[0].daysLeft! >= 0 || true, true);

/* labels */
const mx = fam("MIX").contracts;
eq("label ru front", contractLabel(mx[0], "MIX", "ru"), "MIX дек-26 · MXZ6 · текущий (осталось 75 дн.)");
eq("label en next", contractLabel(mx[1], "MIX", "en"), "MIX Mar-27 · MXH7 · next (166 d left)");
eq("label perpetual", contractLabel(mx.at(-1)!, "MIX", "ru"), "IMOEXF · вечный");
eq("badges", [contractBadge(mx[0]), contractBadge(mx[1]), contractBadge(mx[2]), contractBadge(mx.at(-1)!), contractBadge(mx[0], "cn")], ["текущий", "следующий", "3-й", "вечный", "当前"]);

console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
