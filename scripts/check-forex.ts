/* Live smoke test of the FOREX data providers behind /api/klines and /api/quote(s) with source=forex (src/lib/forex.ts).
   For a few pairs it probes every provider on its own (FMP, Stooq, Yahoo) for a quote, intraday bars and daily bars and prints
   PASS / WARN / FAIL per line with HTTP status, row count, the age of the newest bar / quote ("delay") and what the volume is;
   then runs the real layer (the provider order the terminal uses) end to end. The FMP key is read from the environment or the env
   file, never printed; responses are never printed either, only counts and numbers.

   Run on the server (needs outbound HTTPS to financialmodelingprep.com, stooq.com and query1.finance.yahoo.com):
     cd /opt/fomo && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/check-forex.ts --env /opt/fomo/.env
   Options: --pairs EURUSD,USDJPY,XAUUSD,USDRUB   (default)   --quiet-layer  (skip the end-to-end part)
   The env file lines taken: FMP_API_KEY and FOREX_* (provider order, FOREX_FMP_TZ, FOREX_FMP_DAILY_MAX); the rest is not even kept.
   Exit code: 0 no FAIL (WARN allowed), 1 at least one FAIL.

   How to read it:
     PASS  the call worked and the data looks live (or the market is closed: weekend, Sunday 21:00 - Friday 21:00 UTC is open).
     WARN  the provider is restricted by the plan (402 / 403), switched off (Stooq browser check), or the data is stale while the market is open.
     FAIL  network / TLS error, an unexpected status or shape.
   FMP intraday: if it answers 200 the script also compares the newest bar with the clock under two readings of its timestamps
   (US Eastern wall clock = FMP's documented convention, or UTC) and says which one is plausible; if it says UTC, set FOREX_FMP_TZ=UTC. */
import { readFileSync } from "node:fs";
import { FOREX_PROVIDERS, forexDenied, getForexCandles, getForexQuote, wallToUtc, type ForexProvider } from "../src/lib/forex";
import { fxMarketOpen, parseFxSymbol } from "../src/lib/forex-meta";

