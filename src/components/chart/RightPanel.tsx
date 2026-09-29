"use client";

import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import RuNews from "@/components/instruments/RuNews";
import EconomicCalendar from "@/components/instruments/EconomicCalendar";
import {
  ALL_INSTRUMENTS,
  CATEGORY_ICONS,
  CATEGORY_I18N,
  CATEGORY_NEWS,
  TERMINAL_DATA,
  categoryOf,
  exchangeLabel,
  findInstrument,
  fmtCompact,
  fmtPrice,
  fmtSigned,
  instName,
  type TerminalInstrument,
} from "@/lib/terminal-data";

export type PanelTab = "watchlist" | "info" | "news" | "calendar";

export interface Quote {
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  time?: string;
  open?: number;
  high?: number;
  low?: number;
}

const COLLAPSED_KEY = "fomo-terminal-watch-collapsed";
const qKey = (i: { source: string; dataTicker: string }) => `${i.source}:${i.dataTicker}`;

/* ───────────── small pieces ───────────── */

export function InstIcon({ inst, size = 20 }: { inst: TerminalInstrument; size?: number }) {
  if (inst.emoji) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={inst.emoji} alt="" width={size} height={size} className="rounded-full shrink-0" style={{ width: size, height: size }} />;
  }
  return (
    <span
      className="rounded-full shrink-0 flex items-center justify-center bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42) }}
    >
      {inst.ticker.slice(0, 2).toUpperCase()}
    </span>
  );
}

const tabIcons: Record<PanelTab, ReactNode> = {
  watchlist: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <path d="M8 6h12M8 12h12M8 18h12" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <circle cx="12" cy="7.8" r="0.6" fill="currentColor" />
    </svg>
  ),
  news: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5h11a2 2 0 012 2v12H7a2 2 0 01-2-2V5z" />
      <path d="M18 9h1a1 1 0 011 1v7a2 2 0 01-2 2M8.5 9h6M8.5 12.5h6M8.5 16h3" />
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  ),
};

const TABS: { id: PanelTab; key: string }[] = [
  { id: "watchlist", key: "shell.tab.watchlist" },
  { id: "info", key: "shell.tab.info" },
  { id: "news", key: "shell.tab.news" },
  { id: "calendar", key: "shell.tab.calendar" },
];

/* ───────────── batch quotes ───────────── */

