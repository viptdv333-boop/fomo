/**
 * Second candles of MOEX instruments: the T-Invest tape of trades ("обезличенные сделки") folded into 1-second bars on the server and
 * relayed to the terminal through Socket.IO. The token never leaves this process.
 *
 *   history   MarketDataService/GetLastTrades (REST): the last hour of an instrument, read in 15-minute chunks, newest first, once per
 *             instrument (the book of 1-second bars is kept while somebody watches it and 30 s after the last viewer left);
 *   live      ONE shared WebSocket (wss://invest-public-api.tinkoff.ru/ws/...MarketDataStreamService/MarketDataStream, the JSON proxy of the
 *             gRPC stream) with a trades subscription per watched instrument. Reference-counted: an instrument is subscribed when the first
 *             viewer arrives and unsubscribed 30 s after the last one left; the socket itself is closed a minute after the last instrument.
 *   why a stream and not polling: all unary MarketData methods share ONE quota of 600 requests per minute (limits of the API), which the
 *             quote route, the candle tail and the order-flow feed already use; polling GetLastTrades every second would cost 60 per minute
 *             per watched instrument. A stream's trades are delivered without a throttling interval and cost no unary requests.
 *             Gaps (a reconnect, the moment between the history call and the subscription) are closed with one GetLastTrades call for the gap.
 *
 * Limits respected: 1 stream connection (the grade-1 limit is 16), at most MOEX_SECONDS_MAX instruments (default 24; the API allows 300
 * subscriptions per stream), at most 3 instruments per browser socket, 2 history requests in flight, a 429/401/5xx backs every request off.
 * Memory: <= 3700 one-second bars per instrument (SecondBook), <= MOEX_SECONDS_MAX instruments.
 * Kill switch: MOEX_SECONDS=0. Without TINKOFF_TOKEN nothing runs ("token").
 * Logs never contain the token (it is only in the Authorization header).
 */

import type { Server as SocketIOServer, Socket } from "socket.io";
import WebSocket from "ws";
import { ruCaFetch, ruCaWsOptions } from "../src/lib/algopack-tls";
import { resolveMoex } from "../src/lib/moex-resolve";
import {
  SecondBook,
  WINDOW_MS,
  moexSecondsOn,
  parseTrade,
  windowSince,
  type SecReason,
  type SecRefusal,
  type SecSnapshot,
  type SecState,
} from "../src/lib/moex-seconds";

const REST = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const WS_URL = process.env.TINKOFF_WS_URL || "wss://invest-public-api.tinkoff.ru/ws/tinkoff.public.invest.api.contract.v1.MarketDataStreamService/MarketDataStream";
const MAX_INSTRUMENTS = Math.min(100, Math.max(1, Number(process.env.MOEX_SECONDS_MAX) || 24));
const MAX_PER_SOCKET = 3;
const CHUNK_MS = 15 * 60_000;
const GRACE_MS = Number(process.env.MOEX_SECONDS_GRACE_MS) || 30_000;
const STREAM_IDLE_MS = 60_000;
const FLUSH_MS = 250;
const SILENCE_MS = 200_000;
const READY_TIMEOUT_MS = 40_000;
const TICKER_RE = /^[A-Za-z0-9_.-]{1,24}$/;

const token = () => process.env.TINKOFF_TOKEN || "";

interface Inst {
  key: string;
  secid: string;
  classCode: string;
  uid: string;
  figi: string;
  lot: number;
  book: SecondBook;
  subs: Set<string>;
  /** UTC ms of the first second the book covers completely */
  since: number;
  /** the history is loaded */
  ok: boolean;
  /** why the load failed */
  why: SecReason;
  ready: Promise<boolean>;
  /** the book is known to be complete up to this time (UTC ms): the history's start, the end of the last gap fill, the moment the stream was lost */
  completeTo: number;
  /** the stream delivers this instrument's trades right now */
  live: boolean;
  /** a gap fill is running / wanted again */
  filling: boolean;
  fillAgain: boolean;
  dirty: Set<number>;
  flushTimer: ReturnType<typeof setTimeout> | null;
  dropTimer: ReturnType<typeof setTimeout> | null;
  lastTrim: number;
}

