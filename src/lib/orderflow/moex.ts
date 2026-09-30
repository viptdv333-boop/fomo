import { MinuteBook } from "./book";
import type { FlowSource } from "./aggregate";
import type { PrepareResult } from "./types";
import { mergeCov } from "./bybit";
import { getTinkoffFeed } from "./tinkoff";
import { BigBook } from "./big";

/* MOEX (shares on TQBR and FORTS futures) trades from ISS.
   `trades.json` carries BUYSELL (the initiator side) for every trade, but only for the CURRENT session and at most 5000
   rows per request. A collector per instrument therefore walks the list newest -> oldest (`reversed=1&start=N`, several
   pages in parallel) and keeps polling the head for new trades. Coverage grows backwards from "now" while the backfill
   runs; bars older than the covered part are reported as not covered (the client approximates them). */

const ISS = "https://iss.moex.com/iss";
const PAGE = 5000;
const PARALLEL = 3;
const COLS = "TRADENO,TRADEDATE,TRADETIME,PRICE,QUANTITY,BUYSELL";
const MAX_ROWS = 4_000_000;
const IDLE_MS = 10 * 60_000;
const MAX_COLLECTORS = 6;
const MSK_MS = 3 * 3_600_000;

const FUTURES_PREFIX: Record<string, string> = {
  BR: "BR", GOLD: "GD", SILV: "SV", PLT: "PT", PLD: "PD", NG: "NG", WHEAT: "W4", COCOA: "CC", SUGAR: "SA", CU: "CE",
  Si: "Si", Eu: "Eu", CR: "CR", NASD: "NA", SPYF: "SF", MIX: "MX", RTS: "RI", BTCF: "BT",
};

interface Resolved {
  key: string;
  url: string;
}

interface MoexState {
  collectors: Map<string, Collector>;
  resolved: Map<string, { r: Resolved | null; at: number }>;
  inflight: number;
  waiters: Array<() => void>;
  contracts: Map<string, { c: string; at: number }>;
}
const G = globalThis as unknown as { __fomoMoexFlow?: MoexState };
const state: MoexState = (G.__fomoMoexFlow ??= { collectors: new Map(), resolved: new Map(), inflight: 0, waiters: [], contracts: new Map() });

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  while (state.inflight >= 5) await new Promise<void>((r) => state.waiters.push(r));
  state.inflight++;
  try {
    return await fn();
  } finally {
    state.inflight--;
    state.waiters.shift()?.();
  }
}

async function getJson(url: string): Promise<any | null> {
  return limited(async () => {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
      if (!res.ok) return null;
      // futures TRADENO exceeds 2^53: quote long integers at the start of a row before parsing
      const text = (await res.text()).replace(/\[(\d{15,}),/g, '["$1",');
      return JSON.parse(text);
    } catch {
      return null;
    }
  });
}

async function activeContract(base: string): Promise<string | null> {
  const prefix = FUTURES_PREFIX[base];
  if (!prefix) return null;
  const hit = state.contracts.get(base);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.c;
  const data = await getJson(`${ISS}/engines/futures/markets/forts/boards/RFUD/securities.json?iss.meta=off&iss.only=securities&securities.columns=SECID,SHORTNAME,LASTTRADEDATE`);
  const rows: any[][] | undefined = data?.securities?.data;
  if (!rows) return null;
  const today = new Date().toISOString().slice(0, 10);
  const cand = rows
    .filter((r) => String(r[0]).startsWith(prefix) && r[0] !== base && r[2] && String(r[2]) >= today)
    .sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  const c = cand.length ? String(cand[0][0]) : null;
  if (c) state.contracts.set(base, { c, at: Date.now() });
  return c;
}

