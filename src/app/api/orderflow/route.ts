import { NextRequest, NextResponse } from "next/server";
import { aggregateBars } from "@/lib/orderflow/aggregate";
import { prepareBybit, bybitSupported } from "@/lib/orderflow/bybit";
import { prepareMoex } from "@/lib/orderflow/moex";
import { algopackEnabled } from "@/lib/algopack";
import { getAlgopackAccess } from "@/lib/algopack-access";

/* Order flow (footprint) data: for a list of bars, the traded volume per price level split into bid (market sells) and
   ask (market buys). POST { source, ticker, starts: number[] (real UTC ms, ascending), end: number, tick?: number }.
   Answer: { supported, bars:[{ i, lv:[price,bid,ask,...], dh, dl }], tick, nativeTick, cov:[[from,to]], pending, live }.
   Sources: Bybit spot (daily trade files + live WebSocket) and MOEX (ISS trades of the current session). Anything else is
   not supported and the client approximates from candles. Read-only, no auth, rate limited per IP. */

export const dynamic = "force-dynamic";

const MAX_BARS = 400;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 240;
const hits = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  h.n++;
  return h.n > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  if (limited(ip)) return NextResponse.json({ error: "rate limit" }, { status: 429 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const source = String(body?.source ?? "");
  const ticker = String(body?.ticker ?? "");
  const starts: number[] = Array.isArray(body?.starts) ? body.starts.map(Number) : [];
  const end = Number(body?.end);
  const wantTick = Number(body?.tick) || 0;
  const wantBig = body?.big === true;
  const wantLevels = body?.levels !== false;
  if (!ticker || starts.length === 0 || starts.length > MAX_BARS || starts.some((x) => !isFinite(x) || x <= 0) || !isFinite(end) || end <= starts[starts.length - 1]) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  for (let i = 1; i < starts.length; i++) if (starts[i] <= starts[i - 1]) return NextResponse.json({ error: "starts must ascend" }, { status: 400 });
  const noStore = { headers: { "Cache-Control": "no-store" } };
  // online trades from ALGOPACK for entitled requesters only (admins, or ALGOPACK_PUBLIC=1): checked on the server, per request
  const privileged = source === "moex" && algopackEnabled() && (await getAlgopackAccess()).allowed;
  const answerHeaders = privileged ? { "Cache-Control": "private, no-store", Vary: "Cookie" } : noStore.headers;
  const unsupported = NextResponse.json({ supported: false, bars: [], tick: 0, nativeTick: 0, cov: [], pending: false, live: false }, noStore);

  try {
    let prep = null;
    if (source === "bybit") {
      if (!bybitSupported(ticker)) return unsupported;
      prep = await prepareBybit(ticker, starts[0], end);
    } else if (source === "moex") {
      prep = await prepareMoex(ticker, starts[0], end, { privileged });
    } else return unsupported;
    if (!prep) return unsupported;

    const native = prep.nativeTick;
    if (!(native > 0)) {
      return NextResponse.json({ supported: true, bars: [], tick: 0, nativeTick: 0, cov: prep.cov, pending: prep.pending || prep.live, live: prep.live }, noStore);
    }
    const k = Math.max(1, Math.round(wantTick / native));
    const bars = wantLevels ? aggregateBars(prep.source, starts, end, native, k, prep.bounds) : [];
    return NextResponse.json(
      { supported: true, bars, tick: +(native * k).toFixed(10), nativeTick: native, cov: prep.cov, pending: prep.pending, live: prep.live, delayed: !!prep.delayed, now: Date.now(), ...(wantBig && prep.big ? { big: prep.big(starts[0], end, 300).map((x) => [x.t, x.p, x.v, x.b]) } : {}) },
      { headers: answerHeaders },
    );
  } catch (e) {
    return NextResponse.json({ error: "internal", message: String((e as Error)?.message ?? e) }, { status: 500 });
  }
}