const roomOf = (key: string) => `sec_${key}`;

class MoexSeconds {
  private io: SocketIOServer | null = null;
  private insts = new Map<string, Inst>();
  private bySocket = new Map<string, Set<string>>();
  private instrCache = new Map<string, { at: number; v: { uid: string; figi: string; lot: number } | null }>();

  // unary requests
  private blockedUntil = 0;
  private lastFail: SecReason = "error";
  private tokenBadUntil = 0;
  private active = 0;
  private waiters: (() => void)[] = [];
  private logged = new Map<string, number>();

  // the stream
  private ws: WebSocket | null = null;
  private wsOpen = false;
  private wsSubscribed = new Set<string>();
  private wsFailures = 0;
  private wsRetry: ReturnType<typeof setTimeout> | null = null;
  private wsIdle: ReturnType<typeof setTimeout> | null = null;
  private lastMsgAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private state: SecState = "connecting";

  attach(io: SocketIOServer) {
    this.io = io;
  }

  /** How many instruments are being watched (for logs / tests). */
  get watched(): number {
    return this.insts.size;
  }

  /* ── clients ── */

  async subscribe(socket: Socket, tickerIn: unknown): Promise<SecSnapshot | SecRefusal> {
    if (!moexSecondsOn()) return { ok: false, reason: "off" };
    if (!token()) return { ok: false, reason: "token" };
    if (Date.now() < this.tokenBadUntil) return { ok: false, reason: "token" };
    const ticker = typeof tickerIn === "string" ? tickerIn.trim() : "";
    if (!TICKER_RE.test(ticker)) return { ok: false, reason: "unknown" };
    const mine = this.bySocket.get(socket.id);

    let sec;
    try {
      sec = await resolveMoex(ticker);
    } catch {
      sec = null;
    }
    if (!sec) return { ok: false, reason: "unknown" };
    // an index has no tape of trades
    if (sec.group === "index") return { ok: false, reason: "unsupported" };
    const key = `${sec.secid}_${sec.classCode}`;
    if (!(mine?.has(key)) && (mine?.size ?? 0) >= MAX_PER_SOCKET) return { ok: false, reason: "limit" };

    let inst = this.insts.get(key);
    if (!inst) {
      if (this.insts.size >= MAX_INSTRUMENTS) return { ok: false, reason: "limit" };
      const info = await this.instrument(sec.secid, sec.classCode);
      if (!info) return { ok: false, reason: this.lastFail === "error" ? "unknown" : this.lastFail };
      inst = this.insts.get(key) ?? this.create(key, sec.secid, sec.classCode, info);
    }
    inst.subs.add(socket.id);
    if (inst.dropTimer) {
      clearTimeout(inst.dropTimer);
      inst.dropTimer = null;
    }
    let set = this.bySocket.get(socket.id);
    if (!set) this.bySocket.set(socket.id, (set = new Set()));
    set.add(key);
    await socket.join(roomOf(key));

    const ok = await Promise.race([inst.ready, new Promise<boolean>((r) => setTimeout(() => r(false), READY_TIMEOUT_MS))]);
    if (!ok || !inst.ok) {
      this.leave(socket, key);
      return { ok: false, reason: inst.why === "error" && this.lastFail !== "error" ? this.lastFail : inst.why };
    }
    // the socket may have left while the history was loading
    if (!inst.subs.has(socket.id)) return { ok: false, reason: "error" };
    const now = Date.now();
    inst.book.trim(now);
    return { ok: true, key, now, since: inst.since, last: inst.book.maxT, state: this.state, bars: inst.book.wire() };
  }

  unsubscribe(socket: Socket, key: unknown) {
    if (typeof key !== "string") return;
    this.leave(socket, key);
  }

  dropSocket(socketId: string) {
    const keys = this.bySocket.get(socketId);
    if (!keys) return;
    this.bySocket.delete(socketId);
    for (const key of keys) this.release(socketId, key);
  }

