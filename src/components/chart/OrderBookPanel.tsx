"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n/client";
import { autoLevels, buildLadder, fmtQtyCompact, priceDecimals } from "@/lib/orderbook-math";
import type { TerminalInstrument } from "@/lib/terminal-data";

/* «Стакан»: live depth ladder of a MOEX instrument (MOEX ALGOPACK online order books, Promo). Best N levels per side with
   volume bars, spread, mid price, imbalance; a click on a price copies it. Refreshed every 2.5 s while the panel is on screen.
   The server (/api/orderbook) serves it to signed-in users (admins only with ALGOPACK_PUBLIC=0); everyone else gets a note. */

const POLL_MS = 2500;
const LEVEL_CHOICES = [5, 10, 15, 20, 30, 50];
const LS_LEVELS = "fomo-ob-levels2"; // "auto" (default) or a number; v2: the old key held a fixed 10 for everybody
const LS_BARS = "fomo-ob-bars";
const ROW_H = 24; // px; phones get 26 (finger)
const ROW_H_PHONE = 26;
const SPREAD_H = 46; // the last-price / spread row in the middle
/** the panel widths the «Развернуть» button toggles between (RightPanel owns the real width) */
export const OB_WIDE_W = 420;
export const OB_DEFAULT_W = 340;

interface BookData {
  bids: [number, number][];
  asks: [number, number][];
  ts: number;
  upd?: string;
}
type Status = "loading" | "ok" | "empty" | "denied" | "unavailable" | "unsupported" | "error";

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

interface PanelProps {
  inst: TerminalInstrument;
  visible: boolean;
  /** last trade price of the instrument (the terminal's quote; the book feed itself carries none) and the day change */
  last?: number | null;
  dayChange?: number | null;
  /** right panel only: its current width and the setter (the «Развернуть» button); without them the button is not shown */
  panelWidth?: number;
  onPanelWidth?: (w: number) => void;
}