async function resolve(ticker: string): Promise<Resolved | null> {
  const hit = state.resolved.get(ticker);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.r;
  let r: Resolved | null = null;
  if (/^[A-Za-z0-9]{2,12}$/.test(ticker)) {
    const sh = await getJson(`${ISS}/engines/stock/markets/shares/boards/TQBR/securities/${ticker}.json?iss.meta=off&iss.only=securities&securities.columns=SECID`);
    if (sh?.securities?.data?.length) {
      r = { key: `sh:${ticker}`, url: `${ISS}/engines/stock/markets/shares/boards/TQBR/securities/${ticker}/trades.json` };
    } else {
      const contract = (await activeContract(ticker)) ?? ticker;
      const fu = await getJson(`${ISS}/engines/futures/markets/forts/securities/${contract}.json?iss.meta=off&iss.only=securities&securities.columns=SECID`);
      if (fu?.securities?.data?.length) r = { key: `fu:${contract}`, url: `${ISS}/engines/futures/markets/forts/securities/${contract}/trades.json` };
    }
  }
  state.resolved.set(ticker, { r, at: Date.now() });
  return r;
}

type Row = { no: bigint; t: number; minute: number; price: number; qty: number; buy: boolean };

class Collector {
  book = new MinuteBook();
  big = new BigBook(600);
  low: bigint | null = null;
  high: bigint | null = null;
  count = 0;
  done = false;
  lastUse = Date.now();
  tick = 0;
  ready: Promise<void>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private backfilling = false;
  private polling = false;
  broken = false;
  created = Date.now();

  constructor(public r: Resolved) {
    this.ready = this.init();
  }

  private async page(start: number, limit: number): Promise<Row[] | null> {
    const data = await getJson(`${this.r.url}?iss.meta=off&iss.only=trades&reversed=1&limit=${limit}&start=${start}&trades.columns=${COLS}`);
    const rows: any[][] | undefined = data?.trades?.data;
    if (!rows) return null;
    const out: Row[] = [];
    for (const x of rows) {
      const ds = String(x[1]);
      const ts = String(x[2]);
      const y = +ds.slice(0, 4);
      const mo = +ds.slice(5, 7);
      const d = +ds.slice(8, 10);
      const h = +ts.slice(0, 2);
      const mi = +ts.slice(3, 5);
      const s = +ts.slice(6, 8);
      const utc = Date.UTC(y, mo - 1, d, h, mi, s) - MSK_MS;
      const price = Number(x[3]);
      const qty = Number(x[4]);
      if (!(utc > 0) || !(price > 0) || !(qty > 0)) continue;
      let no: bigint;
      try {
        no = BigInt(x[0]);
      } catch {
        continue;
      }
      out.push({ no, t: utc, minute: Math.floor(utc / 60_000), price, qty, buy: x[5] === "B" });
    }
    return out;
  }

  /** Adds rows that are not covered yet; `older` selects which end of the known range is being extended. Returns the number added. */
  private ingest(rows: Row[], older: boolean): number {
    let added = 0;
    const lo0 = this.low;
    const hi0 = this.high;
    let lo = lo0;
    let hi = hi0;
    for (const r of rows) {
      // judged against the range known BEFORE this page, so a page of new trades is taken whole
      if (lo0 !== null && hi0 !== null) {
        if (r.no >= lo0 && r.no <= hi0) continue;
        if (older && r.no > hi0) continue;
        if (!older && r.no < lo0) continue;
      }
      this.book.add(r.minute, r.price, r.buy, r.qty);
      this.big.add(r.t, r.price, r.qty, r.buy);
      added++;
      if (lo === null || r.no < lo) lo = r.no;
      if (hi === null || r.no > hi) hi = r.no;
    }
    if (added) {
      this.low = lo;
      this.high = hi;
      this.count += added;
      this.book.freezeBefore(this.book.maxMinute - 1);
      if (!this.tick) this.tick = this.book.inferTick();
    }
    return added;
  }

  private async init() {
    const rows = await this.page(0, PAGE);
    if (!rows) {
      this.broken = true;
      return;
    }
    this.ingest(rows, true);
    if (rows.length < PAGE) this.done = true;
    this.tick = this.book.inferTick();
    this.timer = setInterval(() => void this.tickLoop(), 3000);
    (this.timer as any).unref?.();
    void this.backfill();
  }

  private async tickLoop() {
    if (Date.now() - this.lastUse > IDLE_MS) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    await this.poll();
    if (!this.done && !this.backfilling) void this.backfill();
  }