  private leave(socket: Socket, key: string) {
    void socket.leave(roomOf(key));
    this.bySocket.get(socket.id)?.delete(key);
    this.release(socket.id, key);
  }

  private release(socketId: string, key: string) {
    const inst = this.insts.get(key);
    if (!inst) return;
    inst.subs.delete(socketId);
    if (inst.subs.size > 0 || inst.dropTimer) return;
    // the last viewer left: keep the book for a moment (a timeframe switch re-subscribes at once), then unsubscribe and forget
    inst.dropTimer = setTimeout(() => this.drop(inst), GRACE_MS);
    (inst.dropTimer as any).unref?.();
  }

  private drop(inst: Inst) {
    if (inst.subs.size > 0) return;
    if (inst.flushTimer) clearTimeout(inst.flushTimer);
    if (inst.dropTimer) clearTimeout(inst.dropTimer);
    inst.flushTimer = inst.dropTimer = null;
    if (this.insts.get(inst.key) === inst) this.insts.delete(inst.key);
    this.syncStream();
  }

  /* ── instruments ── */

  private create(key: string, secid: string, classCode: string, info: { uid: string; figi: string; lot: number }): Inst {
    const inst: Inst = {
      key,
      secid,
      classCode,
      uid: info.uid,
      figi: info.figi,
      lot: info.lot,
      book: new SecondBook(),
      subs: new Set(),
      since: 0,
      ok: false,
      why: "error",
      ready: Promise.resolve(false),
      completeTo: 0,
      live: false,
      filling: false,
      fillAgain: false,
      dirty: new Set(),
      flushTimer: null,
      dropTimer: null,
      lastTrim: 0,
    };
    this.insts.set(key, inst);
    inst.ready = this.load(inst).catch(() => {
      inst.why = "error";
      return false;
    });
    void inst.ready.then((ok) => {
      // a failed instrument is not kept: the next viewer tries again (the global back-off protects the API)
      if (!ok && this.insts.get(key) === inst) {
        this.insts.delete(key);
        this.syncStream();
      }
    });
    this.syncStream();
    return inst;
  }

  /** Ticker + class code -> uid / figi / lot of the instrument. Cached 6 h. */
  private async instrument(secid: string, classCode: string): Promise<{ uid: string; figi: string; lot: number } | null> {
    const k = `${secid}_${classCode}`;
    const hit = this.instrCache.get(k);
    if (hit && Date.now() - hit.at < (hit.v ? 6 * 3_600_000 : 10 * 60_000)) return hit.v;
    const r = await this.call("InstrumentsService/GetInstrumentBy", { idType: "INSTRUMENT_ID_TYPE_TICKER", classCode, id: secid });
    if (!r) return null;
    const i = r.status === 200 ? r.data?.instrument : null;
    const ok = !!i?.uid && String(i.ticker ?? "").toUpperCase() === secid.toUpperCase();
    const v = ok ? { uid: String(i.uid), figi: String(i.figi ?? ""), lot: Number(i.lot) > 0 ? Number(i.lot) : 1 } : null;
    if (this.instrCache.size > 500) this.instrCache.clear();
    this.instrCache.set(k, { at: Date.now(), v });
    if (!v) this.lastFail = "unknown";
    return v;
  }

  /* ── history ── */

  /** The last hour: newest 15-minute chunk first. A chunk that fails ends the history there (the book then starts later: `since` says where). */
  private async load(inst: Inst): Promise<boolean> {
    const now = Date.now();
    const from0 = now - WINDOW_MS + 5000;
    inst.completeTo = now;
    let since = windowSince(from0);
    for (let to = now, i = 0; to > from0; i++) {
      const from = Math.max(from0, to - CHUNK_MS);
      const ok = await this.fetchTrades(inst, from, to, false);
      if (!ok) {
        if (i === 0) {
          inst.why = this.lastFail;
          return false;
        }
        since = windowSince(to);
        break;
      }
      to = from;
    }
    inst.since = since;
    inst.book.trim(Date.now());
    inst.ok = true;
    return true;
  }

