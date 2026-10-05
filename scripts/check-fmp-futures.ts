/* Check of the FMP futures candle layer (src/lib/fmp-futures.ts, src/lib/fmp-gate.ts) behind /api/klines, /api/quote and /api/quotes.

   Default mode: OFFLINE. fetch is replaced by a stub that plays FMP (newest-first rows in US Eastern wall clock, a daylight-saving change
   day, a Sunday evening Globex open, a holiday, duplicates, zero rows, 429 / 402 / 403 / 401 answers, network errors) and the clock is
   faked, so nothing depends on the day it runs. No network, no key. Run:  npx tsx scripts/check-fmp-futures.ts

   --live: probes the REAL key for the listed symbols (needs outbound HTTPS to financialmodelingprep.com), never printing the key or a
   URL. For each symbol: the time zone of the raw intraday rows (US Eastern or UTC), whether one 1min / EOD window is cut short by the
   provider, then every terminal interval through the real layer: bars, oldest / newest bar (UTC and ET), share of bars with volume,
   lag of the newest bar vs now, provider windows used, and a scroll-back page. On the server after the key is in place:
     cd /opt/fomo && NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt npx tsx scripts/check-fmp-futures.ts --env /opt/fomo/.env --live --symbols CLUSD,GCUSD,NGUSD
   Options: --symbols A,B   --env FILE (lines taken: FMP_API_KEY, FMP_FUTURES_TZ, FOREX_FMP_TZ, FMP_LIMIT_COOLDOWN_MS; the rest is not kept)
   Exit code: 0 no FAIL (WARN allowed), 1 at least one FAIL. */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const arg = (name: string, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const LIVE = args.includes("--live");

if (LIVE) {
  const envFile = arg("env");
  if (envFile) {
    try {
      for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*((?:FMP_API_KEY)|(?:FMP_FUTURES_TZ)|(?:FOREX_FMP_TZ)|(?:FMP_LIMIT_COOLDOWN_MS))\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      console.log(`cannot read ${envFile}`);
    }
  }
} else process.env.FMP_API_KEY = "test-key-not-real";

let fails = 0;
let warns = 0;
let passes = 0;
function line(kind: "PASS" | "FAIL" | "WARN" | "INFO", name: string, note = "") {
  if (kind === "FAIL") fails++;
  else if (kind === "WARN") warns++;
  else if (kind === "PASS") passes++;
  console.log(`${kind.padEnd(4)}  ${name.padEnd(38)} ${note}`);
}
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  else passes++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
function truthy(name: string, cond: boolean, note = "") {
  if (!cond) fails++;
  else passes++;
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${note ? `  ${note}` : ""}`);
}

const MIN = 60_000;
const H = 3_600_000;
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const isoMin = (ms: number) => new Date(ms).toISOString().slice(0, 16) + "Z";

/* ═══════════ independent US Eastern calendar (does NOT share code with the layer) ═══════════ */

function sundayOf(year: number, month: number, nth: number): number {
  const dow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((7 - dow) % 7) + 7 * (nth - 1);
}
function etOffsetMs(utc: number): number {
  const y = new Date(utc).getUTCFullYear();
  const start = Date.UTC(y, 2, sundayOf(y, 2, 2), 7); // 2nd Sunday of March 02:00 EST
  const end = Date.UTC(y, 10, sundayOf(y, 10, 1), 6); // 1st Sunday of November 02:00 EDT
  return utc >= start && utc < end ? -4 * H : -5 * H;
}
const etWall = (utc: number) => new Date(utc + etOffsetMs(utc)).toISOString().slice(0, 19).replace("T", " ");
const etDate = (utc: number) => etWall(utc).slice(0, 10);
/** CME Globex energy / metals / index hours: Sun 18:00 ET - Fri 17:00 ET with a break 17:00-18:00 ET each day. */
function globexOpen(utc: number): boolean {
  const w = new Date(utc + etOffsetMs(utc));
  const dow = w.getUTCDay();
  const m = w.getUTCHours() * 60 + w.getUTCMinutes();
  if (dow === 6) return false;
  if (dow === 0) return m >= 18 * 60;
  if (dow === 5) return m < 17 * 60;
  return m < 17 * 60 || m >= 18 * 60;
}

/* ═══════════ the fake FMP ═══════════ */

interface Req {
  endpoint: "intraday" | "eod" | "quote";
  raw: string;
  symbol: string;
  from: string;
  to: string;
}
type Resp = { status: number; body: string } | "throw";
let NOW = Date.parse("2026-11-04T15:00:00Z");
let handler: (r: Req) => Resp = () => ({ status: 200, body: "[]" });
const requests: Req[] = [];
const realFetch = globalThis.fetch;

function installFetch() {
  Date.now = () => NOW;
  globalThis.fetch = (async (input: unknown) => {
    const u = new URL(String(input));
    const p = u.pathname.replace(/^\/stable/, "");
    const symbol = u.searchParams.get("symbol") ?? "";
    const req: Req = p.startsWith("/historical-chart/")
      ? { endpoint: "intraday", raw: p.slice("/historical-chart/".length), symbol, from: u.searchParams.get("from") ?? "", to: u.searchParams.get("to") ?? "" }
      : p.startsWith("/historical-price-eod")
        ? { endpoint: "eod", raw: "eod", symbol, from: u.searchParams.get("from") ?? "", to: u.searchParams.get("to") ?? "" }
        : { endpoint: "quote", raw: "quote", symbol, from: "", to: "" };
    requests.push(req);
    const r = handler(req);
    if (r === "throw") throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
    return new Response(r.body, { status: r.status });
  }) as typeof fetch;
}

const ok = (rows: unknown[]): Resp => ({ status: 200, body: JSON.stringify(rows) });
const STEP: Record<string, number> = { "1min": MIN, "5min": 5 * MIN, "1hour": H };
const row = (utcMs: number, i: number, step: number) => {
  const base = 70 + ((utcMs / MIN) % 1000) / 100;
  return { date: etWall(utcMs), open: base, high: base + 0.1, low: base - 0.1, close: base + 0.05, volume: Math.floor(utcMs / step) % 7 === 0 ? 0 : 10 + (i % 3) };
};

/** A generated FMP: rows on the Globex schedule from `dataStart`, newest first, for the Eastern dates of the window, cut to the newest `cap` rows. */
function generated(opts: { dataStart?: number; cap?: number; dataEnd?: () => number } = {}): (r: Req) => Resp {
  return (r) => {
    if (r.endpoint === "quote") return ok([{ price: 71.5, change: 0.5, changePercentage: 0.7, volume: 1000, open: 71, dayHigh: 72, dayLow: 70.5, timestamp: Math.floor(NOW / 1000) }]);
    if (r.endpoint === "eod") return ok([]);
    const step = STEP[r.raw];
    const start = opts.dataStart ?? Date.parse("2026-01-01T00:00:00Z");
    const end = Math.min(opts.dataEnd ? opts.dataEnd() : NOW, NOW);
    const out: ReturnType<typeof row>[] = [];
    // walk the Eastern dates of the window
    const from = Date.parse(r.from + "T00:00:00Z") - 12 * H;
    const to = Date.parse(r.to + "T00:00:00Z") + DAY + 12 * H;
    for (let t = Math.floor(from / step) * step; t <= to; t += step) {
      if (t < start || t > end || !globexOpen(t)) continue;
      const d = etDate(t);
      if (d < r.from || d > r.to) continue;
      out.push(row(t, 0, step));
    }
    out.reverse();
    return ok(opts.cap && out.length > opts.cap ? out.slice(0, opts.cap) : out);
  };
}

const scheduleList = (fromMs: number, toMs: number, step: number): number[] => {
  const out: number[] = [];
  for (let t = Math.ceil(fromMs / step) * step; t <= toMs; t += step) if (globexOpen(t)) out.push(t);
  return out;
};

/* ═══════════ offline checks ═══════════ */

async function offline() {
  installFetch();
  const fut = await import("../src/lib/fmp-futures");
  const gate = await import("../src/lib/fmp-gate");
  const forex = await import("../src/lib/forex");
  const { aggregateYearly } = await import("../src/lib/kline-aggregate");
  const { intervalPlan, NATIVE_INTERVALS, MENU_INTERVALS, isValidInterval, intervalOrder, formatInterval } = await import("../src/lib/chart/intervals");
  const { intervalToMs } = await import("../src/lib/chart/format");
  const { getFmpFuturesCandles, __test: T } = fut;
  const reset = () => {
    gate.fmpGateReset();
    fut.fmpFuturesReset();
    requests.length = 0;
    process.env.FMP_API_KEY = "test-key-not-real";
  };
  const nReq = (kind?: Req["endpoint"]) => requests.filter((r) => !kind || r.endpoint === kind).length;

  console.log("-- time conversion --");
  const samples = ["2026-11-01 18:00:00", "2026-10-30 14:00:00", "2026-03-08 03:30:00", "2026-03-09 18:00:00", "2026-11-02 09:30:00", "2026-07-04 12:00:00", "2026-12-25 17:00:00", "2026-02-02"];
  eq("parseWall equals forex wallToUtc (DST samples)", samples.map((s) => T.parseWall(s, "America/New_York")), samples.map((s) => forex.wallToUtc(s, "America/New_York")));
  eq("Sunday Globex open after the DST change = 23:00Z (EST)", iso(T.parseWall("2026-11-01 18:00:00", "America/New_York")), "2026-11-01T23:00:00.000Z");
  eq("Thursday Globex open before it = 22:00Z (EDT)", iso(T.parseWall("2026-10-29 18:00:00", "America/New_York")), "2026-10-29T22:00:00.000Z");
  eq("independent ET calendar agrees", T.parseWall("2026-11-01 18:00:00", "America/New_York"), Date.parse("2026-11-01T18:00:00Z") - etOffsetMs(Date.parse("2026-11-01T23:00:00Z")));
  eq("garbage date", Number.isNaN(T.parseWall("x", "UTC")), true);

  console.log("-- row parsing: duplicates, zero rows, a negative price --");
  const parsed = T.parseRows(
    [
      { date: "2026-10-30 11:00:00", open: 70, high: 71, low: 69, close: 70.5, volume: 10 },
      { date: "2026-10-30 10:00:00", open: 69, high: 70, low: 68, close: 69.5, volume: 5 },
      { date: "2026-10-30 10:00:00", open: 69.1, high: 70.1, low: 68.1, close: 69.6, volume: 6 },
      { date: "2026-10-30 09:00:00", open: 0, high: 0, low: 0, close: 0, volume: 0 },
      { date: "2026-10-30 08:00:00", open: 0, high: 0, low: 0, close: 68, volume: 3 },
      { date: "2026-10-30 07:00:00", open: "67.5", high: "68", low: "67", close: "67.8", volume: null },
      { date: "2020-04-20 14:00:00", open: -10, high: -5, low: -40, close: -37.63, volume: 100 },
      { date: "garbage", open: 1, high: 1, low: 1, close: 1, volume: 1 },
      null,
    ],
    "intraday"
  );
  eq(
    "ascending, one row per time, junk dropped, negative kept",
    parsed.map((b) => [isoMin(b.timestamp), b.open, b.close, b.volume]),
    [["2020-04-20T18:00Z", -10, -37.63, 100], ["2026-10-30T11:00Z", 67.5, 67.8, 0], ["2026-10-30T14:00Z", 69.1, 69.6, 6], ["2026-10-30T15:00Z", 70, 70.5, 10]]
  );
  eq("EOD wrapper {historical: [...]}", T.parseRows({ historical: [{ date: "2026-10-30", open: 1, high: 2, low: 0.5, close: 1.5, volume: 3 }] }, "eod").map((b) => iso(b.timestamp)), ["2026-10-30T00:00:00.000Z"]);

  console.log("-- 15m / 30m from 5m --");
  reset();
  NOW = Date.parse("2026-11-02T16:00:00Z");
  const five = Array.from({ length: 24 }, (_, i) => {
    const t = Date.parse("2026-11-02T14:00:00Z") + i * 5 * MIN; // 09:00 ET (EST)
    return { date: etWall(t), open: 100 + i, high: 100 + i + 0.5, low: 100 + i - 0.5, close: 100 + i + 0.25, volume: i + 1 };
  }).reverse();
  handler = () => ok(five);
  const m15 = await getFmpFuturesCandles("CLUSD", "15", { limit: 300 });
  eq("15m: 8 buckets on the UTC clock", [m15.candles.length, isoMin(m15.candles[0].timestamp), isoMin(m15.candles[7].timestamp)], [8, "2026-11-02T14:00Z", "2026-11-02T15:45Z"]);
  eq("15m first bucket OHLCV", [m15.candles[0].open, m15.candles[0].high, m15.candles[0].low, m15.candles[0].close, m15.candles[0].volume], [100, 102.5, 99.5, 102.25, 6]);
  const m30 = await getFmpFuturesCandles("CLUSD", "30", { limit: 300 });
  eq("30m: 4 buckets", m30.candles.map((c) => isoMin(c.timestamp)), ["2026-11-02T14:00Z", "2026-11-02T14:30Z", "2026-11-02T15:00Z", "2026-11-02T15:30Z"]);
  eq("30m first / last bucket", [m30.candles[0].open, m30.candles[0].high, m30.candles[0].low, m30.candles[0].close, m30.candles[0].volume, m30.candles[3].volume, m30.candles[3].close], [100, 105.5, 99.5, 105.25, 21, 129, 123.25]);
  eq("same rows twice = the data starts there (2 windows, no error)", [m30.reachedStart, m30.error ?? null], [true, null]);
  const m5 = await getFmpFuturesCandles("CLUSD", "5", { limit: 5 });
  eq("5m is native, newest 5 of 24", m5.candles.map((c) => c.volume), [20, 21, 22, 23, 24]);
  eq("limit 5 -> the 5m candles are cleaned (open / high / low / close all set)", m5.candles.every((c) => c.low <= c.open && c.high >= c.close), true);
  eq("unsupported interval", (await getFmpFuturesCandles("CLUSD", "7")).detail, "unsupported-interval");

  console.log("-- 4h from 1h: Globex session aligned (18:00 ET), across the DST change --");
  reset();
  NOW = Date.parse("2026-11-02T12:00:00Z");
  const hourRows: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  const addH = (wall: string, i: number) => hourRows.push({ date: wall, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1 });
  let k = 0;
  for (const h of ["10", "11", "12", "13", "14", "15", "16"]) addH(`2026-10-30 ${h}:00:00`, k++); // Friday before the change (EDT)
  for (const h of ["18", "19", "20", "21", "22", "23"]) addH(`2026-11-01 ${h}:00:00`, k++); // Sunday evening open (EST)
  for (const h of ["00", "01", "02", "03", "04", "05"]) addH(`2026-11-02 ${h}:00:00`, k++);
  handler = () => ok([...hourRows].reverse());
  const h4 = await getFmpFuturesCandles("CLUSD", "240", { limit: 100 });
  eq(
    "4h bucket starts (UTC): 10:00 and 14:00 ET on Friday, 18:00 / 22:00 / 02:00 ET after the DST change",
    h4.candles.map((c) => isoMin(c.timestamp)),
    ["2026-10-30T14:00Z", "2026-10-30T18:00Z", "2026-11-01T23:00Z", "2026-11-02T03:00Z", "2026-11-02T07:00Z"]
  );
  eq("4h bars hold 4 / 3 / 4 / 4 / 4 hours (the 17:00-18:00 break has no bar)", h4.candles.map((c) => c.volume), [4, 3, 4, 4, 4]);
  eq("4h OHLC of the 3-hour Friday bar", [h4.candles[1].open, h4.candles[1].high, h4.candles[1].low, h4.candles[1].close], [104, 107, 103, 106.5]);
  const h1 = await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  eq("1h is native, converted from ET to UTC", [h1.candles.length, isoMin(h1.candles[0].timestamp), isoMin(h1.candles[7].timestamp)], [19, "2026-10-30T14:00Z", "2026-11-01T23:00Z"]);
  eq("sessionBucketStart: Sunday 18:00 EST", isoMin(T.sessionBucketStart(Date.parse("2026-11-01T23:30:00Z"), 4 * H, 18 * 60, "America/New_York")), "2026-11-01T23:00Z");
  eq("sessionBucketStart: Thursday 21:59 EDT is in the 18:00 bucket", isoMin(T.sessionBucketStart(Date.parse("2026-10-30T01:59:00Z"), 4 * H, 18 * 60, "America/New_York")), "2026-10-29T22:00Z");
  eq("stock session: 09:30 / 13:30 ET", [isoMin(T.sessionBucketStart(Date.parse("2026-10-30T14:30:00Z"), 4 * H, 570, "America/New_York")), isoMin(T.sessionBucketStart(Date.parse("2026-10-30T19:45:00Z"), 4 * H, 570, "America/New_York"))], ["2026-10-30T13:30Z", "2026-10-30T17:30Z"]);
  eq("trade date: Sunday 18:00 ET belongs to Monday", iso(T.tradeDay(Date.parse("2026-11-01T23:00:00Z"), "globex") * DAY), "2026-11-02T00:00:00.000Z");
  eq("trade date: Thursday 18:00 ET belongs to Friday", iso(T.tradeDay(Date.parse("2026-10-29T22:00:00Z"), "globex") * DAY), "2026-10-30T00:00:00.000Z");
  eq("trade date: Friday 12:00 ET is Friday", iso(T.tradeDay(Date.parse("2026-10-30T16:00:00Z"), "globex") * DAY), "2026-10-30T00:00:00.000Z");
  eq("stock symbol is not a CME symbol", [fut.fmpSession("AAPL"), fut.fmpSession("CLUSD"), fut.fmpSession("WTIUSD")], ["cash", "globex", "globex"]);

  console.log("-- D / W / M / Y from the EOD table (Sunday row, Saturday row, duplicate, zero row, holiday, year change) --");
  reset();
  NOW = Date.parse("2026-11-02T15:00:00Z");
  const e = (date: string, o: number, h: number, l: number, c: number, v: number) => ({ date, open: o, high: h, low: l, close: c, volume: v });
  const eod = [
    e("2025-12-29", 100, 102, 99, 101, 10),
    e("2025-12-30", 101, 103, 100, 102, 10),
    e("2025-12-31", 102, 104, 101, 103, 10),
    e("2026-01-02", 103, 105, 102, 104, 10), // 01-01 holiday: no row
    e("2026-01-05", 104, 106, 103, 105, 10),
    e("2026-10-26", 105, 107, 104, 106, 10),
    e("2026-10-27", 106, 108, 105, 107, 10),
    e("2026-10-28", 107, 109, 106, 108, 10),
    e("2026-10-29", 0, 0, 0, 0, 0), // an empty row
    e("2026-10-30", 108, 110, 107, 109, 10),
    e("2026-10-30", 108, 111, 107, 110, 12), // a duplicate date: the row that comes LAST in the answer wins (the answer is newest first, so this is the older of the two)
    e("2026-10-31", 999, 999, 999, 999, 1), // Saturday artefact
    e("2026-11-01", 110, 113, 109, 112, 5), // Sunday: the Globex week-open session, belongs to Monday
    e("2026-11-02", 112, 114, 111, 113, 10),
  ];
  handler = (r) => (r.endpoint === "eod" ? ok([...eod].reverse()) : ok([]));
  const d1 = await getFmpFuturesCandles("CLUSD", "D", { limit: 300 });
  eq("D: the empty row, Saturday and the duplicate are gone, Sunday is merged into Monday", d1.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [
    ["2025-12-29", 100, 102, 99, 101, 10],
    ["2025-12-30", 101, 103, 100, 102, 10],
    ["2025-12-31", 102, 104, 101, 103, 10],
    ["2026-01-02", 103, 105, 102, 104, 10],
    ["2026-01-05", 104, 106, 103, 105, 10],
    ["2026-10-26", 105, 107, 104, 106, 10],
    ["2026-10-27", 106, 108, 105, 107, 10],
    ["2026-10-28", 107, 109, 106, 108, 10],
    ["2026-10-30", 108, 110, 107, 109, 10],
    ["2026-11-02", 110, 114, 109, 113, 15],
  ]);
  const w1 = await getFmpFuturesCandles("CLUSD", "W", { limit: 300 });
  eq("W: ISO weeks (Monday), the 2025/2026 week stays one bar", w1.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [
    ["2025-12-29", 100, 105, 99, 104, 40],
    ["2026-01-05", 104, 106, 103, 105, 10],
    ["2026-10-26", 105, 110, 104, 109, 40],
    ["2026-11-02", 110, 114, 109, 113, 15],
  ]);
  const mo = await getFmpFuturesCandles("CLUSD", "M", { limit: 300 });
  eq("M: calendar months", mo.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [
    ["2025-12-01", 100, 104, 99, 103, 30],
    ["2026-01-01", 103, 106, 102, 105, 20],
    ["2026-10-01", 105, 110, 104, 109, 40],
    ["2026-11-01", 110, 114, 109, 113, 15],
  ]);
  const yr = await getFmpFuturesCandles("CLUSD", "Y", { limit: 300 });
  eq("Y: calendar years", yr.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [
    ["2025-01-01", 100, 104, 99, 103, 30],
    ["2026-01-01", 103, 114, 102, 113, 75],
  ]);
  eq("D limit 2 = the newest two", (await getFmpFuturesCandles("CLUSD", "D", { limit: 2 })).candles.map((c) => iso(c.timestamp).slice(0, 10)), ["2026-10-30", "2026-11-02"]);
  eq("D scroll-back (to) is cut at `to`", (await getFmpFuturesCandles("CLUSD", "D", { limit: 300, to: Date.parse("2026-01-03T00:00:00Z") })).candles.map((c) => iso(c.timestamp).slice(0, 10)), ["2025-12-29", "2025-12-30", "2025-12-31", "2026-01-02"]);

  console.log("-- the newest session the EOD table lacks comes from the hourly bars --");
  reset();
  NOW = Date.parse("2026-11-02T15:00:00Z");
  const eodFri = [e("2026-10-29", 107, 109, 106, 108, 10), e("2026-10-30", 108, 111, 107, 110, 12)];
  const sunMon = [
    { date: "2026-11-01 18:00:00", open: 110, high: 111, low: 109, close: 110.5, volume: 2 },
    { date: "2026-11-01 19:00:00", open: 110.5, high: 112, low: 110, close: 111, volume: 3 },
    { date: "2026-11-02 09:00:00", open: 111, high: 113, low: 108, close: 112, volume: 4 },
  ];
  handler = (r) => (r.endpoint === "eod" ? ok([...eodFri].reverse()) : ok([...sunMon].reverse()));
  const dt = await getFmpFuturesCandles("CLUSD", "D", { limit: 10 });
  eq("D gets Monday's bar from the 1h rows (open of the Sunday 18:00 hour)", dt.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [
    ["2026-10-29", 107, 109, 106, 108, 10],
    ["2026-10-30", 108, 111, 107, 110, 12],
    ["2026-11-02", 110, 113, 108, 112, 9],
  ]);
  const wt = await getFmpFuturesCandles("CLUSD", "W", { limit: 10 });
  eq("W includes it", wt.candles.map((c) => [iso(c.timestamp).slice(0, 10), c.volume]), [["2026-10-26", 22], ["2026-11-02", 9]]);
  const dtp = await getFmpFuturesCandles("CLUSD", "D", { limit: 10, to: Date.parse("2026-11-01T00:00:00Z") });
  eq("a scroll-back page never gets the tail", dtp.candles.map((c) => iso(c.timestamp).slice(0, 10)), ["2026-10-29", "2026-10-30"]);

  console.log("-- history paging, merge, cache, in-flight --");
  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z"); // Wednesday
  handler = generated({ dataStart: Date.parse("2026-10-01T00:00:00Z") });
  const p1 = await getFmpFuturesCandles("CLUSD", "1", { limit: 5000 });
  const ts1 = p1.candles.map((c) => c.timestamp);
  eq("1m limit 5000: 5000 bars, ascending, unique", [p1.candles.length, ts1.every((t, i) => i === 0 || t > ts1[i - 1])], [5000, true]);
  truthy("1m: 2..6 provider windows", p1.windows >= 2 && p1.windows <= 6, `windows=${p1.windows}, requests=${nReq()}`);
  eq("1m: exactly the newest 5000 minutes of the Globex schedule (the seams lose nothing)", ts1, scheduleList(NOW - 14 * DAY, NOW, MIN).slice(-5000));
  eq("1m: every bar is on the schedule and not in the future", ts1.every((t) => globexOpen(t) && t <= NOW), true);
  const reqs1 = nReq();
  const p1b = await getFmpFuturesCandles("CLUSD", "1", { limit: 5000 });
  eq("the same request again: served from the cache (0 requests)", [nReq() - reqs1, p1b.candles.length], [0, 5000]);
  NOW += 20_000;
  const p1c = await getFmpFuturesCandles("CLUSD", "1", { limit: 5000 });
  truthy("20 s later only the live window is refetched", nReq() - reqs1 >= 1 && nReq() - reqs1 < p1.windows + 1, `new requests=${nReq() - reqs1}`);
  eq("... and the bars are the same series (+ a newer minute at most)", p1c.candles.length, 5000);
  const first = p1.candles[0].timestamp;
  const reqs2 = nReq();
  const back = await getFmpFuturesCandles("CLUSD", "1", { limit: 3000, to: first - 1 });
  const tsb = back.candles.map((c) => c.timestamp);
  eq("scroll-back: 3000 older bars, all before the oldest shown, contiguous with it", [tsb.length, tsb[tsb.length - 1] < first, tsb.every((t, i) => i === 0 || t > tsb[i - 1])], [3000, true, true]);
  eq("scroll-back: no hole, no overlap", [...tsb, first], scheduleList(tsb[0], first, MIN));
  truthy("scroll-back: at most 6 windows", back.windows <= 6, `windows=${back.windows}, requests=${nReq() - reqs2}`);
  const reqs3 = nReq();
  const [pa, pb] = await Promise.all([getFmpFuturesCandles("GCUSD", "5", { limit: 400 }), getFmpFuturesCandles("GCUSD", "5", { limit: 400 })]);
  eq("two concurrent identical requests share the provider calls", [pa.candles.length, pb.candles.length, nReq() - reqs3 <= pa.windows], [400, 400, true]);

  console.log("-- a provider that cuts every answer to its newest 2000 rows --");
  reset();
  handler = generated({ dataStart: Date.parse("2026-10-01T00:00:00Z"), cap: 2000 });
  const cut = await getFmpFuturesCandles("CLUSD", "1", { limit: 4000 });
  const tsc = cut.candles.map((c) => c.timestamp);
  eq("nothing is silently lost: 4000 contiguous minutes", [tsc.length, JSON.stringify(tsc) === JSON.stringify(scheduleList(NOW - 14 * DAY, NOW, MIN).slice(-4000))], [4000, true]);
  truthy("... within the call cap", cut.windows <= 6, `windows=${cut.windows}`);

  console.log("-- the symbol's first data: stop, remember, no more calls --");
  reset();
  handler = generated({ dataStart: Date.parse("2026-11-02T05:00:00Z") });
  const st = await getFmpFuturesCandles("CLUSD", "1", { limit: 5000 });
  truthy("fewer bars than asked, reachedStart", st.reachedStart && st.candles.length < 5000 && st.candles.length > 1000, `bars=${st.candles.length}, windows=${st.windows}`);
  const reqs4 = nReq();
  const older = await getFmpFuturesCandles("CLUSD", "1", { limit: 500, to: st.candles[0].timestamp - 1 });
  eq("scrolling further back: empty, reachedStart, 0 requests", [older.candles.length, older.reachedStart, nReq() - reqs4], [0, true, 0]);

  console.log("-- 5m, 15m, 30m, 1h, 4h generated, 4h on the session grid over the DST change --");
  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  handler = generated({ dataStart: Date.parse("2026-03-01T00:00:00Z") });
  for (const [iv, want] of [["5", 600], ["15", 600], ["30", 600], ["60", 600], ["240", 600]] as const) {
    const r = await getFmpFuturesCandles("CLUSD", iv, { limit: 600 });
    const t = r.candles.map((c) => c.timestamp);
    truthy(`${iv}: ${want} ascending unique bars`, r.candles.length === want && t.every((x, i) => i === 0 || x > t[i - 1]), `windows=${r.windows}`);
  }
  const g4 = await getFmpFuturesCandles("CLUSD", "240", { limit: 600 });
  const hours4 = g4.candles.map((c) => etWall(c.timestamp));
  eq("4h bars start at ET 18, 22, 02, 06, 10, 14 (before and after Nov 1)", hours4.every((w) => ["18:00:00", "22:00:00", "02:00:00", "06:00:00", "10:00:00", "14:00:00"].includes(w.slice(11))), true);
  eq("4h: the Sunday 2026-11-01 open is 18:00 EST = 23:00Z", g4.candles.some((c) => iso(c.timestamp) === "2026-11-01T23:00:00.000Z"), true);
  const g4h = await getFmpFuturesCandles("CLUSD", "60", { limit: 600 });
  const sumVol = (a: { volume: number }[]) => a.reduce((s, c) => s + c.volume, 0);
  const lastDay = g4.candles.filter((c) => c.timestamp >= Date.parse("2026-11-03T00:00:00Z") && c.timestamp < Date.parse("2026-11-04T00:00:00Z"));
  const hDay = g4h.candles.filter((c) => c.timestamp >= Date.parse("2026-11-03T00:00:00Z") && c.timestamp < Date.parse("2026-11-04T00:00:00Z"));
  eq("4h volume = sum of the hours inside", sumVol(lastDay), sumVol(hDay));

  console.log("-- errors are not silent: limit / plan / network, cooldown, denied, stale --");
  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  const LIMIT_BODY = '{"Error Message":"Limit Reach . Please upgrade your plan or visit our documentation for more details at https://site.financialmodelingprep.com/"}';
  handler = () => ({ status: 429, body: LIMIT_BODY });
  const l1 = await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  eq("429: error limit, no bars", [l1.error, l1.detail, l1.candles.length, nReq()], ["limit", "429", 0, 1]);
  const l2 = await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  const l3 = await getFmpFuturesCandles("GCUSD", "D", { limit: 100 });
  eq("cooldown: no request leaves, for any symbol / interval", [l2.error, l2.detail, l3.error, nReq()], ["limit", "cooldown", "limit", 1]);
  eq("cooldown 1: 60 s", gate.fmpGateStatus().limitSec, 60);
  const q1 = await gate.fmpRequest("quote", "CLUSD", "/quote?symbol=CLUSD");
  eq("quotes share the cooldown (the watchlist poll does not hammer)", [q1.ok, !q1.ok && q1.error, nReq()], [false, "limit", 1]);
  const qs = await (async () => {
    try {
      const { getBatchQuotes } = await import("../src/lib/quotes");
      const out = await getBatchQuotes([{ source: "fmp", ticker: "CLUSD" }]);
      return { ran: true, n: Object.keys(out).length };
    } catch (err) {
      return { ran: false, n: -1, why: String((err as Error)?.message).slice(0, 80) };
    }
  })();
  if (qs.ran) eq("getBatchQuotes: an FMP item costs no request during the cooldown, no quote", [qs.n, nReq()], [0, 1]);
  else line("WARN", "getBatchQuotes import", `skipped: ${(qs as { why?: string }).why}`);
  const fxq = await forex.FOREX_PROVIDERS.fmp.quote!("EURUSD");
  eq("the forex layer respects it too", [fxq.ok, !fxq.ok && fxq.reason, nReq()], [false, "rate", 1]);
  NOW += 61_000;
  await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  eq("after 60 s one request goes out, 429 again: cooldown 2 = 5 min", [nReq(), gate.fmpGateStatus().limitSec], [2, 300]);
  NOW += 301_000;
  await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  eq("cooldown 3 = 30 min", gate.fmpGateStatus().limitSec, 1800);
  NOW += 1801_000;
  await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  const untilMidnight = Math.round((Date.UTC(2026, 10, 5) - NOW) / 1000);
  eq("cooldown 4 = until the next UTC day", gate.fmpGateStatus().limitSec, untilMidnight);
  handler = generated();
  NOW = Date.UTC(2026, 10, 5, 0, 0, 5);
  const back2 = await getFmpFuturesCandles("CLUSD", "60", { limit: 50 });
  eq("the next UTC day it works again and the ladder starts over", [back2.candles.length, back2.error ?? null, gate.fmpGateStatus().limitSec], [50, null, 0]);

  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  handler = () => ({ status: 429, body: '{"Error Message":"Limit Reach. You have exceeded the daily limit"}' });
  await getFmpFuturesCandles("CLUSD", "D", { limit: 10 });
  eq("a body that says «daily» goes straight to the next UTC midnight", gate.fmpGateStatus().limitSec, Math.round((Date.UTC(2026, 10, 5) - NOW) / 1000));

  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  handler = generated({ dataStart: Date.parse("2026-10-01T00:00:00Z") });
  const s1 = await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  NOW += 20_000; // past the 15 s freshness of the live window
  handler = () => ({ status: 429, body: LIMIT_BODY });
  const s2 = await getFmpFuturesCandles("CLUSD", "60", { limit: 100 });
  eq("stale cache is served during a limit (bars + error + stale flag)", [s2.candles.length, s2.error, s2.stale, JSON.stringify(s2.candles) === JSON.stringify(s1.candles)], [100, "limit", true, true]);

  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  handler = (r) => (r.symbol === "GCUSD" && r.endpoint === "intraday" ? { status: 402, body: "Premium Query Parameter: This value set for 'symbol' is not available under your current subscription" } : r.endpoint === "eod" ? ok([e("2026-11-03", 1, 2, 0.5, 1.5, 3)]) : generated()(r));
  const pl1 = await getFmpFuturesCandles("GCUSD", "5", { limit: 100 });
  eq("402 premium symbol: error plan", [pl1.error, pl1.detail, nReq()], ["plan", "premium-symbol", 1]);
  const pl2 = await getFmpFuturesCandles("GCUSD", "15", { limit: 100 });
  eq("a restricted symbol costs ONE call (not one per request)", [pl2.error, nReq()], ["plan", 1]);
  const pl3 = await getFmpFuturesCandles("CLUSD", "5", { limit: 100 });
  eq("other symbols are not affected", [pl3.candles.length, pl3.error ?? null], [100, null]);
  const pl4 = await getFmpFuturesCandles("GCUSD", "M", { limit: 100 });
  eq("the daily table of the same symbol still works (plan restriction is per endpoint kind)", [pl4.candles.length, pl4.error ?? null], [1, null]);
  NOW += 7 * H;
  const before = nReq();
  await getFmpFuturesCandles("GCUSD", "5", { limit: 100 });
  eq("remembered for 6 h, then asked again", nReq() - before, 1);

  reset();
  handler = (r) => (r.endpoint === "intraday" ? { status: 403, body: "Restricted Endpoint: This endpoint is not available under your current subscription" } : ok([]));
  await getFmpFuturesCandles("CLUSD", "60", { limit: 10 });
  const wide = await getFmpFuturesCandles("NGUSD", "5", { limit: 10 });
  eq("403 Restricted Endpoint: every symbol's intraday is denied after one call", [wide.error, wide.detail, nReq("intraday")], ["plan", "restricted-endpoint", 1]);

  reset();
  handler = () => ({ status: 401, body: '{"Error Message":"Invalid API KEY. Please retry or visit our documentation"}' });
  const au = await getFmpFuturesCandles("CLUSD", "D", { limit: 10 });
  const au2 = await getFmpFuturesCandles("NGUSD", "5", { limit: 10 });
  eq("401: plan / auth, blocks everything for a while", [au.error, au.detail, au2.detail, nReq()], ["plan", "auth", "auth", 1]);
  reset();
  process.env.FMP_API_KEY = "";
  const nk = await getFmpFuturesCandles("CLUSD", "D", { limit: 10 });
  eq("no key: plan / no-key, nothing sent", [nk.error, nk.detail, nReq()], ["plan", "no-key", 0]);

  reset();
  NOW = Date.parse("2026-11-04T15:00:00Z");
  handler = () => "throw";
  const ne = await getFmpFuturesCandles("CLUSD", "60", { limit: 10 });
  eq("network error: error network + a harmless code", [ne.error, ne.detail, nReq()], ["network", "ECONNRESET", 1]);
  const ne2 = await getFmpFuturesCandles("CLUSD", "60", { limit: 10 });
  eq("back-off 5 s: no request meanwhile", [ne2.detail, nReq()], ["backoff", 1]);
  NOW += 6000;
  handler = () => ({ status: 502, body: "bad gateway" });
  const ne3 = await getFmpFuturesCandles("CLUSD", "60", { limit: 10 });
  eq("5xx after the back-off: network http-502", [ne3.error, ne3.detail], ["network", "http-502"]);
  reset();
  handler = () => ({ status: 200, body: LIMIT_BODY });
  eq("200 with an {Error Message: Limit Reach} body is a limit too", (await getFmpFuturesCandles("CLUSD", "60", { limit: 10 })).error, "limit");

  reset();
  handler = () => ok([]);
  const em = await getFmpFuturesCandles("ZZUSD", "5", { limit: 100 });
  eq("a clean empty answer: no error, no-data, bounded calls", [em.error ?? null, em.detail, em.candles.length, em.windows <= 6], [null, "no-data", 0, true]);
  const reqs5 = nReq();
  await getFmpFuturesCandles("ZZUSD", "5", { limit: 100 });
  eq("... remembered: the next request costs 0 calls", nReq() - reqs5, 0);
  eq("keys and URLs never leak into a result", JSON.stringify([em, ne, au]).includes("test-key"), false);

  console.log("-- yearly bars for the other sources, and the terminal's interval list --");
  const monthly = (y: number, m: number, o: number, c: number, off = 0) => ({ timestamp: Date.UTC(y, m, 1) - off, open: o, high: Math.max(o, c) + 1, low: Math.min(o, c) - 1, close: c, volume: 10 });
  const mths = [...[8, 9, 10, 11].map((m) => monthly(2024, m, 10 + m, 11 + m)), ...Array.from({ length: 12 }, (_, m) => monthly(2025, m, 100 + m, 101 + m)), monthly(2026, 0, 200, 210), monthly(2026, 1, 210, 205)];
  const y1 = aggregateYearly(mths, 0, false);
  eq("Y from M (true UTC; a first year that starts in September is stamped Jan 1st)", y1.map((c) => [iso(c.timestamp).slice(0, 10), c.open, c.high, c.low, c.close, c.volume]), [["2024-01-01", 18, 23, 17, 22, 40], ["2025-01-01", 100, 113, 99, 112, 120], ["2026-01-01", 200, 211, 199, 205, 20]]);
  eq("Y: a truncated monthly request drops the first, incomplete year", aggregateYearly(mths, 0, true).map((c) => iso(c.timestamp).slice(0, 4)), ["2025", "2026"]);
  eq("Y: a truncated request that starts in January keeps it", aggregateYearly(mths.slice(4), 0, true).map((c) => iso(c.timestamp).slice(0, 4)), ["2025", "2026"]);
  const msk = [monthly(2025, 11, 1, 2, 3 * H), monthly(2026, 0, 3, 4, 3 * H), monthly(2026, 1, 4, 5, 3 * H)]; // Moscow wall clocks parsed in a server zone of UTC+3: first of the month 00:00 MSK = 21:00Z the day before
  eq("Y from MOEX monthly bars (wall clock shifted by the server zone)", aggregateYearly(msk, 3 * H, false).map((c) => [iso(c.timestamp), c.open, c.close]), [["2024-12-31T21:00:00.000Z", 1, 2], ["2025-12-31T21:00:00.000Z", 3, 5]]);
  eq("Y: one monthly bar of a mid-year listing gets Jan 1st of its wall clock", aggregateYearly([monthly(2026, 7, 5, 6)], 0, false).map((c) => iso(c.timestamp)), ["2026-01-01T00:00:00.000Z"]);
  eq("«1Г» is a native interval of every source", [NATIVE_INTERVALS.includes("Y"), intervalPlan("Y", "moex"), intervalPlan("Y", "fmp").ratio], [true, { base: "Y", ratio: 1, ms: 0 }, 1]);
  eq("«1Г» is valid, listed, sorted after the month, has a bar length", [isValidInterval("Y"), MENU_INTERVALS.includes("Y"), intervalOrder("Y") > intervalOrder("M"), intervalToMs("Y")], [true, true, true, 365 * DAY]);
  eq("«1Г» label", formatInterval("Y", (key) => ({ "inst.period.Y": "1Г" })[key] ?? key), "1Г");
  eq("30m is built on the client from 15m (and the layer serves it natively as well)", [intervalPlan("30", "fmp").base, intervalPlan("30", "fmp").ratio], ["15", 2]);

  console.log(`\n${passes} passed, ${fails} failed`);
  globalThis.fetch = realFetch;
  process.exit(fails ? 1 : 0);
}

/* ═══════════ live probe ═══════════ */

const ageText = (t: number) => {
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 120 ? `${m} min` : m < 2880 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} d`;
};
const etString = (ms: number) => new Date(ms).toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);

