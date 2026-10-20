/* The server side of the MOEX second candles (server/moex-trades.ts) against MOCKED T-Invest: GetInstrumentBy / GetLastTrades answers built from the
   documented response shape, a local WebSocket standing in for the MarketDataStream proxy. No token, no network: checks the history in chunks, the live
   relay to the instrument's room, the de-duplication between history and stream, the reference counting (subscribe / unsubscribe on the stream), the caps
   and the refusals (kill switch, no token, quota, index).
   Run: npx tsx scripts/check-moex-trades-service.ts   (exit code 1 on a failed assertion) */
import { WebSocketServer, type WebSocket as WsConn } from "ws";

export {}; // a module: the other check scripts declare the same top-level names

let fails = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PORT = 45871;
process.env.TINKOFF_TOKEN = "test-token-not-real";
process.env.TINKOFF_WS_URL = `ws://127.0.0.1:${PORT}/ws/MarketDataStream`;
process.env.MOEX_SECONDS_GRACE_MS = "300";
process.env.MOEX_SECONDS_MAX = "2";
delete process.env.MOEX_SECONDS;

/* ── mock REST ── */
const calls: { endpoint: string; body: any; auth: string }[] = [];
let mode: "ok" | "429" = "ok";
const UID: Record<string, string> = { SBER: "uid-sber", GAZP: "uid-gazp", LKOH: "uid-lkoh" };
const LOT: Record<string, number> = { SBER: 10, GAZP: 10, LKOH: 1 };
const tradeJson = (ms: number, price: number, lots: number, dir = "BUY") => ({
  figi: "FIGI",
  direction: `TRADE_DIRECTION_${dir}`,
  price: { units: String(Math.trunc(price)), nano: Math.round((price % 1) * 1e9) },
  quantity: String(lots),
  time: new Date(ms).toISOString().replace("Z", "123Z"),
  instrumentUid: "uid-sber",
});
/** the "tape": a trade every 2 s with a price that walks, for any window asked for */
function tape(from: number, to: number) {
  const out = [];
  for (let t = Math.ceil(from / 2000) * 2000; t < to; t += 2000) out.push(tradeJson(t + 300, 250 + ((t / 2000) % 10) / 10, 1 + ((t / 2000) % 3)));
  return out;
}
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  if (url.includes("iss.moex.com")) {
    if (url.includes("/engines/futures/")) return json({}, 500);
    const m = /\/securities\/([A-Z0-9]+)\.json/.exec(url);
    if (m && m[1] === "IMOEX") return json({ boards: { columns: [], data: [["SNDX", "index", "stock", 1, 2, 1]] } });
    if (m) return json({ boards: { columns: [], data: [["TQBR", "shares", "stock", 1, 2, 1]] } });
    return json({}, 404);
  }
  if (url.includes("invest-public-api.tinkoff.ru/rest")) {
    const endpoint = url.split(".v1.")[1];
    const body = JSON.parse(init?.body ?? "{}");
    calls.push({ endpoint, body, auth: String(init?.headers?.Authorization ?? "") });
    if (mode === "429") return new Response("{}", { status: 429, headers: { "x-ratelimit-reset": "5" } });
    if (endpoint === "InstrumentsService/GetInstrumentBy") {
      return json({ instrument: { uid: UID[body.id], figi: "FIGI", ticker: body.id, classCode: body.classCode, lot: LOT[body.id] } });
    }
    if (endpoint === "MarketDataService/GetLastTrades") return json({ trades: tape(Date.parse(body.from), Date.parse(body.to)) });
  }
  return realFetch(input, init);
}) as typeof fetch;

/* ── mock stream ── */
const wsMessages: any[] = [];
let wsConn: WsConn | null = null;
let wsHeaders: Record<string, string | string[] | undefined> = {};
let wsProtocol = "";
const wss = new WebSocketServer({ port: PORT, handleProtocols: (p) => (p.has("json") ? "json" : false) });
wss.on("connection", (c, req) => {
  wsConn = c;
  wsHeaders = req.headers;
  wsProtocol = c.protocol;
  c.on("message", (d) => {
    const m = JSON.parse(d.toString());
    wsMessages.push(m);
    const r = m.subscribeTradesRequest;
    if (r?.subscriptionAction === "SUBSCRIPTION_ACTION_SUBSCRIBE") {
      c.send(JSON.stringify({ subscribeTradesResponse: { trackingId: "x", tradeSubscriptions: r.instruments.map((i: any) => ({ figi: "FIGI", subscriptionStatus: "SUBSCRIPTION_STATUS_SUCCESS", instrumentUid: i.instrumentId })) } }));
    }
  });
});

/* ── fake socket.io ── */
const emitted: { room: string; event: string; payload: any }[] = [];
const io: any = { to: (room: string) => ({ emit: (event: string, payload: any) => emitted.push({ room, event, payload }) }) };
const mkSocket = (id: string): any => {
  const rooms = new Set<string>();
  return { id, rooms, join: async (r: string) => void rooms.add(r), leave: async (r: string) => void rooms.delete(r) };
};

