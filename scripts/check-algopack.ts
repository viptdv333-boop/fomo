/* Live smoke test of the MOEX ALGOPACK integration: one real call per endpoint the terminal uses, PASS / FAIL / WARN per line.
   The key is read from the environment (ALGOPACK_KEY), never printed; neither are responses — only row counts, field presence
   and timings.

   Run on the server (where the key is configured):
     cd /opt/fomo && set -a && . ./.env && set +a && npx tsx scripts/check-algopack.ts
   or let the script read the ALGOPACK_* lines of an env file itself:
     npx tsx scripts/check-algopack.ts --env /opt/fomo/.env
   Options: --secid SBER   --fut MIX   (instrument for shares / futures; the futures id may be a generic ticker -> front contract)
   Exit code: 0 all PASS (WARN allowed), 1 at least one FAIL, 2 no key.

   WARN means "the call worked but the answer is empty / looks stale" — typical outside trading hours, or a product the
   subscription does not include yet. FAIL means the call itself failed or the response is not in the documented shape. */
import { readFileSync } from "node:fs";
import { algopackBase, algopackEnabled, apGet, tableRows } from "../src/lib/algopack";
import { mskDateOf, parseBook, wallMs } from "../src/lib/algopack-parse";
import { dsMarket, loadAlerts, loadFutoi, loadHi2, loadSuperCandles } from "../src/lib/algopack-data";
import { issSecurityPath, resolveMoex, type MoexSecurity } from "../src/lib/moex-resolve";
import { algopackPolicy } from "../src/lib/algopack-policy";

