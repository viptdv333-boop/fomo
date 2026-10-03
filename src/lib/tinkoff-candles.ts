/**
 * Real-time tail of MOEX candles from T-Invest (Tinkoff Invest API, MarketDataService/GetCandles).
 *
 * The free MOEX ISS candles used by /api/klines are ~15 minutes delayed while the quotes come from T-Invest in real time, so the last
 * minutes of the chart were missing. ISS stays the authoritative, complete history; this module only adds what ISS does not have yet:
 *
 *   1. 1-minute candles of the last few days are loaded from T-Invest (one request per <= 1 day window, cached 2 s per instrument and
 *      refreshed incrementally, so any number of clients polling costs the upstream the same handful of calls);
 *   2. they are bucketed to the native ISS interval of the request (1m, 10m, 60m, D, W, M) with the SAME time basis ISS rows have
 *      (Moscow wall clock parsed in the server zone: see `wallToTs`), so the result drops into the existing pipeline;
 *   3. `mergeTail`: ISS rows up to its last bar are kept; the last ISS bar is folded with the T-Invest bar of the same time
 *      (open stays ISS's, high / low are the union, close is the fresher one), newer T-Invest buckets are appended;
 *   4. `checkTail`: the overlap of both feeds is compared first, a mismatch (wrong instrument mapping, other price scale) discards the
 *      whole tail, so a bad mapping can never corrupt the chart.
 *
 * Everything fails soft: no token, API error, unknown instrument, 429 (back off) -> the unchanged ISS rows, `tail: "iss"` and a reason.
 * No Next / DB imports. Never logs or returns the token.
 */

import { cleanCandle } from "./chart/candles";
import type { MoexSecurity } from "./moex-resolve";

export interface CandleRow {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TailSource = "tinkoff" | "algopack" | "iss";
export type Level = 1 | 10 | 60 | "D" | "W" | "M";

export interface TailResult {
  rows: CandleRow[];
  tail: TailSource;
  /** why the tail is (not) there: ok | no-token | backoff | unknown-instrument | iss-empty | no-new-data | gate: ... | error: ... */
  reason: string;
  added?: number;
  folded?: number;
}

/** A 1-minute T-Invest candle, UTC milliseconds, volume already in units (lots x lot size) like ISS. */
export interface MinBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  done: boolean;
}

/** A T-Invest bucket in the native interval of the request. `timestamp` is in the ISS basis. */
export interface TailBucket extends CandleRow {
  /** every minute bar in it is complete */
  done: boolean;
  /** T-Invest data covers the whole bucket from its start (so open / volume can be trusted and the bucket can be appended) */
  covered: boolean;
}

const API = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const MSK_MS = 3 * 3_600_000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** how far back 1m candles are loaded (covers a weekend + the Friday evening session, a Monday morning, a 3-day holiday) */
const MAX_BACK_MS = 4 * DAY;
/** the API serves at most one day of 1-minute candles per request */
const CHUNK_MS = DAY - MIN;
const FRESH_TTL_MS = 2000;
const STALE_OK_MS = 60_000;
/** T-Invest launched in 2019: an earlier candle time ("0001-01-01", "1970-...") is an empty / garbage value */
const MIN_VALID_TS = Date.UTC(2019, 0, 1);
/** overlapping bars of the two feeds may differ by this much (median) before the tail is discarded */
const OVERLAP_TOL = 0.015;
/** no overlap to compare: the tail may start this far from the last ISS close (an overnight gap) */
const JUMP_TOL = 0.08;
const MAX_PAR = 4;
const REQUEST_TIMEOUT_MS = 7000;

/* ── shared state (survives dev hot reload) ── */

