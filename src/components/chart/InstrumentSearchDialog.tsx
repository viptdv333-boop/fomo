"use client";

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useT } from "@/lib/i18n/client";
import { ALL_INSTRUMENTS, adHocInstrument, type ChartSource, type TerminalInstrument } from "@/lib/terminal-data";
import { itemToInstrument } from "@/lib/market-client";
import type { FutAsset, GroupTab, MarketItem } from "@/lib/market-types";
import { FUT_ASSET_CHIPS } from "@/lib/futures-assets";
import { GROUP_TABS, NO_FILTERS, filterOptions, hasFilters, venueKind, type Filters, type VenueKind } from "@/lib/instrument-filters";
import { buildDisplayRows, selectableRows, type DisplayRow } from "@/lib/instrument-rows";
import { fmpSymbol } from "@/lib/fmp-alias";
import { getRecent, pushRecent, recentFor } from "@/lib/recent-instruments";
import ModalPortal from "./ModalPortal";
import Flag from "./Flag";
import InstIcon from "./InstIcon";
import { ContractBadge } from "./ContractPicker";
import { ContractSubRows, ExpandButton, iconFor, pickMarketItem } from "./MarketRows";
import { useInstrumentSearch } from "./use-instrument-search";
import "./terminal-v3.css";

/**
 * The instrument search dialog (the look and the behaviour of TradingView's «Добавить инструмент»), shared by three surfaces:
 *  - "watchlist": «+» adds and keeps the dialog open, Shift + click / Shift + Enter adds and closes, ✓ / trash for what is already in the list
 *  - "symbol": a click selects the symbol and closes («Поиск символа»)
 *  - "compare": a click picks the symbol to compare with and closes («Сравнить с»)
 * Category chips, for «Фьючерсы» a second row of underlying-asset chips (the list is then grouped under asset headers, inside them РФ before США),
 * the country / exchange (board / category / quote) dropdowns, server-side search with a 250 ms debounce and pages of 40 rows.
 */
export type SearchMode = "watchlist" | "symbol" | "compare";

interface Props {
  open: boolean;
  mode: SearchMode;
  onClose: () => void;
  /** watchlist: add the instrument; symbol / compare: the picked instrument */
  onPick: (inst: TerminalInstrument) => void;
  /** watchlist: what is in the list already (✓, trash) and how to take a row out */
  existing?: TerminalInstrument[];
  onRemove?: (inst: TerminalInstrument) => void;
  /** symbol / compare: the symbol on the chart (its row is marked) */
  current?: { source: string; ticker: string };
  initialQuery?: string;
}

const RAW_TICKER = /^[A-Za-z0-9_.-]{2,24}$/;

/** the same instrument in a list: the FMP aliases of spot-style tickers (WTIUSD -> CLUSD) count as one */
function sameInstrument(a: { source: string; dataTicker: string }, b: { source: string; dataTicker: string }): boolean {
  if (a.source !== b.source) return false;
  const [x, y] = a.source === "fmp" ? [fmpSymbol(a.dataTicker), fmpSymbol(b.dataTicker)] : [a.dataTicker, b.dataTicker];
  return x.toLowerCase() === y.toLowerCase();
}

/** the instrument of a row for display (icon, ticker): no side effects, unlike itemToInstrument */
function viewInst(item: MarketItem): TerminalInstrument {
  return { ticker: item.ticker, name: item.name, source: item.source as ChartSource, dataTicker: item.secid, emoji: iconFor(item, ALL_INSTRUMENTS), group: item.group };
}

const FILTER_KEY: Record<VenueKind, string> = { exchange: "is.filter.exchange", board: "is.filter.board", category: "is.filter.category", quote: "is.filter.quote" };

/* ───────────── small pieces ───────────── */