  /** One GetLastTrades call for [from, to] into the book. `emit`: the changed seconds go to the viewers. false = the call failed. */
  private async fetchTrades(inst: Inst, from: number, to: number, emit: boolean): Promise<boolean> {
    const r = await this.call("MarketDataService/GetLastTrades", {
      instrumentId: inst.uid,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      tradeSource: "TRADE_SOURCE_EXCHANGE",
    });
    if (!r || r.status !== 200 || !Array.isArray(r.data?.trades)) return false;
    const trades: unknown[] = r.data.trades;
    // the API gives them oldest first; sort anyway, the book's open/close rules rely on time, not on arrival
    for (const raw of trades) {
      const tr = parseTrade(raw, inst.lot);
      if (!tr) continue;
      const sec = inst.book.add(tr);
      if (sec && emit) inst.dirty.add(sec);
    }
    if (emit && inst.dirty.size > 0) this.scheduleFlush(inst);
    return true;
  }

  /** The stream is (re)subscribed for `inst`: read what happened since the history / the last connection, so no trade falls between the two. */
  private async fill(inst: Inst) {
    if (inst.filling) {
      inst.fillAgain = true;
      return;
    }
    inst.filling = true;
    try {
      if (!(await inst.ready) || !this.insts.has(inst.key)) return;
      do {
        inst.fillAgain = false;
        const now = Date.now();
        const from = Math.max(now - WINDOW_MS + 5000, inst.completeTo - 5000);
        if (await this.fetchTrades(inst, from, now, true)) inst.completeTo = now;
      } while (inst.fillAgain && this.insts.has(inst.key));
    } finally {
      inst.filling = false;
    }
  }

