/* DEV ONLY: a local stand-in for the ALGOPACK gateway (apim.moex.com/iss), serving deterministic synthetic data in the documented
   response shapes. Used to try the terminal UI and scripts/check-algopack.ts without a subscription.
     npx tsx scripts/mock-algopack.ts            (port 4010, key "mock-local-key")
   then start the app / the smoke script with
     ALGOPACK_BASE=http://localhost:4010/iss ALGOPACK_KEY=mock-local-key ALGOPACK_PUBLIC=1
   ALGOPACK_BASE accepts only the real gateway or http://localhost|127.0.0.1, so the real key can never be sent here by mistake.
   MOCK_DENY=futoi,alerts  makes those products answer 403 (entitlement missing). */
import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 4010);
const KEY = "mock-local-key";
const DENY = new Set((process.env.MOCK_DENY || "").split(",").filter(Boolean));
const MIN = 60_000;
const DAY = 86_400_000;
const MSK = 3 * 3_600_000;

const pad = (n: number) => String(n).padStart(2, "0");
/** wall-as-UTC ms -> "YYYY-MM-DD HH:MM:SS" */
const fmt = (w: number) => {
  const d = new Date(w);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
};
const nowWall = () => Date.now() + MSK;
const dateOf = (w: number) => fmt(w).slice(0, 10);
const wallOfDate = (s: string) => Date.parse(`${s}T00:00:00Z`);

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const rnd = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};
const BASES: Record<string, number> = { SBER: 300, GAZP: 160, LKOH: 7000 };
const baseOf = (secid: string) => BASES[secid] ?? (/^[A-Za-z]{2}[FGHJKMNQUVXZ]\d$/.test(secid) ? 95000 : 100 + (hash(secid) % 900));
const stepOf = (secid: string) => (baseOf(secid) > 1000 ? 1 : 0.01);

/** Deterministic 1-minute close of an instrument at wall minute m (since epoch). */
function px(secid: string, m: number): number {
  const b = baseOf(secid);
  const st = stepOf(secid);
  const v = b * (1 + 0.012 * Math.sin(m / 700) + 0.004 * Math.sin(m / 90) + 0.0012 * (rnd(m + hash(secid) % 97) - 0.5));
  return +(Math.round(v / st) * st).toFixed(4);
}

const isTrading = (w: number) => {
  const d = new Date(w);
  const dow = d.getUTCDay();
  const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
  return dow !== 0 && dow !== 6 && mins >= 10 * 60 && mins < 18 * 60 + 50;
};

