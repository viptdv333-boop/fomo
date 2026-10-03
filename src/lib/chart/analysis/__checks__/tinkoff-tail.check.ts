/* Real-time tail of MOEX candles from T-Invest (src/lib/tinkoff-candles.ts): time basis, wire format, bucketing, merge rules, the
   sanity gate, caching / chunking / back-off, fail-soft paths. No network and no token: T-Invest is a mocked fetch with hand-built
   fixtures in its wire format (units / nano, ISO UTC times, isComplete), ISS rows are built in the shape /api/klines has them.
   Run (the result must not depend on the server zone, so try several):
     TZ=UTC npx tsx src/lib/chart/analysis/__checks__/tinkoff-tail.check.ts
     TZ=Europe/Moscow npx tsx ...   TZ=America/New_York npx tsx ...   TZ=Asia/Kolkata npx tsx ... */
import {
  applyTinkoffTail,
  bucketBars,
  checkTail,
  mergeTail,
  parseCandle,
  quotation,
  tsToWall,
  wallToTs,
  type CandleRow,
  type MinBar,
} from "../../../tinkoff-candles";
import type { MoexSecurity } from "../../../moex-resolve";

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

/* ── fixtures ── */

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** "2026-10-02 18:05" (Moscow wall clock) -> real UTC ms */
const utcOf = (msk: string) => Date.parse(msk.length === 10 ? `${msk}T00:00:00+03:00` : `${msk.replace(" ", "T")}:00+03:00`);
/** the timestamp /api/klines gives a candle whose ISS `begin` is that string: parsed in the SERVER zone, exactly like route.ts */
const issTs = (msk: string) => new Date(msk.length === 10 ? `${msk} 00:00:00` : `${msk}:00`).getTime();

function wire(b: { t: number; o: number; h: number; l: number; c: number; v: number; done?: boolean }) {
  const q = (x: number) => {
    const neg = x < 0;
    const a = Math.abs(x);
    const units = Math.floor(a + 1e-9);
    const nano = Math.round((a - units) * 1e9);
    return { units: String(neg ? -units : units), nano: neg ? -nano : nano };
  };
  return { open: q(b.o), high: q(b.h), low: q(b.l), close: q(b.c), volume: String(b.v), time: new Date(b.t).toISOString(), isComplete: b.done !== false, candleSource: "CANDLE_SOURCE_EXCHANGE" };
}

/** minute bars [from, to] inclusive (Moscow wall "YYYY-MM-DD HH:MM"), price walks deterministically from `base` */
function minutes(from: string, to: string, base: number, opts: { skip?: [string, string][]; scale?: number; volume?: number } = {}) {
  const out: { t: number; o: number; h: number; l: number; c: number; v: number }[] = [];
  const skip = (opts.skip ?? []).map(([a, b]) => [utcOf(a), utcOf(b)]);
  for (let t = utcOf(from); t <= utcOf(to); t += MIN) {
    if (skip.some(([a, b]) => t >= a && t <= b)) continue;
    const k = Math.round((t - utcOf(from)) / MIN);
    const o = base + Math.round(Math.sin(k / 7) * 100) / 100;
    const c = base + Math.round(Math.sin((k + 1) / 7) * 100) / 100;
    const s = opts.scale ?? 1;
    out.push({ t, o: o * s, h: Math.max(o, c) * s + 0.05 * s, l: Math.min(o, c) * s - 0.05 * s, c: c * s, v: opts.volume ?? 100 + (k % 13) });
  }
  return out;
}
/** ISS 1m rows (volume in units; `lot` converts to lots on the T-Invest side) */
const issRows = (m: ReturnType<typeof minutes>): CandleRow[] =>
  m.map((b) => ({ timestamp: new Date(new Date(b.t + 3 * HOUR).toISOString().slice(0, 19).replace("T", " ")).getTime(), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }));

/* ── mocked T-Invest ── */

