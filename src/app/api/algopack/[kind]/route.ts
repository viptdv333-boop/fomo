import { NextRequest, NextResponse } from "next/server";
import { denied, getAlgopackAccess, ipOf, overLimit, PRIVATE_HEADERS } from "@/lib/algopack-access";
import { clampFrom, loadAlerts, loadFutoi, loadHi2, loadSuperCandles, locate } from "@/lib/algopack-data";

/* Promo-only ALGOPACK datasets for the chart's indicators and panels.
     GET /api/algopack/status
     GET /api/algopack/futoi?ticker=MIX&from=YYYY-MM-DD            FUTOI (futures only): { cols, rows } one row per 5-min snapshot
     GET /api/algopack/supercandles?ticker=SBER&from=..&sets=ts,os,ob   tradestats / orderstats / obstats per 5-min bar
     GET /api/algopack/alerts?ticker=SBER&from=..                  Mega Alerts of the instrument
     GET /api/algopack/hi2?ticker=SBER&from=..                     HI2 concentration, daily
   Times are `w`: Moscow wall clock read as UTC ms (see lib/algopack-parse.ts). ACCESS: admins only (or ALGOPACK_PUBLIC=1),
   enforced here; the answers are private. Without the key every data route answers 404 and nothing leaves the server. */

export const dynamic = "force-dynamic";

const KINDS = new Set(["status", "futoi", "supercandles", "alerts", "hi2"]);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: PRIVATE_HEADERS });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params;
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, reason: "unknown-kind" }, { status: 404 });
  const access = await getAlgopackAccess();
  if (kind === "status") return json({ ok: true, allowed: access.allowed, why: access.why });
  if (!access.allowed) return denied(access);
  if (overLimit(`algopack:${ipOf(req)}`, 120)) return NextResponse.json({ ok: false, reason: "rate-limit" }, { status: 429, headers: { ...PRIVATE_HEADERS, "Retry-After": "10" } });

  const sp = req.nextUrl.searchParams;
  const loc = await locate((sp.get("ticker") || "").trim());
  if ("error" in loc) return json({ ok: false, reason: loc.error });
  const { sec, market } = loc;
  const base = { kind, secid: sec.secid, market, at: Date.now() };

  try {
    if (kind === "futoi") {
      const r = await loadFutoi(sec, clampFrom(sp.get("from"), 4, 30));
      return json(r.ok ? { ok: true, ...base, ticker: r.ticker, ...r.tbl } : { ok: false, ...base, reason: r.reason });
    }
    if (kind === "supercandles") {
      const sets = (sp.get("sets") || "ts").split(",").filter((s) => s === "ts" || s === "os" || s === "ob");
      if (sets.length === 0) return json({ ok: false, ...base, reason: "no-sets" });
      const r = await loadSuperCandles(sec.secid, market, clampFrom(sp.get("from"), 3, 25), sets);
      return json({ ok: r.ok, ...base, reason: r.reason, basis: r.basis, ts: r.ts, os: r.os, ob: r.ob, reasons: r.reasons });
    }
    if (kind === "alerts") {
      const r = await loadAlerts(sec.secid, market, clampFrom(sp.get("from"), 3, 10));
      return json(r.ok ? { ok: true, ...base, alerts: r.alerts } : { ok: false, ...base, reason: r.reason });
    }
    // hi2
    const r = await loadHi2(sec.secid, market, clampFrom(sp.get("from"), 120, 400));
    return json(r.ok ? { ok: true, ...base, ...r.hi2 } : { ok: false, ...base, reason: r.reason });
  } catch {
    return json({ ok: false, ...base, reason: "internal" }, 500);
  }
}