interface Bar {
  b: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

function minuteBar(secid: string, wMin: number): Bar | null {
  const m = Math.floor(wMin / MIN);
  if (!isTrading(wMin)) return null;
  const o = px(secid, m - 1);
  const c = px(secid, m);
  const st = stepOf(secid);
  const h = +(Math.max(o, c) + Math.round(rnd(m * 3) * 3) * st).toFixed(4);
  const l = +(Math.min(o, c) - Math.round(rnd(m * 5) * 3) * st).toFixed(4);
  return { b: wMin, o, h, l, c, v: 100 + Math.floor(rnd(m * 7) * 4000) };
}

function bars(secid: string, interval: number, fromW: number, tillW: number): Bar[] {
  const out: Bar[] = [];
  const span = interval === 24 ? DAY : interval === 7 ? 7 * DAY : interval === 31 ? 31 * DAY : interval * MIN;
  const end = Math.min(tillW, nowWall());
  let start = Math.floor(fromW / span) * span;
  if (interval === 7) start = fromW - ((new Date(fromW).getUTCDay() + 6) % 7) * DAY;
  if (end - start > 400 * DAY) start = end - 400 * DAY;
  if (interval < 24 && end - start > 20 * DAY) start = Math.floor((end - 20 * DAY) / span) * span;
  for (let s = start; s < end; s += span) {
    let cur: Bar | null = null;
    // aggregate the minutes inside [s, s+span): only trading minutes count
    const stop = Math.min(s + span, end + MIN);
    for (let w = s; w < stop; w += MIN) {
      const mb = minuteBar(secid, w);
      if (!mb || w > end) continue;
      if (!cur) cur = { ...mb, b: s };
      else {
        cur.h = Math.max(cur.h, mb.h);
        cur.l = Math.min(cur.l, mb.l);
        cur.c = mb.c;
        cur.v += mb.v;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

const block = (name: string, columns: string[], data: unknown[][]) => ({ [name]: { metadata: {}, columns, data } });

function candles(secid: string, q: URLSearchParams) {
  const interval = Number(q.get("interval") || 1);
  const fromW = q.get("from") ? wallOfDate(q.get("from")!.slice(0, 10)) : wallOfDate(dateOf(nowWall() - 3 * DAY));
  const tillW = q.get("till") ? wallOfDate(q.get("till")!.slice(0, 10)) + DAY : nowWall() + MIN;
  let rows = bars(secid, interval, fromW, tillW);
  if (q.get("iss.reverse") === "true") rows = rows.reverse();
  const start = Number(q.get("start") || 0);
  rows = rows.slice(start, start + 500);
  const span = interval === 24 ? DAY : interval === 7 ? 7 * DAY : interval === 31 ? 31 * DAY : interval * MIN;
  return block(
    "candles",
    ["open", "close", "high", "low", "value", "volume", "begin", "end"],
    rows.map((r) => [r.o, r.c, r.h, r.l, Math.round(r.c * r.v), r.v, fmt(r.b), fmt(r.b + span - 1000)]),
  );
}

function trades(secid: string, q: URLSearchParams) {
  // one trade every ~3 s of the current session, newest last by TRADENO
  const now = nowWall();
  const day = Math.floor(now / DAY) * DAY;
  const s0 = day + 10 * 3_600_000;
  const n = isTrading(now) ? Math.floor((now - s0) / 3000) : Math.floor((day + 18.8 * 3_600_000 - s0) / 3000);
  const all: unknown[][] = [];
  for (let i = 1; i <= Math.max(0, n); i++) {
    const w = s0 + i * 3000;
    const price = px(secid, Math.floor(w / MIN)) + (rnd(i) > 0.5 ? stepOf(secid) : 0);
    all.push([i, dateOf(w), fmt(w).slice(11), price, 1 + Math.floor(rnd(i * 3) * 200), rnd(i * 11) > 0.48 ? "B" : "S"]);
  }
  const rows = q.get("reversed") === "1" || q.get("reversed") === "true" ? all.reverse() : all;
  const start = Number(q.get("start") || 0);
  const limit = Math.min(5000, Number(q.get("limit") || 5000));
  return block("trades", ["TRADENO", "TRADEDATE", "TRADETIME", "PRICE", "QUANTITY", "BUYSELL"], rows.slice(start, start + limit));
}

function orderbook(secid: string) {
  const w = nowWall();
  const mid = px(secid, Math.floor(w / MIN));
  const st = stepOf(secid);
  const rows: unknown[][] = [];
  const t = fmt(w).slice(11);
  for (let i = 0; i < 25; i++) {
    const k = Math.floor(w / 2000);
    rows.push(["TQBR", secid, "B", +(mid - (i + 1) * st).toFixed(4), 200 + Math.floor(rnd(k * 31 + i) * 6000), 1, t, 2]);
    rows.push(["TQBR", secid, "S", +(mid + i * st).toFixed(4), 200 + Math.floor(rnd(k * 17 + i + 99) * 6000), 1, t, 2]);
  }
  return block("orderbook", ["BOARDID", "SECID", "BUYSELL", "PRICE", "QUANTITY", "SEQNUM", "UPDATETIME", "DECIMALS"], rows);
}

/** 5-minute bar starts of the trading days in [from, till] that already closed */
function fiveMin(fromD: string, tillD: string): number[] {
  const out: number[] = [];
  const now = nowWall();
  for (let d = wallOfDate(fromD); d <= wallOfDate(tillD); d += DAY) {
    for (let s = d + 10 * 3_600_000; s < d + (18 * 60 + 50) * MIN; s += 5 * MIN) {
      if (isTrading(s) && s + 5 * MIN <= now) out.push(s);
    }
  }
  return out;
}

function datashop(kind: string, secid: string, q: URLSearchParams) {
  const fromD = q.get("from") || q.get("date") || dateOf(nowWall());
  const tillD = q.get("till") || q.get("date") || dateOf(nowWall());
  const page = (rows: unknown[][], name: string, cols: string[]) => {
    const start = Number(q.get("start") || 0);
    return block(name, cols, rows.slice(start, start + 1000));
  };
  if (kind === "tradestats") {
    const cols = ["tradedate", "tradetime", "secid", "pr_open", "pr_high", "pr_low", "pr_close", "pr_std", "vol", "val", "trades", "pr_vwap", "pr_change", "trades_b", "trades_s", "val_b", "val_s", "vol_b", "vol_s", "disb", "pr_vwap_b", "pr_vwap_s", "systime"];
    const rows = fiveMin(fromD, tillD).map((s) => {
      const m = Math.floor(s / MIN);
      const o = px(secid, m - 1);
      const c = px(secid, m + 4);
      const vb = 2000 + Math.floor(rnd(m) * 9000);
      const vs = 2000 + Math.floor(rnd(m + 1) * 9000);
      const tr = 150 + Math.floor(rnd(m + 2) * 400);
      const tb = Math.round((tr * vb) / (vb + vs));
      return [dateOf(s), fmt(s).slice(11), secid, o, Math.max(o, c) + stepOf(secid), Math.min(o, c) - stepOf(secid), c, 0.1, vb + vs, (vb + vs) * c, tr, c, +(((c - o) / o) * 100).toFixed(3), tb, tr - tb, vb * c, vs * c, vb, vs, +((vb - vs) / (vb + vs)).toFixed(4), c, c, fmt(s + 5 * MIN + 7000)];
    });
    return page(rows, "data", cols);
  }
  if (kind === "orderstats") {
    const cols = ["tradedate", "tradetime", "secid", "put_orders_b", "put_orders_s", "put_orders", "put_vol_b", "put_vol_s", "put_vol", "put_val_b", "put_val_s", "put_val", "put_vwap_b", "put_vwap_s", "cancel_orders_b", "cancel_orders_s", "cancel_orders", "cancel_vol_b", "cancel_vol_s", "cancel_vol", "cancel_val_b", "cancel_val_s", "cancel_val", "cancel_vwap_b", "cancel_vwap_s", "systime"];
    const rows = fiveMin(fromD, tillD).map((s) => {
      const m = Math.floor(s / MIN);
      const pb = 500 + Math.floor(rnd(m + 3) * 500);
      const ps = 500 + Math.floor(rnd(m + 4) * 500);
      const cb = Math.floor(pb * (0.4 + rnd(m + 5) * 0.5));
      const cs = Math.floor(ps * (0.4 + rnd(m + 6) * 0.5));
      const c = px(secid, m);
      return [dateOf(s), fmt(s).slice(11), secid, pb, ps, pb + ps, pb * 30, ps * 30, (pb + ps) * 30, pb * 30 * c, ps * 30 * c, (pb + ps) * 30 * c, c, c, cb, cs, cb + cs, cb * 30, cs * 30, (cb + cs) * 30, cb * 30 * c, cs * 30 * c, (cb + cs) * 30 * c, c, c, fmt(s + 5 * MIN + 9000)];
    });
    return page(rows, "data", cols);
  }
  if (kind === "obstats") {
    const cols = ["tradedate", "tradetime", "secid", "spread_bbo", "spread_lv10", "spread_1mio", "levels_b", "levels_s", "vol_b", "vol_s", "val_b", "val_s", "imbalance_vol_bbo", "imbalance_val_bbo", "imbalance_vol", "imbalance_val", "systime"];
    const rows = fiveMin(fromD, tillD).map((s) => {
      const m = Math.floor(s / MIN);
      const vb = 100000 + Math.floor(rnd(m + 7) * 300000);
      const vs = 100000 + Math.floor(rnd(m + 8) * 300000);
      const imb = +((vb - vs) / (vb + vs)).toFixed(4);
      return [dateOf(s), fmt(s).slice(11), secid, +(0.8 + rnd(m + 9) * 1.6).toFixed(3), +(3 + rnd(m + 10) * 6).toFixed(3), +(5 + rnd(m + 11) * 10).toFixed(3), 20, 22, vb, vs, vb * 300, vs * 300, +(rnd(m + 12) * 1.6 - 0.8).toFixed(4), +(rnd(m + 13) * 1.6 - 0.8).toFixed(4), imb, imb, fmt(s + 5 * MIN + 8000)];
    });
    return page(rows, "data", cols);
  }
  if (kind === "alerts") {
    const cols = ["tradedate", "tradetime", "secid", "alert_type", "threshold", "value", "reference", "systime"];
    const types = ["vol_b_99_9_pctl", "vol_s_99_9_pctl", "pr_change_99_9_pctl-", "pr_change_99_9_pctl+", "net_vol_99_9_pctl+", "vol_99_9_pctl", "pr_high_max", "pr_low_min"];
    const ref = '[{"m_5": ["0.086", "-0.078", "25", "18", "0.017"], "m_15": ["0.134", "-0.101", "22", "21", "0.019"], "m_30": ["0.161", "-0.138", "22", "20", "0.018"], "h_1": ["0.215", "-0.146", "18", "26", "0.002"]}]';
    const rows: unknown[][] = [];
    for (const s of fiveMin(fromD, tillD)) {
      const m = Math.floor(s / MIN);
      if (rnd(m + 21) > 0.12) continue;
      const w = s + Math.floor(rnd(m + 22) * 5) * MIN;
      rows.push([dateOf(w), fmt(w).slice(11), secid, types[Math.floor(rnd(m + 23) * types.length)], 100000, 100000 + Math.floor(rnd(m + 24) * 90000), ref, fmt(w + 60000)]);
    }
    return page(rows, "data", cols);
  }
  if (kind === "hi2") {
    const rows: unknown[][] = [];
    for (let d = wallOfDate(fromD); d <= wallOfDate(tillD); d += DAY) {
      const wd = new Date(d).getUTCDay();
      if (wd === 0 || wd === 6 || d + 19 * 3_600_000 > nowWall()) continue;
      const k = Math.floor(d / DAY);
      for (const [i, metric] of ["hhi_volume", "hhi_buy", "hhi_sell", "hhi_aggressive", "hhi_passive"].entries()) rows.push([dateOf(d), "19:00:00", secid, metric, Math.round(700 + rnd(k + i) * 2200), null, `${dateOf(d)} 19:05:00`]);
    }
    return page(rows, "data", ["tradedate", "tradetime", "secid", "metric", "value", "reference", "systime"]);
  }
  return null;
}

function futoi(ticker: string, q: URLSearchParams) {
  const fromD = q.get("from") || dateOf(nowWall());
  const tillD = q.get("till") || dateOf(nowWall());
  const rows: unknown[][] = [];
  let n = 0;
  const now = nowWall();
  for (let d = wallOfDate(fromD); d <= wallOfDate(tillD); d += DAY) {
    const wd = new Date(d).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    for (let s = d + 9 * 3_600_000; s < d + 23.8 * 3_600_000; s += 5 * MIN) {
      if (s > now) break;
      const m = Math.floor(s / MIN);
      n++;
      const drift = Math.sin(m / 400);
      rows.push([1, n * 2, dateOf(s), fmt(s).slice(11), ticker, "FIZ", Math.round(-5000 + drift * 3000), 40000 + Math.round(drift * 2000), -(45000 + Math.round(drift * -1000)), 3100, 4200, fmt(s + 4000)]);
      rows.push([1, n * 2 + 1, dateOf(s), fmt(s).slice(11), ticker, "YUR", Math.round(5000 - drift * 3000), 160000 + Math.round(drift * 3000), -(155000 + Math.round(drift * 1000)), 900, 850, fmt(s + 4000)]);
    }
  }
  const start = Number(q.get("start") || 0);
  return block("futoi", ["sess_id", "seqnum", "tradedate", "tradetime", "ticker", "clgroup", "pos", "pos_long", "pos_short", "pos_long_num", "pos_short_num", "systime"], rows.slice(start, start + 1000));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  if (req.headers.authorization !== `Bearer ${KEY}`) return send(401, { error: "unauthorized" });
  const p = url.pathname.replace(/^\/iss/, "");
  const q = url.searchParams;
  let m: RegExpMatchArray | null;
  if ((m = p.match(/\/securities\/([^/]+)\/candles\.json$/))) return send(200, candles(decodeURIComponent(m[1]), q));
  if ((m = p.match(/\/securities\/([^/]+)\/trades\.json$/))) return send(200, trades(decodeURIComponent(m[1]), q));
  if ((m = p.match(/\/securities\/([^/]+)\/orderbook\.json$/))) return send(200, orderbook(decodeURIComponent(m[1])));
  if ((m = p.match(/^\/datashop\/algopack\/(eq|fo|fx)\/(tradestats|orderstats|obstats|alerts|hi2)\/([^/]+)\.json$/))) {
    if (DENY.has(m[2])) return send(403, "Forbidden");
    const d = datashop(m[2], decodeURIComponent(m[3]), q);
    return d ? send(200, d) : send(404, {});
  }
  if ((m = p.match(/^\/analyticalproducts\/futoi\/securities\/([^/]+)\.json$/))) {
    if (DENY.has("futoi")) return send(403, "Forbidden");
    const t = decodeURIComponent(m[1]);
    // only the underlying code is a FUTOI ticker (not the contract id)
    if (!/^[A-Za-z]{2}$/.test(t)) return send(200, block("futoi", [], []));
    return send(200, futoi(t, q));
  }
  send(404, { error: "not found", path: p });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock ALGOPACK gateway on http://127.0.0.1:${PORT}/iss  (key: ${KEY})${DENY.size ? `  deny: ${[...DENY].join(",")}` : ""}`));