interface Req {
  endpoint: string;
  body: any;
}
let requests: Req[] = [];
let NOW = 0;
let candlesByUid: Record<string, ReturnType<typeof minutes>> = {};
let instruments: Record<string, { uid: string; ticker: string; classCode: string; lot: number }> = {};
let mode: "ok" | "429" | "400src" | "500" = "ok";
let lastWindow: [number, number][] = [];

(Date as any).now = () => NOW;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init?: any) => {
  const u = String(url);
  if (!u.startsWith("https://invest-public-api.tinkoff.ru/")) return realFetch(url, init);
  const endpoint = u.split("v1.")[1];
  const body = JSON.parse(init.body);
  requests.push({ endpoint, body });
  const json = (status: number, data: any, headers: Record<string, string> = {}) => new Response(JSON.stringify(data), { status, headers });
  if (endpoint === "InstrumentsService/GetInstrumentBy") {
    const i = instruments[`${body.id}_${body.classCode}`];
    return i ? json(200, { instrument: i }) : json(404, { code: 5, message: "Instrument not found", description: "50002" });
  }
  if (endpoint === "MarketDataService/GetCandles") {
    if (mode === "429") return json(429, { code: 8, message: "rate limit" }, { "x-ratelimit-reset": "12" });
    if (mode === "500") return json(500, { code: 13 });
    if (mode === "400src" && body.candleSourceType) return json(400, { code: 3, message: "unknown field candleSourceType" });
    const from = Date.parse(body.from);
    const to = Date.parse(body.to);
    lastWindow.push([from, to]);
    if (to - from > DAY) return json(400, { code: 3, message: "30014: a period of more than 1 day for 1 minute candles" });
    const all = candlesByUid[body.instrumentId] ?? [];
    const list = all.filter((b) => b.t >= from && b.t < to).map((b) => ({ ...wire({ ...b, done: b.t + MIN <= NOW }) }));
    // an unordered response with a duplicate and garbage rows, like a flaky feed could deliver
    const noisy = list.length > 3 ? [list[2], ...list, list[1], { ...list[0], time: "1970-01-01T00:00:00Z" }, { ...list[0], time: "0001-01-01T00:00:00Z" }, null] : list;
    return json(200, { candles: noisy });
  }
  return json(404, {});
}) as typeof fetch;

function reset() {
  const st = (globalThis as any).__fomoTinkoffCandles;
  st.backoffUntil = 0;
  st.useSourceType = true;
  st.instr.clear();
  st.instrInflight.clear();
  st.stores.clear();
  st.logged.clear();
  requests = [];
  lastWindow = [];
  instruments = {};
  candlesByUid = {};
  mode = "ok";
  process.env.TINKOFF_TOKEN = "test-token-not-real";
}

const sber: MoexSecurity = { secid: "SBER", requested: "SBER", engine: "stock", market: "shares", board: "TQBR", classCode: "TQBR", group: "stock" };
const mxz6: MoexSecurity = { secid: "MXZ6", requested: "MIX", engine: "futures", market: "forts", board: "RFUD", classCode: "SPBFUT", group: "future", auto: true };
const candleReqs = () => requests.filter((r) => r.endpoint === "MarketDataService/GetCandles");

function setup(sec: MoexSecurity, uid: string, lot: number, data: ReturnType<typeof minutes>) {
  instruments[`${sec.secid}_${sec.classCode}`] = { uid, ticker: sec.secid, classCode: sec.classCode, lot };
  candlesByUid[uid] = data;
}