interface Store {
  uid: string;
  bars: Map<number, MinBar>;
  /** covered range [from, to] in UTC ms; to === 0: nothing loaded yet */
  from: number;
  to: number;
  /** when `to` was last refreshed successfully */
  at: number;
  lastUse: number;
  busy: Promise<void> | null;
}
interface Instr {
  uid: string;
  lot: number;
}
interface State {
  backoffUntil: number;
  useSourceType: boolean;
  instr: Map<string, { at: number; v: Instr | null }>;
  instrInflight: Map<string, Promise<Instr | null>>;
  stores: Map<string, Store>;
  logged: Map<string, { key: string; at: number }>;
}
const G = globalThis as unknown as { __fomoTinkoffCandles?: State };
const S: State = (G.__fomoTinkoffCandles ??= {
  backoffUntil: 0,
  useSourceType: true,
  instr: new Map(),
  instrInflight: new Map(),
  stores: new Map(),
  logged: new Map(),
});

/* ── time basis ──
   ISS candle times are Moscow wall-clock strings that /api/klines parses with `new Date("YYYY-MM-DD HH:MM:SS")`, i.e. in the SERVER zone.
   The client undoes that with serverTzOffsetMin. The tail must produce exactly the same numbers, so it goes through the same parse. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Moscow wall clock (as UTC ms, "wall-as-UTC") -> the timestamp /api/klines gives a candle with that ISS `begin` string. */
export function wallToTs(wallMs: number): number {
  const d = new Date(wallMs);
  return new Date(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`).getTime();
}
/** Inverse of wallToTs. */
export function tsToWall(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}

/* ── T-Invest wire format ── */

/** {units: "274", nano: 660000000} -> 274.66 (built from the decimal string, so it equals the literal 274.66 exactly). NaN when absent. */
export function quotation(q: unknown): number {
  if (!q || typeof q !== "object") return NaN;
  const { units, nano } = q as { units?: string | number; nano?: number };
  const u = String(units ?? "0").trim();
  const n = Number(nano ?? 0);
  if (!/^-?\d+$/.test(u) || !Number.isFinite(n)) return NaN;
  const neg = u.startsWith("-") || n < 0;
  const abs = Number(`${u.replace("-", "")}.${String(Math.abs(Math.trunc(n))).padStart(9, "0")}`);
  return neg ? -abs : abs;
}

/** One candle of the GetCandles response -> MinBar (null for garbage). `lot` converts lots to units, the ISS volume unit. */
export function parseCandle(raw: any, lot: number, nowMs = Date.now()): MinBar | null {
  if (!raw || typeof raw !== "object") return null;
  const t = Date.parse(raw.time);
  if (!Number.isFinite(t) || t < MIN_VALID_TS) return null;
  const c = quotation(raw.close);
  if (!(Number.isFinite(c) && c !== 0)) return null;
  const vol = Number(raw.volume ?? 0);
  return {
    t,
    o: quotation(raw.open),
    h: quotation(raw.high),
    l: quotation(raw.low),
    c,
    v: (Number.isFinite(vol) && vol > 0 ? vol : 0) * lot,
    done: raw.isComplete === true || (raw.isComplete === undefined && t + MIN <= nowMs),
  };
}

/* ── request layer ── */

let active = 0;
const waiters: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_PAR) await new Promise<void>((r) => waiters.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiters.shift()?.();
  }
}

function backoff(ms: number, why: string) {
  const until = Date.now() + ms;
  if (until > S.backoffUntil + 1000) console.warn(`[tinkoff-tail] backing off ${Math.round(ms / 1000)}s: ${why}`);
  S.backoffUntil = Math.max(S.backoffUntil, until);
}

async function call(endpoint: string, body: object): Promise<{ status: number; data: any } | null> {
  const token = process.env.TINKOFF_TOKEN;
  if (!token || Date.now() < S.backoffUntil) return null;
  try {
    const res = await slot(() =>
      fetch(`${API}.${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    );
    if (res.status === 429) {
      const reset = Number(res.headers.get("x-ratelimit-reset"));
      backoff(Math.min(120, Math.max(3, Number.isFinite(reset) && reset > 0 ? reset : 20)) * 1000, "429 rate limit");
      return null;
    }
    if (res.status === 401 || res.status === 403) {
      backoff(10 * 60_000, `HTTP ${res.status} (token rejected)`);
      return null;
    }
    if (res.status >= 500) {
      backoff(5000, `HTTP ${res.status}`);
      return null;
    }
    let data: any = null;
    try {
      data = await res.json();
    } catch {}
    return { status: res.status, data };
  } catch (e) {
    backoff(3000, `network: ${(e as Error)?.name ?? "error"}`);
    return null;
  }
}

