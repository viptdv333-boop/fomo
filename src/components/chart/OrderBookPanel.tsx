"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { buildLadder, priceDecimals } from "@/lib/orderbook-math";
import type { TerminalInstrument } from "@/lib/terminal-data";

/* «Стакан»: live depth ladder of a MOEX instrument (MOEX ALGOPACK online order books, Promo). Best N levels per side with
   volume bars, spread, mid price, imbalance; a click on a price copies it. Refreshed every 2.5 s while the panel is on screen.
   The server (/api/orderbook) serves it to entitled requesters only (admins unless ALGOPACK_PUBLIC=1); everyone else gets a note. */

const POLL_MS = 2500;
const LEVEL_CHOICES = [5, 10, 15, 20];
const LS_LEVELS = "fomo-ob-levels";

interface BookData {
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
  upd?: string;
}
type Status = "loading" | "ok" | "empty" | "denied" | "unsupported" | "error";

function fmtQty(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v * 100) / 100);
}

async function copyText(s: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(s);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export default function OrderBookPanel({ inst, visible }: { inst: TerminalInstrument; visible: boolean }) {
  const { t } = useT();
  const [levels, setLevels] = useState(10);
  const [data, setData] = useState<BookData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState<{ s: string; ok: boolean } | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMoex = inst.source === "moex";
  const ticker = inst.dataTicker;

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LS_LEVELS));
      if (LEVEL_CHOICES.includes(v)) setLevels(v);
    } catch {}
  }, []);

  /* polling while the panel is visible */
  useEffect(() => {
    setData(null);
    setStatus("loading");
    if (!visible || !isMoex) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = POLL_MS;
    const tick = async () => {
      if (stopped) return;
      if (document.hidden) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/orderbook?secid=${encodeURIComponent(ticker)}`, { cache: "no-store" });
        if (stopped) return;
        if (res.status === 403 || res.status === 404) {
          setStatus("denied");
          // entitlement does not change within a session often: look again rarely
          delay = 60_000;
        } else if (res.status === 429) {
          delay = 10_000;
        } else {
          const j = await res.json().catch(() => null);
          if (stopped) return;
          if (j?.ok) {
            const bids: [number, number][] = Array.isArray(j.bids) ? j.bids : [];
            const asks: [number, number][] = Array.isArray(j.asks) ? j.asks : [];
            if (bids.length === 0 && asks.length === 0) {
              setStatus("empty");
              setData(null);
            } else {
              setData({ bids, asks, ts: typeof j.ts === "number" ? j.ts : Date.now(), upd: typeof j.upd === "string" ? j.upd : undefined });
              setStatus("ok");
            }
            delay = POLL_MS;
          } else if (j?.reason === "unknown-instrument" || j?.reason === "no-book") {
            setStatus("unsupported");
            delay = 60_000;
          } else {
            setStatus((s) => (s === "ok" ? s : "error"));
            delay = 8000;
          }
        }
      } catch {
        if (!stopped) setStatus((s) => (s === "ok" ? s : "error"));
        delay = 8000;
      }
      if (!stopped) timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [visible, isMoex, ticker]);

  const ladder = useMemo(() => (data ? buildLadder(data.bids.map(([p, q]) => ({ p, q })), data.asks.map(([p, q]) => ({ p, q })), levels) : null), [data, levels]);
  const dec = useMemo(() => (data ? priceDecimals([...data.bids.slice(0, 20), ...data.asks.slice(0, 20)].map((x) => x[0])) : 2), [data]);

  const copy = useCallback(
    async (price: number) => {
      const s = price.toFixed(dec);
      const ok = await copyText(s);
      setCopied({ s, ok });
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(null), 1600);
    },
    [dec],
  );

  const pickLevels = (n: number) => {
    setLevels(n);
    try {
      localStorage.setItem(LS_LEVELS, String(n));
    } catch {}
  };

  const note = !isMoex
    ? t("ap.ob.moexOnly")
    : status === "denied"
      ? t("ap.ob.denied")
      : status === "unsupported"
        ? t("ap.ob.unsupported")
        : status === "error"
          ? t("ap.ob.error")
          : status === "empty"
            ? t("ap.ob.empty")
            : status === "loading"
              ? t("ap.ob.loading")
              : "";

  if (!ladder || status !== "ok") {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-xs text-gray-500 dark:text-gray-400" data-testid="ob-note">
        {note}
      </div>
    );
  }

  const imbPct = ladder.imbalance === null ? null : ladder.imbalance * 100;
  const bidShare = ladder.sumBid + ladder.sumAsk > 0 ? (ladder.sumBid / (ladder.sumBid + ladder.sumAsk)) * 100 : 50;
  const asksTopDown = ladder.asks.slice().reverse();
  const fmtP = (p: number) => p.toFixed(dec);

  const row = (p: number, q: number, cum: number, side: "bid" | "ask") => {
    const w = ladder.maxQty > 0 ? Math.max(2, (q / ladder.maxQty) * 100) : 0;
    const wc = ladder.maxCum > 0 ? (cum / ladder.maxCum) * 100 : 0;
    const bar = side === "bid" ? "bg-green-500/20" : "bg-red-500/20";
    const cbar = side === "bid" ? "bg-green-500/8" : "bg-red-500/8";
    return (
      <button
        key={`${side}${p}`}
        type="button"
        onClick={() => void copy(p)}
        title={t("ap.ob.copy")}
        className="group relative grid w-full grid-cols-3 items-center gap-1 px-2 h-[22px] md:h-[20px] text-[11px] tabular-nums cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
        data-side={side}
      >
        <span className={`absolute inset-y-0 right-0 ${cbar}`} style={{ width: `${wc}%` }} />
        <span className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${w}%` }} />
        <span className={`relative text-left font-medium ${side === "bid" ? "text-green-600" : "text-red-500"}`}>{fmtP(p)}</span>
        <span className="relative text-right text-gray-800 dark:text-gray-200">{fmtQty(q)}</span>
        <span className="relative text-right text-gray-400">{fmtQty(cum)}</span>
      </button>
    );
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col text-gray-800 dark:text-gray-200" data-testid="orderbook">
      {/* summary */}
      <div className="shrink-0 grid grid-cols-3 gap-1 px-2 pt-2 pb-1.5 text-[10px] text-gray-500">
        <div>
          <div>{t("ap.ob.spread")}</div>
          <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 tabular-nums" data-testid="ob-spread">
            {ladder.spread !== null ? ladder.spread.toFixed(dec) : "—"}
            {ladder.spreadPct !== null && <span className="ml-1 text-[10px] font-normal text-gray-400">{ladder.spreadPct.toFixed(3)}%</span>}
          </div>
        </div>
        <div className="text-center">
          <div>{t("ap.ob.mid")}</div>
          <div className="text-[12px] font-semibold text-gray-800 dark:text-gray-100 tabular-nums" data-testid="ob-mid">
            {ladder.mid !== null ? (Math.abs(ladder.mid * 10 ** dec - Math.round(ladder.mid * 10 ** dec)) > 1e-6 ? ladder.mid.toFixed(dec + 1) : ladder.mid.toFixed(dec)) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div>{t("ap.ob.imb")}</div>
          <div className={`text-[12px] font-semibold tabular-nums ${imbPct === null ? "" : imbPct >= 0 ? "text-green-600" : "text-red-500"}`} data-testid="ob-imb">
            {imbPct === null ? "—" : `${imbPct > 0 ? "+" : ""}${imbPct.toFixed(1)}%`}
          </div>
        </div>
      </div>
      <div className="shrink-0 mx-2 mb-1.5 flex h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700" aria-hidden>
        <div className="bg-green-500" style={{ width: `${bidShare}%` }} />
        <div className="bg-red-500" style={{ width: `${100 - bidShare}%` }} />
      </div>

      {/* column heads */}
      <div className="shrink-0 grid grid-cols-3 gap-1 px-2 pb-0.5 text-[10px] uppercase tracking-wide text-gray-400">
        <span>{t("ap.ob.price")}</span>
        <span className="text-right">{t("ap.ob.size")}</span>
        <span className="text-right">{t("ap.ob.total")}</span>
      </div>

      {/* ladder: asks above (best nearest the middle), bids below */}
      <div className="flex-1 min-h-0 overflow-y-auto" data-testid="ob-ladder">
        <div className="flex flex-col justify-end min-h-full">
          {asksTopDown.map((a) => row(a.p, a.q, a.cum, "ask"))}
          <div className="my-0.5 flex items-center justify-between border-y border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-semibold tabular-nums dark:border-gray-700 dark:bg-gray-800/60">
            <span className="text-green-600">{ladder.bestBid !== null ? fmtP(ladder.bestBid) : "—"}</span>
            <span className="text-[10px] font-normal text-gray-400">{ladder.spread !== null ? ladder.spread.toFixed(dec) : ""}</span>
            <span className="text-red-500">{ladder.bestAsk !== null ? fmtP(ladder.bestAsk) : "—"}</span>
          </div>
          {ladder.bids.map((b) => row(b.p, b.q, b.cum, "bid"))}
        </div>
      </div>

      {/* footer */}
      <div className="shrink-0 flex items-center gap-2 border-t border-gray-100 px-2 py-1.5 text-[10px] text-gray-400 dark:border-gray-800">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {t("ap.ob.live")}
          {data?.upd ? ` · ${data.upd}` : ""}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {t("ap.ob.levels")}
          {LEVEL_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => pickLevels(n)}
              className={`rounded px-1.5 py-0.5 cursor-pointer ${levels === n ? "bg-green-600/15 text-green-600" : "hover:bg-gray-100 dark:hover:bg-gray-800"}`}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
      {copied && (
        <div className="pointer-events-none absolute bottom-12 left-1/2 -translate-x-1/2 rounded bg-gray-900/90 px-2 py-1 text-[11px] text-white shadow dark:bg-gray-100/90 dark:text-gray-900" role="status">
          {copied.ok ? t("ap.ob.copied") : t("ap.ob.copyFail")}: {copied.s}
        </div>
      )}
    </div>
  );
}
