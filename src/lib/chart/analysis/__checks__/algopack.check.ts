/* ALGOPACK server side (src/lib/algopack*.ts) against fixtures in the documented response shapes (scripts/fixtures/algopack).
   No network and no key: fetch is mocked; the key used here is a dummy that must never show up in any result.
   Run (the result must not depend on the server zone, so try several):
     TZ=UTC npx tsx src/lib/chart/analysis/__checks__/algopack.check.ts
     TZ=Europe/Moscow npx tsx ...   TZ=America/New_York npx tsx ... */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  algopackBase,
  algopackEnabled,
  apBlocked,
  apGet,
  apRows,
  algopackReset,
  algopackState,
  familyOf,
  publicToApim,
  tableRows,
} from "../../../algopack";
import {
  alertDirection,
  attachAlertPrices,
  barStampShift,
  futoiCandidates,
  hi2Band,
  normAlerts,
  normFutoi,
  normHi2,
  normObstats,
  normOrderstats,
  normTradestats,
  parseBook,
  parseReference,
  wallMs,
} from "../../../algopack-parse";
import { algopackPolicy } from "../../../algopack-policy";
import { buildLadder } from "../../../orderbook-math";
import { clampFrom, dsMarket } from "../../../algopack-data";
import { getIssJson, labelTail, type Feed } from "../../../algopack-feed";
import type { TailResult } from "../../../tinkoff-candles";

let failures = 0;
let checks = 0;
function ok(cond: unknown, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function eq<T>(a: T, b: T, msg: string) {
  ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);
}
function section(name: string) {
  console.log(`\n== ${name}`);
}
const fx = (n: string) => JSON.parse(readFileSync(join(__dirname, "../../../../../scripts/fixtures/algopack", n), "utf8"));
const KEY = "dummy-key-for-the-check-0000";
const MIN = 60_000;