/** Ticker + class code -> T-Invest instrument (uid, lot). Cached 6 h, a miss 10 min; the ticker / class code of the answer must match. */
async function resolveInstrument(sec: Pick<MoexSecurity, "secid" | "classCode">): Promise<Instr | null> {
  const key = `${sec.secid}_${sec.classCode}`;
  const hit = S.instr.get(key);
  if (hit && Date.now() - hit.at < (hit.v ? 6 * HOUR : 10 * MIN)) return hit.v;
  let p = S.instrInflight.get(key);
  if (!p) {
    p = (async () => {
      const r = await call("InstrumentsService/GetInstrumentBy", { idType: "INSTRUMENT_ID_TYPE_TICKER", classCode: sec.classCode, id: sec.secid });
      if (!r) return hit?.v ?? null; // transient: not cached
      const i = r.status === 200 ? r.data?.instrument : null;
      const ok =
        !!i?.uid &&
        String(i.ticker ?? "").toUpperCase() === sec.secid.toUpperCase() &&
        (!i.classCode || String(i.classCode).toUpperCase() === sec.classCode.toUpperCase());
      const v: Instr | null = ok ? { uid: String(i.uid), lot: Number(i.lot) > 0 ? Number(i.lot) : 1 } : null;
      if (S.instr.size > 3000) S.instr.clear();
      S.instr.set(key, { at: Date.now(), v });
      return v;
    })().finally(() => S.instrInflight.delete(key));
    S.instrInflight.set(key, p);
  }
  return p;
}

/** 1-minute candles of [from, to] (<= 1 day). null = the request failed. */
async function fetchChunk(instr: Instr, from: number, to: number): Promise<MinBar[] | null> {
  const body: Record<string, unknown> = {
    instrumentId: instr.uid,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    interval: "CANDLE_INTERVAL_1_MIN",
  };
  if (S.useSourceType) body.candleSourceType = "CANDLE_SOURCE_EXCHANGE";
  let r = await call("MarketDataService/GetCandles", body);
  if (r && r.status === 400 && S.useSourceType) {
    // the optional field was not accepted: retry without it and remember
    delete body.candleSourceType;
    const r2 = await call("MarketDataService/GetCandles", body);
    if (r2 && r2.status === 200) S.useSourceType = false;
    r = r2;
  }
  if (!r || r.status !== 200 || !Array.isArray(r.data?.candles)) return null;
  const now = Date.now();
  const out: MinBar[] = [];
  for (const raw of r.data.candles) {
    const b = parseCandle(raw, instr.lot, now);
    if (b) out.push(b);
  }
  return out;
}

async function loadRange(st: Store, instr: Instr, from: number, to: number): Promise<boolean> {
  const jobs: Promise<MinBar[] | null>[] = [];
  for (let cursor = to; cursor > from; ) {
    const cf = Math.max(from, cursor - CHUNK_MS);
    jobs.push(fetchChunk(instr, cf, cursor));
    cursor = cf;
  }
  const res = await Promise.all(jobs);
  let ok = true;
  for (const bars of res) {
    if (!bars) {
      ok = false;
      continue;
    }
    for (const b of bars) st.bars.set(b.t, b);
  }
  return ok;
}

