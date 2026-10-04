"use client";

import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import RuNews from "@/components/instruments/RuNews";
import CalendarPanel from "./calendar/CalendarPanel";
import { panelTabIcon } from "./icons";
import ObjectTree from "./ObjectTree";
import OrderBookPanel from "./OrderBookPanel";
import AlgoPanel from "./AlgoPanel";
import { AlertsPanelView, OwnAlertsPanel } from "./AlertsPanel";
import type { AlertsApi } from "./useAlerts";
import type { DrawingsController } from "@/lib/chart/drawings/controller";
import type { IndicatorsControllerLike } from "@/lib/chart/contracts";
import {
  ALL_INSTRUMENTS,
  CATEGORY_NEWS,
  categoryOf,
  exchangeLabel,
  findInstrument,
  fmtCompact,
  fmtPrice,
  fmtSigned,
  instName,
  rememberInstrument,
  type TerminalInstrument,
} from "@/lib/terminal-data";
import { fetchContractInfo, itemToInstrument, lookupSecid, type ContractBadgeInfo } from "@/lib/market-client";
import type { MarketItem } from "@/lib/market-types";
import { ContractBadge } from "./ContractPicker";
import { ContractSubRows, ExpandButton, GroupTabs, useMarketSearch, iconFor, type GroupTab } from "./MarketRows";
import "./terminal-v3.css";

export type PanelTab = "watchlist" | "info" | "ideas" | "news" | "calendar" | "objects" | "alerts" | "orderbook" | "algo";

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
      className="rounded-full shrink-0 flex items-center justify-center bg-[var(--tv3-fill2)] text-[var(--tv3-text2)] font-bold"
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.42) }}
    >
      {inst.ticker.slice(0, 2).toUpperCase()}
    </span>
  );
}

