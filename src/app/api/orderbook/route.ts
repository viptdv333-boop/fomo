import { NextRequest, NextResponse } from "next/server";
import { denied, getAlgopackAccess, ipOf, overLimit, PRIVATE_HEADERS } from "@/lib/algopack-access";
import { loadBook } from "@/lib/algopack-data";
import { resolveMoex } from "@/lib/moex-resolve";

/* Live order book (depth ladder) of a MOEX instrument from ALGOPACK (online order books, Promo).
   GET /api/orderbook?secid=SBER   (a share, an exact futures contract, a generic futures ticker -> front contract, a currency pair)
   -> { ok, secid, board, ts, upd?, bids: [[price, qty], ...], asks: [[price, qty], ...] }  at most 50 levels a side.
   ACCESS: admins only (or ALGOPACK_PUBLIC=1) — checked here, on the server. Everyone else gets 403 and never any data.
   Cached ~2 s upstream and rate limited per IP; the answer is private (never stored by a shared cache). */

export const dynamic = "force-dynamic";

const MAX_LEVELS = 50;

export async function GET(req: NextRequest) {
  const access = await getAlgopackAccess();
  if (!access.allowed) return denied(access);
  if (overLimit(`orderbook:${ipOf(req)}`, 90)) return NextResponse.json({ ok: false, reason: "rate-limit" }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "10" } });

  const secid = (req.nextUrl.searchParams.get("secid") || req.nextUrl.searchParams.get("ticker") || "").trim();
  if (!/^[A-Za-z0-9_.-]{1,24}$/.test(secid)) return NextResponse.json({ ok: false, reason: "bad-secid" }, { status: 400, headers: PRIVATE_HEADERS });

  const sec = await resolveMoex(secid);
  if (!sec) return NextResponse.json({ ok: false, reason: "unknown-instrument" }, { headers: PRIVATE_HEADERS });
  if (sec.engine === "stock" && sec.market === "index") return NextResponse.json({ ok: false, reason: "no-book" }, { headers: PRIVATE_HEADERS });

  const r = await loadBook(sec);
  if (!r.ok || !r.book) return NextResponse.json({ ok: false, reason: r.reason, secid: sec.secid }, { headers: PRIVATE_HEADERS });
  const { bids, asks, upd } = r.book;
  return NextResponse.json(
    {
      ok: true,
      secid: sec.secid,
      board: sec.board,
      group: sec.group,
      ts: Date.now(),
      ...(upd ? { upd } : {}),
      bids: bids.slice(0, MAX_LEVELS).map((x) => [x.p, x.q]),
      asks: asks.slice(0, MAX_LEVELS).map((x) => [x.p, x.q]),
    },
    { headers: PRIVATE_HEADERS },
  );
}