async function update(st: Store, instr: Instr, since: number, now: number): Promise<void> {
  if (st.to === 0) {
    if (await loadRange(st, instr, since, now)) {
      st.from = since;
      st.to = now;
      st.at = now;
    }
    return;
  }
  const needOlder = since < st.from;
  const needFresh = now - st.at >= FRESH_TTL_MS;
  const [olderOk, freshOk] = await Promise.all([
    needOlder ? loadRange(st, instr, since, st.from) : Promise.resolve(true),
    // the last minutes are re-read: the forming bar changes and a bar can arrive late
    needFresh ? loadRange(st, instr, Math.max(since, st.to - 10 * MIN), now) : Promise.resolve(true),
  ]);
  if (needOlder && olderOk) st.from = since;
  if (needFresh && freshOk) {
    st.to = now;
    st.at = now;
  }
  const cut = now - MAX_BACK_MS - DAY;
  for (const k of st.bars.keys()) if (k < cut) st.bars.delete(k);
}

/** The 1m store of an instrument, covering at least [since, now - 2 s]; null when it could not be loaded or is stale. */
async function ensureMinutes(instr: Instr, since: number): Promise<Store | null> {
  const now = Date.now();
  since = Math.max(since, now - MAX_BACK_MS);
  let st = S.stores.get(instr.uid);
  if (!st) {
    // bounded memory: instruments nobody has asked for lately go first, then the least recently used
    for (const [k, v] of S.stores) if (now - v.lastUse > 20 * MIN && !v.busy) S.stores.delete(k);
    while (S.stores.size >= 150) {
      let oldest: string | null = null;
      for (const [k, v] of S.stores) if (!oldest || v.lastUse < S.stores.get(oldest)!.lastUse) oldest = k;
      if (!oldest) break;
      S.stores.delete(oldest);
    }
    st = { uid: instr.uid, bars: new Map(), from: 0, to: 0, at: 0, lastUse: now, busy: null };
    S.stores.set(instr.uid, st);
  }
  st.lastUse = now;
  for (let guard = 0; st.busy && guard < 5; guard++) await st.busy.catch(() => {});
  const needOlder = st.to !== 0 && since < st.from;
  if (st.to === 0 || needOlder || now - st.at >= FRESH_TTL_MS) {
    const store = st;
    const job = update(store, instr, since, now).finally(() => {
      if (store.busy === job) store.busy = null;
    });
    store.busy = job;
    await job.catch(() => {});
  }
  if (st.to === 0 || Date.now() - st.at > STALE_OK_MS) return null;
  return st;
}

/* ── bucketing ── */

export function levelOf(moexInterval: number): Level | null {
  switch (moexInterval) {
    case 1: return 1;
    case 10: return 10;
    case 60: return 60;
    case 24: return "D";
    case 7: return "W";
    case 31: return "M";
    default: return null;
  }
}

const dow = (dayMs: number) => new Date(dayMs).getUTCDay(); // 0 = Sunday

/**
 * 1-minute bars (ascending) -> buckets of the native ISS interval.
 * `futuresDays`: ISS files the weekend sessions of FORTS contracts under the next Monday's daily bar (shares keep their own Saturday).
 * Weekly bars begin on Monday and monthly on the 1st; Saturday / Sunday belong to the week / month they fall in.
 */
export function bucketBars(bars: MinBar[], level: Level, coveredFromUtc: number, opts: { futuresDays?: boolean } = {}): TailBucket[] {
  const out: TailBucket[] = [];
  let cur: TailBucket | null = null;
  let curKey = NaN;
  for (const b of bars) {
    const wall = b.t + MSK_MS;
    const day = Math.floor(wall / DAY) * DAY;
    let key: number; // wall ms of the bucket start
    let cov: number; // earliest wall ms that can belong to the bucket
    if (level === 1) cov = key = Math.floor(wall / MIN) * MIN;
    else if (level === 10) cov = key = Math.floor(wall / (10 * MIN)) * (10 * MIN);
    else if (level === 60) cov = key = Math.floor(wall / HOUR) * HOUR;
    else if (level === "D") {
      const d = dow(day);
      key = opts.futuresDays && d === 6 ? day + 2 * DAY : opts.futuresDays && d === 0 ? day + DAY : day;
      cov = opts.futuresDays && dow(key) === 1 ? key - 2 * DAY : key;
    } else if (level === "W") {
      key = day - ((dow(day) + 6) % 7) * DAY;
      cov = key;
    } else {
      const d = new Date(day);
      cov = key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    }
    if (!cur || key !== curKey) {
      const raw = { t: wallToTs(key), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v };
      const prev = out.length ? out[out.length - 1].close : undefined;
      const clean = cleanCandle(raw, prev);
      if (!clean) {
        cur = null;
        curKey = NaN;
        continue;
      }
      cur = { timestamp: clean.t, open: clean.o, high: clean.h, low: clean.l, close: clean.c, volume: clean.v, done: b.done, covered: cov - MSK_MS >= coveredFromUtc };
      out.push(cur);
      curKey = key;
    } else {
      const c = cleanCandle({ t: 0, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }, cur.close);
      if (!c) continue;
      cur.high = Math.max(cur.high, c.h);
      cur.low = Math.min(cur.low, c.l);
      cur.close = c.c;
      cur.volume += c.v;
      cur.done = cur.done && b.done;
    }
  }
  return out;
}

