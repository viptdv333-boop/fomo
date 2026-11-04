import { MinuteBook } from "./book";
import { ruCaFetch } from "../algopack-tls";
import { keyId, tinkoffToken } from "../data/moex-keys";

/* Real-time MOEX trades from the Tinkoff Invest API (MarketDataService/GetLastTrades: the last hour, with the trade direction).
   The free MOEX ISS trade list is ~15 minutes late, so this fills the newest minutes. Needs TINKOFF_TOKEN (the same token
   /api/quote uses); without it nothing here runs. Quantities are in lots and are converted to shares / contracts. */

const BASE = "https://invest-public-api.tinkoff.ru/rest/tinkoff.public.invest.api.contract.v1";
const HOUR = 3_600_000;
const IDLE_MS = 10 * 60_000;

export function tinkoffEnabled(): boolean {
  return tinkoffToken().length > 0;
}

async function call(token: string, endpoint: string, body: object): Promise<any | null> {
  try {
    const res = await ruCaFetch(`${BASE}.${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

const quotation = (q?: { units?: string; nano?: number }) => (q ? parseInt(q.units || "0", 10) + (q.nano || 0) / 1e9 : 0);

export class TinkoffFeed {
  book = new MinuteBook();
  /** First minute (UTC ms) the feed covers completely. */
  from = 0;
  ok = false;
  lastUse = Date.now();
  ready: Promise<void>;
  private lot = 1;
  private lastTs = 0;
  private seen = new Set<string>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  /** the token this feed was opened with (the requester's own, or the server's for an admin): the feed keeps polling on it */
  private token = tinkoffToken();

  constructor(
    private secid: string,
    private classCode: string,
    startFrom: number,
  ) {
    this.from = Math.ceil(Math.max(startFrom, Date.now() - HOUR + 60_000) / 60_000) * 60_000;
    this.ready = this.init();
  }

  private async init() {
    const info = await call(this.token, "InstrumentsService/GetInstrumentBy", { idType: "INSTRUMENT_ID_TYPE_TICKER", classCode: this.classCode, id: this.secid });
    const lot = Number(info?.instrument?.lot);
    if (lot > 0) this.lot = lot;
    await this.poll(this.from);
    this.timer = setInterval(() => void this.tick(), 3000);
    (this.timer as any).unref?.();
  }

  private async tick() {
    if (Date.now() - this.lastUse > IDLE_MS) {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      return;
    }
    await this.poll(this.lastTs > 0 ? this.lastTs - 3000 : this.from);
  }

  private async poll(fromMs: number) {
    if (this.busy) return;
    this.busy = true;
    try {
      const now = Date.now();
      const from = Math.max(fromMs, now - HOUR + 5000);
      const data = await call(this.token, "MarketDataService/GetLastTrades", {
        instrumentId: `${this.secid}_${this.classCode}`,
        from: new Date(from).toISOString(),
        to: new Date(now).toISOString(),
        tradeSource: "TRADE_SOURCE_EXCHANGE",
      });
      const trades: any[] | undefined = data?.trades;
      if (!trades) return;
      this.ok = true;
      for (const t of trades) {
        const ts = Date.parse(t.time);
        const price = quotation(t.price);
        const qty = parseInt(String(t.quantity ?? "0"), 10) * this.lot;
        if (!(ts > 0) || !(price > 0) || !(qty > 0)) continue;
        if (ts < this.lastTs - 3000) continue;
        const key = `${ts}|${price}|${qty}|${t.direction}`;
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.book.add(Math.floor(ts / 60_000), price, t.direction === "TRADE_DIRECTION_BUY", qty);
        if (ts > this.lastTs) this.lastTs = ts;
      }
      // keep only the keys of the last few seconds for de-duplication
      if (this.seen.size > 20000) this.seen.clear();
      this.book.freezeBefore(this.book.maxMinute - 1);
    } finally {
      this.busy = false;
    }
  }
}

const G = globalThis as unknown as { __fomoTinkoff?: Map<string, TinkoffFeed> };
const feeds: Map<string, TinkoffFeed> = (G.__fomoTinkoff ??= new Map());

export function getTinkoffFeed(secid: string, classCode: string, startFrom: number): TinkoffFeed | null {
  if (!tinkoffEnabled()) return null;
  // one feed per instrument AND token: trades read on one person's token are not handed to another person
  const key = `${keyId(tinkoffToken())}:${classCode}:${secid}`;
  let f = feeds.get(key);
  if (!f) {
    if (feeds.size >= 40) feeds.clear();
    f = new TinkoffFeed(secid, classCode, startFrom);
    feeds.set(key, f);
  }
  f.lastUse = Date.now();
  return f;
}