const ICON = {
  search: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  close: (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  plus: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" />
    </svg>
  ),
  chevron: (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
};

function Chip({ on, onClick, children, small, tone = "dark" }: { on: boolean; onClick: () => void; children: string; small?: boolean; tone?: "dark" | "accent" }) {
  const onCls = tone === "accent" ? "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : "bg-[var(--tv3-text)] text-[var(--tv3-card)]";
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`tv3-press shrink-0 cursor-pointer rounded-full font-semibold ${small ? "h-7 px-2.5 text-[12px]" : "h-8 px-3 text-[13px]"} ${on ? onCls : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)]"}`}
    >
      {children}
    </button>
  );
}

function FilterSelect({ value, onChange, allLabel, options, label }: { value: string; onChange: (v: string) => void; allLabel: string; options: { value: string; label: string }[]; label: string }) {
  const disabled = options.length <= 1 && !value;
  return (
    <label className="relative min-w-0 flex-1 sm:flex-none">
      <select
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full sm:w-auto sm:min-w-[170px] appearance-none truncate rounded-[10px] bg-[var(--tv3-fill)] pl-3 pr-8 text-[13px] font-medium text-[var(--tv3-text)] outline-none cursor-pointer disabled:opacity-50 disabled:cursor-default focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--tv3-muted)]">{ICON.chevron}</span>
    </label>
  );
}

/* ───────────── one result row ───────────── */

interface RowProps {
  rid: string;
  item: MarketItem;
  mode: SearchMode;
  active: boolean;
  listed: boolean;
  isCurrent: boolean;
  /** futures row with contracts to pick from */
  expandable: boolean;
  expanded: boolean;
  recent?: boolean;
  onAct: (item: MarketItem, shift: boolean) => void;
  onHover: (key: string) => void;
  onToggle: (item: MarketItem) => void;
  onRemoveRow: (item: MarketItem) => void;
  onPickContract: (inst: TerminalInstrument) => void;
  markContract: (ticker: string) => boolean;
}