/* ── sanity check and merge ── */

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Do the two feeds describe the same instrument? null = yes, otherwise the reason to discard the tail.
 * Bars of the same time are compared (1m: open and close of complete bars; coarser buckets: the open, which does not depend on the
 * 15 minute delay of ISS). Without any overlap the tail must at least start near the last ISS close.
 */
export function checkTail(iss: CandleRow[], buckets: TailBucket[], level: Level): string | null {
  if (iss.length === 0) return "iss empty";
  const last = iss[iss.length - 1];
  const byTs = new Map<number, CandleRow>();
  for (let i = Math.max(0, iss.length - 60); i < iss.length; i++) byTs.set(iss[i].timestamp, iss[i]);
  const diffs: number[] = [];
  for (const b of buckets) {
    const i = byTs.get(b.timestamp);
    if (!i) continue;
    if (level === 1) {
      if (b.done) diffs.push(Math.max(rel(b.open, i.open), rel(b.close, i.close)));
    } else if (b.covered) diffs.push(rel(b.open, i.open));
  }
  const recent = diffs.slice(-20);
  if (recent.length > 0) {
    const med = median(recent);
    if (med > OVERLAP_TOL) return `overlap mismatch: median ${(med * 100).toFixed(2)}% over ${recent.length} bars`;
  } else {
    const first = buckets.find((b) => b.timestamp > last.timestamp);
    if (first && rel(first.open, last.close) > JUMP_TOL) return `no overlap, tail starts ${(rel(first.open, last.close) * 100).toFixed(1)}% from the last ISS close`;
    const same = buckets.find((b) => b.timestamp === last.timestamp);
    if (same && (same.close < last.low * (1 - JUMP_TOL) || same.close > last.high * (1 + JUMP_TOL))) return "last bar close outside the ISS range";
  }
  for (const b of buckets) {
    if (b.timestamp >= last.timestamp && rel(b.close, last.close) > 0.25) return `tail close ${(rel(b.close, last.close) * 100).toFixed(0)}% from the last ISS close`;
  }
  return null;
}