const args = process.argv.slice(2);
const arg = (name: string, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

/* optional env file: only FMP_API_KEY and FOREX_* lines are taken */
const envFile = arg("env");
if (envFile) {
  try {
    for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*((?:FMP_API_KEY)|(?:FOREX_[A-Z_]+))\s*=\s*(.*?)\s*$/);
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
const ms = (v: number) => `${v} ms`;
const ageText = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 120 ? `${m} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`;
};
const open = fxMarketOpen(new Date());
const tlsHint = (e: unknown) => {
  const msg = String((e as { cause?: { code?: string }; message?: string })?.cause?.code ?? (e as Error)?.message ?? e);
  return /CERT|TLS|SSL|issuer|self.signed/i.test(msg) ? `${msg}  (TLS: run with NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt)` : msg;
};

async function probeProvider(p: ForexProvider, symbol: string) {
  const tag = `${p.name} ${symbol}`;
  /* quote */
  if (p.quote) {
    const t0 = Date.now();
    try {
      const r = await p.quote(symbol);
      if (r.ok) {
        const age = Date.now() - Date.parse(r.data.time);
        // a quote older than 30 min while the market is open is stale; closed market: expected
        const stale = open && age > 30 * 60_000;
        line(stale ? "WARN" : "PASS", `${tag} quote`, `price=${r.data.price} chg=${r.data.changePercent}% age=${ageText(Date.parse(r.data.time))} ${ms(Date.now() - t0)}${r.proxy ? `  PROXY: ${r.proxy}` : ""}${stale ? "  STALE while the market is open" : ""}`);
      } else line(r.reason === "error" ? "FAIL" : "WARN", `${tag} quote`, `${r.reason}${r.status ? ` (HTTP ${r.status})` : ""}${r.wide ? " [whole endpoint]" : ""} ${ms(Date.now() - t0)}`);
    } catch (e) {
      line("FAIL", `${tag} quote`, tlsHint(e));
    }
  }
  /* candles: one intraday and one daily probe */
  if (p.candles) {
    for (const [iv, label, limit] of [["60", "1h", 200], ["5", "5m", 300], ["D", "daily", 300]] as const) {
      const t0 = Date.now();
      try {
        const r = await p.candles(symbol, iv, undefined, undefined, limit);
        if (r.ok && r.data.candles.length) {
          const c = r.data.candles;
          const last = c[c.length - 1];
          const age = Date.now() - last.timestamp;
          const intraday = iv !== "D";
          const stale = open && ((intraday && age > 3 * 3_600_000) || (!intraday && age > 4 * 86_400_000));
          const vol = r.data.volume === "tick" ? `tick volume (last ${last.volume})` : "no volume";
          line(stale ? "WARN" : "PASS", `${tag} ${label}`, `${c.length} bars, newest ${new Date(last.timestamp).toISOString().slice(0, 16)}Z (${ageText(last.timestamp)} ago), ${vol} ${ms(Date.now() - t0)}${r.proxy ? `  PROXY: ${r.proxy}` : ""}${stale ? "  STALE while the market is open" : ""}`);
          if (p.name === "fmp" && intraday) {
            // two readings of FMP's wall-clock timestamps; the plausible one has the newest bar slightly in the past
            const raw = await fmpRawLastBarWall(symbol, iv);
            if (raw) {
              const asNy = wallToUtc(raw, "America/New_York");
              const asUtc = wallToUtc(raw, "UTC");
              const okNy = Date.now() - asNy >= -60_000 && Date.now() - asNy < 3 * 3_600_000;
              const okUtc = Date.now() - asUtc >= -60_000 && Date.now() - asUtc < 3 * 3_600_000;
              line("INFO", `${tag} timestamps`, `newest bar "${raw}": read as US Eastern -> ${ageText(asNy)} ago ${okNy ? "(plausible)" : "(implausible)"}, read as UTC -> ${ageText(asUtc)} ago ${okUtc ? "(plausible)" : "(implausible)"}${open ? "" : "  (market closed: not conclusive)"}`);
            }
          }
        } else if (r.ok) line("WARN", `${tag} ${label}`, `empty answer ${ms(Date.now() - t0)}`);
        else line(r.reason === "error" ? "FAIL" : "WARN", `${tag} ${label}`, `${r.reason}${r.status ? ` (HTTP ${r.status})` : ""}${r.wide ? " [whole endpoint: not in the plan / switched off]" : ""} ${ms(Date.now() - t0)}`);
      } catch (e) {
        line("FAIL", `${tag} ${label}`, tlsHint(e));
      }
    }
  }
}

/** The "date" string of the newest FMP intraday bar (needs the key; never printed beyond that string). */
async function fmpRawLastBarWall(symbol: string, interval: string): Promise<string | null> {
  const key = process.env.FMP_API_KEY || "";
  const iv = interval === "5" ? "5min" : "1hour";
  try {
    const res = await fetch(`https://financialmodelingprep.com/stable/historical-chart/${iv}?symbol=${symbol}&apikey=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });
    const j = res.ok ? await res.json() : null;
    const dates = Array.isArray(j) ? j.map((x: { date?: string }) => String(x.date)).sort() : [];
    return dates.length ? dates[dates.length - 1] : null;
  } catch {
    return null;
  }
}

async function main() {
  const pairs = arg("pairs", "EURUSD,USDJPY,XAUUSD,USDRUB").split(",").map((s) => s.trim().toUpperCase()).filter((s) => parseFxSymbol(s));
  console.log(`FOREX provider check  ${new Date().toISOString()}  market ${open ? "OPEN (Sun 21:00 - Fri 21:00 UTC)" : "CLOSED (weekend): stale data is expected"}`);
  console.log(`FMP key: ${process.env.FMP_API_KEY ? "present (not shown)" : "NOT SET (FMP lines will be restricted)"}   quote order: ${process.env.FOREX_QUOTE_PROVIDERS || "yahoo,fmp"}   candle order: ${process.env.FOREX_CANDLE_PROVIDERS || "fmp,stooq,yahoo"}\n`);

  for (const sym of pairs) {
    for (const p of Object.values(FOREX_PROVIDERS)) await probeProvider(p, sym);
    console.log("");
  }

  if (!args.includes("--quiet-layer")) {
    console.log("-- the layer the terminal uses (provider order above, denied-memory, caching) --");
    for (const sym of pairs) {
      const q = await getForexQuote(sym);
      line(q ? "PASS" : "FAIL", `layer quote ${sym}`, q ? `${q.provider} price=${q.quote.price}${q.proxy ? `  PROXY: ${q.proxy}` : ""}` : "no provider answered");
      for (const iv of ["1", "15", "60", "240", "D", "W"]) {
        const r = await getForexCandles(sym, iv, undefined, undefined, 300);
        const last = r.candles[r.candles.length - 1];
        line(r.candles.length ? "PASS" : "FAIL", `layer ${sym} ${iv}`, r.candles.length ? `${r.provider} ${r.candles.length} bars, newest ${ageText(last.timestamp)} ago, volume ${r.volume}` : `none (${r.reason})`);
      }
      // scroll-back page: bars before the oldest we have
      const first = (await getForexCandles(sym, "60", undefined, undefined, 300)).candles[0];
      if (first) {
        const back = await getForexCandles(sym, "60", undefined, first.timestamp - 1, 300);
        line(back.candles.length && back.candles[back.candles.length - 1].timestamp < first.timestamp ? "PASS" : "WARN", `layer ${sym} 1h scroll-back`, `${back.provider} ${back.candles.length} older bars`);
      }
    }
    const den = forexDenied();
    line("INFO", "switched off right now", Object.keys(den).length ? Object.entries(den).map(([k, s]) => `${k} (${s}s)`).join(", ") : "nothing");
  }

  console.log(`\n${passes} PASS, ${warns} WARN, ${fails} FAIL`);
  process.exit(fails ? 1 : 0);
}
main();