const TABS: { id: PanelTab; key: string; titleKey?: string }[] = [
  { id: "watchlist", key: "shell.tab.watchlist" },
  { id: "info", key: "shell.tab.info", titleKey: "p3.title.info" },
  { id: "ideas", key: "p3.tab.ideas" },
  { id: "news", key: "shell.tab.news" },
  { id: "calendar", key: "shell.tab.calendar" },
  { id: "objects", key: "cm.tab.objects", titleKey: "p3.title.objects" },
  { id: "alerts", key: "p3.tab.alerts" },
  { id: "orderbook", key: "shell.tab.orderbook" },
  { id: "algo", key: "shell.tab.algo" },
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

/* Mini sparklines (30 daily closes): fetched lazily, two at a time, remembered for 10 minutes. */
const SPARK_TTL = 10 * 60_000;
const sparkCache = new Map<string, { t: number; v: number[] | null }>();
const sparkInflight = new Set<string>();
const sparkQueue: (() => Promise<void>)[] = [];
let sparkActive = 0;
function sparkPump() {
  while (sparkActive < 2 && sparkQueue.length) {
    const job = sparkQueue.shift()!;
    sparkActive++;
    job().finally(() => {
      sparkActive--;
      sparkPump();
    });
  }
}

function useSparklines(items: TerminalInstrument[], enabled: boolean): Record<string, number[]> {
  const [data, setData] = useState<Record<string, number[]>>({});
  const key = useMemo(() => items.map(qKey).join(","), [items]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const ready: Record<string, number[]> = {};
    for (const inst of items) {
      const k = qKey(inst);
      const c = sparkCache.get(k);
      if (c && Date.now() - c.t < SPARK_TTL) {
        if (c.v) ready[k] = c.v;
        continue;
      }
      if (sparkInflight.has(k)) continue;
      sparkInflight.add(k);
      sparkQueue.push(async () => {
        let v: number[] | null = null;
        try {
          const r = await fetch(`/api/klines?source=${inst.source}&ticker=${encodeURIComponent(inst.dataTicker)}&interval=D&limit=30`);
          if (r.ok) {
            const j = await r.json();
            const rows: any[] = Array.isArray(j) ? j : j.candles ?? [];
            const closes = rows.map((d) => Number(d?.close)).filter((x) => Number.isFinite(x) && x > 0);
            if (closes.length >= 3) v = closes.slice(-30);
          }
        } catch {
          /* no sparkline */
        }
        sparkCache.set(k, { t: Date.now(), v });
        sparkInflight.delete(k);
        if (v && !cancelled) setData((prev) => ({ ...prev, [k]: v as number[] }));
      });
    }
    if (Object.keys(ready).length) setData((prev) => ({ ...prev, ...ready }));
    sparkPump();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return data;
}

function Spark({ values, color }: { values: number[] | undefined; color: string }) {
  if (!values || values.length < 2) return <span className="block h-6 w-[52px] shrink-0" aria-hidden />;
  const mn = Math.min(...values);
  const mx = Math.max(...values);
  const n = values.length - 1;
  const d = values.map((v, j) => `${j ? "L" : "M"}${((j * 64) / n).toFixed(1)} ${(26 - ((v - mn) / (mx - mn || 1)) * 24).toFixed(1)}`).join("");
  return (
    <svg width="52" height="24" viewBox="0 0 64 28" className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const WatchRow = memo(function WatchRow({
  inst,
  q,
  spark,
  selected,
  onSelect,
  onRemove,
  removeTitle,
  locale,
  label,
  contract,
}: {
  inst: TerminalInstrument;
  q: Quote | undefined;
  spark: number[] | undefined;
  selected: boolean;
  onSelect: (i: TerminalInstrument) => void;
  onRemove: (i: TerminalInstrument) => void;
  removeTitle: string;
  locale: string;
  label: string;
  /** exact futures contract: kind / order for the badge next to the ticker */
  contract?: ContractBadgeInfo;
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
  const flat = !!q && q.change === 0;
  const color = !q ? "var(--tv3-muted)" : flat ? "var(--tv3-muted)" : up ? "var(--tv3-up)" : "var(--tv3-down)";
  const sparkUp = spark && spark.length > 1 ? spark[spark.length - 1] >= spark[0] : up;

  return (
    <div className="relative group">
      <button
        onClick={() => onSelect(inst)}
        className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-[9px] text-left cursor-pointer ${selected ? "bg-[var(--tv3-fill)]" : "hover:bg-[var(--tv3-fill3)]"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold leading-tight text-[var(--tv3-text)]">{inst.ticker}</span>
          <span className="flex items-center gap-1 text-[12px] leading-tight text-[var(--tv3-muted)]">
            {contract && <ContractBadge c={contract} />}
            <span className="truncate">
              {label} · {exchangeLabel(inst.source)}
            </span>
          </span>
        </span>
        <Spark values={spark} color={sparkUp ? "var(--tv3-up)" : "var(--tv3-down)"} />
        <span className="w-[86px] shrink-0 text-right">
          <span
            className={`block rounded-sm px-0.5 text-[14px] font-semibold leading-tight tabular-nums transition-colors duration-500 ${
              flash === "up" ? "bg-[var(--tv3-up)]/25" : flash === "down" ? "bg-[var(--tv3-down)]/25" : "bg-transparent"
            } ${q ? "text-[var(--tv3-text)]" : "text-[var(--tv3-muted)]"}`}
          >
            {q ? fmtPrice(q.price, locale) : "…"}
          </span>
          <span className="block text-[12px] font-semibold leading-tight tabular-nums" style={{ color }}>
            {q ? `${fmtSigned(q.changePercent, 2, locale)}%` : ""}
          </span>
        </span>
      </button>
      <button
        onClick={() => onRemove(inst)}
        title={removeTitle}
        aria-label={removeTitle}
        className="absolute right-1 top-1 w-5 h-5 hidden group-hover:flex items-center justify-center rounded-md bg-[var(--tv3-card)] text-[var(--tv3-muted)] hover:text-[var(--tv3-red)] cursor-pointer"
        style={{ boxShadow: "var(--tv3-shadow-sm)" }}
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

const WL_SYNCED_KEY = "fomo-terminal-watchlist-synced";
const WL_SOURCES = ["moex", "bybit", "fmp"];

function cleanWatchItems(raw: unknown): TerminalInstrument[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TerminalInstrument[] = [];
  for (const i of raw) {
    if (!i || typeof i.ticker !== "string" || typeof i.dataTicker !== "string" || !WL_SOURCES.includes(i.source)) continue;
    const key = `${i.source}:${i.dataTicker}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const known = findInstrument(i.source, i.dataTicker);
    const item: TerminalInstrument = { ticker: i.ticker, name: typeof i.name === "string" ? i.name : i.ticker, source: i.source, dataTicker: i.dataTicker, emoji: known?.emoji ?? (typeof i.emoji === "string" ? i.emoji : ""), ...(i.group ? { group: i.group } : {}), ...(i.unit ? { unit: i.unit } : {}) };
    if (!known) rememberInstrument(item);
    out.push(item);
  }
  return out;
}

/**
 * The user's own list of symbols. Empty until they add some. Signed-in users get it on their account
 * (same list on every device); guests keep it in this browser. The first time a signed-in user opens
 * the terminal, whatever they had collected in the browser is merged into the account list.
 */
function useWatchlist() {
  const [items, setItems] = useState<TerminalInstrument[]>([]);
  const mode = useRef<"unknown" | "guest" | "user">("unknown");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const writeLocal = (list: TerminalInstrument[]) => {
    try {
      localStorage.setItem(WL_KEY, JSON.stringify(list));
    } catch {}
  };
  const push = (list: TerminalInstrument[]) => {
    fetch("/api/terminal/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: list.map((i) => ({ source: i.source, ticker: i.ticker, dataTicker: i.dataTicker, name: i.name })) }),
    }).catch(() => {});
  };

  useEffect(() => {
    let local: TerminalInstrument[] = [];
    try {
      local = cleanWatchItems(JSON.parse(localStorage.getItem(WL_KEY) || "[]"));
    } catch {}
    setItems(local);

    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/terminal/watchlist", { cache: "no-store" });
        if (cancelled) return;
        if (r.status === 401) {
          mode.current = "guest";
          try {
            localStorage.removeItem(WL_SYNCED_KEY); // what a guest collects is merged on the next sign-in
          } catch {}
          return;
        }
        if (!r.ok) return;
        const server = cleanWatchItems((await r.json()).items);
        mode.current = "user";
        let alreadySynced = false;
        try {
          alreadySynced = localStorage.getItem(WL_SYNCED_KEY) === "1";
        } catch {}
        // after the first sync the account list is the truth (an item removed on another device must not come back)
        const have = new Set(server.map((i) => `${i.source}:${i.dataTicker}`));
        const merged = alreadySynced ? server : [...server, ...local.filter((i) => !have.has(`${i.source}:${i.dataTicker}`))];
        setItems(merged);
        writeLocal(merged);
        try {
          localStorage.setItem(WL_SYNCED_KEY, "1");
        } catch {}
        if (merged.length !== server.length) push(merged);
      } catch {
        /* offline: keep the local copy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = (next: TerminalInstrument[]) => {
    setItems(next);
    writeLocal(next);
    if (mode.current === "user") {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => push(next), 400);
    }
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
  initialQuery = "",
}: {
  existing: TerminalInstrument[];
  onAdd: (i: TerminalInstrument) => void;
  onClose: () => void;
  initialQuery?: string;
}) {
  const { t } = useT();
  const [q, setQ] = useState(initialQuery);
  const [results, setResults] = useState<TerminalInstrument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<GroupTab>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const market = useMarketSearch(q, tab);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // curated + catalogue rows (filtered by the tab) followed by the exchange search results
  const merged = useMemo(() => {
    if (results === null && market.items.length === 0) return null;
    const out: { inst: TerminalInstrument; item?: MarketItem; expand?: string }[] = [];
    const seen = new Set<string>();
    for (const inst of results ?? []) {
      const cat = categoryOf(inst);
      const grp: GroupTab | null = inst.source !== "moex" ? null : cat ? (cat.name === "Акции ММВБ" ? "stock" : "future") : "stock";
      if (tab !== "all" && grp !== tab) continue;
      seen.add(wlKey(inst));
      out.push({ inst, expand: inst.source === "moex" && cat && cat.name !== "Акции ММВБ" ? inst.dataTicker : undefined });
    }
    for (const item of market.items) {
      if (seen.has(`moex:${item.secid}`)) continue;
      seen.add(`moex:${item.secid}`);
      out.push({ inst: itemToInstrument(item, iconFor(item, ALL_INSTRUMENTS)), item, expand: item.group === "future" && item.auto && (item.contracts ?? 0) > 1 ? item.secid : undefined });
    }
    return out;
  }, [results, market.items, tab]);

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
        // the terminal's own list first (names like «Кофе» have no data source in the instruments table, but the terminal charts them)
        const norm = (x: string) => x.toLowerCase().replace(/ё/g, "е");
        const nd = norm(needle);
        for (const inst of ALL_INSTRUMENTS) {
          if (norm(inst.name).includes(nd) || norm(inst.ticker).includes(nd) || norm(inst.dataTicker).includes(nd)) {
            const key = `${inst.source}:${inst.dataTicker}`;
            if (!seen.has(key)) {
              seen.add(key);
              out.push(inst);
            }
          }
        }
        for (const row of Array.isArray(rows) ? rows : []) {
          let source = row?.dataSource;
          let dataTicker = row?.dataTicker || row?.ticker;
          if (!source && row?.ticker) {
            // a catalogue entry without a feed (e.g. ICE «KC») maps to the curated instrument with the same ticker
            const alias = ALL_INSTRUMENTS.find((i) => i.ticker.toLowerCase() === String(row.ticker).toLowerCase());
            if (alias) {
              source = alias.source;
              dataTicker = alias.dataTicker;
            }
          }
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
    <div ref={boxRef} className="absolute left-2 right-2 top-full z-20 mt-1 rounded-2xl bg-[var(--tv3-card)]" style={{ boxShadow: "var(--tv3-shadow-pop)" }}>
      <div className="p-2">
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder={t("shell.watch.addPlaceholder")}
          aria-label={t("shell.watch.addPlaceholder")}
          className="w-full h-9 px-3 rounded-[10px] bg-[var(--tv3-fill2)] text-[14px] text-[var(--tv3-text)] outline-none"
        />
      </div>
      <GroupTabs value={tab} onChange={setTab} className="px-2 pb-1.5" />
      <div className="max-h-64 overflow-y-auto py-1">
        {merged === null && <div className="px-3 py-4 text-center text-xs text-[var(--tv3-muted)]">{loading || market.loading ? "…" : t("shell.watch.addHint")}</div>}
        {merged !== null && merged.length === 0 && <div className="px-3 py-4 text-center text-xs text-[var(--tv3-muted)]">{loading || market.loading ? "…" : t("shell.watch.noResults")}</div>}
        {merged?.map(({ inst, item, expand }) => {
          const inList = existing.some((i) => wlKey(i) === wlKey(inst));
          const isOpen = !!(expand && expanded[expand]);
          return (
            <div key={wlKey(inst)}>
              <button
                onClick={() => onAdd(inst)}
                disabled={inList}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--tv3-fill3)] disabled:opacity-50 disabled:cursor-default cursor-pointer"
              >
                <InstIcon inst={inst} size={18} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-[var(--tv3-text)] truncate">{inst.ticker}</span>
                  <span className="block text-[11px] text-[var(--tv3-muted)] truncate">{inst.name}</span>
                </span>
                {item?.group === "future" && !item.auto && item.kind && (
                  <ContractBadge c={{ kind: item.kind, order: item.order ?? 0, badge: item.kind === "perpetual" ? t("ms.perpetual") : item.order === 1 ? t("ct.b.current") : item.order === 2 ? t("ct.b.next") : t("ct.b.nth", { n: item.order ?? 0 }) }} />
                )}
                {item?.group === "future" && item.auto && (item.contracts ?? 0) > 1 && <span className="text-[10px] text-[var(--tv3-muted)] shrink-0">{t("ct.contracts", { n: item.contracts ?? 0 })}</span>}
                <span className="text-[10px] text-[var(--tv3-muted)] shrink-0">{exchangeLabel(inst.source)}</span>
                {expand && <ExpandButton open={isOpen} onToggle={() => setExpanded((e) => ({ ...e, [expand]: !e[expand] }))} />}
                <span className={`text-xs shrink-0 ${inList ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-muted)]"}`}>{inList ? "✓" : "+"}</span>
              </button>
              {isOpen && expand && (
                <ContractSubRows
                  asset={expand}
                  base={inst}
                  autoTicker={expand}
                  autoName={item ? item.name : inst.name}
                  mark={(tk) => existing.some((i) => i.source === "moex" && i.dataTicker === tk)}
                  onPick={(c) => onAdd(c)}
                />
              )}
            </div>
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
  visible,
}: {
  items: TerminalInstrument[];
  onAdd: (i: TerminalInstrument) => void;
  onRemove: (i: TerminalInstrument) => void;
  quotes: Record<string, Quote>;
  selected: TerminalInstrument;
  onSelect: (i: TerminalInstrument) => void;
  /** the tab is on screen: sparklines are fetched only then */
  visible: boolean;
}) {
  const { t, locale } = useT();
  const [filter, setFilter] = useState("");
  const [adding, setAdding] = useState(false);
  // badges (текущий / следующий / вечный ...) of the exact futures contracts in the list; the answer only has contracts
  const [contractInfo, setContractInfo] = useState<Record<string, ContractBadgeInfo>>({});
  const moexIds = useMemo(() => items.filter((i) => i.source === "moex" && i.dataTicker.length >= 3 && !ALL_INSTRUMENTS.some((c) => c.source === "moex" && c.dataTicker === i.dataTicker)).map((i) => i.dataTicker).join(","), [items]);
  useEffect(() => {
    if (!moexIds) return;
    let cancelled = false;
    fetchContractInfo(moexIds.split(","), locale).then((r) => !cancelled && setContractInfo(r));
    return () => {
      cancelled = true;
    };
  }, [moexIds, locale]);

  const norm = (x: string) => x.toLowerCase().replace(/ё/g, "е");
  const needle = norm(filter.trim());
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          !needle ||
          norm(i.ticker).includes(needle) ||
          norm(i.dataTicker).includes(needle) ||
          norm(i.name).includes(needle) ||
          norm(instName(i, t)).includes(needle)
      ),
    [items, needle, t]
  );
  const [addSeed, setAddSeed] = useState("");

  const sparks = useSparklines(shown, visible);
  const btn = "mt-3 inline-flex items-center gap-1 px-3.5 h-8 rounded-[10px] bg-[var(--tv3-accent)] text-white text-[13px] font-semibold hover:bg-[var(--tv3-accent-hover)] cursor-pointer";
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="relative px-2.5 pb-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--tv3-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("shell.watch.filter")}
              aria-label={t("shell.watch.filter")}
              className="w-full h-8 pl-8 pr-2 rounded-[10px] bg-[var(--tv3-fill)] text-[13px] text-[var(--tv3-text)] outline-none"
            />
          </div>
          <button
            onClick={() => {
              setAddSeed("");
              setAdding((v) => !v);
            }}
            title={t("shell.watch.add")}
            aria-label={t("shell.watch.add")}
            className={`w-8 h-8 shrink-0 flex items-center justify-center rounded-[10px] cursor-pointer ${
              adding ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)]"
            }`}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        {adding && (
          <AddTicker
            key={addSeed}
            existing={items}
            onAdd={(i) => onAdd(i)}
            onClose={() => setAdding(false)}
            initialQuery={addSeed}
          />
        )}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5">
        {items.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="text-[14px] font-semibold text-[var(--tv3-text2)]">{t("shell.watch.emptyList")}</div>
            <div className="mt-1 text-[12px] text-[var(--tv3-muted)]">{t("shell.watch.emptyHint")}</div>
            <button onClick={() => setAdding(true)} className={btn}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {t("shell.watch.add")}
            </button>
          </div>
        )}
        {items.length > 0 && shown.length === 0 && (
          <div className="px-3 py-6 text-center text-[13px] text-[var(--tv3-muted)]">
            <div>{t("shell.watch.empty")}</div>
            <button
              onClick={() => {
                setAddSeed(filter.trim());
                setAdding(true);
              }}
              className={btn}
            >
              {t("shell.watch.searchExchange", { q: filter.trim() })}
            </button>
          </div>
        )}
        {shown.map((inst) => (
          <WatchRow
            key={qKey(inst)}
            inst={inst}
            q={quotes[qKey(inst)]}
            spark={sparks[qKey(inst)]}
            selected={selected.source === inst.source && selected.dataTicker === inst.dataTicker}
            onSelect={onSelect}
            onRemove={onRemove}
            removeTitle={t("shell.watch.remove")}
            locale={locale}
            label={instName(inst, t)}
            contract={inst.source === "moex" ? contractInfo[inst.dataTicker] : undefined}
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
  const shares = categoryOf(inst)?.name === "Акции ММВБ" || inst.group === "stock" || inst.group === "bond" || inst.group === "fund";
  if (shares) return inRange(9 * 60 + 50, 18 * 60 + 50) || inRange(19 * 60 + 5, 23 * 60 + 50);
  return inRange(9 * 60, 14 * 60) || inRange(14 * 60 + 5, 18 * 60 + 50) || inRange(19 * 60 + 5, 23 * 60 + 50);
}

const POINT_TICKERS = new Set(["MIX", "RTS", "SPYF", "NASD"]);
/** exact contracts of the index futures (MXZ6, RIH7, SFZ6, IMOEXF ...) quote in index points as well */
const POINT_CONTRACT = /^(MX|MM|RI|RM|SF|NA)[FGHJKMNQUVXZ]\d$|^(IMOEXF|SP500F|QQQF)$/;

function currencyOf(inst: TerminalInstrument, t: (k: string) => string): string {
  if (inst.source === "bybit") return inst.ticker.endsWith("USDT") ? "USDT" : inst.ticker.endsWith("USDC") ? "USDC" : "";
  if (inst.source === "moex") return inst.unit === "%" ? "%" : POINT_TICKERS.has(inst.dataTicker) || POINT_CONTRACT.test(inst.dataTicker) || inst.group === "index" ? t("shell.info.points") : "RUB";
  return "";
}

/** An instrument restored from a saved list has no market group / unit: ask the exchange search for them once. */
function useResolvedGroup(inst: TerminalInstrument): TerminalInstrument {
  const [found, setFound] = useState<{ id: string; group?: TerminalInstrument["group"]; unit?: TerminalInstrument["unit"] } | null>(null);
  const need = inst.source === "moex" && !inst.group && !categoryOf(inst);
  useEffect(() => {
    if (!need) return;
    let cancelled = false;
    lookupSecid(inst.dataTicker).then((it) => {
      if (!cancelled && it) setFound({ id: inst.dataTicker, group: it.group, unit: it.unit });
    });
    return () => {
      cancelled = true;
    };
  }, [need, inst.dataTicker]);
  return need && found?.id === inst.dataTicker ? { ...inst, group: found.group, unit: found.unit ?? inst.unit } : inst;
}

function InfoCard({ inst: inst0, quote, visible }: { inst: TerminalInstrument; quote: Quote | undefined; visible: boolean }) {
  const inst = useResolvedGroup(inst0);
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
  const type =
    inst.source === "bybit"
      ? t("shell.info.spot")
      : cat?.name === "Акции ММВБ" || inst.group === "stock"
        ? t("shell.info.stock")
        : inst.group && inst.group !== "future" && inst.group !== "other"
          ? t(`ms.group.${inst.group}`)
          : t("shell.info.future");
  const pos = high != null && low != null && high > low && price != null ? Math.min(100, Math.max(0, ((price - low) / (high - low)) * 100)) : null;
  const label = "text-[var(--tv3-muted)]";
  const rowCls = "flex items-center justify-between gap-3 border-b border-[var(--tv3-hair2)] px-2 py-[9px] text-[14px]";
  const valCls = "font-semibold tabular-nums text-[var(--tv3-text)] text-right";

  return (
    <div className="px-2.5 pb-2.5 text-[14px]">
      <div className="flex items-center gap-2.5 px-2 py-2">
        <InstIcon inst={inst} size={32} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[16px] font-bold text-[var(--tv3-text)] truncate">{inst.ticker}</div>
          <div className="text-[12px] text-[var(--tv3-muted)] truncate">{instName(inst, t)}</div>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2 h-[22px] rounded-full text-[11px] font-semibold ${
            open_ ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-muted)]"
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${open_ ? "bg-[var(--tv3-up)]" : "bg-[var(--tv3-muted)]"}`} />
          {open_ ? t("shell.info.open") : t("shell.info.closed")}
        </span>
      </div>

      {price != null ? (
        <div className="px-2 pb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-bold tabular-nums text-[var(--tv3-text)]">{fmtPrice(price, locale)}</span>
            {cur && <span className="text-[12px] text-[var(--tv3-muted)]">{cur}</span>}
          </div>
          <div className="text-[13px] font-semibold tabular-nums" style={{ color: change === 0 ? "var(--tv3-muted)" : up ? "var(--tv3-up)" : "var(--tv3-down)" }}>
            {fmtSigned(change, chgDigits(price), locale)}&nbsp;&nbsp;{fmtSigned(pct, 2, locale)}%
          </div>
        </div>
      ) : (
        <div className="px-2 py-2 text-[14px] text-[var(--tv3-muted)]">{t("shell.info.noQuote")}</div>
      )}

      {pos !== null && high != null && low != null && (
        <div className="px-2 pb-2.5 text-[12px]">
          <div className={`mb-1.5 ${label}`}>{t(inst.source === "bybit" ? "shell.info.range24" : "shell.info.range")}</div>
          <div className="relative h-1 rounded-full bg-[var(--tv3-fill2)]">
            <span className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[var(--tv3-accent)] -translate-y-1/2 -translate-x-1/2" style={{ left: `${pos}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between font-semibold tabular-nums text-[var(--tv3-text)]">
            <span>{fmtPrice(low, locale)}</span>
            <span>{fmtPrice(high, locale)}</span>
          </div>
        </div>
      )}

      <div>
        <div className={rowCls}>
          <span className={label}>{t("p3.info.ticker")}</span>
          <span className={valCls}>{inst.ticker}</span>
        </div>
        {open != null && (
          <div className={rowCls}>
            <span className={label}>{t("shell.info.dayOpen")}</span>
            <span className={valCls}>{fmtPrice(open, locale)}</span>
          </div>
        )}
        {volume > 0 && (
          <div className={rowCls}>
            <span className={label}>{t("shell.info.volume")}</span>
            <span className={valCls}>{fmtCompact(volume, locale)}</span>
          </div>
        )}
        <div className={rowCls}>
          <span className={label}>{t("shell.info.type")}</span>
          <span className={valCls}>{type}</span>
        </div>
        <div className={rowCls}>
          <span className={label}>{t("shell.info.exchange")}</span>
          <span className={valCls}>{exchangeLabel(inst.source)}</span>
        </div>
      </div>
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
  /** Object tree tab: the chart's drawings and indicators. */
  drawings?: DrawingsController;
  indicators?: IndicatorsControllerLike;
  /** IANA zone of the chart time axis: the economic calendar shows release times in it. */
  calendarZone?: string;
  /** Alerts tab: the alerts state shared with the alerts dialog (without it the tab keeps its own) and the opener of the create form. */
  alertsApi?: AlertsApi;
  onOpenAlerts?: () => void;
}

export default function RightPanel({ open, mobileOpen, visible, tab, onTab, onCollapse, onCloseMobile, selected, onSelect, drawings, indicators, calendarZone, alertsApi, onOpenAlerts }: Props) {
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
  const cur = TABS.find((x) => x.id === tab) ?? TABS[0];
  const createAlert = () => onOpenAlerts?.();

  return (
    <>
      {mobileOpen && <div className="md:hidden absolute inset-0 z-40 bg-black/40" onClick={onCloseMobile} />}
      <aside
        className={`${mobileOpen ? "flex" : "hidden"} md:flex absolute md:static inset-x-0 md:inset-x-auto bottom-0 md:bottom-auto right-0 z-50 md:z-auto shrink-0 h-[78%] md:h-full w-full md:w-auto md:gap-2 rounded-t-2xl md:rounded-none bg-[var(--tv3-card)] md:bg-transparent text-[var(--tv3-text)] shadow-2xl md:shadow-none pb-[env(safe-area-inset-bottom)] md:pb-0`}
      >
        {/* content */}
        <div className={`w-full md:w-[340px] flex-col min-h-0 min-w-0 flex md:rounded-2xl md:bg-[var(--tv3-card)] ${open ? "md:flex" : "md:hidden"}`}>
          <button type="button" onClick={onCloseMobile} aria-label={t("shell.close")} className="md:hidden shrink-0 flex justify-center pt-2 pb-1 cursor-pointer">
            <span className="h-1 w-10 rounded-full bg-[var(--tv3-fill2)]" />
          </button>
          {visible && (
            <>
              <div className="flex items-center gap-2 shrink-0 px-3 pt-1 md:pt-3 pb-2">
                <div className="md:hidden flex items-center gap-0.5 min-w-0 overflow-x-auto [scrollbar-width:none]">
                  {TABS.map((tb) => (
                    <button
                      key={tb.id}
                      onClick={() => onTab(tb.id)}
                      title={t(tb.key)}
                      aria-label={t(tb.key)}
                      aria-pressed={tab === tb.id}
                      className={`tv3-press h-10 w-10 shrink-0 flex items-center justify-center rounded-xl cursor-pointer ${tab === tb.id ? "text-[var(--tv3-accent)] bg-[var(--tv3-accent-soft)]" : "text-[var(--tv3-text2)]"}`}
                    >
                      {panelTabIcon(tb.id, tab === tb.id, 24)}
                    </button>
                  ))}
                </div>
                <span className="hidden md:block flex-1 min-w-0 truncate text-[13px] font-bold uppercase tracking-[.5px] text-[var(--tv3-text2)]">{t(cur.titleKey ?? cur.key)}</span>
                <button
                  onClick={onCollapse}
                  title={t("shell.panel.collapse")}
                  aria-label={t("shell.panel.collapse")}
                  className="tv3-press hidden md:flex ml-auto w-8 h-8 items-center justify-center rounded-[10px] bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)] cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
                <button onClick={onCloseMobile} title={t("shell.close")} aria-label={t("shell.close")} className="tv3-press md:hidden ml-auto w-10 h-10 shrink-0 flex items-center justify-center rounded-xl text-[var(--tv3-muted)] cursor-pointer">
                  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              {tab === "watchlist" && (
                <Watchlist items={watchlist.items} onAdd={watchlist.add} onRemove={watchlist.remove} quotes={quotes} selected={selected} onSelect={onSelect} visible={visible && tab === "watchlist"} />
              )}
              {tab === "info" && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <InfoCard inst={selected} quote={quote} visible={visible && tab === "info"} />
                </div>
              )}
              {tab === "ideas" && (
                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5">
                  <div className="rounded-[14px] bg-[var(--tv3-fill3)] p-3.5 text-[14px] leading-[1.45] text-[var(--tv3-text)]">
                    {t("p3.ideas.text", { ticker: selected.ticker })}
                    <div className="mt-2.5">
                      <Link href="/feed" className="font-semibold text-[var(--tv3-accent)] hover:text-[var(--tv3-accent-hover)]">
                        {t("p3.ideas.open")}
                      </Link>
                    </div>
                  </div>
                </div>
              )}
              {tab === "news" && (
                <div className="flex-1 min-h-0 overflow-y-auto [&>div]:shadow-none! [&>div]:rounded-none! [&>div]:p-3! [&_h2]:text-sm! [&_h2]:mb-2! [&_.overflow-y-auto]:max-h-none! [&_p]:text-xs!">
                  <RuNews category={CATEGORY_NEWS[cat?.name ?? ""] ?? "general"} title={t("shell.tab.news")} />
                </div>
              )}
              {tab === "objects" && drawings && indicators && <ObjectTree drawings={drawings} indicators={indicators} />}
              {tab === "alerts" && (
                <div className="flex-1 min-h-0 overflow-y-auto px-2.5 pb-2.5">
                  {alertsApi ? <AlertsPanelView api={alertsApi} symbol={selected} onCreate={createAlert} /> : <OwnAlertsPanel symbol={selected} onCreate={createAlert} />}
                </div>
              )}
              {tab === "orderbook" && <OrderBookPanel inst={selected} visible={visible && tab === "orderbook"} />}
              {tab === "algo" && <AlgoPanel inst={selected} visible={visible && tab === "algo"} />}
              {tab === "calendar" && <CalendarPanel zone={calendarZone ?? "UTC"} visible={visible && tab === "calendar"} />}
              {tab !== "calendar" && <div className="shrink-0 border-t border-[var(--tv3-hair2)] px-3.5 pb-2.5 pt-2 text-[11px] text-[var(--tv3-muted)]">{t("p3.footer")}</div>}
            </>
          )}
        </div>

        {/* icon rail (desktop) */}
        <div className="hidden md:flex flex-col items-center w-[66px] shrink-0 py-1.5 overflow-y-auto self-stretch rounded-2xl bg-[var(--tv3-card)]">
          <span className="tv3-rgap" />
          {/* icons spread evenly over the card height (flexible spacers shrink to 2px on short screens, then the rail scrolls) */}
          {TABS.map((tb) => {
            const on = open && tab === tb.id;
            return (
              <Fragment key={tb.id}>
                <button
                  onClick={() => onTab(tb.id)}
                  title={t(tb.key)}
                  aria-label={t(tb.key)}
                  aria-pressed={on}
                  className={`tv3-rbtn tv3-press tv3-hov shrink-0 flex items-center justify-center cursor-pointer ${
                    on ? "text-[var(--tv3-accent)] bg-[var(--tv3-accent-soft)] hover:!bg-[var(--tv3-accent-soft)] active:!bg-[var(--tv3-accent-soft)]" : "text-[var(--tv3-text2)]"
                  }`}
                >
                  {panelTabIcon(tb.id, on, 26)}
                </button>
                <span className="tv3-rgap" />
              </Fragment>
            );
          })}
        </div>
      </aside>
    </>
  );
}