const args = process.argv.slice(2);
const arg = (name: string, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

/* optional env file: only the ALGOPACK_* lines are taken (the rest of the file is not even kept in memory) */
const envFile = arg("env");
if (envFile) {
  try {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*(ALGOPACK_[A-Z_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    console.log(`cannot read ${envFile}`);
  }
}

let fails = 0;
let warns = 0;
let passes = 0;
function line(kind: "PASS" | "FAIL" | "WARN" | "INFO", name: string, note = "") {
  if (kind === "FAIL") fails++;
  else if (kind === "WARN") warns++;
  else if (kind === "PASS") passes++;
  console.log(`${kind.padEnd(4)}  ${name.padEnd(34)} ${note}`);
}
async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = Date.now();
  const r = await fn();
  return [r, Date.now() - t0];
}
const todayMsk = () => mskDateOf(Date.now());
const daysAgo = (n: number) => mskDateOf(Date.now() - n * 86_400_000);
const mskNowWall = () => Date.now() + 3 * 3_600_000;

async function main() {
  if (!algopackEnabled()) {
    console.log("ALGOPACK_KEY is not set in the environment: nothing to test (no network call was made).");
    process.exit(2);
  }
  console.log(`ALGOPACK smoke test  gateway=${algopackBase()}  ${new Date().toISOString()}  (key present, not shown)\n`);

  /* policy sanity (pure) */
  const admin = algopackPolicy({ role: "ADMIN" });
  const anon = algopackPolicy(null);
  if (admin.allowed && !anon.allowed === !(process.env.ALGOPACK_PUBLIC === "1" || process.env.ALGOPACK_PUBLIC === "true")) line("PASS", "access policy", `admin: allowed, anonymous: ${anon.allowed ? "allowed (ALGOPACK_PUBLIC=1)" : "denied"}`);
  else line("FAIL", "access policy", `admin=${admin.allowed} anonymous=${anon.allowed}`);

  const shareId = arg("secid", "SBER");
  const futId = arg("fut", "MIX");
  const share = await resolveMoex(shareId);
  const fut = await resolveMoex(futId);
  if (!share) line("FAIL", `resolve ${shareId}`, "public ISS did not resolve the instrument");
  if (!fut) line("WARN", `resolve ${futId}`, "futures not resolved: futures checks skipped");

  const probe = async (name: string, sec: MoexSecurity, what: "candles" | "trades" | "orderbook") => {
    const path = `${issSecurityPath(sec)}/${what}.json`;
    const q: Record<string, string> =
      what === "candles" ? { interval: "1", from: daysAgo(4), "iss.reverse": "true", "iss.meta": "off" } : what === "trades" ? { reversed: "1", limit: "200", "iss.meta": "off", "iss.only": "trades" } : { "iss.meta": "off", "iss.only": "orderbook" };
    const [r, ms] = await timed(() => apGet(path, q, { family: `smoke-${what}`, timeoutMs: 20_000, quoteBigInts: what === "trades" }));
    if (!r.ok) return line("FAIL", name, `${r.reason} (${ms} ms) — check the key, the plan and the gateway host`);
    const rows = tableRows(r.data, what);
    if (what === "candles") {
      if (!rows.length) return line("WARN", name, `no candles in the last 4 days (${ms} ms)`);
      const need = ["open", "close", "high", "low", "volume", "begin"].every((k) => k in rows[0]);
      if (!need) return line("FAIL", name, "candle columns differ from the documented ones");
      const begin = wallMs(String(rows[0].begin).slice(0, 10), String(rows[0].begin).slice(11));
      const lagMin = Math.round((mskNowWall() - begin) / 60_000);
      return line("PASS", name, `${rows.length} bars, newest begins ${lagMin} min before now (Moscow clock; 1-2 min = online, ~15+ = delayed, hours = market closed) (${ms} ms)`);
    }
    if (what === "trades") {
      if (!rows.length) return line("WARN", name, `no trades (market closed?) (${ms} ms)`);
      const need = ["tradeno", "tradetime", "price", "quantity", "buysell"].every((k) => k in rows[0]);
      const sides = new Set(rows.map((x) => x.buysell));
      if (!need) return line("FAIL", name, "trade columns differ from the documented ones");
      const t = wallMs(String(rows[0].tradedate ?? todayMsk()), String(rows[0].tradetime));
      const lagMin = Math.round((mskNowWall() - t) / 60_000);
      return line("PASS", name, `${rows.length} trades, aggressor sides ${[...sides].join("/")}, newest ${lagMin} min before now (${ms} ms)`);
    }
    const b = parseBook(r.data);
    if (!b.bids.length && !b.asks.length) return line("WARN", name, `empty book (market closed?) (${ms} ms)`);
    return line(b.bids.length && b.asks.length ? "PASS" : "WARN", name, `${b.bids.length} bids / ${b.asks.length} asks${b.upd ? `, updated ${b.upd}` : ""} (${ms} ms)`);
  };

  if (share) {
    await probe(`candles ${share.secid} (1m)`, share, "candles");
    await probe(`trades ${share.secid} (online)`, share, "trades");
    await probe(`orderbook ${share.secid}`, share, "orderbook");
  }
  if (fut) {
    await probe(`candles ${fut.secid} (1m)`, fut, "candles");
    await probe(`trades ${fut.secid} (online)`, fut, "trades");
    await probe(`orderbook ${fut.secid}`, fut, "orderbook");
  }

  /* trades of PAST days — not documented in the product notes: exploratory, never FAIL */
  if (share) {
    const day = daysAgo(1);
    for (const [label, path, q] of [
      ["trades?date= (current-session route)", `${issSecurityPath(share)}/trades.json`, { date: day, limit: "5", "iss.meta": "off" }],
      ["history/.../trades.json", `/iss/history/engines/${share.engine}/markets/${share.market}/securities/${share.secid}/trades.json`, { date: day, limit: "5", "iss.meta": "off" }],
    ] as const) {
      const r = await apGet(path, q as Record<string, string>, { family: "smoke-trades-history", timeoutMs: 15_000 });
      const rows = r.ok ? tableRows(r.data, "trades") : [];
      const past = rows.some((x) => String(x.tradedate ?? "").slice(0, 10) === day);
      line("INFO", `past-day trades: ${label}`, r.ok ? (past ? `answered with rows of ${day} (the footprint could use this!)` : rows.length ? "answered, but with the current session's rows (the date is ignored)" : "answered, empty") : r.reason);
    }
  }

  /* SuperCandles */
  const sc = async (name: string, sec: MoexSecurity | null) => {
    const market = dsMarket(sec);
    if (!sec || !market) return;
    const [r, ms] = await timed(() => loadSuperCandles(sec.secid, market, daysAgo(4), ["ts", "os", "ob"]));
    for (const set of ["ts", "os", "ob"] as const) {
      const label = `${name} ${set === "ts" ? "tradestats" : set === "os" ? "orderstats" : "obstats"}`;
      const reason = r.reasons[set];
      const tb = r[set];
      if (!tb || reason !== "ok") {
        line(reason === "empty" ? "WARN" : "FAIL", label, `${reason ?? "missing"} (${ms} ms)`);
        continue;
      }
      const must = set === "ts" ? ["vol_b", "vol_s", "trades"] : set === "os" ? ["put_vol", "cancel_vol"] : ["spread_bbo", "imb_vol"];
      const have = must.filter((c) => tb.rows.some((row) => row[tb.cols.indexOf(c)] !== null));
      if (have.length < must.length) line("WARN", label, `${tb.rows.length} bars but fields without values: ${must.filter((c) => !have.includes(c)).join(",")} (fields may be named differently for this market)`);
      else line("PASS", label, `${tb.rows.length} bars, stamp=${r.basis ?? "?"}, newest begins ${Math.round((mskNowWall() - (tb.rows[tb.rows.length - 1][0] as number)) / 60_000)} min ago (${ms} ms)`);
    }
  };
  await sc(`supercandles ${shareId}`, share);
  await sc(`supercandles ${fut?.secid ?? futId}`, fut);

  /* FUTOI */
  if (fut && fut.engine === "futures") {
    const [r, ms] = await timed(() => loadFutoi(fut, daysAgo(4)));
    if (!r.ok) line(r.reason === "empty" ? "WARN" : "FAIL", `futoi ${fut.secid}`, `${r.reason} (${ms} ms)`);
    else {
      const last = r.tbl!.rows[r.tbl!.rows.length - 1];
      const c = r.tbl!.cols;
      line("PASS", `futoi ${fut.secid} (ticker ${r.ticker})`, `${r.tbl!.rows.length} snapshots, FIZ net ${last[c.indexOf("fiz_pos")]}, YUR net ${last[c.indexOf("yur_pos")]} (${ms} ms)`);
    }
  }

  /* Mega Alerts */
  for (const [label, sec] of [[shareId, share], [fut?.secid ?? futId, fut]] as const) {
    const market = dsMarket(sec);
    if (!sec || !market || market === "fx") continue;
    const [r, ms] = await timed(() => loadAlerts(sec.secid, market, daysAgo(10), false));
    if (!r.ok) line("FAIL", `alerts ${label}`, `${r.reason} (${ms} ms)`);
    else if (!r.alerts!.length) line("WARN", `alerts ${label}`, `no alerts in 10 days (${ms} ms)`);
    else line("PASS", `alerts ${label}`, `${r.alerts!.length} alerts, types: ${[...new Set(r.alerts!.map((a) => a.type))].slice(0, 4).join(", ")} (${ms} ms)`);
  }

  /* HI2 */
  for (const [label, sec] of [[shareId, share], [fut?.secid ?? futId, fut]] as const) {
    const market = dsMarket(sec);
    if (!sec || !market) continue;
    const [r, ms] = await timed(() => loadHi2(sec.secid, market, daysAgo(14)));
    if (!r.ok) line("FAIL", `hi2 ${label}`, `${r.reason} (${ms} ms)`);
    else if (!r.hi2!.rows.length) line("WARN", `hi2 ${label}`, `no rows in 14 days (${ms} ms)`);
    else line("PASS", `hi2 ${label}`, `${r.hi2!.rows.length} values, metrics: ${r.hi2!.metrics.join(",")} (${ms} ms)`);
  }

  console.log(`\n${passes} PASS, ${warns} WARN, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}

main().catch((e) => {
  // never print anything that could carry the key: the message of our own client errors does not, but stay conservative
  console.log(`FAIL  smoke test crashed: ${(e as Error)?.name ?? "error"}`);
  process.exit(1);
});