  /* ── unary requests ── */

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= 2) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }

  private log(msg: string) {
    const last = this.logged.get(msg) ?? 0;
    if (Date.now() - last < 60_000) return;
    this.logged.set(msg, Date.now());
    if (this.logged.size > 50) this.logged.clear();
    console.warn(`[moex-seconds] ${msg}`);
  }

  private backoff(ms: number, why: SecReason, text: string) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms);
    this.lastFail = why;
    this.log(`${text}; backing off ${Math.round(ms / 1000)}s`);
  }

  private async call(endpoint: string, body: object): Promise<{ status: number; data: any } | null> {
    const tk = token();
    if (!tk) {
      this.lastFail = "token";
      return null;
    }
    if (Date.now() < this.tokenBadUntil) {
      this.lastFail = "token";
      return null;
    }
    if (Date.now() < this.blockedUntil) return null;
    try {
      const res = await this.slot(() =>
        ruCaFetch(`${REST}.${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(25_000),
        }),
      );
      if (res.status === 429) {
        const reset = Number(res.headers.get("x-ratelimit-reset"));
        this.backoff(Math.min(120, Math.max(5, Number.isFinite(reset) && reset > 0 ? reset : 20)) * 1000, "quota", "HTTP 429 (request limit)");
        return null;
      }
      if (res.status === 401 || res.status === 403) {
        this.tokenBadUntil = Date.now() + 10 * 60_000;
        this.lastFail = "token";
        this.log(`HTTP ${res.status} (token rejected), paused for 10 min`);
        return null;
      }
      if (res.status >= 500) {
        this.backoff(5000, "error", `HTTP ${res.status}`);
        return null;
      }
      let data: any = null;
      try {
        data = await res.json();
      } catch {}
      if (res.status !== 200) this.lastFail = res.status === 404 || res.status === 400 ? "unknown" : "error";
      return { status: res.status, data };
    } catch (e) {
      this.backoff(3000, "error", `network: ${(e as Error)?.name ?? "error"}`);
      return null;
    }
  }

  /* ── the stream ── */

  private setState(s: SecState) {
    if (s === this.state) return;
    this.state = s;
    for (const inst of this.insts.values()) this.io?.to(roomOf(inst.key)).emit("seconds_state", { key: inst.key, state: s });
  }

  /** Make the stream match the watched instruments: open it, subscribe the new ones, unsubscribe the gone ones, close it when idle. */
  private syncStream() {
    if (this.insts.size === 0) {
      // nobody watches anything: unsubscribe what is still subscribed, close the connection a minute later
      if (this.wsOpen && this.wsSubscribed.size > 0) {
        this.send("SUBSCRIPTION_ACTION_UNSUBSCRIBE", [...this.wsSubscribed]);
        this.wsSubscribed.clear();
      }
      if (!this.wsIdle && (this.ws || this.wsRetry)) {
        this.wsIdle = setTimeout(() => {
          this.wsIdle = null;
          if (this.insts.size === 0) this.closeStream();
        }, STREAM_IDLE_MS);
        (this.wsIdle as any).unref?.();
      }
      return;
    }
    if (this.wsIdle) {
      clearTimeout(this.wsIdle);
      this.wsIdle = null;
    }
    if (!this.ws) {
      if (!this.wsRetry) this.openStream();
      return;
    }
    if (!this.wsOpen) return;
    const want = new Set([...this.insts.values()].map((i) => i.uid));
    const add = [...want].filter((u) => !this.wsSubscribed.has(u));
    const del = [...this.wsSubscribed].filter((u) => !want.has(u));
    if (add.length) this.send("SUBSCRIPTION_ACTION_SUBSCRIBE", add);
    if (del.length) this.send("SUBSCRIPTION_ACTION_UNSUBSCRIBE", del);
    for (const u of add) this.wsSubscribed.add(u);
    for (const u of del) this.wsSubscribed.delete(u);
    // trades between the history call and the moment the subscription is in force are read once the subscription is confirmed;
    // this timer is the fallback when no confirmation message arrives
    if (add.length) {
      const t = setTimeout(() => {
        for (const inst of this.insts.values()) if (add.includes(inst.uid)) void this.fill(inst);
      }, 4000);
      (t as any).unref?.();
    }
  }

  private send(action: string, uids: string[]) {
    for (let i = 0; i < uids.length; i += 50) {
      try {
        this.ws?.send(
          JSON.stringify({
            subscribeTradesRequest: {
              subscriptionAction: action,
              instruments: uids.slice(i, i + 50).map((u) => ({ instrumentId: u })),
              tradeSource: "TRADE_SOURCE_EXCHANGE",
            },
          }),
        );
      } catch {}
    }
  }

  private closeStream() {
    if (this.wsRetry) clearTimeout(this.wsRetry);
    this.wsRetry = null;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    const ws = this.ws;
    this.ws = null;
    this.wsOpen = false;
    this.wsSubscribed.clear();
    try {
      ws?.removeAllListeners();
      ws?.on("error", () => {});
      ws?.close();
    } catch {}
  }

  private openStream() {
    const tk = token();
    if (!tk || !moexSecondsOn() || Date.now() < this.tokenBadUntil) return;
    this.setState("connecting");
    let ws: WebSocket;
    try {
      ws = new WebSocket(WS_URL, ["json"], { headers: { Authorization: `Bearer ${tk}` }, handshakeTimeout: 15_000, ...ruCaWsOptions(WS_URL) });
    } catch {
      this.streamLost(0, "open failed");
      return;
    }
    this.ws = ws;
    ws.on("open", () => {
      if (this.ws !== ws) return;
      this.wsOpen = true;
      this.wsFailures = 0;
      this.lastMsgAt = Date.now();
      this.wsSubscribed.clear();
      this.syncStream();
      this.setState("live");
      if (!this.watchdog) {
        this.watchdog = setInterval(() => {
          if (this.wsOpen && Date.now() - this.lastMsgAt > SILENCE_MS) {
            this.log("stream silent for too long, reconnecting");
            try {
              this.ws?.terminate();
            } catch {}
          }
        }, 30_000);
        (this.watchdog as any).unref?.();
      }
    });
    ws.on("message", (data) => {
      if (this.ws !== ws) return;
      this.lastMsgAt = Date.now();
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg?.trade) this.onTrade(msg.trade);
      else if (msg?.subscribeTradesResponse) this.onSubscribed(msg.subscribeTradesResponse);
    });
    ws.on("error", (err) => {
      const m = String((err as Error)?.message ?? "");
      if (/\b(401|403)\b/.test(m)) {
        this.tokenBadUntil = Date.now() + 10 * 60_000;
        this.log("stream: token rejected, paused for 10 min");
      } else if (/\b429\b/.test(m)) this.lastFail = "quota";
      else this.log(`stream error: ${m.replace(/Bearer\s+\S+/gi, "Bearer ***").slice(0, 160)}`);
    });
    ws.on("close", (code) => {
      if (this.ws !== ws) return;
      this.streamLost(code, `closed ${code}`);
    });
  }

  private streamLost(code: number, why: string) {
    // what the stream delivered until its last message is in the book; from there the reconnect reads the gap
    for (const inst of this.insts.values()) {
      if (inst.live) inst.completeTo = Math.max(inst.completeTo, this.lastMsgAt);
      inst.live = false;
    }
    const ws = this.ws;
    this.ws = null;
    this.wsOpen = false;
    this.wsSubscribed.clear();
    try {
      ws?.removeAllListeners();
      ws?.on("error", () => {});
      ws?.terminate();
    } catch {}
    this.wsFailures++;
    this.setState("error");
    if (code === 4016) this.tokenBadUntil = Date.now() + 10 * 60_000;
    if (code === 4008) this.lastFail = "quota";
    if (this.insts.size === 0) return;
    const wait = code === 4008 ? 90_000 : code === 4016 ? 10 * 60_000 : Math.min(60_000, 2000 * 2 ** Math.min(this.wsFailures, 5));
    this.log(`stream lost (${why}); reconnect in ${Math.round(wait / 1000)}s`);
    this.wsRetry = setTimeout(() => {
      this.wsRetry = null;
      if (this.insts.size > 0) this.openStream();
    }, wait);
    (this.wsRetry as any).unref?.();
  }

  private onSubscribed(resp: any) {
    for (const s of resp?.tradeSubscriptions ?? []) {
      const st = String(s?.subscriptionStatus ?? "");
      const inst = [...this.insts.values()].find((i) => i.uid === s?.instrumentUid || (i.figi && i.figi === s?.figi));
      if (st === "SUBSCRIPTION_STATUS_SUCCESS") {
        // the subscription is in force: close the gap between the history (or the previous connection) and now
        if (inst) {
          inst.live = true;
          void this.fill(inst);
        }
        continue;
      }
      this.log(`stream subscription for ${inst?.secid ?? "?"}: ${st}`);
      // the history still serves the viewers; the live part for this instrument is not there
    }
  }

  private onTrade(raw: any) {
    const uid = String(raw?.instrumentUid ?? "");
    let inst: Inst | undefined;
    for (const i of this.insts.values()) {
      if ((uid && i.uid === uid) || (!uid && i.figi && i.figi === raw?.figi)) {
        inst = i;
        break;
      }
    }
    if (!inst) return;
    const tr = parseTrade(raw, inst.lot);
    if (!tr) return;
    const now = Date.now();
    if (tr.t > now + 60_000) return;
    const sec = inst.book.add(tr);
    if (!sec) return;
    inst.dirty.add(sec);
    this.scheduleFlush(inst);
    if (now - inst.lastTrim > 5000) {
      inst.lastTrim = now;
      inst.book.trim(now);
    }
  }

  private scheduleFlush(inst: Inst) {
    if (inst.flushTimer) return;
    inst.flushTimer = setTimeout(() => {
      inst.flushTimer = null;
      if (inst.dirty.size === 0) return;
      const bars = inst.book.wire(inst.dirty);
      inst.dirty.clear();
      if (bars.length) this.io?.to(roomOf(inst.key)).emit("seconds_bars", { key: inst.key, bars });
    }, FLUSH_MS);
  }
}

const G = globalThis as unknown as { __fomoMoexSeconds?: MoexSeconds };
export const moexSeconds: MoexSeconds = (G.__fomoMoexSeconds ??= new MoexSeconds());