export default function OrderBookPanel({ inst, visible, last, dayChange, panelWidth, onPanelWidth }: PanelProps) {
  const { t, locale } = useT();
  const { status: sessionStatus } = useSession();
  const [levelsPref, setLevelsPref] = useState<"auto" | number>("auto");
  const [barMode, setBarMode] = useState<"cum" | "vol">("cum");
  const [ladderEl, setLadderEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState({ h: 0, rowH: ROW_H });
  const [dir, setDir] = useState(0);
  const prevLast = useRef<number | null>(null);
  const [data, setData] = useState<BookData | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState<{ s: string; ok: boolean } | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMoex = inst.source === "moex";
  const ticker = inst.dataTicker;

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LS_LEVELS));
      if (LEVEL_CHOICES.includes(v)) setLevelsPref(v);
      if (localStorage.getItem(LS_BARS) === "vol") setBarMode("vol");
    } catch {}
  }, []);

  /* the ladder's pixel height drives «Авто»: as many levels per side as fit */
  useEffect(() => {
    if (!ladderEl) return;
    const measure = () => {
      const h = ladderEl.clientHeight;
      const rowH = window.innerWidth < 640 ? ROW_H_PHONE : ROW_H;
      setBox((p) => (p.h === h && p.rowH === rowH ? p : { h, rowH }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(ladderEl);
    return () => ro.disconnect();
  }, [ladderEl]);

  /* last-trade direction: against the previous distinct price, before the first change by the day's sign */
  useEffect(() => {
    prevLast.current = null;
  }, [ticker]);
  useEffect(() => {
    if (last == null || !Number.isFinite(last)) {
      prevLast.current = null;
      setDir(0);
      return;
    }
    const p = prevLast.current;
    if (p === null) setDir(dayChange ? Math.sign(dayChange) : 0);
    else if (last !== p) setDir(Math.sign(last - p));
    prevLast.current = last;
  }, [last, dayChange]);

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
          // 404 = no ALGOPACK key on the server (the data is switched off), 403 = this account is not served
          setStatus(res.status === 404 ? "unavailable" : "denied");
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

  const levels = levelsPref === "auto" ? autoLevels(box.h, box.rowH, SPREAD_H) : levelsPref;
  const ladder = useMemo(() => (data ? buildLadder(data.bids.map(([p, q]) => ({ p, q })), data.asks.map(([p, q]) => ({ p, q })), levels) : null), [data, levels]);
  const hasLadder = ladder !== null;

  /* a ladder taller than its box (a fixed 30/50): start with the spread in the middle of the view; not on every poll, so the user's own scrolling is left alone */
  useEffect(() => {
    if (!ladderEl) return;
    ladderEl.scrollTop = Math.max(0, (ladderEl.scrollHeight - ladderEl.clientHeight) / 2);
  }, [ladderEl, levels, box.h, hasLadder, ticker, panelWidth]);
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

  const pickLevels = (n: "auto" | number) => {
    setLevelsPref(n);
    try {
      localStorage.setItem(LS_LEVELS, String(n));
    } catch {}
  };
  const pickBars = (m: "cum" | "vol") => {
    setBarMode(m);
    try {
      localStorage.setItem(LS_BARS, m);
    } catch {}
  };

  const note = !isMoex
    ? t("ap.ob.moexOnly")
    : status === "denied"
      ? t(sessionStatus === "unauthenticated" ? "dg.guestOnly" : "ap.ob.denied")
      : status === "unavailable"
        ? t("ap.ob.unavailable")
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
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-xs text-[var(--tv3-muted)]" data-testid="ob-note">
        {note}
      </div>
    );
  }

  const comma = locale === "ru";
  const fq = (v: number) => fmtQtyCompact(v, comma);
  const num = (x: string) => (comma ? x.replace(".", ",") : x);
  const imbPct = ladder.imbalance === null ? null : ladder.imbalance * 100;
  const bidShare = ladder.sumBid + ladder.sumAsk > 0 ? (ladder.sumBid / (ladder.sumBid + ladder.sumAsk)) * 100 : 50;
  const asksTopDown = ladder.asks.slice().reverse();
  const fmtP = (p: number) => num(p.toFixed(dec));
  const rowH = box.rowH;
  const hasLast = last != null && Number.isFinite(last);
  const lastCol = dir > 0 ? "var(--tv3-up)" : dir < 0 ? "var(--tv3-down)" : "var(--tv3-text)";
  const wide = panelWidth !== undefined && panelWidth >= OB_WIDE_W - 6;

  const row = (p: number, q: number, cum: number, side: "bid" | "ask", best: boolean) => {
    const scale = barMode === "cum" ? ladder.maxCum : ladder.maxQty;
    const w = scale > 0 ? Math.max(1.5, ((barMode === "cum" ? cum : q) / scale) * 100) : 0;
    const bar = side === "bid" ? "bg-green-500/25" : "bg-red-500/25";
    return (
      <button
        key={`${side}${p}`}
        type="button"
        onClick={() => void copy(p)}
        title={t("ap.ob.copy")}
        className={`group relative grid w-full shrink-0 grid-cols-[1.1fr_1fr_1fr] items-center gap-2 px-3 text-[14px] sm:text-[13px] tabular-nums cursor-pointer hover:bg-[var(--tv3-fill3)] ${best ? "font-bold bg-[var(--tv3-fill3)]" : ""}`}
        style={{ height: rowH }}
        data-side={side}
        data-best={best ? "1" : undefined}
      >
        <span className={`absolute inset-y-px right-0 ${bar}`} style={{ width: `${w}%` }} />
        <span className={`relative text-left ${best ? "font-bold" : "font-medium"} ${side === "bid" ? "text-[var(--tv3-up)]" : "text-[var(--tv3-down)]"}`}>{fmtP(p)}</span>
        <span className="relative text-right text-[var(--tv3-text)]">{fq(q)}</span>
        <span className="relative text-right text-[var(--tv3-muted)]">{fq(cum)}</span>
      </button>
    );
  };

  const seg = (on: boolean) => `rounded-md px-2 py-0.5 cursor-pointer ${on ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)] font-semibold" : "hover:bg-[var(--tv3-fill3)]"}`;

  return (
    <div className="relative flex-1 min-h-0 flex flex-col text-[var(--tv3-text)]" data-testid="orderbook">
      {/* toolbar: bar scale + widen */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-1 pb-1.5 text-[11px] text-[var(--tv3-muted)]">
        <span className="inline-flex items-center gap-0.5 rounded-lg bg-[var(--tv3-fill)] p-0.5" role="group" aria-label={t("ap.ob.bars")}>
          <button type="button" onClick={() => pickBars("cum")} aria-pressed={barMode === "cum"} className={seg(barMode === "cum")} data-testid="ob-bars-cum">
            {t("ap.ob.barCum")}
          </button>
          <button type="button" onClick={() => pickBars("vol")} aria-pressed={barMode === "vol"} className={seg(barMode === "vol")} data-testid="ob-bars-vol">
            {t("ap.ob.barVol")}
          </button>
        </span>
        {onPanelWidth && (
          <button
            type="button"
            onClick={() => onPanelWidth(wide ? OB_DEFAULT_W : OB_WIDE_W)}
            aria-pressed={wide}
            className="ml-auto hidden md:inline-flex items-center gap-1 rounded-lg bg-[var(--tv3-fill)] px-2 py-1 text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)] cursor-pointer"
            data-testid="ob-expand"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {wide ? <path d="M15 6l-6 6 6 6" /> : <path d="M9 6l-6 6 6 6M3 12h18" />}
            </svg>
            {wide ? t("ap.ob.shrink") : t("ap.ob.expand")}
          </button>
        )}
      </div>

      {/* summary */}
      <div className="shrink-0 grid grid-cols-3 gap-1 px-3 pb-1.5 text-[11px] text-[var(--tv3-muted)]">
        <div>
          <div>{t("ap.ob.spread")}</div>
          <div className="text-[13px] font-semibold text-[var(--tv3-text)] tabular-nums" data-testid="ob-spread">
            {ladder.spread !== null ? num(ladder.spread.toFixed(dec)) : "—"}
            {ladder.spreadPct !== null && <span className="ml-1 text-[11px] font-normal text-[var(--tv3-muted)]">{num(ladder.spreadPct.toFixed(3))}%</span>}
          </div>
        </div>
        <div className="text-center">
          <div>{t("ap.ob.mid")}</div>
          <div className="text-[13px] font-semibold text-[var(--tv3-text)] tabular-nums" data-testid="ob-mid">
            {ladder.mid !== null ? num(Math.abs(ladder.mid * 10 ** dec - Math.round(ladder.mid * 10 ** dec)) > 1e-6 ? ladder.mid.toFixed(dec + 1) : ladder.mid.toFixed(dec)) : "—"}
          </div>
        </div>
        <div className="text-right">
          <div>{t("ap.ob.imb")}</div>
          <div className={`text-[13px] font-semibold tabular-nums ${imbPct === null ? "" : imbPct >= 0 ? "text-[var(--tv3-up)]" : "text-[var(--tv3-down)]"}`} data-testid="ob-imb">
            {imbPct === null ? "—" : `${imbPct > 0 ? "+" : ""}${num(imbPct.toFixed(1))}%`}
          </div>
        </div>
      </div>
      <div className="shrink-0 mx-3 mb-2 flex h-1.5 overflow-hidden rounded-full bg-[var(--tv3-fill2)]" aria-hidden>
        <div className="bg-green-500" style={{ width: `${bidShare}%` }} />
        <div className="bg-red-500" style={{ width: `${100 - bidShare}%` }} />
      </div>

      {/* column heads */}
      <div className="shrink-0 grid grid-cols-[1.1fr_1fr_1fr] gap-2 px-3 pb-1 text-[10px] uppercase tracking-wide text-[var(--tv3-muted)] border-b border-[var(--tv3-hair2)]">
        <span>{t("ap.ob.price")}</span>
        <span className="text-right">{t("ap.ob.size")}</span>
        <span className="text-right">{t("ap.ob.total")}</span>
      </div>

      {/* ladder: asks above (best nearest the middle), the last price / spread row in the middle, bids below. The two halves are equal
          (grid 1fr auto 1fr), so the spread sits at the vertical middle with any number of levels; few levels stay compact next to it. */}
      <div ref={setLadderEl} className="flex-1 min-h-0 overflow-y-auto" data-testid="ob-ladder" data-levels={levels}>
        <div className="grid min-h-full" style={{ gridTemplateRows: "1fr auto 1fr" }}>
          <div className="flex flex-col justify-end" data-testid="ob-asks">
            {asksTopDown.map((a, i) => row(a.p, a.q, a.cum, "ask", i === asksTopDown.length - 1))}
          </div>
          <div
            className="flex shrink-0 items-center justify-between gap-2 border-y border-[var(--tv3-hair2)] bg-[var(--tv3-fill3)] px-3 tabular-nums"
            style={{ height: SPREAD_H }}
            data-testid="ob-spreadrow"
          >
            <div className="min-w-0" data-testid="ob-last" data-dir={dir}>
              <div className="text-[10px] leading-none text-[var(--tv3-muted)]">{hasLast ? t("ap.ob.last") : t("ap.ob.mid")}</div>
              <div className="mt-1 flex items-baseline gap-1 text-[18px] font-bold leading-none" style={{ color: hasLast ? lastCol : "var(--tv3-text)" }}>
                {hasLast && dir !== 0 && <span className="text-[11px]">{dir > 0 ? "▲" : "▼"}</span>}
                {hasLast ? fmtP(last as number) : ladder.mid !== null ? num(ladder.mid.toFixed(dec)) : "—"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] leading-none text-[var(--tv3-muted)]">{t("ap.ob.spread")}</div>
              <div className="mt-1 text-[13px] font-semibold leading-none text-[var(--tv3-text)]">
                {ladder.spread !== null ? num(ladder.spread.toFixed(dec)) : "—"}
                {ladder.spreadPct !== null && <span className="ml-1 text-[11px] font-normal text-[var(--tv3-muted)]">{num(ladder.spreadPct.toFixed(3))}%</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-start" data-testid="ob-bids">
            {ladder.bids.map((b, i) => row(b.p, b.q, b.cum, "bid", i === 0))}
          </div>
        </div>
      </div>

      {/* footer */}
      <div className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--tv3-hair2)] px-3 py-1.5 text-[11px] text-[var(--tv3-muted)]">
        <span className="inline-flex items-center gap-1" data-testid="ob-live">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          {t("ap.ob.live")}
          {data?.upd ? ` · ${data.upd}` : ""}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-0.5" data-testid="ob-levelpick">
          <span className="mr-0.5">{t("ap.ob.levels")}</span>
          <button type="button" onClick={() => pickLevels("auto")} aria-pressed={levelsPref === "auto"} className={seg(levelsPref === "auto")} data-testid="ob-level-auto">
            {t("ap.ob.auto")}
          </button>
          {LEVEL_CHOICES.map((n) => (
            <button key={n} type="button" onClick={() => pickLevels(n)} aria-pressed={levelsPref === n} className={`${seg(levelsPref === n)} !px-1.5`}>
              {n}
            </button>
          ))}
        </span>
      </div>
      {copied && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-[var(--tv3-pill-dark)] px-3 py-1.5 text-[12px] text-white" role="status">
          {copied.ok ? t("ap.ob.copied") : t("ap.ob.copyFail")}: {copied.s}
        </div>
      )}
    </div>
  );
}
