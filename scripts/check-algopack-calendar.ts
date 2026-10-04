/* Probes the MOEX ISS / ALGOPACK trading-calendar routes with the Bearer ALGOPACK_KEY and reports, per route: HTTP status / reason,
   the response blocks and columns, the row count and sample rows, and whether the data gives exchange trading days, sessions and
   holidays for equities (stock), futures and FX (currency). The ALGOPACK "Promo" subscription is documented to include a
   machine-readable calendar; the public iss.moex.com answers these routes with an HTML page (verified: /iss/calendars.json ->
   200 text/html), which is why src/lib/calendar/moex.ts derives non-trading days from isdayoff.ru today.
   The key is read from the environment (ALGOPACK_KEY) or an env file, never printed; neither are responses beyond a few sample rows.

   Run on the server (where the key is configured):
     cd /opt/fomo && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/check-algopack-calendar.ts --env /opt/fomo/.env
   Options: --from 2026-10-01 --till 2026-12-31 (window, default today .. +90 days)   --raw (print the first 1500 characters of every body)
   Exit code: 0 something useful answered, 1 every route failed, 2 no key (no network call is made).

   Routes (from the ISS reference, skill moex-iss/references/calendars.md; paths relative to the gateway base https://apim.moex.com/iss):
     /calendars.json                      off_days: tradedate, {currency,futures,stock}_workday, *_trade_session_date, *_reason (H holiday, W weekend / special, N normal, T transferred)
     /calendars/stock.json                stock off-days            /calendars/stock/session.json      session schedule (tradingsession 0 morning, 1 main, 2 evening, 5 special day; time_from / time_till)
     /calendars/futures.json              futures off-days          /calendars/futures/session.json    session schedule     /calendars/futures/securities.json  futures metadata (expiration_date, weekend_session)
     /calendars/currency.json             FX off-days + settlement  /calendars/currency/session.json   session / security data
   If a route answers HTML or 404 even with the key, the entitlement does not include it (or the path changed): see the printed reason. */
import { readFileSync } from "node:fs";
import { algopackBase, algopackEnabled, apGet, tableRows } from "../src/lib/algopack";