  /** New trades since the last poll. */
  private async poll() {
    if (this.polling || this.high === null) return;
    this.polling = true;
    try {
      const prevHigh = this.high;
      let start = 0;
      for (let n = 0; n < 40; n++) {
        const limit = n === 0 ? 500 : PAGE;
        const rows = await this.page(start, limit);
        if (!rows || rows.length === 0) return;
        this.ingest(rows, false);
        // stop once the page reaches trades that are already known
        if (rows[rows.length - 1].no <= prevHigh || rows.length < limit) return;
        start += rows.length;
      }
    } finally {
      this.polling = false;
    }
  }

  private async backfill() {
    if (this.backfilling || this.done) return;
    this.backfilling = true;
    let errors = 0;
    try {
      while (!this.done && Date.now() - this.lastUse < IDLE_MS && this.count < MAX_ROWS) {
        const base = Math.max(0, this.count - 100);
        const pages = await Promise.all(Array.from({ length: PARALLEL }, (_, k) => this.page(base + k * PAGE, PAGE)));
        let progressed = 0;
        let end = false;
        let err = false;
        for (const rows of pages) {
          if (!rows) {
            err = true;
            break;
          }
          progressed += this.ingest(rows, true);
          if (rows.length < PAGE) {
            end = true;
            break;
          }
        }
        if (end) this.done = true;
        else if (err) {
          if (++errors > 5) break;
          await new Promise((r) => setTimeout(r, 2000));
        } else if (progressed === 0) this.done = true;
      }
      if (this.count >= MAX_ROWS) this.done = true;
    } finally {
      this.backfilling = false;
    }
  }

  coverage(now: number): [number, number][] {
    if (!isFinite(this.book.minMinute)) return [];
    const from = (this.done ? this.book.minMinute : this.book.minMinute + 1) * 60_000;
    return [[from, now]];
  }
}

function getCollector(r: Resolved): Collector {
  let c = state.collectors.get(r.key);
  if (c && c.broken && Date.now() - c.created > 15_000) {
    state.collectors.delete(r.key);
    c = undefined;
  }
  if (!c) {
    if (state.collectors.size >= MAX_COLLECTORS) {
      let old: string | null = null;
      for (const [k, v] of state.collectors) if (old === null || v.lastUse < state.collectors.get(old)!.lastUse) old = k;
      if (old) state.collectors.delete(old);
    }
    c = new Collector(r);
    state.collectors.set(r.key, c);
  }
  c.lastUse = Date.now();
  return c;
}

export async function prepareMoex(ticker: string, fromMs: number, _toMs: number): Promise<PrepareResult | null> {
  const r = await resolve(ticker);
  if (!r) return null;
  const c = getCollector(r);
  await Promise.race([c.ready, new Promise((res) => setTimeout(res, 7000))]);
  const now = Date.now();
  // ISS trades are ~15 minutes late: the Tinkoff feed (when a token is configured) supplies the newest minutes
  const issMax = c.book.maxMinute;
  const feed = getTinkoffFeed(r.key.slice(3), r.key.startsWith("sh:") ? "TQBR" : "SPBFUT", isFinite(issMax) ? (issMax - 3) * 60_000 : now - 3_600_000);
  if (feed) await Promise.race([feed.ready, new Promise((res) => setTimeout(res, 4000))]);
  const rt = !!feed && feed.ok;
  const covList = c.coverage(isFinite(issMax) ? (issMax + 1) * 60_000 : now);
  if (rt) covList.push([feed!.from, now]);
  const cov = mergeCov(covList);
  const covFrom = cov.length ? cov[0][0] : Infinity;
  const pending = !c.done && fromMs < covFrom;
  const feedFromMinute = rt ? feed!.from / 60_000 : Infinity;
  const source: FlowSource = {
    minute(minute, cb) {
      if (rt && minute >= feedFromMinute) {
        if (!feed!.book.has(minute)) return false;
        feed!.book.each(minute, cb);
        return true;
      }
      if (!c.book.has(minute)) return false;
      c.book.each(minute, cb);
      return true;
    },
  };
  return { source, big: (from, to, limit) => c.big.range(from, to, limit), nativeTick: c.tick, cov, pending, live: rt, delayed: !rt, bounds: [isFinite(c.book.minMinute) ? c.book.minMinute : 0, Math.floor(now / 60_000)] };
}