function useBatchQuotes(instruments: TerminalInstrument[], enabled: boolean) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const itemsKey = useMemo(() => instruments.map(qKey).join(","), [instruments]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let inflight = false;
    const load = async () => {
      if (stopped || inflight || document.hidden) return;
      inflight = true;
      try {
        const r = await fetch(`/api/quotes?items=${encodeURIComponent(itemsKey)}`, { cache: "no-store" });
        if (!r.ok || stopped) return;
        const data: Record<string, Quote> = await r.json();
        setQuotes((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [k, q] of Object.entries(data)) {
            const p = prev[k];
            if (!p || p.price !== q.price || p.change !== q.change || p.changePercent !== q.changePercent) {
              next[k] = q;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch {
        /* keep the last values */
      } finally {
        inflight = false;
      }
    };
    load();
    const id = setInterval(load, 5000);
    const onVis = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [itemsKey, enabled]);

  return quotes;
}

/* ───────────── watchlist ───────────── */

const chgDigits = (p: number) => (p >= 1 ? 2 : p >= 0.01 ? 4 : 6);

const WatchRow = memo(function WatchRow({
  inst,
  q,
  selected,
  onSelect,
  onRemove,
  removeTitle,
  locale,
  label,
}: {
  inst: TerminalInstrument;
  q: Quote | undefined;
  selected: boolean;
  onSelect: (i: TerminalInstrument) => void;
  onRemove: (i: TerminalInstrument) => void;
  removeTitle: string;
  locale: string;
  label: string;
}) {
  const prev = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const price = q?.price;
  useEffect(() => {
    const before = prev.current;
    prev.current = price;
    if (price === undefined || before === undefined || before === price) return;
    setFlash(price > before ? "up" : "down");
    const id = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(id);
  }, [price]);

  const up = (q?.change ?? 0) >= 0;
  const color = q ? (q.change === 0 ? "text-gray-500 dark:text-gray-400" : up ? "text-green-600 dark:text-green-500" : "text-red-500") : "text-gray-400";
  const digits = q ? chgDigits(q.price) : 2;

  return (
    <div className="relative group">
    <button
      onClick={() => onSelect(inst)}
      className={`w-full grid grid-cols-[minmax(0,1fr)_68px_50px_54px] items-center h-8 pl-2 pr-2 text-left cursor-pointer border-l-2 ${
        selected
          ? "bg-green-50 dark:bg-green-900/20 border-green-600"
          : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/60"
      }`}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <InstIcon inst={inst} size={18} />
        <span className="min-w-0 leading-tight">
          <span className={`block text-xs font-bold truncate ${selected ? "text-green-700 dark:text-green-400" : "text-gray-900 dark:text-gray-100"}`}>{inst.ticker}</span>
          <span className="block text-[10px] text-gray-400 dark:text-gray-500 truncate">{label}</span>
        </span>
      </span>
      <span
        className={`text-right text-xs font-medium tabular-nums px-1 rounded-sm transition-colors duration-500 ${
          flash === "up" ? "bg-green-500/30" : flash === "down" ? "bg-red-500/30" : "bg-transparent"
        } ${q ? "text-gray-900 dark:text-gray-100" : "text-gray-400"}`}
      >
        {q ? fmtPrice(q.price, locale) : "…"}
      </span>
      <span className={`text-right text-[11px] tabular-nums ${color}`}>{q ? fmtSigned(q.change, digits, locale) : ""}</span>
      <span className={`text-right text-[11px] tabular-nums font-medium ${color}`}>{q ? `${fmtSigned(q.changePercent, 2, locale)}%` : ""}</span>
    </button>
    <button
      onClick={() => onRemove(inst)}
      title={removeTitle}
      aria-label={removeTitle}
      className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 hidden group-hover:flex items-center justify-center rounded bg-white/90 dark:bg-gray-800/90 text-gray-400 hover:text-red-500 cursor-pointer shadow-sm"
    >
      <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
    </div>
  );
});

const WL_KEY = "fomo-terminal-watchlist-v1";
const wlKey = (i: { source: string; dataTicker: string }) => `${i.source}:${i.dataTicker}`;

/** The user's own list of symbols. Empty until they add some; kept in this browser. */
function useWatchlist() {
  const [items, setItems] = useState<TerminalInstrument[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(WL_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        setItems(
          parsed.filter(
            (i) => i && typeof i.ticker === "string" && typeof i.dataTicker === "string" && (i.source === "moex" || i.source === "bybit" || i.source === "fmp")
          )
        );
      }
    } catch {}
  }, []);
  const commit = (next: TerminalInstrument[]) => {
    setItems(next);
    try {
      localStorage.setItem(WL_KEY, JSON.stringify(next));
    } catch {}
  };
  return {
    items,
    add: (inst: TerminalInstrument) => {
      if (!items.some((i) => wlKey(i) === wlKey(inst))) commit([...items, inst]);
    },
    remove: (inst: TerminalInstrument) => commit(items.filter((i) => wlKey(i) !== wlKey(inst))),
  };
}

/** Search the instruments database and add a result to the watchlist. */
function AddTicker({
  existing,
  onAdd,
  onClose,
}: {
  existing: TerminalInstrument[];
  onAdd: (i: TerminalInstrument) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<TerminalInstrument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && e.target instanceof Node && !boxRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  useEffect(() => {
    const needle = q.trim();
    if (!needle) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/instruments?search=${encodeURIComponent(needle)}`);
        const rows: any[] = r.ok ? await r.json() : [];
        if (cancelled) return;
        const seen = new Set<string>();
        const out: TerminalInstrument[] = [];
        for (const row of Array.isArray(rows) ? rows : []) {
          const source = row?.dataSource;
          const dataTicker = row?.dataTicker || row?.ticker;
          if ((source !== "moex" && source !== "bybit" && source !== "fmp") || !dataTicker) continue;
          const key = `${source}:${dataTicker}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const known = findInstrument(source, dataTicker);
          out.push({ ticker: row.ticker || dataTicker, name: row.name || dataTicker, source, dataTicker, emoji: known?.emoji ?? "" });
        }
        setResults(out);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q]);

  return (
    <div ref={boxRef} className="absolute left-2 right-2 top-full z-20 mt-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl">
      <div className="p-2 border-b border-gray-100 dark:border-gray-800">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder={t("shell.watch.addPlaceholder")}
          aria-label={t("shell.watch.addPlaceholder")}
          className="w-full h-7 px-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-green-600"
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {results === null && <div className="px-3 py-4 text-center text-xs text-gray-400">{loading ? "…" : t("shell.watch.addHint")}</div>}
        {results !== null && results.length === 0 && <div className="px-3 py-4 text-center text-xs text-gray-400">{loading ? "…" : t("shell.watch.noResults")}</div>}
        {results?.map((inst) => {
          const inList = existing.some((i) => wlKey(i) === wlKey(inst));
          return (
            <button
              key={wlKey(inst)}
              onClick={() => onAdd(inst)}
              disabled={inList}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50 disabled:cursor-default cursor-pointer"
            >
              <InstIcon inst={inst} size={18} />
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{inst.ticker}</span>
                <span className="block text-[10px] text-gray-400 truncate">{inst.name}</span>
              </span>
              <span className="text-[10px] text-gray-400 shrink-0">{exchangeLabel(inst.source)}</span>
              <span className={`text-xs shrink-0 ${inList ? "text-green-600" : "text-gray-400"}`}>{inList ? "✓" : "+"}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Watchlist({
  items,
  onAdd,
  onRemove,
  quotes,
  selected,
  onSelect,
}: {
  items: TerminalInstrument[];
  onAdd: (i: TerminalInstrument) => void;
  onRemove: (i: TerminalInstrument) => void;
  quotes: Record<string, Quote>;
  selected: TerminalInstrument;
  onSelect: (i: TerminalInstrument) => void;
}) {
  const { t, locale } = useT();
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);

  const needle = filter.trim().toLowerCase();
  const shown = useMemo(
    () =>
      items.filter(
        (i) => !needle || i.ticker.toLowerCase().includes(needle) || i.name.toLowerCase().includes(needle) || instName(i, t).toLowerCase().includes(needle)
      ),
    [items, needle, t]
  );

  const headCls = "text-[11px] font-medium text-gray-500 dark:text-gray-400";
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="relative px-2 pt-2 pb-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("shell.watch.filter")}
              aria-label={t("shell.watch.filter")}
              className="w-full h-7 pl-7 pr-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-green-600"
            />
          </div>
          <button
            onClick={() => setAdding((v) => !v)}
            title={t("shell.watch.add")}
            aria-label={t("shell.watch.add")}
            className={`w-7 h-7 shrink-0 flex items-center justify-center rounded border cursor-pointer ${
              adding ? "border-green-600 text-green-600 bg-green-600/10" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {adding && (
          <AddTicker
            existing={items}
            onAdd={(i) => onAdd(i)}
            onClose={() => setAdding(false)}
          />
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_68px_50px_54px] items-center h-6 px-2 bg-white dark:bg-gray-900 border-y border-gray-100 dark:border-gray-800">
          <span className={headCls}>{t("shell.watch.instrument")}</span>
          <span className={`${headCls} text-right`}>{t("shell.watch.price")}</span>
          <span className={`${headCls} text-right`}>{t("shell.watch.change")}</span>
          <span className={`${headCls} text-right`}>{t("shell.watch.changePct")}</span>
        </div>
        {items.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{t("shell.watch.emptyList")}</div>
            <div className="mt-1 text-[11px] text-gray-400">{t("shell.watch.emptyHint")}</div>
            <button
              onClick={() => setAdding(true)}
              className="mt-3 inline-flex items-center gap-1 px-3 h-7 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("shell.watch.add")}
            </button>
          </div>
        )}
        {items.length > 0 && shown.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-400">{t("shell.watch.empty")}</div>}
        {shown.map((inst) => (
          <WatchRow
            key={qKey(inst)}
            inst={inst}
            q={quotes[qKey(inst)]}
            selected={selected.source === inst.source && selected.dataTicker === inst.dataTicker}
            onSelect={onSelect}
            onRemove={onRemove}
            removeTitle={t("shell.watch.remove")}
            locale={locale}
            label={instName(inst, t)}
          />
        ))}
      </div>
    </div>
  );
}

/* ───────────── symbol info card ───────────── */

/** Moscow wall clock: [weekday 0-6 (Sun=0), minutes since midnight]. */
function moscowNow(): [number, number] {
  const d = new Date(Date.now() + 3 * 3_600_000);
  return [d.getUTCDay(), d.getUTCHours() * 60 + d.getUTCMinutes()];
}

function isMarketOpen(inst: TerminalInstrument): boolean {
  if (inst.source === "bybit") return true;
  if (inst.source !== "moex") return true;
  const [dow, m] = moscowNow();
  if (dow === 0 || dow === 6) return false;
  const inRange = (a: number, b: number) => m >= a && m < b;
  const shares = categoryOf(inst)?.name === "Акции ММВБ";
  if (shares) return inRange(9 * 60 + 50, 18 * 60 + 50) || inRange(19 * 60 + 5, 23 * 60 + 50);
  return inRange(9 * 60, 14 * 60) || inRange(14 * 60 + 5, 18 * 60 + 50) || inRange(19 * 60 + 5, 23 * 60 + 50);
}

const POINT_TICKERS = new Set(["MIX", "RTS", "SPYF", "NASD"]);

function currencyOf(inst: TerminalInstrument, t: (k: string) => string): string {
  if (inst.source === "bybit") return inst.ticker.endsWith("USDT") ? "USDT" : inst.ticker.endsWith("USDC") ? "USDC" : "";
  if (inst.source === "moex") return POINT_TICKERS.has(inst.dataTicker) ? t("shell.info.points") : "RUB";
  return "";
}

function InfoCard({ inst, quote, visible }: { inst: TerminalInstrument; quote: Quote | undefined; visible: boolean }) {
  const { t, locale } = useT();
  const [detail, setDetail] = useState<Quote | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    setDetail(null);
    if (!visible) return;
    let stopped = false;
    const load = async () => {
      if (stopped || document.hidden) return;
      try {
        const r = await fetch(`/api/quote?source=${inst.source}&ticker=${encodeURIComponent(inst.dataTicker)}`, { cache: "no-store" });
        if (!r.ok || stopped) return;
        const d = await r.json();
        if (d?.price) setDetail(d);
      } catch {}
    };
    load();
    const id = setInterval(load, 10_000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [inst.source, inst.dataTicker, visible]);

  // the market status flips on the clock, not on quotes
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const price = quote?.price ?? detail?.price;
  const change = quote?.change ?? detail?.change ?? 0;
  const pct = quote?.changePercent ?? detail?.changePercent ?? 0;
  const high = detail?.high ?? quote?.high;
  const low = detail?.low ?? quote?.low;
  const open = detail?.open ?? quote?.open;
  const volume = detail?.volume || quote?.volume || 0;
  const up = change >= 0;
  const open_ = isMarketOpen(inst);
  const cur = currencyOf(inst, t);
  const cat = categoryOf(inst);
  const type = inst.source === "bybit" ? t("shell.info.spot") : cat?.name === "Акции ММВБ" ? t("shell.info.stock") : t("shell.info.future");
  const pos = high != null && low != null && high > low && price != null ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : null;
  const label = "text-gray-500 dark:text-gray-400";
  const val = "text-gray-900 dark:text-gray-100 tabular-nums";

  return (
    <div className="px-3 py-3 space-y-2.5 text-xs">
      <div className="flex items-center gap-2">
        <InstIcon inst={inst} size={28} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{inst.ticker}</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{instName(inst, t)}</div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-1.5 h-5 rounded text-[10px] font-medium ${
            open_ ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-gray-200/70 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${open_ ? "bg-green-500" : "bg-gray-400"}`} />
          {open_ ? t("shell.info.open") : t("shell.info.closed")}
        </span>
      </div>

      {price != null ? (
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-100">{fmtPrice(price, locale)}</span>
            {cur && <span className="text-xs text-gray-400">{cur}</span>}
          </div>
          <div className={`text-xs font-medium tabular-nums ${change === 0 ? label : up ? "text-green-600 dark:text-green-500" : "text-red-500"}`}>
            {fmtSigned(change, chgDigits(price), locale)}&nbsp;&nbsp;{fmtSigned(pct, 2, locale)}%
          </div>
        </div>
      ) : (
        <div className="text-sm text-gray-400 py-2">{t("shell.info.noQuote")}</div>
      )}

      {pos !== null && high != null && low != null && (
        <div>
          <div className={`flex justify-between mb-1 ${label}`}>
            <span>{t(inst.source === "bybit" ? "shell.info.range24" : "shell.info.range")}</span>
          </div>
          <div className="relative h-1 rounded bg-gray-200 dark:bg-gray-700">
            <span className="absolute top-1/2 w-2 h-2 rounded-full bg-green-600 -translate-y-1/2 -translate-x-1/2" style={{ left: `${pos}%` }} />
          </div>
          <div className={`flex justify-between mt-1 ${val}`}>
            <span>{fmtPrice(low, locale)}</span>
            <span>{fmtPrice(high, locale)}</span>
          </div>
        </div>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {open != null && (
          <>
            <dt className={label}>{t("shell.info.dayOpen")}</dt>
            <dd className={`text-right ${val}`}>{fmtPrice(open, locale)}</dd>
          </>
        )}
        {volume > 0 && (
          <>
            <dt className={label}>{t("shell.info.volume")}</dt>
            <dd className={`text-right ${val}`}>{fmtCompact(volume, locale)}</dd>
          </>
        )}
        <dt className={label}>{t("shell.info.type")}</dt>
        <dd className={`text-right ${val}`}>{type}</dd>
        <dt className={label}>{t("shell.info.exchange")}</dt>
        <dd className={`text-right ${val}`}>{exchangeLabel(inst.source)}</dd>
      </dl>
    </div>
  );
}

/* ───────────── the panel ───────────── */

interface Props {
  /** Expanded on desktop. */
  open: boolean;
  /** Drawer shown on mobile. */
  mobileOpen: boolean;
  /** Whether the content is actually on screen (drives polling). */
  visible: boolean;
  tab: PanelTab;
  onTab: (tab: PanelTab) => void;
  onCollapse: () => void;
  onCloseMobile: () => void;
  selected: TerminalInstrument;
  onSelect: (inst: TerminalInstrument) => void;
}

export default function RightPanel({ open, mobileOpen, visible, tab, onTab, onCollapse, onCloseMobile, selected, onSelect }: Props) {
  const { t } = useT();
  const cat = categoryOf(selected);

  const watchlist = useWatchlist();
  // the selected symbol may not be in the list; its quote is still needed for the info card
  const instruments = useMemo(() => {
    const inList = watchlist.items.some((i) => i.source === selected.source && i.dataTicker === selected.dataTicker);
    return inList || (selected.source !== "moex" && selected.source !== "bybit") ? watchlist.items : [...watchlist.items, selected];
  }, [watchlist.items, selected]);
  const quotes = useBatchQuotes(instruments, visible && instruments.length > 0);
  const quote = quotes[qKey(selected)];

  return (
    <>
      {mobileOpen && <div className="md:hidden absolute inset-0 z-40 bg-black/40" onClick={onCloseMobile} />}
      <aside
        className={`${mobileOpen ? "flex" : "hidden"} md:flex absolute md:static top-0 md:top-auto bottom-0 md:bottom-auto right-0 z-50 md:z-auto shrink-0 md:h-full max-w-[92vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800`}
      >
        {/* content */}
        <div className={`w-[300px] md:w-[280px] max-w-full flex-col min-h-0 min-w-0 flex ${open ? "md:flex" : "md:hidden"}`}>
          {visible && (
            <>
              <div className="flex items-center gap-1 h-9 px-2 shrink-0 border-b border-gray-100 dark:border-gray-800">
                <div className="md:hidden flex items-center gap-0.5">
                  {TABS.map((tb) => (
                    <button
                      key={tb.id}
                      onClick={() => onTab(tb.id)}
                      title={t(tb.key)}
                      className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer ${tab === tb.id ? "text-green-600 bg-green-600/10" : "text-gray-500"}`}
                    >
                      {tabIcons[tb.id]}
                    </button>
                  ))}
                </div>
                <span className="hidden md:block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 truncate">
                  {t(TABS.find((x) => x.id === tab)?.key ?? "shell.tab.watchlist")}
                </span>
                <button
                  onClick={onCollapse}
                  title={t("shell.panel.collapse")}
                  className="hidden md:flex ml-auto w-6 h-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                <button
                  onClick={onCloseMobile}
                  title={t("shell.close")}
                  className="md:hidden ml-auto w-8 h-8 flex items-center justify-center rounded text-gray-400 cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {tab === "watchlist" && (
                <>
                  <Watchlist items={watchlist.items} onAdd={watchlist.add} onRemove={watchlist.remove} quotes={quotes} selected={selected} onSelect={onSelect} />
                  <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 max-h-[46%] overflow-y-auto">
                    <InfoCard inst={selected} quote={quote} visible={visible && tab === "watchlist"} />
                  </div>
                </>
              )}
              {tab === "info" && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <InfoCard inst={selected} quote={quote} visible={visible && tab === "info"} />
                </div>
              )}
              {tab === "news" && (
                <div className="flex-1 min-h-0 overflow-y-auto [&>div]:shadow-none! [&>div]:rounded-none! [&>div]:p-3! [&_h2]:text-sm! [&_h2]:mb-2! [&_.overflow-y-auto]:max-h-none! [&_p]:text-xs!">
                  <RuNews category={CATEGORY_NEWS[cat?.name ?? ""] ?? "general"} title={t("shell.tab.news")} />
                </div>
              )}
              {tab === "calendar" && (
                <div className="flex-1 min-h-0 overflow-y-auto [&>div]:shadow-none! [&>div]:rounded-none! [&>div]:p-3! [&_h2]:text-sm! [&_h2]:mb-2!">
                  <EconomicCalendar country={cat?.name === "Акции ММВБ" ? "RU" : undefined} />
                </div>
              )}
            </>
          )}
        </div>

        {/* icon strip (desktop) */}
        <div className="hidden md:flex flex-col items-center gap-1 w-10 shrink-0 py-2 border-l border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900">
          {TABS.map((tb) => {
            const on = open && tab === tb.id;
            return (
              <button
                key={tb.id}
                onClick={() => onTab(tb.id)}
                title={t(tb.key)}
                aria-label={t(tb.key)}
                aria-pressed={on}
                className={`w-8 h-8 flex items-center justify-center rounded cursor-pointer transition ${
                  on ? "text-green-600 bg-green-600/10" : "text-gray-500 dark:text-gray-400 hover:bg-gray-200/60 dark:hover:bg-gray-800"
                }`}
              >
                {tabIcons[tb.id]}
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