const ResultRow = memo(function ResultRow({ rid, item, mode, active, listed, isCurrent, expandable, expanded, recent, onAct, onHover, onToggle, onRemoveRow, onPickContract, markContract }: RowProps) {
  const { t, locale } = useT();
  const inst = useMemo(() => viewInst(item), [item]);
  const key = recent ? `r:${item.source}:${item.secid}` : `${item.source}:${item.secid}`;
  const raw = locale !== "ru" && item.nameEn ? item.nameEn : item.name;
  // a futures family shows its underlying code (BRM, not the terminal's «BRM.F»); the name's «BRM · » lead is the ticker again
  const shown = item.group === "future" && item.auto ? item.ticker.replace(/\.F$/, "") : item.ticker;
  const lead = [shown, item.ticker, item.asset].find((p) => p && raw.startsWith(`${p} · `));
  const desc = lead ? raw.slice(lead.length + 3) : raw;
  const badge =
    item.group === "future" && !item.auto && item.kind
      ? { kind: item.kind, order: item.order ?? 0, badge: item.kind === "perpetual" ? t("ms.perpetual") : item.order === 1 ? t("ct.b.current") : item.order === 2 ? t("ct.b.next") : t("ct.b.nth", { n: item.order ?? 0 }) }
      : null;
  const hasContracts = item.group === "future" && item.auto && (item.contracts ?? 0) > 1;
  return (
    <>
      <div
        id={rid}
        role="option"
        aria-selected={active}
        aria-label={`${shown}, ${desc}${item.exchange ? `, ${item.exchange}` : ""}`}
        data-key={key}
        onClick={(e) => onAct(item, e.shiftKey)}
        onMouseMove={() => !active && onHover(key)}
        className={`group flex min-h-[54px] cursor-pointer select-none items-center gap-3 px-3 sm:min-h-[48px] sm:px-5 ${active ? "bg-[var(--tv3-fill)]" : ""}`}
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 54px" }}
      >
        <InstIcon inst={inst} size={28} />
        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <div className="flex min-w-0 items-center gap-1.5 sm:w-[150px] sm:shrink-0">
            <span className={`truncate text-[14px] font-bold leading-tight ${isCurrent ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-text)]"}`}>{shown}</span>
            {badge && <ContractBadge c={badge} />}
            {item.unit === "%" && <span className="shrink-0 rounded bg-[var(--tv3-fill2)] px-1 text-[10px] text-[var(--tv3-text2)]">%</span>}
            {item.source === "fmp" && (
              <span title={t("is.src.fmp")} className="shrink-0 rounded bg-[var(--tv3-fill2)] px-1.5 text-[10px] font-semibold leading-4 text-[var(--tv3-text2)]">
                FMP
              </span>
            )}
          </div>
          <span className="block min-w-0 truncate text-[13px] leading-tight text-[var(--tv3-muted)] sm:flex-1">{desc}</span>
        </div>
        {hasContracts && <span className="hidden shrink-0 text-[11px] text-[var(--tv3-muted)] md:block">{t("ct.contracts", { n: item.contracts ?? 0 })}</span>}
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-[var(--tv3-muted)] sm:text-[12px]">
          <span className="max-w-[64px] truncate sm:max-w-none">{item.exchange}</span>
          {item.country && <Flag code={item.country} width={18} />}
        </span>
        {expandable && <ExpandButton open={expanded} onToggle={() => onToggle(item)} />}
        {mode === "watchlist" &&
          (listed ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("is.remove", { ticker: shown })}
              title={t("is.remove", { ticker: shown })}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveRow(item);
              }}
              className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--tv3-accent)] hover:text-[var(--tv3-red)]"
            >
              <span className={`${active ? "hidden" : "inline-flex"} [@media(hover:none)]:hidden`}>{ICON.check}</span>
              <span className={`${active ? "inline-flex" : "hidden"} [@media(hover:none)]:inline-flex`}>{ICON.trash}</span>
            </button>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              aria-label={t("is.add", { ticker: shown })}
              title={t("is.add", { ticker: shown })}
              onClick={(e) => {
                e.stopPropagation();
                onAct(item, e.shiftKey);
              }}
              className="tv3-press flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-accent)] hover:text-white"
            >
              {ICON.plus}
            </button>
          ))}
      </div>
      {expanded && item.asset && (
        <ContractSubRows asset={item.secid} base={inst} autoTicker={item.secid} autoName={item.name} mark={markContract} onPick={onPickContract} />
      )}
    </>
  );
});

/** «Open X on MOEX / Bybit»: any other ticker typed in full can be opened directly on either exchange */
const OpenRow = memo(function OpenRow({ rid, inst, active, onAct, onHover }: { rid: string; inst: TerminalInstrument; active: boolean; onAct: (inst: TerminalInstrument) => void; onHover: (key: string) => void }) {
  const { t } = useT();
  const text = t(inst.source === "moex" ? "shell.symbol.openMoex" : "shell.symbol.openBybit", { ticker: inst.ticker });
  return (
    <div
      id={rid}
      role="option"
      aria-selected={active}
      data-key={`open:${inst.source}`}
      onClick={() => onAct(inst)}
      onMouseMove={() => !active && onHover(`open:${inst.source}`)}
      className={`flex min-h-[48px] cursor-pointer select-none items-center gap-3 px-3 sm:px-5 ${active ? "bg-[var(--tv3-fill)]" : ""}`}
    >
      <InstIcon inst={inst} size={28} />
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-[var(--tv3-text)]">{text}</span>
    </div>
  );
});

/* ───────────── the dialog ───────────── */