async function main() {
  const { moexSeconds } = await import("../server/moex-trades");
  moexSeconds.attach(io);
  const A = mkSocket("A");
  const B = mkSocket("B");

  // 1. first viewer: the history (4 chunks of 15 minutes), the stream, the snapshot
  const t0 = Date.now();
  const snap: any = await moexSeconds.subscribe(A, "SBER");
  eq("snapshot is ok, key SBER_TQBR", [snap.ok, snap.key], [true, "SBER_TQBR"]);
  const hist = calls.filter((c) => c.endpoint === "MarketDataService/GetLastTrades");
  eq("history: four 15-minute chunks, newest first, by instrument uid, exchange trades", [hist.length >= 4, hist[0].body.instrumentId, hist[0].body.tradeSource], [true, "uid-sber", "TRADE_SOURCE_EXCHANGE"]);
  const spans = hist.slice(0, 4).map((c) => Date.parse(c.body.to) - Date.parse(c.body.from));
  eq("each chunk is at most 15 minutes", spans.every((s) => s <= 15 * 60_000 && s > 0), true);
  eq("the first chunk ends 'now', the oldest starts inside the hour", [Math.abs(Date.parse(hist[0].body.to) - t0) < 5000, Date.now() - Date.parse(hist[3].body.from) < 3_600_000], [true, true]);
  eq("the token is sent only as a Bearer header", [calls.every((c) => c.auth === "Bearer test-token-not-real"), JSON.stringify(calls.map((c) => c.body)).includes("test-token")], [true, false]);
  eq("about an hour of 1-second bars (a trade every 2 s -> ~1800 traded seconds), ascending, volume in shares (lot 10)", [snap.bars.length > 1700 && snap.bars.length < 1900, snap.bars.every((b: number[], i: number, a: number[][]) => i === 0 || a[i - 1][0] < b[0]), snap.bars.every((b: number[]) => b[5] % 10 === 0 && b[5] > 0)], [true, true, true]);
  eq("since is the first whole second of the window (~1 h before now)", [snap.since > Date.now() - 3_600_000 - 1000, snap.since < Date.now() - 3_590_000 + 1000, snap.since % 1000], [true, true, 0]);
  eq("the bars start no earlier than since", snap.bars[0][0] >= snap.since, true);
  for (let i = 0; i < 50 && wsMessages.length === 0; i++) await sleep(100);
  eq("subscribed to the instrument on the stream, JSON subprotocol, bearer header", [wsMessages[0]?.subscribeTradesRequest?.instruments, wsProtocol, wsHeaders.authorization], [[{ instrumentId: "uid-sber" }], "json", "Bearer test-token-not-real"]);
  eq("A joined the room", [...A.rooms], ["sec_SBER_TQBR"]);

  // 2. live: a stream trade reaches the room within the flush interval, as a cumulative 1-second bar
  const now = Math.floor(Date.now() / 1000) * 1000;
  emitted.length = 0;
  wsConn!.send(JSON.stringify({ trade: { figi: "FIGI", direction: "TRADE_DIRECTION_BUY", price: { units: "300", nano: 500000000 }, quantity: "2", time: new Date(now + 100).toISOString().replace("Z", "777Z"), instrumentUid: "uid-sber" } }));
  wsConn!.send(JSON.stringify({ trade: { figi: "FIGI", direction: "TRADE_DIRECTION_SELL", price: { units: "301", nano: 0 }, quantity: "1", time: new Date(now + 200).toISOString().replace("Z", "778Z"), instrumentUid: "uid-sber" } }));
  await sleep(600);
  const upd = emitted.filter((e) => e.event === "seconds_bars");
  eq("one update to the instrument room with the 1-second bar", [upd.length >= 1, upd[0]?.room, upd[0]?.payload.key], [true, "sec_SBER_TQBR", "SBER_TQBR"]);
  const last = upd[upd.length - 1].payload.bars.at(-1);
  eq("the bar is cumulative: open 300.5, high 301, close 301, volume (2+1) lots x 10", last, [now, 300.5, 301, 300.5, 301, 30]);
  // a trade of the stream that the history already has is not counted twice
  const histTrade = tape(now - 12_000, now - 10_000)[0];
  const before = (await moexSeconds.subscribe(A, "SBER")) as any;
  const volAt = (s: any, t: number) => s.bars.find((b: number[]) => b[0] === t)?.[5];
  const tSec = Math.floor(Date.parse(histTrade.time) / 1000) * 1000;
  const v0 = volAt(before, tSec);
  wsConn!.send(JSON.stringify({ trade: histTrade }));
  await sleep(500);
  const after = (await moexSeconds.subscribe(A, "SBER")) as any;
  eq("the same trade from the stream and from the history counts once", [v0 > 0, volAt(after, tSec)], [true, v0]);

  // 3. a second viewer shares the instrument: no new stream subscription, no new history
  const nHist = calls.filter((c) => c.endpoint === "MarketDataService/GetLastTrades").length;
  const nSub = wsMessages.filter((m) => m.subscribeTradesRequest?.subscriptionAction === "SUBSCRIPTION_ACTION_SUBSCRIBE").length;
  const snapB: any = await moexSeconds.subscribe(B, "SBER");
  eq("second viewer: the book is shared", [snapB.ok, calls.filter((c) => c.endpoint === "MarketDataService/GetLastTrades").length - nHist <= 1, wsMessages.filter((m) => m.subscribeTradesRequest?.subscriptionAction === "SUBSCRIPTION_ACTION_SUBSCRIBE").length], [true, true, nSub]);
  eq("watched instruments", moexSeconds.watched, 1);

  // 4. caps: MOEX_SECONDS_MAX=2 instruments, an index has no trades
  const gazp: any = await moexSeconds.subscribe(A, "GAZP");
  eq("second instrument fits", gazp.ok, true);
  const lkoh: any = await moexSeconds.subscribe(B, "LKOH");
  eq("a third instrument is over the cap", lkoh, { ok: false, reason: "limit" });
  eq("an index has no tape of trades", await moexSeconds.subscribe(B, "IMOEX"), { ok: false, reason: "unsupported" });
  eq("a bad ticker is refused before any request", await moexSeconds.subscribe(B, "../etc"), { ok: false, reason: "unknown" });
  eq("per-socket cap of 3 instruments does not trip at two", (await moexSeconds.subscribe(A, "SBER") as any).ok, true);

  // 4b. the stream drops: it reconnects by itself, re-subscribes everything and reads the gap with ONE history call per instrument
  {
    const subs0 = wsMessages.filter((m) => m.subscribeTradesRequest?.subscriptionAction === "SUBSCRIPTION_ACTION_SUBSCRIBE").length;
    const h0 = calls.filter((c) => c.endpoint === "MarketDataService/GetLastTrades").length;
    wsConn!.terminate();
    for (let i = 0; i < 100 && wsMessages.filter((m) => m.subscribeTradesRequest?.subscriptionAction === "SUBSCRIPTION_ACTION_SUBSCRIBE").length === subs0; i++) await sleep(100);
    const resub = wsMessages.slice(subs0).flatMap((m) => m.subscribeTradesRequest?.instruments ?? []).map((i: any) => i.instrumentId).sort();
    eq("after a drop the stream reconnects and re-subscribes both instruments", resub, ["uid-gazp", "uid-sber"]);
    await sleep(700);
    const gap = calls.filter((c) => c.endpoint === "MarketDataService/GetLastTrades").slice(h0);
    eq("the gap is read once per instrument, from just before the drop (not the whole hour)", [gap.length >= 2 && gap.length <= 4, gap.every((c) => Date.parse(c.body.to) - Date.parse(c.body.from) < 30_000)], [true, true]);
    const hist = (await moexSeconds.subscribe(A, "SBER")) as any;
    eq("no second was counted twice by the gap read (a trade is 10..30 shares, at most 2 per second here)", hist.bars.every((b: number[]) => b[5] <= 60), true);
  }

  // 5. reference counting: leaving viewers release the stream subscription after the grace period
  moexSeconds.unsubscribe(B, "SBER_TQBR");
  await sleep(500);
  eq("one viewer left of two: still subscribed", moexSeconds.watched, 2);
  moexSeconds.dropSocket("A");
  await sleep(900);
  eq("last viewer gone: instruments dropped and unsubscribed on the stream", [moexSeconds.watched, wsMessages.filter((m) => m.subscribeTradesRequest?.subscriptionAction === "SUBSCRIPTION_ACTION_UNSUBSCRIBE").flatMap((m) => m.subscribeTradesRequest.instruments.map((i: any) => i.instrumentId)).sort()], [0, ["uid-gazp", "uid-sber"]]);

  // 6. refusals
  mode = "429";
  const q: any = await moexSeconds.subscribe(mkSocket("C"), "LKOH");
  eq("429 from the API -> quota, no stream", q, { ok: false, reason: "quota" });
  const callsAfter = calls.length;
  const q2: any = await moexSeconds.subscribe(mkSocket("D"), "LKOH");
  eq("while backing off nothing is sent to the API", [q2.ok, calls.length], [false, callsAfter]);
  mode = "ok";
  process.env.MOEX_SECONDS = "0";
  eq("kill switch MOEX_SECONDS=0", await moexSeconds.subscribe(mkSocket("E"), "SBER"), { ok: false, reason: "off" });
  delete process.env.MOEX_SECONDS;
  const tok = process.env.TINKOFF_TOKEN;
  process.env.TINKOFF_TOKEN = "";
  eq("no token", await moexSeconds.subscribe(mkSocket("F"), "SBER"), { ok: false, reason: "token" });
  process.env.TINKOFF_TOKEN = tok;
}

main()
  .catch((e) => {
    fails++;
    console.log("FAIL threw", e);
  })
  .finally(() => {
    console.log(fails ? `\n${fails} check(s) FAILED` : "\nall moex-trades service checks passed");
    process.exit(fails ? 1 : 0);
  });