async function main() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  console.log(`server zone: ${tz} (offset ${-new Date().getTimezoneOffset()} min)`);

  /* ── wire format and time basis ── */
  section("time basis and wire format");
  {
    const t = Date.parse("2026-10-02T15:00:00Z"); // 18:00 Moscow
    eq(wallToTs(t + 3 * HOUR), new Date("2026-10-02 18:00:00").getTime(), "wallToTs equals the route's parse of the ISS begin string");
    eq(tsToWall(wallToTs(t + 3 * HOUR)), t + 3 * HOUR, "tsToWall inverts wallToTs");
    eq(quotation({ units: "274", nano: 660000000 }), 274.66, "units/nano 274.66 is exactly the literal");
    eq(quotation({ units: "0", nano: 10000000 }), 0.01, "0.01");
    eq(quotation({ units: "-2", nano: -500000000 }), -2.5, "negative price (futures spread)");
    eq(quotation({ units: "85112" }), 85112, "no nano");
    ok(Number.isNaN(quotation(undefined)), "absent price is NaN");
    const nowMs = Date.parse("2026-10-02T15:10:00Z");
    const done = parseCandle(wire({ t, o: 1, h: 2, l: 0.5, c: 1.5, v: 7 }), 10, nowMs)!;
    eq(done.v, 70, "volume in lots x lot size = units");
    ok(done.done, "isComplete true");
    ok(!parseCandle(wire({ t: nowMs - 20_000, o: 1, h: 1, l: 1, c: 1, v: 1, done: false }), 1, nowMs)!.done, "the forming bar is not complete");
    ok(parseCandle({ ...wire({ t, o: 1, h: 1, l: 1, c: 1, v: 1 }), time: "1970-01-01T00:00:00Z" }, 1) === null, "epoch time dropped");
    ok(parseCandle({ ...wire({ t, o: 1, h: 1, l: 1, c: 1, v: 1 }), time: "2018-05-01T10:00:00Z" }, 1) === null, "pre-2019 time dropped");
    ok(parseCandle({ ...wire({ t, o: 1, h: 1, l: 1, c: 1, v: 1 }), time: "not a time" }, 1) === null, "garbage time dropped");
    ok(parseCandle({ ...wire({ t, o: 1, h: 1, l: 1, c: 1, v: 1 }), close: undefined }, 1) === null, "no close dropped");
    const noOpen = parseCandle({ ...wire({ t, o: 1, h: 1, l: 1, c: 1, v: 1 }), open: undefined }, 1)!;
    ok(Number.isNaN(noOpen.o), "a missing open parses as NaN (repaired by cleanCandle in bucketBars)");
  }

  /* ── pure merge, 1m ── */
  section("merge 1m: ISS delayed 15 min, forming bar, overlap");
  {
    NOW = utcOf("2026-10-02 10:20") + 30_000;
    const all = minutes("2026-10-02 09:50", "2026-10-02 10:20", 270);
    const iss = issRows(all.filter((b) => b.t <= utcOf("2026-10-02 10:05")));
    const bars: MinBar[] = all.map((b) => ({ ...b, done: b.t + MIN <= NOW }));
    eq(bars[bars.length - 1].done, false, "last Tinkoff bar is forming");
    const buckets = bucketBars(bars, 1, utcOf("2026-10-02 09:00"));
    eq(buckets.length, 31, "31 minute buckets");
    eq(checkTail(iss, buckets, 1), null, "gate passes on identical overlap");
    const m = mergeTail(iss, buckets, 1);
    eq(m.rows.length, 31, "ISS 16 bars + 15 new");
    eq(m.added, 15, "15 appended");
    eq(m.folded, 0, "an identical last bar needs no fold");
    // ISS saw only part of its last minute: Tinkoff's complete bar extends high / low / close, the ISS open stays
    const partial = iss.map((r, i) => (i === iss.length - 1 ? { ...r, close: r.close - 0.04, low: r.low + 0.02, high: r.high - 0.02, volume: r.volume - 5 } : r));
    const mp = mergeTail(partial, buckets, 1);
    eq(mp.folded, 1, "the last ISS bar is completed from Tinkoff's");
    eq(mp.rows[iss.length - 1], { ...iss[iss.length - 1] }, "…and equals the complete bar");
    eq(m.rows.slice(0, 15), iss.slice(0, 15), "ISS history untouched");
    eq(m.rows[m.rows.length - 1].timestamp, issTs("2026-10-02 10:20"), "tail reaches the forming minute");
    eq(m.rows.map((r) => r.timestamp), [...new Set(m.rows.map((r) => r.timestamp))].sort((a, b) => a - b), "ascending, no duplicates");
    // forming bar with the same time as the last ISS bar adds nothing
    const frozen = bars.map((b) => (b.t === utcOf("2026-10-02 10:05") ? { ...b, done: false, c: b.c + 0.2 } : b)).filter((b) => b.t <= utcOf("2026-10-02 10:05"));
    const m2 = mergeTail(iss, bucketBars(frozen, 1, 0), 1);
    eq(m2.rows[m2.rows.length - 1], iss[iss.length - 1], "an incomplete bar of the last ISS minute is ignored");
  }

  /* ── orchestrated: SBER ── */
  section("applyTinkoffTail 1m, caching, chunking");
  {
    reset();
    NOW = utcOf("2026-10-02 10:20") + 30_000;
    const all = minutes("2026-10-01 18:00", "2026-10-02 10:20", 270, { skip: [["2026-10-01 18:51", "2026-10-02 06:49"]] });
    setup(sber, "uid-sber", 1, all);
    const iss = issRows(all.filter((b) => b.t <= utcOf("2026-10-02 10:05")));
    const r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "tinkoff", "tail = tinkoff");
    eq(r.reason, "ok", "reason ok");
    eq(r.rows.length, iss.length + 15, "15 minutes added");
    eq(requests.filter((q) => q.endpoint.includes("GetInstrumentBy")).length, 1, "instrument resolved once");
    ok(lastWindow.every(([a, b]) => b - a <= DAY), "every 1m request spans at most one day");
    ok(candleReqs().every((q) => q.body.interval === "CANDLE_INTERVAL_1_MIN" && q.body.instrumentId === "uid-sber"), "1m interval, instrument by uid");
    ok(r.rows.every((x, i, a) => i === 0 || x.timestamp > a[i - 1].timestamp), "ascending, unique despite a duplicate / unordered / garbage response");
    ok(r.rows.every((x) => x.low <= Math.min(x.open, x.close) && x.high >= Math.max(x.open, x.close) && x.open > 0), "all bars drawable");

    const n1 = candleReqs().length;
    NOW += 1000;
    const r2 = await applyTinkoffTail(sber, 1, iss);
    eq(candleReqs().length, n1, "a second client within 2 s costs no upstream request");
    eq(r2.rows.length, r.rows.length, "same answer");
    // concurrent clients share one refresh
    NOW += 5000;
    const before = candleReqs().length;
    await Promise.all([applyTinkoffTail(sber, 1, iss), applyTinkoffTail(sber, 1, iss), applyTinkoffTail(sber, 1, iss)]);
    eq(candleReqs().length - before, 1, "3 concurrent clients -> 1 incremental request");
    const w = lastWindow[lastWindow.length - 1];
    ok(w[1] - w[0] <= 11 * MIN + 10_000, "the refresh is incremental (about the last 10 minutes), not the whole day");
    // a new minute arrives
    const grown = minutes("2026-10-01 18:00", "2026-10-02 10:22", 270, { skip: [["2026-10-01 18:51", "2026-10-02 06:49"]] });
    candlesByUid["uid-sber"] = grown;
    NOW = utcOf("2026-10-02 10:22") + 20_000;
    const r3 = await applyTinkoffTail(sber, 1, iss);
    eq(r3.rows[r3.rows.length - 1].timestamp, issTs("2026-10-02 10:22"), "the next refresh brings the new minute");
    // 4-day look back for a Monday morning is still chunked per day
    reset();
    NOW = utcOf("2026-10-05 07:10");
    setup(sber, "uid-sber", 1, minutes("2026-10-02 18:00", "2026-10-02 18:50", 270));
    const issFri = issRows(minutes("2026-10-02 18:00", "2026-10-02 18:50", 270));
    const rm = await applyTinkoffTail(sber, 24, [{ timestamp: issTs("2026-10-02"), open: 270, high: 271, low: 269, close: 270.5, volume: 1 }]);
    ok(lastWindow.length >= 4 && lastWindow.length <= 6, `daily look back = ${lastWindow.length} one-day chunks`);
    ok(lastWindow.every(([a, b]) => b - a <= DAY), "…each at most one day");
    void rm;
    void issFri;
  }

  section("lots: volume in units, wrong mapping caught by the gate");
  {
    reset();
    NOW = utcOf("2026-10-02 10:20") + 30_000;
    const all = minutes("2026-10-02 09:50", "2026-10-02 10:20", 270, { volume: 7 });
    setup(sber, "uid-sber", 10, all); // lot 10
    const iss = issRows(all.filter((b) => b.t <= utcOf("2026-10-02 10:05")).map((b) => ({ ...b, v: 70 })));
    const r = await applyTinkoffTail(sber, 1, iss);
    eq(r.rows[r.rows.length - 1].volume, 70, "7 lots x lot 10 = 70 units, as ISS counts");
    // the same tail, but another price scale (a wrong instrument, or points vs roubles)
    reset();
    const wrong = minutes("2026-10-02 09:50", "2026-10-02 10:20", 270, { scale: 2 });
    setup(sber, "uid-sber", 1, wrong);
    const r2 = await applyTinkoffTail(sber, 1, iss);
    eq(r2.tail, "iss", "wrong prices -> discarded");
    ok(r2.reason.startsWith("gate"), `reason is the gate: ${r2.reason}`);
    eq(r2.rows, iss, "the ISS rows are returned untouched");
    // no overlap at all and a jump: still refused
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-10-02 10:20", "2026-10-02 10:30", 400));
    NOW = utcOf("2026-10-02 10:31");
    const r3 = await applyTinkoffTail(sber, 1, iss);
    eq(r3.tail, "iss", "no overlap + 40% jump -> discarded");
    // no overlap but a plausible continuation (an overnight gap of 1%) is accepted
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-10-02 10:07", "2026-10-02 10:30", iss[iss.length - 1].close * 1.01));
    const r4 = await applyTinkoffTail(sber, 1, iss);
    eq(r4.tail, "tinkoff", "no overlap, small gap -> accepted");
  }

  section("session boundaries (main session end, evening session)");
  {
    reset();
    NOW = utcOf("2026-10-02 19:12") + 20_000;
    const all = minutes("2026-10-02 18:30", "2026-10-02 19:12", 270, { skip: [["2026-10-02 18:59", "2026-10-02 19:04"]] });
    setup(sber, "uid-sber", 1, all);
    const iss = issRows(all.filter((b) => b.t <= utcOf("2026-10-02 18:58")));
    const r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "tinkoff", "tail across the clearing break");
    const ts = r.rows.map((x) => x.timestamp);
    ok(!ts.some((t) => t >= issTs("2026-10-02 18:59") && t <= issTs("2026-10-02 19:04")), "no invented bars inside the break");
    ok(ts.includes(issTs("2026-10-02 19:05")) && ts.includes(issTs("2026-10-02 19:12")), "evening session bars present");
    // hourly: ISS knows 18:00 (and 17:00), Tinkoff gives the 19:00 hour (evening session) and the forming one
    reset();
    NOW = utcOf("2026-10-02 20:20");
    const m = minutes("2026-10-02 15:00", "2026-10-02 20:20", 270, { skip: [["2026-10-02 18:59", "2026-10-02 19:04"]] });
    setup(sber, "uid-sber", 1, m);
    const hour = (h: number) => {
      const part = m.filter((b) => b.t >= utcOf(`2026-10-02 ${h}:00`) && b.t < utcOf(`2026-10-02 ${h + 1}:00`));
      return { timestamp: issTs(`2026-10-02 ${h}:00`), open: part[0].o, high: Math.max(...part.map((b) => b.h)), low: Math.min(...part.map((b) => b.l)), close: part[part.length - 1].c, volume: part.reduce((s, b) => s + b.v, 0) };
    };
    const issH = [hour(16), hour(17), hour(18)];
    const rh = await applyTinkoffTail(sber, 60, issH);
    eq(rh.tail, "tinkoff", "hourly tail");
    eq(rh.rows.map((x) => x.timestamp), [16, 17, 18, 19, 20].map((h) => issTs(`2026-10-02 ${h}:00`)), "hours 19:00 (evening) and the forming 20:00 appended");
    eq(rh.rows[3], hour(19), "the 19:00 bucket is the aggregate of its minutes (with the break)");
    eq(rh.rows[2], issH[2], "the 18:00 ISS hour is complete and unchanged (fold keeps it)");
    // a hole at the start of coverage must not produce a partial first bucket as 'new'
    const partial = bucketBars(m.map((b) => ({ ...b, done: true })).filter((b) => b.t >= utcOf("2026-10-02 17:30")), 60, utcOf("2026-10-02 17:30"));
    ok(partial[0].covered === false && partial[1].covered === true, "a bucket cut by the start of the data is marked not covered");
  }

  section("exact futures contract, weekend, daily / weekly");
  {
    reset();
    NOW = utcOf("2026-10-03 14:20");
    // Saturday (weekend session of a futures contract): ISS files it under Monday 10-05
    const fut = minutes("2026-10-02 19:05", "2026-10-03 14:19", 8500, {});
    setup(mxz6, "uid-mxz6", 1, fut);
    const issD: CandleRow[] = [
      { timestamp: issTs("2026-10-01"), open: 8400, high: 8600, low: 8350, close: 8450, volume: 1000 },
      { timestamp: issTs("2026-10-02"), open: 8450, high: 8620, low: 8400, close: fut[0].o, volume: 1200 },
    ];
    const rd = await applyTinkoffTail(mxz6, 24, issD);
    eq(rd.tail, "tinkoff", "weekend tail on a futures contract");
    eq(rd.rows.length, 3, "Friday evening folded into Friday, Saturday session -> Monday's bar");
    ok(rd.rows.some((x) => x.timestamp === issTs("2026-10-05")), "Saturday session filed under Monday 2026-10-05 like ISS does for FORTS");
    eq(rd.rows[1].open, 8450, "ISS open of the folded day is kept");
    // the same instrument as shares: the Saturday keeps its own date
    const b = bucketBars(fut.map((x) => ({ ...x, done: true })), "D", 0, { futuresDays: false });
    ok(b.some((x) => x.timestamp === issTs("2026-10-03")), "shares: Saturday is its own daily bar");

    // weekly: ISS weekly bar of this week (Mon 09-28) exists; the new data folds into it, the open stays
    reset();
    NOW = utcOf("2026-10-02 12:00");
    const wk = minutes("2026-09-29 10:00", "2026-10-02 11:59", 270);
    setup(sber, "uid-sber", 1, wk);
    const issW: CandleRow[] = [
      { timestamp: issTs("2026-09-21"), open: 260, high: 275, low: 255, close: 268, volume: 9 },
      { timestamp: issTs("2026-09-28"), open: 268, high: 272, low: 266, close: 270, volume: 50_000_000 },
    ];
    const rw = await applyTinkoffTail(sber, 7, issW);
    eq(rw.tail, "tinkoff", "weekly fold");
    eq(rw.rows.length, 2, "no new week");
    eq(rw.rows[1].open, 268, "weekly open kept from ISS");
    ok(rw.rows[1].high >= 272 && rw.rows[1].low <= 266, "range is the union");
    eq(rw.rows[1].close, wk[wk.length - 1].c, "close = latest Tinkoff close");
    eq(rw.rows[1].volume, 50_000_000, "volume = ISS's (a partial week of Tinkoff data does not shrink it)");

    // Monday morning: ISS has no bar for the new day yet, Tinkoff does -> appended (covered back to Saturday 00:00)
    reset();
    NOW = utcOf("2026-10-05 07:30");
    const mon = minutes("2026-10-02 18:00", "2026-10-02 18:50", 270).concat(minutes("2026-10-05 06:50", "2026-10-05 07:29", 270.4));
    setup(sber, "uid-sber", 1, mon);
    const issFri = [{ timestamp: issTs("2026-10-02"), open: 270, high: 275, low: 268, close: minutes("2026-10-02 18:50", "2026-10-02 18:50", 270)[0].o, volume: 7 }];
    const rmon = await applyTinkoffTail(sber, 24, issFri);
    eq(rmon.tail, "tinkoff", "Monday: ISS has no daily bar yet");
    eq(rmon.rows.map((x) => x.timestamp), [issTs("2026-10-02"), issTs("2026-10-05")], "today's bar appended");

    // weekend, nothing new
    reset();
    NOW = utcOf("2026-10-04 12:00");
    const fri = minutes("2026-10-02 18:00", "2026-10-02 18:50", 270);
    setup(sber, "uid-sber", 1, fri);
    const issFri1m = issRows(fri);
    const rwk = await applyTinkoffTail(sber, 1, issFri1m);
    eq(rwk.tail, "iss", "weekend without trading: ISS only");
    eq(rwk.reason, "no-new-data", "…reason no-new-data");
    eq(rwk.rows, issFri1m, "…rows unchanged");
  }

  section("fail soft");
  {
    const iss = issRows(minutes("2026-10-02 09:50", "2026-10-02 10:05", 270));
    NOW = utcOf("2026-10-02 10:20");
    // no token
    reset();
    delete process.env.TINKOFF_TOKEN;
    let r = await applyTinkoffTail(sber, 1, iss);
    eq([r.tail, r.reason, requests.length], ["iss", "no-token", 0], "no token: ISS only, no requests");
    // unknown instrument (404), cached as a miss
    reset();
    r = await applyTinkoffTail(sber, 1, iss);
    eq([r.tail, r.reason], ["iss", "unknown-instrument"], "unknown instrument");
    await applyTinkoffTail(sber, 1, iss);
    eq(requests.length, 1, "the miss is cached (one lookup, no candle request)");
    // ticker mismatch in the answer
    reset();
    instruments["SBER_TQBR"] = { uid: "u", ticker: "SBERP", classCode: "TQBR", lot: 1 };
    r = await applyTinkoffTail(sber, 1, iss);
    eq(r.reason, "unknown-instrument", "an instrument with another ticker is not used");
    delete instruments["SBER_TQBR"];
    // 429: back off, then recover
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-10-02 09:50", "2026-10-02 10:20", 270));
    mode = "429";
    r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "iss", "429 -> ISS only");
    const n = requests.length;
    NOW += 5000;
    r = await applyTinkoffTail(sber, 1, iss);
    eq([r.tail, r.reason, requests.length], ["iss", "backoff", n], "inside the back-off window nothing is sent upstream");
    NOW += 12_000;
    mode = "ok";
    r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "tinkoff", "after the back-off the tail is back");
    // 5xx
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-10-02 09:50", "2026-10-02 10:20", 270));
    mode = "500";
    r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "iss", "HTTP 500 -> ISS only");
    // the optional candleSourceType rejected: retried without it, remembered
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-10-02 09:50", "2026-10-02 10:20", 270));
    mode = "400src";
    r = await applyTinkoffTail(sber, 1, iss);
    eq(r.tail, "tinkoff", "candleSourceType rejected -> retried without");
    ok(candleReqs().some((q) => !("candleSourceType" in q.body)), "retry has no candleSourceType");
    // empty / unsupported
    reset();
    eq((await applyTinkoffTail(sber, 1, [])).reason, "iss-empty", "empty ISS -> nothing to extend");
    eq((await applyTinkoffTail(sber, 5, iss)).reason, "unsupported-interval", "unsupported interval");
    // ISS older than the look-back
    reset();
    setup(sber, "uid-sber", 1, minutes("2026-09-20 09:50", "2026-10-02 10:20", 270));
    NOW = utcOf("2026-10-10 12:00");
    eq((await applyTinkoffTail(sber, 1, iss)).reason, "stale-iss", "ISS stale beyond the look-back: not stitched across a gap");
  }

  console.log(`\n${checks - failures}/${checks} checks passed${failures ? `, ${failures} FAILED` : ""}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