/* ── mocked fetch ── */
type Handler = (url: string, init: any) => { status?: number; body?: unknown; text?: string; headers?: Record<string, string> } | Promise<any>;
let handler: Handler = () => ({ status: 404 });
const calls: { url: string; auth: string | null }[] = [];
(globalThis as any).fetch = async (url: string, init: any) => {
  calls.push({ url, auth: init?.headers?.Authorization ?? null });
  const r: any = await handler(url, init);
  const status = r.status ?? 200;
  const text = r.text ?? JSON.stringify(r.body ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
};

async function main() {
  /* ───────── time basis ───────── */
  section("wall clock -> wall-as-UTC (independent of the server zone)");
  eq(wallMs("2026-10-02", "10:05:00"), Date.UTC(2026, 9, 2, 10, 5, 0), "date + time");
  eq(wallMs("2026-10-02", "2026-10-02 10:05:07"), Date.UTC(2026, 9, 2, 10, 5, 7), "full datetime in the time field");
  eq(wallMs("2026-10-02 10:05:07"), Date.UTC(2026, 9, 2, 10, 5, 7), "systime alone");
  eq(wallMs("2026-10-02"), Date.UTC(2026, 9, 2), "date only");
  ok(Number.isNaN(wallMs("nope", "10:00:00")), "garbage date -> NaN");
  ok(Number.isNaN(wallMs("2026-10-02", "xx")), "garbage time -> NaN");

  section("SuperCandles: bar stamp (begin vs end) detected from systime");
  const tsRaw = fx("tradestats-eq.json");
  const tsRows = tableRows(tsRaw, "data");
  eq(barStampShift(tsRows).basis, "begin", "systime ~5 min after tradetime -> tradetime is the bar start");
  const ts = normTradestats(tsRaw);
  eq(ts.tbl.rows.length, 12, "12 bars");
  eq(ts.tbl.rows[0][0], Date.UTC(2026, 9, 2, 10, 0), "first bar begins 10:00");
  eq(ts.tbl.rows[1][0]! - ts.tbl.rows[0][0]!, 5 * MIN, "5 minute step");
  eq(ts.tbl.cols.slice(0, 3), ["w", "pr_open", "pr_high"], "columns");
  const iVolB = ts.tbl.cols.indexOf("vol_b");
  const iVol = ts.tbl.cols.indexOf("vol");
  const iVolS = ts.tbl.cols.indexOf("vol_s");
  ok(ts.tbl.rows.every((r) => r[iVolB]! + r[iVolS]! === r[iVol]!), "vol = vol_b + vol_s");
  // the same data with END stamps (tradetime + 5 min, systime untouched)
  const endRaw = JSON.parse(JSON.stringify(tsRaw));
  const iT = endRaw.data.columns.indexOf("tradetime");
  endRaw.data.data.forEach((r: any[]) => {
    const [h, m] = r[iT].split(":").map(Number);
    const t = h * 60 + m + 5;
    r[iT] = `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}:00`;
  });
  const tsEnd = normTradestats(endRaw);
  eq(tsEnd.basis, "end", "systime a few seconds after tradetime -> tradetime is the bar end");
  eq(tsEnd.tbl.rows.map((r) => r[0]), ts.tbl.rows.map((r) => r[0]), "end-stamped feed lands on the same bar starts");
  // a re-published bar replaces the earlier one
  const dup = JSON.parse(JSON.stringify(tsRaw));
  dup.data.data.push([...dup.data.data[3]]);
  dup.data.data[dup.data.data.length - 1][dup.data.columns.indexOf("vol")] = 777;
  const tsDup = normTradestats(dup);
  eq(tsDup.tbl.rows.length, 12, "duplicate bar collapsed");
  eq(tsDup.tbl.rows[3][iVol], 777, "later publication wins");
  eq(normTradestats({}).tbl.rows.length, 0, "empty payload -> no rows");
  eq(normTradestats({ data: { columns: ["tradedate", "tradetime"], data: [["x", "y"]] } }).tbl.rows.length, 0, "malformed rows dropped");
  eq(barStampShift([]).basis, "assumed-begin", "no systime -> assume the bar start");

  section("OrderStats / OBStats (EQ and FO)");
  const os = normOrderstats(fx("orderstats-eq.json"));
  eq(os.tbl.rows.length, 12, "orderstats rows");
  ok(os.tbl.rows.every((r) => (r[os.tbl.cols.indexOf("cancel_vol")] ?? 0) > 0), "cancel_vol read");
  const obEq = normObstats(fx("obstats-eq.json"));
  eq(obEq.tbl.rows.length, 12, "obstats EQ rows");
  const iImb = obEq.tbl.cols.indexOf("imb_vol");
  ok(obEq.tbl.rows.every((r) => r[iImb] !== null && Math.abs(r[iImb]!) <= 1), "EQ imbalance_vol within -1..1");
  ok(obEq.tbl.rows.every((r) => r[obEq.tbl.cols.indexOf("spread_bbo")]! > 0), "EQ spread_bbo");
  const obFo = normObstats(fx("obstats-fo.json"));
  const c = obFo.tbl.cols;
  const r0 = obFo.tbl.rows[0];
  eq(r0[c.indexOf("spread_bbo")], 1, "FO spread_bbo <- spread_l1");
  eq(r0[c.indexOf("spread_deep")], 6, "FO spread_deep <- spread_l10");
  eq(r0[c.indexOf("spread_big")], 14, "FO spread_big <- spread_l20");
  ok(Math.abs((r0[c.indexOf("imb_vol_bbo")] as number) - (100 - 60) / 160) < 1e-9, "FO bbo imbalance from vol_b_l1 / vol_s_l1");
  ok(Math.abs((r0[c.indexOf("imb_vol")] as number) - (1200 - 900) / 2100) < 1e-9, "FO full imbalance from the deepest level (l20)");
  eq(r0[c.indexOf("vol_b")], 1200, "FO vol_b <- deepest cumulative level");

  section("FUTOI");
  const fu = normFutoi(fx("futoi.json"));
  eq(fu.rows.length, 8, "one row per 5-min snapshot (FIZ and YUR pivoted)");
  const fc = fu.cols;
  eq(fu.rows[0][0], Date.UTC(2026, 9, 2, 10, 0), "snapshot time");
  ok(fu.rows.every((r) => (r[fc.indexOf("fiz_short")] as number) > 0 && (r[fc.indexOf("yur_short")] as number) > 0), "negative raw pos_short -> positive gross short");
  eq(fu.rows[0][fc.indexOf("fiz_pos")], -5010, "net position of FIZ as sent");
  eq(fu.rows[0][fc.indexOf("yur_long")], 160020, "YUR gross long");
  eq(fu.rows[0][fc.indexOf("fiz_ln")], 3100, "participants long");
  eq(normFutoi({ futoi: { columns: ["tradedate", "tradetime", "clgroup", "pos_long", "pos_short"], data: [["2026-10-02", "10:00:00", "FIZ", 10, -4]] } }).rows[0][fc.indexOf("fiz_pos")], 6, "net derived when `pos` is absent");
  eq(futoiCandidates("SiZ6", "Si"), ["Si", "SiZ6"], "SiZ6 -> Si, then the contract id");
  eq(futoiCandidates("RIH7", "RTS"), ["RI", "RTS", "RIH7"], "RIH7 -> RI, then the asset code");
  eq(futoiCandidates("MXZ6", "MIX").slice(0, 2), ["MX", "MIX"], "MXZ6 -> MX");
  eq(futoiCandidates("IMOEXF", "MIX"), ["MIX", "IMOEXF", "IM"], "perpetual: asset code first");

  section("Mega Alerts");
  for (const [t, d] of [
    ["vol_b_99_9_pctl", 1], ["vol_s_99_9_pctl", -1], ["vol_99_9_pctl", 0], ["vol_b_max", 1], ["vol_s_max", -1], ["vol_max", 0],
    ["net_vol_99_9_pctl+", 1], ["net_vol_99_9_pctl-", -1], ["net_vol_max", 1], ["net_vol_min", -1],
    ["pr_change_99_9_pctl+", 1], ["pr_change_99_9_pctl-", -1], ["pr_change_max", 1], ["pr_change_min", -1], ["pr_high_max", 1], ["pr_low_min", -1],
  ] as const) eq(alertDirection(t), d, `direction of ${t}`);
  const refSample = fx("alerts.json").data.data[0][6];
  const ref = parseReference(refSample)!;
  eq(ref.m5, [0.086, -0.078, 25, 18, 0.017], "reference m_5 parsed to numbers");
  eq(ref.h1?.length, 5, "reference h_1");
  eq(parseReference("not json"), undefined, "bad reference -> undefined");
  eq(parseReference(null), undefined, "null reference");
  const al = normAlerts(fx("alerts.json"));
  eq(al.length, 5, "alerts");
  eq(al.map((a) => a.dir), [1, -1, 0, 1, -1], "directions in order");
  eq(al[0].w, Date.UTC(2026, 9, 2, 10, 7), "alert time");
  eq(al[4].thr, null, "missing threshold -> null");
  attachAlertPrices(al, ts.tbl);
  // 10:07 falls into the 10:05 bar; 10:22 into 10:20; 10:31 is past the last bar (10:55 end is the 12th bar start 10:55 -> inside)
  const closeAt = (hhmm: string) => ts.tbl.rows.find((r) => r[0] === wallMs("2026-10-02", `${hhmm}:00`))![ts.tbl.cols.indexOf("pr_close")];
  eq(al[0].price, closeAt("10:05"), "price of the 10:05 bar for the 10:07 alert");
  eq(al[1].price, closeAt("10:20"), "price of the 10:20 bar for the 10:22 alert");
  eq(al[2].price, closeAt("10:30"), "price of the 10:30 bar");
  const late = [{ w: Date.UTC(2026, 9, 2, 18, 0), type: "x", dir: 0 as const, thr: null, val: null }];
  attachAlertPrices(late, ts.tbl);
  eq((late[0] as any).price, undefined, "no bar within 5 min -> no price");

  section("HI2");
  const h = normHi2(fx("hi2.json"));
  eq(h.metrics, ["hhi_volume", "hhi_buy", "hhi_sell", "hhi_aggressive"], "metrics in order of appearance");
  eq(h.rows.length, 12, "3 days x 4 metrics");
  eq(h.rows[0][0], Date.UTC(2026, 8, 30), "day start");
  eq([hi2Band(1000), hi2Band(1500), hi2Band(2500), hi2Band(2501)], ["low", "moderate", "moderate", "high"], "interpretation bands");

  section("order book");
  const book = parseBook(fx("orderbook.json"));
  eq(book.bids.length, 12, "12 bids");
  eq(book.bids[0].p, 250, "best bid first");
  eq(book.asks[0].p, 250.01, "best ask first");
  ok(book.bids.every((b, i, a) => i === 0 || b.p < a[i - 1].p), "bids descending");
  ok(book.asks.every((b, i, a) => i === 0 || b.p > a[i - 1].p), "asks ascending");
  eq(book.upd, "12:41:23", "update time");
  const lad = buildLadder(book.bids, book.asks, 5);
  eq([lad.bids.length, lad.asks.length], [5, 5], "best 5 levels");
  eq(lad.bestBid, 250, "best bid");
  eq(lad.bestAsk, 250.01, "best ask");
  ok(Math.abs(lad.spread! - 0.01) < 1e-9, "spread");
  ok(Math.abs(lad.mid! - 250.005) < 1e-9, "mid");
  ok(Math.abs(lad.spreadPct! - (0.01 / 250.005) * 100) < 1e-9, "spread %");
  eq(lad.sumBid, 1000 + 1150 + 1300 + 1450 + 1600, "sum of the shown bids");
  eq(lad.sumAsk, 800 + 1020 + 1240 + 1460 + 1680, "sum of the shown asks");
  ok(Math.abs(lad.imbalance! - (lad.sumBid - lad.sumAsk) / (lad.sumBid + lad.sumAsk)) < 1e-12, "imbalance");
  eq(lad.bids[4].cum, lad.sumBid, "cumulative volume ends at the sum");
  const empty = buildLadder([], [], 5);
  eq([empty.mid, empty.imbalance, empty.spread], [null, null, null], "empty book");
  eq(parseBook({ orderbook: { columns: ["BUYSELL", "PRICE", "QUANTITY"], data: [["B", 0, 5], ["S", 10, -1], ["B", 9, 3]] } }).bids.length, 1, "zero price / negative qty rows dropped");

  section("markets and dates");
  eq([dsMarket({ engine: "stock", market: "shares" }), dsMarket({ engine: "futures", market: "forts" }), dsMarket({ engine: "currency", market: "selt" }), dsMarket({ engine: "stock", market: "bonds" })], ["eq", "fo", "fx", null], "ISS market -> datashop market");
  const NOW = Date.UTC(2026, 9, 3, 12, 0);
  eq(clampFrom("2026-10-01", 3, 25, NOW), "2026-10-01", "valid date kept");
  eq(clampFrom("2020-01-01", 3, 25, NOW), "2026-09-08", "too old -> clamped");
  eq(clampFrom("2030-01-01", 3, 25, NOW), "2026-10-03", "future -> today");
  eq(clampFrom("garbage", 3, 25, NOW), "2026-09-30", "bad -> default");
  eq(clampFrom(null, 3, 25, NOW), "2026-09-30", "missing -> default");

  /* ───────── access policy ───────── */
  section("access policy");
  const admin = { role: "ADMIN" };
  const owner = { role: "OWNER" };
  const user = { role: "USER" };
  eq(algopackPolicy(admin, { enabled: true, publicFlag: false }).allowed, true, "admin allowed");
  eq(algopackPolicy(owner, { enabled: true, publicFlag: false }).allowed, true, "owner allowed");
  eq(algopackPolicy(user, { enabled: true, publicFlag: false }), { enabled: true, allowed: false, why: "denied" }, "regular user denied");
  eq(algopackPolicy(null, { enabled: true, publicFlag: false }).allowed, false, "anonymous denied");
  eq(algopackPolicy(undefined, { enabled: true, publicFlag: false }).allowed, false, "no session denied");
  eq(algopackPolicy(null, { enabled: true, publicFlag: true }), { enabled: true, allowed: true, why: "public" }, "ALGOPACK_PUBLIC=1 opens it for anonymous");
  eq(algopackPolicy(admin, { enabled: false, publicFlag: true }), { enabled: false, allowed: false, why: "no-key" }, "no key -> nobody, not even admin / public flag");
  eq(algopackPolicy({ role: "admin" }, { enabled: true, publicFlag: false }).allowed, false, "role match is exact");
  delete process.env.ALGOPACK_KEY;
  delete process.env.ALGOPACK_PUBLIC;
  eq(algopackPolicy(admin).allowed, false, "env default: no key -> denied");
  process.env.ALGOPACK_KEY = KEY;
  eq(algopackPolicy(admin).allowed, true, "env default: key + admin -> allowed");
  eq(algopackPolicy(user).allowed, false, "env default: key + user -> denied");
  process.env.ALGOPACK_PUBLIC = "1";
  eq(algopackPolicy(user).allowed, true, "env default: ALGOPACK_PUBLIC=1 -> allowed");
  delete process.env.ALGOPACK_PUBLIC;

  /* ───────── client: no key ───────── */
  section("client without a key behaves like before");
  delete process.env.ALGOPACK_KEY;
  algopackReset();
  calls.length = 0;
  eq(algopackEnabled(), false, "disabled without key");
  const nk = await apGet("/iss/datashop/algopack/eq/tradestats/SBER.json");
  eq([nk.ok, nk.reason, nk.data], [false, "no-key", null], "no key -> soft failure");
  eq(calls.length, 0, "no network call at all without a key");
  const nkf: Feed = { ap: false, apHits: 0, apMiss: 0, apReason: "" };
  handler = () => ({ body: { candles: { data: [[1]] } } });
  const pub = await getIssJson("https://iss.moex.com/iss/x/candles.json", nkf);
  eq(pub, { candles: { data: [[1]] } }, "non-privileged feed reads the public ISS");
  eq(calls.at(-1)!.auth, null, "public request carries no Authorization header");

  /* ───────── client: with a key ───────── */
  process.env.ALGOPACK_KEY = KEY;
  section("client with a key");
  algopackReset();
  calls.length = 0;
  eq(algopackBase(), "https://apim.moex.com/iss", "default base");
  process.env.ALGOPACK_BASE = "https://evil.example.com/iss";
  eq(algopackBase(), "https://apim.moex.com/iss", "a foreign host in ALGOPACK_BASE is ignored (the key must not leave)");
  process.env.ALGOPACK_BASE = "http://localhost:4010/iss";
  eq(algopackBase(), "http://localhost:4010/iss", "a local mock is allowed");
  delete process.env.ALGOPACK_BASE;
  eq(publicToApim("https://iss.moex.com/iss/engines/stock/markets/shares/securities/SBER.json"), "https://apim.moex.com/iss/engines/stock/markets/shares/securities/SBER.json", "public ISS URL -> gateway");
  eq(familyOf("https://apim.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/candles.json?x=1"), "candles", "family: candles");
  eq(familyOf("/iss/datashop/algopack/eq/tradestats/SBER.json"), "datashop/algopack/eq/tradestats", "family: datashop product");
  eq(familyOf("/iss/analyticalproducts/futoi/securities/Si.json"), "analyticalproducts/futoi", "family: futoi");

  handler = () => ({ body: { ok: 1 } });
  const a1 = await apGet("/iss/datashop/algopack/eq/tradestats/SBER.json", { from: "2026-10-01" }, { ttlMs: 30_000 });
  eq(a1.ok, true, "ok");
  eq(calls.length, 1, "one request");
  eq(calls[0].auth, `Bearer ${KEY}`, "bearer header sent");
  ok(!calls[0].url.includes(KEY), "the key is not in the URL");
  ok(calls[0].url.startsWith("https://apim.moex.com/iss/datashop/algopack/eq/tradestats/SBER.json?from=2026-10-01"), "URL on the gateway");
  const a2 = await apGet("/iss/datashop/algopack/eq/tradestats/SBER.json", { from: "2026-10-01" }, { ttlMs: 30_000 });
  eq([a2.ok, a2.cached, calls.length], [true, true, 1], "second call is served from the TTL cache");

  // the key never goes to a foreign host
  calls.length = 0;
  const bad = await apGet("https://evil.example.com/iss/x.json");
  eq([bad.ok, bad.reason, calls.length], [false, "bad-host", 0], "foreign host refused before any request");

  // coalescing
  calls.length = 0;
  let resolveSlow: (() => void) | null = null;
  handler = () => new Promise((res) => (resolveSlow = () => res({ body: { slow: 1 } })));
  const p1 = apGet("/iss/datashop/algopack/eq/obstats/GAZP.json");
  const p2 = apGet("/iss/datashop/algopack/eq/obstats/GAZP.json");
  await new Promise((r) => setTimeout(r, 10));
  resolveSlow!();
  const [c1, c2] = await Promise.all([p1, p2]);
  eq([c1.ok, c2.ok, calls.length], [true, true, 1], "identical in-flight requests share one fetch");

  // pagination: start advances by the returned row count
  algopackReset();
  calls.length = 0;
  const page = (n: number) => ({ data: { columns: ["a"], data: Array.from({ length: n }, (_, i) => [i]) } });
  handler = (url) => {
    const m = url.match(/start=(\d+)/);
    const st = m ? +m[1] : 0;
    return { body: st === 0 ? page(3) : st === 3 ? page(2) : page(0) };
  };
  const pr = await apRows("/iss/datashop/algopack/eq/tradestats/SBER.json", { from: "2026-10-01" }, "data");
  eq([pr.ok, pr.rows.length, pr.truncated], [true, 5, false], "all pages read");
  eq(calls.map((c) => c.url.match(/start=(\d+)/)?.[1] ?? "-"), ["-", "3", "5"], "start = rows read so far, until an empty page");
  handler = () => ({ body: page(2) });
  algopackReset();
  const prT = await apRows("/iss/datashop/algopack/eq/tradestats/SBER.json", {}, "data", { maxPages: 3 });
  eq([prT.rows.length, prT.truncated], [6, true], "maxPages stops a runaway feed");

  // 404-ish route mismatch answered as html
  algopackReset();
  handler = () => ({ text: "<html>nope</html>" });
  const hn = await apGet("/iss/datashop/algopack/eq/hi2/SBER.json");
  eq([hn.ok, hn.reason], [false, "non-json"], "html answer -> non-json");

  // 403 entitlement: only that product is cooled down
  algopackReset();
  handler = () => ({ status: 403, text: "Forbidden" });
  const f1 = await apGet("/iss/datashop/algopack/fo/alerts/SiZ6.json");
  eq([f1.ok, f1.reason], [false, "http-403"], "403 reported");
  ok((apBlocked("datashop/algopack/fo/alerts") ?? "").startsWith("cooldown"), "that product is in cool-down");
  eq(apBlocked("candles"), null, "other products are not");
  calls.length = 0;
  const f2 = await apGet("/iss/datashop/algopack/fo/alerts/SiZ6.json");
  ok(f2.reason.startsWith("cooldown"), "cooled down: no new request");
  eq(calls.length, 0, "no request during the cool-down");
  // 403 "Too Many Requests": everything slows down
  algopackReset();
  handler = () => ({ status: 403, text: "Too Many Requests" });
  await apGet("/iss/datashop/algopack/eq/hi2/SBER.json");
  ok((apBlocked("candles") ?? "").startsWith("cooldown"), "network-protection 403 cools everything down");
  // 401: global
  algopackReset();
  handler = () => ({ status: 401 });
  await apGet("/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/orderbook.json");
  ok((apBlocked("trades") ?? "").includes("unauthorized"), "401 -> global cool-down");
  // 429 with Retry-After
  algopackReset();
  handler = () => ({ status: 429, headers: { "retry-after": "7" } });
  await apGet("/iss/datashop/algopack/eq/hi2/SBER.json");
  const st = algopackState();
  ok(st.globalCooldownMs > 5000 && st.globalCooldownMs <= 7000, `429 honours Retry-After (${st.globalCooldownMs} ms)`);
  // 5xx: soft back-off per family
  algopackReset();
  handler = () => ({ status: 502 });
  await apGet("/iss/datashop/algopack/eq/hi2/SBER.json");
  ok((apBlocked("datashop/algopack/eq/hi2") ?? "").startsWith("cooldown"), "5xx -> short back-off of that product");
  eq(apBlocked("candles"), null, "5xx does not stop the others");
  // success clears the ladder
  algopackReset();
  handler = () => ({ body: { ok: 1 } });
  eq((await apGet("/iss/datashop/algopack/eq/hi2/GAZP.json")).ok, true, "healthy again");

  // the key never appears in any reason / state
  const all = JSON.stringify([nk, f1, f2, hn, st, algopackState()]);
  ok(!all.includes(KEY), "the key is nowhere in results or diagnostics");

  /* ───────── candles feed: gateway first, public fallback, labels ───────── */
  section("candles feed (klines)");
  algopackReset();
  calls.length = 0;
  const feed: Feed = { ap: true, apHits: 0, apMiss: 0, apReason: "" };
  handler = (url) => (url.startsWith("https://apim.moex.com/") ? { body: { candles: { data: [[1]] } } } : { status: 500 });
  const g1 = await getIssJson("https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/candles.json?interval=1", feed);
  eq(g1, { candles: { data: [[1]] } }, "privileged feed reads the gateway");
  eq([feed.apHits, feed.apMiss], [1, 0], "counted");
  eq(calls[0].url.startsWith("https://apim.moex.com/iss/engines/stock/"), true, "request went to the gateway");
  eq(calls[0].auth, `Bearer ${KEY}`, "with the bearer header");
  // gateway down -> public ISS for that call
  algopackReset();
  calls.length = 0;
  const feed2: Feed = { ap: true, apHits: 0, apMiss: 0, apReason: "" };
  handler = (url) => (url.startsWith("https://apim.moex.com/") ? { status: 403, text: "no plan" } : { body: { candles: { data: [[2]] } } });
  const g2 = await getIssJson("https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/candles.json?interval=1", feed2);
  eq(g2, { candles: { data: [[2]] } }, "fallback to the public ISS when the gateway refuses");
  eq([feed2.apHits, feed2.apMiss, feed2.apReason], [0, 1, "http-403"], "miss recorded with its reason");
  const pubCall = calls.find((c) => c.url.startsWith("https://iss.moex.com/"))!;
  eq(pubCall.auth, null, "the public fallback request has no Authorization header");
  // a cool-down makes the next call go straight to the public feed
  calls.length = 0;
  await getIssJson("https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities/SBER/candles.json?interval=60", feed2);
  ok(calls.every((c) => c.url.startsWith("https://iss.moex.com/")), "during the cool-down no request goes to the gateway");

  const base: TailResult = { rows: [], tail: "iss", reason: "no-token" };
  eq(labelTail(base, { ap: false, apHits: 0, apMiss: 0, apReason: "" }), base, "public feed: label untouched");
  const lab = labelTail(base, { ap: true, apHits: 2, apMiss: 0, apReason: "" });
  eq([lab.tail, lab.reason], ["algopack", "apim ok; no-token"], "gateway rows, nothing newer -> algopack");
  const lab2 = labelTail({ ...base, reason: "no-new-data" }, { ap: true, apHits: 1, apMiss: 0, apReason: "" });
  eq(lab2.tail, "algopack", "no-new-data with the gateway is still algopack");
  const lab3 = labelTail({ rows: [], tail: "tinkoff", reason: "ok" }, { ap: true, apHits: 1, apMiss: 0, apReason: "" });
  eq([lab3.tail, lab3.reason], ["tinkoff", "apim ok; ok"], "T-Invest still added newer bars -> tinkoff");
  const lab4 = labelTail(base, { ap: true, apHits: 0, apMiss: 1, apReason: "http-403" });
  eq([lab4.tail, lab4.reason], ["iss", "apim http-403; no-token"], "gateway failed -> iss, reason explains");
  const lab5 = labelTail(base, { ap: true, apHits: 1, apMiss: 1, apReason: "timeout" });
  eq(lab5.tail, "iss", "partly fallen back -> not claimed as algopack");

  console.log(`\n${checks} checks, ${failures} failed`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