async function live() {
  const fut = await import("../src/lib/fmp-futures");
  const gate = await import("../src/lib/fmp-gate");
  const forexMod = await import("../src/lib/forex");
  const symbols = arg("symbols", "CLUSD,GCUSD,NGUSD").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const open = globexOpen(Date.now());
  console.log(`FMP futures check  ${new Date().toISOString()}  Globex ${open ? "OPEN" : "CLOSED (maintenance break / weekend: lag is expected)"}`);
  console.log(`FMP key: ${process.env.FMP_API_KEY ? "present (not shown)" : "NOT SET: every line below will say plan / no-key"}   provider time zone: ${process.env.FMP_FUTURES_TZ || process.env.FOREX_FMP_TZ || "America/New_York (default)"}\n`);
  const tzName = process.env.FMP_FUTURES_TZ || forexMod.FMP_INTRADAY_TZ;

  for (const sym of symbols) {
    console.log(`── ${sym} (${fut.fmpSession(sym)} session)`);
    const today = new Date().toISOString().slice(0, 10);
    const d3 = new Date(Date.now() - 3 * DAY).toISOString().slice(0, 10);
    const d14 = new Date(Date.now() - 14 * DAY).toISOString().slice(0, 10);
    // 1. time zone of the raw rows: the newest 5min row read as the wall clock of ET / UTC
    const r5 = await gate.fmpRequest("intraday", sym, `/historical-chart/5min?symbol=${sym}&from=${d3}&to=${today}`);
    if (!r5.ok) {
      line(r5.error === "network" ? "FAIL" : "WARN", `${sym} raw 5min`, `${r5.error} (${r5.detail})${r5.retryAfterSec ? ` retry in ${r5.retryAfterSec}s` : ""}`);
    } else {
      const rows = (Array.isArray(r5.json) ? r5.json : []) as { date?: string }[];
      const dates = rows.map((x) => String(x.date)).sort();
      if (!dates.length) line("WARN", `${sym} raw 5min`, "empty answer for the last 3 days");
      else {
        const newest = dates[dates.length - 1];
        const asEt = fut.__test.parseWall(newest, "America/New_York");
        const asUtc = fut.__test.parseWall(newest, "UTC");
        const plausible = (t: number) => Date.now() - t >= -60_000 && Date.now() - t < 6 * H;
        line("INFO", `${sym} raw time zone`, `newest 5min row "${newest}": read as US Eastern -> ${ageText(asEt)} ago ${plausible(asEt) ? "(plausible)" : "(implausible)"}, read as UTC -> ${ageText(asUtc)} ago ${plausible(asUtc) ? "(plausible)" : "(implausible)"}${open ? "" : "  (market closed: not conclusive)"}  layer reads it as ${tzName}`);
      }
    }
    // 2. is one window cut short? 1min over 4 days, EOD over 12 years
    const r1 = await gate.fmpRequest("intraday", sym, `/historical-chart/1min?symbol=${sym}&from=${new Date(Date.now() - 4 * DAY).toISOString().slice(0, 10)}&to=${today}`);
    if (r1.ok) {
      const rows = (Array.isArray(r1.json) ? r1.json : []) as { date?: string }[];
      const dates = rows.map((x) => String(x.date)).sort();
      const days = new Set(dates.map((d) => d.slice(0, 10))).size;
      line(rows.length ? "PASS" : "WARN", `${sym} raw 1min, 4-day window`, `${rows.length} rows over ${days} trading dates${dates.length ? `, ${dates[0]} .. ${dates[dates.length - 1]}` : ""}${rows.length && rows.length % 1000 === 0 ? "  ROUND COUNT: the provider may cut its answer at " + rows.length + " rows (the layer pages by the oldest row received, so nothing is lost, but it costs calls)" : ""}`);
    } else line("WARN", `${sym} raw 1min`, `${r1.error} (${r1.detail})`);
    const eodFrom = new Date(Date.now() - 12 * 365 * DAY).toISOString().slice(0, 10);
    const re = await gate.fmpRequest("eod", sym, `/historical-price-eod/full?symbol=${sym}&from=${eodFrom}&to=${today}`);
    if (re.ok) {
      const rows = (Array.isArray(re.json) ? re.json : (re.json as { historical?: unknown[] })?.historical ?? []) as { date?: string }[];
      const dates = rows.map((x) => String(x.date)).sort();
      line(rows.length ? "PASS" : "WARN", `${sym} raw EOD, 12-year window`, `${rows.length} rows${dates.length ? `, ${dates[0]} .. ${dates[dates.length - 1]}` : ""}${dates.length && dates[0] > new Date(Date.now() - 11.8 * 365 * DAY).toISOString().slice(0, 10) ? "  (history starts later than the window: the symbol's first data, or a plan limit)" : ""}`);
    } else line("WARN", `${sym} raw EOD`, `${re.error} (${re.detail})`);
    void d14;

    // 3. every interval through the real layer
    for (const iv of ["1", "5", "15", "30", "60", "240", "D", "W", "M", "Y"]) {
      const t0 = Date.now();
      const r = await fut.getFmpFuturesCandles(sym, iv, { limit: 300 });
      const c = r.candles;
      if (!c.length) {
        line(r.error === "network" ? "FAIL" : "WARN", `${sym} ${iv.padEnd(3)}`, `no bars: ${r.error ?? "empty"} (${r.detail ?? ""})${r.retryAfterSec ? ` retry in ${r.retryAfterSec}s` : ""}  windows=${r.windows}`);
        continue;
      }
      const last = c[c.length - 1];
      const lag = Date.now() - last.timestamp;
      const intraday = !["D", "W", "M", "Y"].includes(iv);
      const stale = open && ((intraday && lag > Math.max(3 * H, 2 * Number(iv) * MIN)) || (iv === "D" && lag > 4 * DAY));
      const nz = c.filter((x) => x.volume > 0).length / c.length;
      const ordered = c.every((x, i) => i === 0 || x.timestamp > c[i - 1].timestamp);
      line(!ordered ? "FAIL" : stale ? "WARN" : "PASS", `${sym} ${iv.padEnd(3)}`, `${c.length} bars, ${iso(c[0].timestamp).slice(0, 16)}Z (ET ${etString(c[0].timestamp)}) .. ${iso(last.timestamp).slice(0, 16)}Z (ET ${etString(last.timestamp)}), volume>0 ${(nz * 100).toFixed(0)}%, newest ${ageText(last.timestamp)} ago${stale ? "  STALE while the market is open" : ""}, windows=${r.windows}${r.error ? `, ${r.error}` : ""}${r.stale ? ", stale" : ""}${Date.now() - t0 > 8000 ? `, ${Date.now() - t0} ms` : ""}`);
      if (["1", "60", "D"].includes(iv)) {
        const back = await fut.getFmpFuturesCandles(sym, iv, { limit: 300, to: c[0].timestamp - 1 });
        const okBack = back.candles.length > 0 && back.candles[back.candles.length - 1].timestamp < c[0].timestamp;
        line(okBack || back.reachedStart ? "PASS" : "WARN", `${sym} ${iv.padEnd(3)} scroll-back`, `${back.candles.length} older bars${back.candles.length ? `, ${iso(back.candles[0].timestamp).slice(0, 16)}Z .. ${iso(back.candles[back.candles.length - 1].timestamp).slice(0, 16)}Z` : ""}, windows=${back.windows}${back.reachedStart ? ", reached the first data" : ""}${back.error ? `, ${back.error}` : ""}`);
      }
    }
    console.log("");
  }
  const st = gate.fmpGateStatus();
  line("INFO", "switched off right now", `limit ${st.limitSec}s, network ${st.netSec}s, denied: ${Object.keys(st.denied).length ? Object.entries(st.denied).map(([k, s]) => `${k} (${s}s)`).join(", ") : "nothing"}`);
  console.log(`\n${passes} PASS, ${warns} WARN, ${fails} FAIL`);
  process.exitCode = fails ? 1 : 0; // not process.exit(): on Windows it can trip a libuv assertion while keep-alive sockets close
}

(LIVE ? live() : offline()).catch((err) => {
  console.log(`FAIL  unexpected error: ${(err as Error)?.stack ?? err}`);
  process.exit(1);
});