function Dialog({ mode, onClose, onPick, existing, onRemove, current, initialQuery = "" }: Omit<Props, "open">) {
  const { t } = useT();
  const [q, setQ] = useState(initialQuery);
  const [tab, setTab] = useState<GroupTab>("all");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [recent] = useState(getRecent);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const search = useInstrumentSearch(q, tab, filters, true);
  const needle = q.trim();
  const list = existing ?? [];

  /* focus the search box; the page behind does not scroll while a phone shows the dialog full screen */
  useEffect(() => {
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* Escape closes from anywhere (also with the focus on the page behind) */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const refocus = () => {
    // a touch screen would open the keyboard on every chip tap
    if (window.matchMedia?.("(hover: hover)").matches) inputRef.current?.focus();
  };
  const chooseTab = (g: GroupTab) => {
    setTab(g);
    setFilters(NO_FILTERS); // the second dropdown means something else on every chip
    setExpanded({});
    refocus();
  };
  const setFilter = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    refocus();
  };

  const showRecent = !needle && !hasFilters(filters);
  const recentItems = useMemo(() => (showRecent ? recentFor(tab, recent) : []), [showRecent, tab, recent]);
  const rows = useMemo<DisplayRow[]>(
    () => buildDisplayRows(search.items, { tab, asset: filters.asset, mix: search.popular && !needle && !hasFilters(filters), recent: recentItems }),
    [search.items, search.popular, tab, filters, needle, recentItems]
  );

  /* «open the exact ticker on MOEX / Bybit»: symbol search and compare only */
  const adhoc = useMemo<TerminalInstrument[]>(() => {
    if (mode === "watchlist" || !RAW_TICKER.test(needle) || (tab !== "all" && tab !== "crypto")) return [];
    if (ALL_INSTRUMENTS.some((i) => i.ticker.toLowerCase() === needle.toLowerCase())) return [];
    const out: TerminalInstrument[] = [];
    if (tab === "all" && search.items.length === 0 && !search.loading && !search.popular) out.push(adHocInstrument("moex", needle));
    // perpetuals / dated contracts (BTCUSDT.P ...) are not in the spot list: still openable by the exact ticker
    if (!search.items.some((r) => r.source === "bybit") && !search.popular) out.push(adHocInstrument("bybit", needle.toUpperCase()));
    return out;
  }, [mode, needle, tab, search.items, search.loading, search.popular]);

  const entries = useMemo(() => [...selectableRows(rows).map((r) => ({ key: r.recent ? `r:${r.item.source}:${r.item.secid}` : `${r.item.source}:${r.item.secid}`, row: r })), ...adhoc.map((inst) => ({ key: `open:${inst.source}`, row: null, inst }))], [rows, adhoc]);
  const activeIdx = Math.max(0, entries.findIndex((e) => e.key === activeKey));
  const activeEntry = entries[activeIdx];
  const ridOf = (key: string) => `${uid}-${key.replace(/[^A-Za-z0-9_-]/g, "_")}`;

  useEffect(() => {
    if (!activeEntry || !listRef.current) return;
    listRef.current.querySelector<HTMLElement>(`[id="${ridOf(activeEntry.key)}"]`)?.scrollIntoView({ block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntry?.key]);

  /* ── actions ── */
  const inList = (item: MarketItem) => {
    const inst = viewInst(item);
    return list.some((e) => sameInstrument(e, inst));
  };
  const actRef = useRef<(item: MarketItem, shift: boolean) => void>(() => {});
  actRef.current = async (item, shift) => {
    if (mode === "watchlist") {
      const inst = itemToInstrument(item, iconFor(item, ALL_INSTRUMENTS));
      if (!list.some((e) => sameInstrument(e, inst))) {
        onPick(inst);
        pushRecent(item);
      }
      if (shift) onClose();
      return;
    }
    const inst = await pickMarketItem(item, ALL_INSTRUMENTS);
    pushRecent(item);
    onPick(inst);
    onClose();
  };
  const focusRef = useRef<() => void>(() => {});
  focusRef.current = refocus;
  const onAct = useCallback((item: MarketItem, shift: boolean) => {
    void actRef.current(item, shift);
    focusRef.current(); // the next keystroke goes on searching, not to the button that was clicked
  }, []);
  const onHover = useCallback((key: string) => setActiveKey(key), []);
  const removeRef = useRef<(item: MarketItem) => void>(() => {});
  removeRef.current = (item) => {
    const inst = viewInst(item);
    const listed = list.find((e) => sameInstrument(e, inst));
    if (listed) onRemove?.(listed);
  };
  const onRemoveRow = useCallback((item: MarketItem) => {
    removeRef.current(item);
    focusRef.current();
  }, []);
  const onToggle = useCallback((item: MarketItem) => {
    setExpanded((e) => ({ ...e, [item.secid]: !e[item.secid] }));
    focusRef.current();
  }, []);
  const pickContractRef = useRef<(inst: TerminalInstrument) => void>(() => {});
  pickContractRef.current = (inst) => {
    onPick(inst);
    if (mode !== "watchlist") onClose();
  };
  const onPickContract = useCallback((inst: TerminalInstrument) => pickContractRef.current(inst), []);
  const markRef = useRef<(ticker: string) => boolean>(() => false);
  markRef.current = (ticker) => (mode === "watchlist" ? list.some((i) => i.source === "moex" && i.dataTicker === ticker) : !!current && current.source === "moex" && current.ticker === ticker);
  const markContract = useCallback((ticker: string) => markRef.current(ticker), []);
  const actAdhoc = (inst: TerminalInstrument) => {
    onPick(inst);
    onClose();
  };

  const isExpandable = (item: MarketItem) => item.group === "future" && !!item.auto && (item.contracts ?? 0) > 1;

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!entries.length) return;
      const next = Math.min(entries.length - 1, Math.max(0, activeIdx + (e.key === "ArrowDown" ? 1 : -1)));
      setActiveKey(entries[next].key);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const en = activeEntry;
      if (!en) return;
      if (en.row) void actRef.current(en.row.item, e.shiftKey);
      else if ("inst" in en && en.inst) actAdhoc(en.inst);
    } else if (e.key === "ArrowRight" && activeEntry?.row && isExpandable(activeEntry.row.item) && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      e.preventDefault();
      setExpanded((x) => ({ ...x, [activeEntry.row!.item.secid]: true }));
    } else if (e.key === "ArrowLeft" && activeEntry?.row && expanded[activeEntry.row.item.secid]) {
      e.preventDefault();
      setExpanded((x) => ({ ...x, [activeEntry.row!.item.secid]: false }));
    }
  };

  /* keys stay in the dialog (the chart behind has its own shortcuts); Tab cycles through the dialog */
  const onRootKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.key !== "Tab") return;
    const nodes = [...(rootRef.current?.querySelectorAll<HTMLElement>('input, select, button:not([tabindex="-1"])') ?? [])].filter((n) => !(n as HTMLInputElement).disabled && n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  /* ── view ── */
  const opts = filterOptions(tab, search.facets, filters);
  const kind = venueKind(tab);
  const tr = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const venueLabel = (v: string) => (kind === "board" ? tr(`is.board.${v}`, v) : kind === "category" ? tr(`is.cat.${v}`, v) : v);
  const title = mode === "compare" ? t("is.title.compare") : mode === "symbol" ? t("is.title.symbol") : t("is.title.watchlist");
  const empty = entries.length === 0 && !search.loading;
  const hint = mode === "watchlist" ? t("is.hint.watchlist") : t("is.hint.pick");
  const remaining = Math.max(0, search.total - search.items.length);

  return (
    <div className="app-sd-wrap fixed inset-0 z-[80] flex items-stretch justify-center bg-black/40 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={onRootKey}
        className="app-sd-card flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] sm:h-[min(80vh,760px)] sm:w-[820px] sm:max-w-full sm:rounded-2xl"
      >
        {/* sticky head: title, search, chips, filters */}
        <div className="shrink-0 border-b border-[var(--tv3-hair)]">
          <div className="flex h-12 items-center justify-between px-4 sm:px-5">
            <h2 className="text-[18px] font-bold">{title}</h2>
            <button type="button" onClick={onClose} aria-label={t("shell.close")} title={t("shell.close")} className="tv3-press -mr-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)]">
              {ICON.close}
            </button>
          </div>
          <div className="app-sd-head max-h-[52dvh] overflow-y-auto sm:max-h-none sm:overflow-visible">
            <div className="px-4 pb-1.5 sm:px-5">
              <div className="flex h-11 items-center gap-3 rounded-xl bg-[var(--tv3-fill)] px-3.5 focus-within:ring-2 focus-within:ring-[var(--tv3-accent)]">
                <span className="text-[var(--tv3-muted)]">{ICON.search}</span>
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onInputKey}
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${uid}-list`}
                  aria-autocomplete="list"
                  aria-activedescendant={activeEntry ? ridOf(activeEntry.key) : undefined}
                  aria-label={t("is.placeholder")}
                  placeholder={t("is.placeholder")}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className="min-w-0 flex-1 bg-transparent text-[16px] text-[var(--tv3-text)] outline-none placeholder:text-[var(--tv3-muted)]"
                />
                {q && (
                  <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label={t("shell.close")} className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-[var(--tv3-fill2)] text-[var(--tv3-muted)]">
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div role="group" aria-label={t("is.chips")} className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 px-4 pb-1.5 sm:px-5">
              {GROUP_TABS.map((g) => (
                <Chip key={g} on={tab === g} onClick={() => chooseTab(g)}>
                  {t(`ms.tab.${g}`)}
                </Chip>
              ))}
            </div>
            {tab === "future" && (
              <div role="group" aria-label={t("is.assets")} className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 px-4 pb-1.5 sm:px-5">
                <Chip small tone="accent" on={!filters.asset} onClick={() => setFilter({ asset: "" })}>
                  {t("is.fa.all")}
                </Chip>
                {FUT_ASSET_CHIPS.map((a: FutAsset) => (
                  <Chip small tone="accent" key={a} on={filters.asset === a} onClick={() => setFilter({ asset: a })}>
                    {t(`is.fa.${a}`)}
                  </Chip>
                ))}
              </div>
            )}
            <div role="group" aria-label={t("is.filters")} className="flex items-center gap-2 px-4 pb-2.5 sm:px-5">
              <FilterSelect
                value={filters.country}
                onChange={(country) => setFilter({ country })}
                allLabel={t("is.filter.country")}
                label={t("is.filter.country")}
                options={opts.countries.map((c) => ({ value: c, label: tr(`is.country.${c}`, c) }))}
              />
              <FilterSelect
                value={filters.venue}
                onChange={(venue) => setFilter({ venue })}
                allLabel={t(FILTER_KEY[kind])}
                label={t(FILTER_KEY[kind])}
                options={opts.venues.map((v) => ({ value: v, label: venueLabel(v) }))}
              />
              {search.loading && <span className="ml-1 hidden shrink-0 text-[12px] text-[var(--tv3-muted)] sm:block">{t("ms.searching")}</span>}
            </div>
          </div>
        </div>

        {/* the list */}
        <div ref={listRef} id={`${uid}-list`} role="listbox" aria-label={title} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {rows.map((r) => {
            switch (r.kind) {
              case "recent-head":
                return (
                  <div key={r.key} className="px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)] sm:px-5">
                    {t("is.recent")}
                  </div>
                );
              case "group-head":
                return (
                  <div key={r.key} className="sticky top-0 z-[1] bg-[var(--tv3-card)] px-4 pb-1 pt-3 text-[12px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)] sm:px-5">
                    {t(`ms.group.${r.group === "other" ? "stock" : r.group}`)}
                  </div>
                );
              case "asset-head":
                return (
                  <div key={r.key} className="sticky top-0 z-[1] border-b border-[var(--tv3-hair2)] bg-[var(--tv3-card)] px-4 pb-1.5 pt-3.5 text-[15px] font-bold sm:px-5">
                    {t(`is.fah.${r.asset}`)}
                  </div>
                );
              case "country-head":
                return (
                  <div key={r.key} className="flex items-center gap-2 px-4 pb-0.5 pt-2 text-[12px] font-semibold text-[var(--tv3-text2)] sm:px-5">
                    <Flag code={r.country} width={18} />
                    <span>{tr(`is.country.${r.country}`, r.country)}</span>
                    <span className="truncate font-normal text-[var(--tv3-muted)]">{tr(`is.sub.${r.country}`, "")}</span>
                  </div>
                );
              case "item": {
                const item = r.item;
                const key = r.recent ? `r:${item.source}:${item.secid}` : `${item.source}:${item.secid}`;
                const inst = viewInst(item);
                return (
                  <ResultRow
                    key={r.key}
                    rid={ridOf(key)}
                    item={item}
                    mode={mode}
                    active={activeEntry?.key === key}
                    listed={mode === "watchlist" && list.some((e) => sameInstrument(e, inst))}
                    isCurrent={mode !== "watchlist" && !!current && current.source === inst.source && current.ticker === inst.dataTicker}
                    expandable={isExpandable(item)}
                    expanded={!!expanded[item.secid] && isExpandable(item)}
                    recent={r.recent}
                    onAct={onAct}
                    onHover={onHover}
                    onToggle={onToggle}
                    onRemoveRow={onRemoveRow}
                    onPickContract={onPickContract}
                    markContract={markContract}
                  />
                );
              }
            }
          })}
          {adhoc.map((inst) => (
            <OpenRow key={inst.source} rid={ridOf(`open:${inst.source}`)} inst={inst} active={activeEntry?.key === `open:${inst.source}`} onAct={actAdhoc} onHover={onHover} />
          ))}
          {search.loading && entries.length === 0 && <div className="px-5 py-8 text-center text-[13px] text-[var(--tv3-muted)]">{t("ms.searching")}</div>}
          {empty && !search.failed && (
            <div className="px-5 py-10 text-center">
              <div className="text-[15px] font-semibold text-[var(--tv3-text2)]">{t("is.empty")}</div>
              <div className="mt-1 text-[13px] text-[var(--tv3-muted)]">{t("is.emptyHint")}</div>
              {hasFilters(filters) && (
                <button type="button" onClick={() => setFilter({ ...NO_FILTERS })} className="tv3-press mt-3 h-8 cursor-pointer rounded-[10px] bg-[var(--tv3-fill)] px-3.5 text-[13px] font-semibold hover:bg-[var(--tv3-fill2)]">
                  {t("is.reset")}
                </button>
              )}
            </div>
          )}
          {empty && search.failed && <div className="px-5 py-10 text-center text-[13px] text-[var(--tv3-muted)]">{t("is.failed")}</div>}
          {search.hasMore && (
            <div className="px-4 py-3 sm:px-5">
              <button type="button" onClick={search.loadMore} disabled={search.loadingMore} className="tv3-press h-10 w-full cursor-pointer rounded-[10px] bg-[var(--tv3-fill)] text-[14px] font-semibold hover:bg-[var(--tv3-fill2)] disabled:opacity-60">
                {search.loadingMore ? "…" : remaining > 0 ? t("is.moreN", { n: remaining }) : t("is.more")}
              </button>
            </div>
          )}
        </div>
        <div className="sr-only" aria-live="polite">
          {!search.loading && needle ? t("is.results", { n: search.total }) : ""}
        </div>
        <div className="hidden h-9 shrink-0 items-center border-t border-[var(--tv3-hair)] px-5 text-[12px] text-[var(--tv3-muted)] sm:flex">{hint}</div>
      </div>
    </div>
  );
}

export default function InstrumentSearchDialog({ open, ...rest }: Props) {
  if (!open) return null;
  return (
    <ModalPortal>
      <Dialog {...rest} />
    </ModalPortal>
  );
}