/** ISS rows + T-Invest buckets -> merged rows (ascending). Call `checkTail` first. */
export function mergeTail(iss: CandleRow[], buckets: TailBucket[], level: Level): { rows: CandleRow[]; added: number; folded: number } {
  const rows = iss.slice();
  const last = iss[iss.length - 1];
  let added = 0;
  let folded = 0;
  if (!last) return { rows, added, folded };
  for (const b of buckets) {
    if (b.timestamp < last.timestamp) continue;
    if (b.timestamp === last.timestamp) {
      // the last ISS bar is complete as far as ISS knows: a forming 1m bar of the same minute adds nothing
      if (level === 1 && !b.done) continue;
      const f: CandleRow = {
        timestamp: last.timestamp,
        open: last.open,
        high: Math.max(last.high, b.high),
        low: Math.min(last.low, b.low),
        close: b.close,
        volume: Math.max(last.volume, b.volume),
      };
      // a bar T-Invest only confirms (market closed, same data) is not "new data"
      if (f.high !== last.high || f.low !== last.low || f.close !== last.close || f.volume !== last.volume) {
        rows[rows.length - 1] = f;
        folded++;
      }
    } else if (b.covered) {
      rows.push({ timestamp: b.timestamp, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
      added++;
    }
  }
  return { rows, added, folded };
}

/* ── diagnostics ── */

function note(sec: Pick<MoexSecurity, "secid" | "classCode">, level: Level | null, r: Pick<TailResult, "tail" | "reason" | "added" | "folded">) {
  const kind = `${r.tail}:${r.reason.split(":")[0]}`;
  const id = `${sec.secid}_${sec.classCode}_${level}`;
  const prev = S.logged.get(id);
  const now = Date.now();
  // first use of an instrument, then only when the outcome changes (at most once a minute per instrument)
  if (prev && (prev.key === kind || now - prev.at < 60_000)) return;
  if (S.logged.size > 2000) S.logged.clear();
  S.logged.set(id, { key: kind, at: now });
  const extra = r.tail === "tinkoff" ? ` +${r.added ?? 0} bars, ${r.folded ?? 0} folded` : "";
  const line = `[tinkoff-tail] ${sec.secid}/${sec.classCode} interval=${level ?? "?"} tail=${r.tail} (${r.reason})${extra}`;
  if (r.reason.startsWith("gate") || r.reason.startsWith("error")) console.warn(line);
  else console.log(line);
}

/* ── entry ── */

/**
 * Adds the real-time tail to ISS rows of the native interval `moexInterval` (1, 10, 60, 24 = D, 7 = W, 31 = M; ascending, deduped,
 * in the ISS time basis). Never throws; on any problem returns the same rows with tail "iss".
 */
export async function applyTinkoffTail(sec: MoexSecurity, moexInterval: number, iss: CandleRow[]): Promise<TailResult> {
  const level = levelOf(moexInterval);
  const fail = (reason: string): TailResult => {
    const r: TailResult = { rows: iss, tail: "iss", reason };
    note(sec, level, r);
    return r;
  };
  try {
    if (!process.env.TINKOFF_TOKEN) return fail("no-token");
    if (iss.length === 0) return fail("iss-empty");
    if (!level) return fail("unsupported-interval");
    if (Date.now() < S.backoffUntil) return fail("backoff");
    const instr = await resolveInstrument(sec);
    if (!instr) return fail(Date.now() < S.backoffUntil ? "backoff" : "unknown-instrument");

    const now = Date.now();
    const last = iss[iss.length - 1];
    const issLastUtc = tsToWall(last.timestamp) - MSK_MS;
    let since: number;
    if (level === 1) since = issLastUtc - 30 * MIN;
    else if (level === 10) since = issLastUtc - HOUR;
    else if (level === 60) since = issLastUtc - 2 * HOUR;
    else since = now - MAX_BACK_MS;
    if (typeof level === "number" && now - issLastUtc > MAX_BACK_MS) return fail("stale-iss");

    const st = await ensureMinutes(instr, since);
    if (!st) return fail(Date.now() < S.backoffUntil ? "backoff" : "error: no fresh 1m candles");

    const bars = [...st.bars.values()].sort((a, b) => a.t - b.t);
    const buckets = bucketBars(bars, level, st.from, { futuresDays: sec.engine === "futures" });
    const bad = checkTail(iss, buckets, level);
    if (bad) {
      console.warn(`[tinkoff-tail] ${sec.secid}/${sec.classCode}: discarded, ${bad}`);
      return fail(`gate: ${bad}`);
    }
    const m = mergeTail(iss, buckets, level);
    if (m.added === 0 && m.folded === 0) return fail("no-new-data");
    const r: TailResult = { rows: m.rows, tail: "tinkoff", reason: "ok", added: m.added, folded: m.folded };
    note(sec, level, r);
    return r;
  } catch (e) {
    return fail(`error: ${(e as Error)?.message ?? "unknown"}`);
  }
}