const args = process.argv.slice(2);
const arg = (name: string, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

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

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const from = arg("from", iso(Date.now()));
const till = arg("till", iso(Date.now() + 90 * 86_400_000));

const ROUTES: { path: string; q: Record<string, string>; what: string }[] = [
  { path: "/iss/calendars.json", q: { from, till, show_all_days: "1" }, what: "all markets: off days" },
  { path: "/iss/calendars/stock.json", q: { from, till, show_all_days: "1" }, what: "stock: off days" },
  { path: "/iss/calendars/stock/session.json", q: { from, till }, what: "stock: session schedule" },
  { path: "/iss/calendars/futures.json", q: { from, till, show_all_days: "1" }, what: "futures: off days" },
  { path: "/iss/calendars/futures/session.json", q: { from, till }, what: "futures: session schedule" },
  { path: "/iss/calendars/futures/securities.json", q: {}, what: "futures: contracts metadata" },
  { path: "/iss/calendars/currency.json", q: { from, till, show_all_days: "1" }, what: "FX: off days" },
  { path: "/iss/calendars/currency/session.json", q: { from, till }, what: "FX: session schedule" },
];

interface Probe {
  path: string;
  what: string;
  ok: boolean;
  reason: string;
  status: number;
  blocks: Record<string, { cols: string[]; rows: Record<string, unknown>[] }>;
}

function blocksOf(data: unknown): Probe["blocks"] {
  const out: Probe["blocks"] = {};
  if (!data || typeof data !== "object") return out;
  for (const [name, v] of Object.entries(data as Record<string, unknown>)) {
    const b = v as { columns?: unknown; data?: unknown };
    if (b && Array.isArray(b.columns) && Array.isArray(b.data)) out[name] = { cols: b.columns.map(String), rows: tableRows({ [name]: b }, name) };
  }
  return out;
}

async function main() {
  if (!algopackEnabled()) {
    console.log("ALGOPACK_KEY is not set in the environment: nothing to test (no network call was made).");
    console.log("Run it on the server: NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/check-algopack-calendar.ts --env /opt/fomo/.env");
    process.exit(2);
  }
  console.log(`ALGOPACK calendar probe  gateway=${algopackBase()}  window ${from}..${till}  (key present, not shown)\n`);

  const probes: Probe[] = [];
  for (const r of ROUTES) {
    const res = await apGet(r.path, { ...r.q, "iss.meta": "off" }, { family: `calendar-${r.path}`, timeoutMs: 25_000 });
    const blocks = res.ok ? blocksOf(res.data) : {};
    const p: Probe = { path: r.path, what: r.what, ok: res.ok && Object.keys(blocks).length > 0, reason: res.reason, status: res.status, blocks };
    probes.push(p);
    console.log(`${p.ok ? "PASS" : "FAIL"}  ${r.path}  [${r.what}]  HTTP ${res.status || "-"}  ${res.ok ? "" : res.reason}`);
    for (const [name, b] of Object.entries(blocks)) {
      console.log(`      block ${name}: ${b.rows.length} rows, columns: ${b.cols.join(", ")}`);
      for (const row of b.rows.slice(0, 2)) console.log(`        sample: ${JSON.stringify(row).slice(0, 300)}`);
    }
    if (args.includes("--raw") && res.data) console.log(`      raw: ${JSON.stringify(res.data).slice(0, 1500)}`);
    if (res.reason === "non-json") console.log("      (HTML instead of JSON: this route is not served for the key, or the path differs)");
  }

  /* what the data gives */
  console.log("\nsummary");
  const off = probes.find((p) => p.path === "/iss/calendars.json" && p.ok)?.blocks.off_days;
  const days = off?.rows ?? [];
  const lack = (cond: boolean) => (cond ? "yes" : "NO");
  console.log(`  trading days / holidays per market (calendars.json off_days): ${lack(days.length > 0)}${days.length ? `, ${days.length} rows` : ""}`);
  for (const m of ["stock", "futures", "currency"] as const) {
    const have = days.some((r) => r[`${m}_workday`] !== undefined && r[`${m}_workday`] !== null);
    const nonWork = days.filter((r) => String(r[`${m}_workday`]) === "0");
    const reasons = [...new Set(nonWork.map((r) => String(r[`${m}_reason`] ?? "?")))].join(",");
    console.log(`    ${m.padEnd(8)} ${lack(have)}  non-working days in the window: ${nonWork.length}${reasons ? ` (reasons ${reasons})` : ""}`);
  }
  const sessions = ["/iss/calendars/stock/session.json", "/iss/calendars/futures/session.json", "/iss/calendars/currency/session.json"].map((p) => probes.find((x) => x.path === p));
  for (const s of sessions) {
    const rows = s?.ok ? Object.values(s.blocks).reduce((a, b) => a + b.rows.length, 0) : 0;
    const special = s?.ok ? Object.values(s.blocks).flatMap((b) => b.rows).filter((r) => String(r.tradingsession) === "5" || r.type === "special").length : 0;
    console.log(`  sessions ${s?.path.split("/")[3]}: ${lack(rows > 0)}${rows ? `, ${rows} rows, special-day rows: ${special}` : ""}`);
  }

  /* cross-check with the source moex.ts uses today: isdayoff.ru (digit per day: 0 work, 1 holiday, 2 shortened) */
  if (days.length) {
    const years = [...new Set(days.map((r) => String(r.tradedate).slice(0, 4)))];
    const digits = new Map<string, string>();
    for (const y of years) {
      try {
        const res = await fetch(`https://isdayoff.ru/api/getdata?year=${y}&pre=1`);
        const t = (await res.text()).trim();
        if (/^[0-9]{365,366}$/.test(t)) for (let i = 0; i < t.length; i++) digits.set(iso(Date.UTC(+y, 0, 1) + i * 86_400_000), t[i]);
      } catch {
        console.log(`  isdayoff.ru ${y}: not reachable, cross-check skipped`);
      }
    }
    let agree = 0;
    let differ = 0;
    const diffs: string[] = [];
    for (const r of days) {
      const d = String(r.tradedate).slice(0, 10);
      const dig = digits.get(d);
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dig === undefined || r.stock_workday === undefined || r.stock_workday === null) continue;
      const exchangeOff = String(r.stock_workday) === "0";
      const productionOff = dig === "1";
      if (exchangeOff === productionOff || wd === 0 || wd === 6) agree++;
      else {
        differ++;
        if (diffs.length < 10) diffs.push(`${d}: exchange ${exchangeOff ? "closed" : "open"} / production calendar ${dig}`);
      }
    }
    console.log(`  vs isdayoff.ru (stock): ${agree} days agree, ${differ} differ${diffs.length ? "\n    " + diffs.join("\n    ") : ""}`);
    if (differ === 0 && agree > 0) console.log("  -> the exchange's own calendar matches the production calendar here; it is still the better source (it is the exchange's own, and covers special sessions).");
    else if (differ > 0) console.log("  -> differences: moex.ts (isdayoff.ru) would show the wrong closed / open state on those days: switch it to this source.");
  }

  const good = probes.filter((p) => p.ok).length;
  console.log(`\n${good}/${probes.length} routes answered with data`);
  process.exit(good ? 0 : 1);
}

main().catch((e) => {
  // never print anything that could carry the key
  console.log(`FAIL  probe crashed: ${(e as Error)?.name ?? "error"}`);
  process.exit(1);
});
