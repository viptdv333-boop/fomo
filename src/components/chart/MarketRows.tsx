"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ContractInfo, ContractsResponse, MarketGroup, MarketItem } from "@/lib/market-types";
import { contractToInstrument, fetchContracts, getLastContract, lookupSecid, itemToInstrument, popularMarketApi, searchMarketApi } from "@/lib/market-client";
import { rememberInstrument, type TerminalInstrument } from "@/lib/terminal-data";
import { coinIcon } from "@/lib/bybit-spot-search";
import { fxIcon } from "@/lib/forex-meta";
import { staticPopular } from "@/lib/market-popular";
import { ContractBadge, ROLL_DAYS } from "./ContractPicker";

export type GroupTab = "all" | Exclude<MarketGroup, "other">;
export const GROUP_TABS: GroupTab[] = ["all", "stock", "bond", "fund", "future", "crypto", "currency", "forex"];

/** Group filter chips of the search dialogs (Все · Акции · Облигации · Фонды · Фьючерсы · Крипто · Валюта · Форекс), wrapped onto several lines so no chip is clipped. */
export function GroupTabs({ value, onChange, className = "" }: { value: GroupTab; onChange: (g: GroupTab) => void; className?: string }) {
  const { t } = useT();
  return (
    <div role="tablist" className={`flex flex-wrap items-center gap-x-1 gap-y-1 ${className}`}>
      {GROUP_TABS.map((g) => (
        <button
          key={g}
          role="tab"
          aria-selected={value === g}
          onClick={() => onChange(g)}
          className={`h-6 px-2.5 rounded-full text-[12px] font-semibold shrink-0 cursor-pointer ${
            value === g ? "bg-[var(--tv3-text)] text-[var(--tv3-card)]" : "bg-[var(--tv3-fill)] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill2)]"
          }`}
        >
          {t(`ms.tab.${g}`)}
        </button>
      ))}
    </div>
  );
}

/** live «popular» lists by chip (a copy of the server's answer): the chip shows it at once on the next open; until it arrives the curated static list stands in */
const popularCache = new Map<GroupTab, { at: number; items: MarketItem[] }>();
const POPULAR_TTL = 5 * 60_000;

/** What a chip shows with an empty query, available synchronously (never an empty hint). */
export function popularNow(group: GroupTab): MarketItem[] {
  return popularCache.get(group)?.items ?? staticPopular(group);
}

const popularInflight = new Map<GroupTab, Promise<boolean>>();
/** Fetches the live list of a chip once (shared by every open dialog); crypto / forex are static. */
/** resolves true when the cache got a new list (a re-render is due) */
function loadPopular(group: GroupTab): Promise<boolean> {
  const hit = popularCache.get(group);
  if (group === "crypto" || group === "forex" || (hit && Date.now() - hit.at < POPULAR_TTL)) return Promise.resolve(false);
  let p = popularInflight.get(group);
  if (!p) {
    p = popularMarketApi(group)
      .then((items) => {
        if (items.length) popularCache.set(group, { at: Date.now(), items });
        return items.length > 0;
      })
      .finally(() => popularInflight.delete(group));
    popularInflight.set(group, p);
  }
  return p;
}
const LIVE_GROUPS: GroupTab[] = ["stock", "bond", "fund", "future", "currency", "all"];

/**
 * Debounced exchange search (shares of all boards, bonds, funds, currency, futures with their contracts).
 * With nothing typed it returns the group's popular list instead: the curated one right away, replaced by the live (turnover ranked) one when it arrives.
 */
export function useMarketSearch(q: string, group: GroupTab, enabled = true): { items: MarketItem[]; loading: boolean; popular: boolean } {
  const [state, setState] = useState<{ items: MarketItem[]; loading: boolean }>({ items: [], loading: false });
  const [, bump] = useState(0);
  const needle = q.trim();
  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.items.length || s.loading ? { items: [], loading: false } : s));
      return;
    }
    const ctl = new AbortController();
    if (!needle) {
      // the typed-search leftovers must not show under the popular list
      setState((s) => (s.items.length || s.loading ? { items: [], loading: false } : s));
      // the opened chip first, the others right after: switching chips then shows the live (turnover ranked) list at once
      let alive = true;
      void Promise.all([group, ...LIVE_GROUPS.filter((g) => g !== group)].map((g) => loadPopular(g).then((fresh) => fresh && alive && bump((n) => n + 1))));
      return () => {
        alive = false;
      };
    }
    setState((s) => ({ items: s.items, loading: true }));
    const id = setTimeout(async () => {
      const items = await searchMarketApi(needle, group, ctl.signal);
      if (!ctl.signal.aborted) setState({ items, loading: false });
    }, 250);
    return () => {
      clearTimeout(id);
      ctl.abort();
    };
  }, [needle, group, enabled]);
  // derived, not stored: a chip switch shows the new list in the same render (no flash of the previous chip's rows or of an empty hint)
  if (enabled && !needle) return { items: popularNow(group), loading: false, popular: true };
  return { ...state, popular: false };
}

