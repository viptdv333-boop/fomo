/* Offline check of the Databento live client (src/lib/data/databento-live.ts) against a local mock gateway that speaks the raw Live protocol:
   greeting + cram challenge, the sha256 auth answer, subscriptions, start_session, then JSON lines (symbol mapping + 1-second bars).
   Run: npx tsx scripts/check-databento-live.ts */
import { createHash } from "node:crypto";
import net from "node:net";

const KEY = "db-abcdefghijklmnopqrstuvwxyz012";
let fails = 0;
const ok = (c: boolean, what: string, extra = "") => {
  console.log(`${c ? "ok  " : "FAIL"} ${what}${c ? "" : " " + extra}`);
  if (!c) fails++;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const seen: string[] = [];
let behaviour: "good" | "badkey" = "good";
const server = net.createServer((sock) => {
  sock.setEncoding("utf8");
  const challenge = "CHALLENGE123";
  sock.write(`lsg_version=0.9.4\ncram=${challenge}\n`);
  let buf = "";
  let t0 = Math.floor(Date.now() / 60_000) * 60_000;
  sock.on("data", (d: string) => {
    buf += d;
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      seen.push(line);
      if (line.startsWith("auth=")) {
        const [resp] = line.slice(5).split("|");
        const want = `${createHash("sha256").update(`${challenge}|${KEY}`).digest("hex")}-${KEY.slice(-5)}`;
        sock.write(resp === want && behaviour === "good" ? "success=1|session_id=abc\n" : "success=0|error=Authentication failed\n");
        if (resp !== want || behaviour !== "good") sock.end();
      } else if (line === "start_session") {
        const rec = (o: number, h: number, l: number, c: number, v: number, sec: number) =>
          JSON.stringify({ hd: { ts_event: String((t0 + sec * 1000) * 1_000_000), rtype: 32, publisher_id: 1, instrument_id: 42 }, open: String(Math.round(o * 1e9)), high: String(Math.round(h * 1e9)), low: String(Math.round(l * 1e9)), close: String(Math.round(c * 1e9)), volume: String(v) });
        sock.write(JSON.stringify({ hd: { ts_event: String(t0 * 1_000_000), rtype: 22, instrument_id: 42 }, stype_in_symbol: "ES.c.0", stype_out_symbol: "ESZ6" }) + "\n");
        sock.write(rec(4500.25, 4500.5, 4500.0, 4500.25, 10, 1) + "\n");
        sock.write(rec(4500.25, 4501.0, 4500.25, 4500.75, 5, 2) + "\n");
        sock.write(JSON.stringify({ hd: { ts_event: String(t0 * 1_000_000), rtype: 23 }, msg: "Heartbeat" }) + "\n");
        sock.write(rec(4500.75, 4500.75, 4499.5, 4499.75, 7, 61) + "\n"); // next minute
      }
    }
  });
});

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.DATABENTO_LIVE_MOCK = `127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  const { liveOf } = await import("../src/lib/data/databento-live");
  const spec = { dataset: "GLBX.MDP3", symbol: "ES.c.0", stype: "continuous" as const };

  const first = liveOf(KEY, spec);
  ok(first.bars.length === 0, "the first request only opens the session (no data yet)");
  await sleep(600);
  const r = liveOf(KEY, spec);
  ok(r.state === "live", "authenticated and live", r.state + " " + r.reason);
  ok(seen.some((l) => l.startsWith("auth=") && l.includes("|dataset=GLBX.MDP3|encoding=json")), "auth line carries dataset and json encoding", JSON.stringify(seen));
  ok(seen.includes("schema=ohlcv-1s|stype_in=continuous|symbols=ES.c.0|snapshot=0|is_last=1"), "subscription line", JSON.stringify(seen));
  ok(seen.indexOf("start_session") > seen.findIndex((l) => l.startsWith("schema=")), "start_session after the subscription");
  ok(r.bars.length === 2, "two minute bars", String(r.bars.length));
  const m0 = r.bars[0];
  ok(m0 && m0.open === 4500.25 && m0.high === 4501 && m0.low === 4500 && m0.close === 4500.75 && m0.volume === 15, "1-second bars folded into one minute bar", JSON.stringify(m0));
  ok(r.last === 4499.75, "last price is the newest bar's close", String(r.last));
  ok(!JSON.stringify(seen).includes(KEY), "the raw key is never sent, only the hash and its last 5 characters");

  // a refused key: state "refused", nothing thrown, no data
  behaviour = "badkey";
  const spec2 = { dataset: "XNAS.ITCH", symbol: "AAPL", stype: "raw_symbol" as const };
  liveOf(KEY, spec2);
  await sleep(500);
  const bad = liveOf(KEY, spec2);
  ok(bad.state === "refused" && bad.bars.length === 0, "a refused key leaves no data and says so", bad.state);

  server.close();
  console.log(fails ? `\n${fails} FAILED` : "\nall ok");
  process.exit(fails ? 1 : 0);
})();