/** The icon of a futures underlying, when the terminal has one. */
export function iconFor(item: MarketItem, curated: TerminalInstrument[]): string {
  if (item.group === "forex") return fxIcon(item.secid);
  if (item.group === "crypto") return coinIcon(item.asset ?? "") || (curated.find((i) => i.source === "bybit" && i.dataTicker === item.secid)?.emoji ?? "");
  if (item.group !== "future") return "";
  return curated.find((i) => i.source === "moex" && (i.dataTicker === item.secid || i.dataTicker === item.asset))?.emoji ?? "";
}

/** A market search result for a pick: a futures underlying opens the last chosen contract (when the user chose one), else the auto front month. */
export async function pickMarketItem(item: MarketItem, curated: TerminalInstrument[]): Promise<TerminalInstrument> {
  const icon = iconFor(item, curated);
  if (item.group === "future" && item.auto && item.asset) {
    const last = getLastContract(item.asset);
    if (last) {
      const found = await lookupSecid(last);
      if (found && !(found.daysLeft != null && found.daysLeft < 0)) return itemToInstrument(found, icon);
    }
  }
  return itemToInstrument(item, icon);
}

/** Contracts of an underlying as sub-rows: pick one (or add it to the watchlist). */
export function ContractSubRows({
  asset,
  base,
  onPick,
  mark,
  includeAuto = true,
  autoTicker,
  autoName,
}: {
  asset: string;
  base: TerminalInstrument;
  onPick: (inst: TerminalInstrument) => void;
  /** true for a contract already in the list / on the chart */
  mark?: (ticker: string) => boolean;
  includeAuto?: boolean;
  autoTicker: string;
  autoName: string;
}) {
  const { t, locale } = useT();
  const [data, setData] = useState<ContractsResponse | null | undefined>(undefined);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    fetchContracts("moex", asset, locale).then((r) => live.current && setData(r));
    return () => {
      live.current = false;
    };
  }, [asset, locale]);

  if (data === undefined) return <div className="pl-7 pr-3 py-1.5 text-[11px] text-[var(--tv3-muted)]">{t("ct.loading")}</div>;
  if (!data || data.contracts.length === 0) return <div className="pl-7 pr-3 py-1.5 text-[11px] text-[var(--tv3-muted)]">{t("ct.unavailable")}</div>;

  const rowCls = "w-full flex items-center gap-2 pl-7 pr-2 h-8 text-left cursor-pointer hover:bg-[var(--tv3-fill)]";
  const last = getLastContract(data.asset);
  return (
    <div className="bg-[var(--tv3-fill3)]">
      {includeAuto && (
        <button
          onClick={() => {
            const inst: TerminalInstrument = { ...base, ticker: autoTicker, dataTicker: autoTicker, name: autoName, group: "future" };
            rememberInstrument(inst);
            onPick(inst);
          }}
          className={rowCls}
        >
          <span className="w-[66px] shrink-0"><span className="px-1.5 rounded text-[10px] leading-4 font-medium whitespace-nowrap bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]">{t("ct.autoRow")}</span></span>
          <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--tv3-muted)]">{autoTicker}</span>
          {mark?.(autoTicker) && <span className="text-xs text-[var(--tv3-accent)]">✓</span>}
        </button>
      )}
      {data.contracts.map((c: ContractInfo) => (
        <button key={c.ticker} onClick={() => onPick(contractToInstrument(c, base, data.name))} className={rowCls}>
          <span className="w-[66px] shrink-0">
            <ContractBadge c={c} />
          </span>
          <span className="text-[12px] font-semibold text-[var(--tv3-text)] w-16 shrink-0 truncate">
            {c.ticker}
            {last === c.ticker && <span className="ml-0.5 text-amber-500">★</span>}
          </span>
          <span className="flex-1 min-w-0 truncate text-[11px] text-[var(--tv3-muted)]">{c.expiry ?? t("ct.noExpiry")}</span>
          {c.daysLeft !== null && <span className={`text-[10px] tabular-nums shrink-0 ${c.daysLeft <= ROLL_DAYS ? "text-amber-600" : "text-[var(--tv3-muted)]"}`}>{t("ct.left", { n: c.daysLeft })}</span>}
          {mark?.(c.ticker) && <span className="text-xs text-[var(--tv3-accent)]">✓</span>}
        </button>
      ))}
    </div>
  );
}

/** Small chevron button that toggles the contract list of a futures row. */
export function ExpandButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useT();
  return (
    <span
      role="button"
      tabIndex={0}
      title={open ? t("ct.collapse") : t("ct.expand")}
      aria-label={open ? t("ct.collapse") : t("ct.expand")}
      aria-expanded={open}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          onToggle();
        }
      }}
      className="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded-md text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill2)] cursor-pointer"
    >
      <svg className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}
