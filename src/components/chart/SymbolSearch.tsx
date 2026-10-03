"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import {
  ALL_INSTRUMENTS,
  CATEGORY_I18N,
  TERMINAL_DATA,
  adHocInstrument,
  exchangeLabel,
  instName,
  type TerminalInstrument,
} from "@/lib/terminal-data";
import { InstIcon } from "./RightPanel";
import { ContractSubRows, ExpandButton, GroupTabs, pickMarketItem, useMarketSearch, type GroupTab } from "./MarketRows";
import { ContractBadge } from "./ContractPicker";
import { autoToAsset, getLastContract, lookupSecid, itemToInstrument } from "@/lib/market-client";
import type { MarketItem } from "@/lib/market-types";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (inst: TerminalInstrument) => void;
  current?: { source: string; ticker: string };
}

interface Row {
  inst: TerminalInstrument;
  group: string;
  custom?: boolean;
  /** result of the exchange search */
  item?: MarketItem;
  /** futures underlying whose contracts can be expanded under the row (auto ticker) */
  expand?: string;
}

export default function SymbolSearch({ open, onClose, onPick, current }: Props) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<GroupTab>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const market = useMarketSearch(q, tab, open);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Row[] = [];
    const seen = new Set<string>();
    for (const cat of TERMINAL_DATA) {
      const group = t(CATEGORY_I18N[cat.name] || cat.name);
      const shares = cat.name === "Акции ММВБ";
      for (const inst of cat.instruments) {
        // tabs: shares -> Акции, the other MOEX entries are futures, crypto only in "Все"
        if (tab !== "all" && !(inst.source === "moex" && (tab === "stock" ? shares : tab === "future" ? !shares : false))) continue;
        if (
          !needle ||
          inst.ticker.toLowerCase().includes(needle) ||
          inst.name.toLowerCase().includes(needle) ||
          instName(inst, t).toLowerCase().includes(needle)
        ) {
          out.push({ inst, group, expand: inst.source === "moex" && !shares ? inst.dataTicker : undefined });
          seen.add(`${inst.source}:${inst.dataTicker}`);
        }
      }
    }
    // the exchange search: shares of all boards, bonds, funds, currency, futures with their contracts
    let marketHits = 0;
    for (const item of market.items) {
      const key = `moex:${item.secid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marketHits++;
      out.push({
        inst: itemToInstrument(item, ""),
        group: t(`ms.group.${item.group === "other" ? "stock" : item.group}`),
        item,
        expand: item.group === "future" && item.auto && (item.contracts ?? 0) > 1 ? item.secid : undefined,
      });
    }
    // Any other ticker can be opened directly on either exchange.
    const raw = q.trim();
    if (/^[A-Za-z0-9_.-]{2,24}$/.test(raw) && !ALL_INSTRUMENTS.some((i) => i.ticker.toLowerCase() === raw.toLowerCase()) && tab === "all") {
      if (!marketHits && !market.loading) out.push({ inst: adHocInstrument("moex", raw), group: "MOEX", custom: true });
      out.push({ inst: adHocInstrument("bybit", raw.toUpperCase()), group: "Bybit", custom: true });
    }
    return out;
  }, [q, t, tab, market.items, market.loading]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${idx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  if (!open) return null;

  const pick = async (r: Row | undefined) => {
    if (!r) return;
    if (r.item) {
      onPick(await pickMarketItem(r.item, ALL_INSTRUMENTS));
    } else if (r.expand && !r.custom) {
      // a curated futures entry: reopen the contract the user chose last time (still listed), else the auto front month
      const last = getLastContract(autoToAsset(r.expand));
      const found = last ? await lookupSecid(last) : null;
      onPick(found && !(found.daysLeft != null && found.daysLeft < 0) ? itemToInstrument(found, r.inst.emoji) : r.inst);
    } else onPick(r.inst);
    onClose();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(rows[idx]);
    }
  };

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-3 bg-black/40" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t("shell.symbol.searchTitle")}
        className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-2xl overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2 px-3 h-12 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("shell.symbol.placeholder")}
            className="flex-1 bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose} title={t("shell.close")} className="w-7 h-7 flex items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <GroupTabs value={tab} onChange={setTab} className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0" />

        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {rows.length === 0 && !market.loading && <div className="px-4 py-8 text-center text-sm text-gray-400">{t("shell.symbol.empty")}</div>}
          {market.loading && <div className="px-4 pt-2 text-[11px] text-gray-400">{t("ms.searching")}</div>}
          {rows.map((r, i) => {
            const head = r.group !== lastGroup;
            lastGroup = r.group;
            const active = i === idx;
            const isCurrent = current && current.source === r.inst.source && current.ticker === r.inst.dataTicker;
            const isOpen = !!(r.expand && expanded[r.expand]);
            const it = r.item;
            const badgeText = it && it.kind === "perpetual" ? t("ms.perpetual") : it && it.order === 1 ? t("ct.b.current") : it && it.order === 2 ? t("ct.b.next") : t("ct.b.nth", { n: it?.order ?? 0 });
            return (
              <div key={`${r.inst.source}:${r.inst.dataTicker}:${i}`}>
                {head && (
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{r.group}</div>
                )}
                <button
                  data-i={i}
                  onMouseMove={() => setIdx(i)}
                  onClick={() => void pick(r)}
                  className={`w-full flex items-center gap-3 px-3 h-10 text-left ${active ? "bg-gray-100 dark:bg-gray-800" : ""}`}
                >
                  <InstIcon inst={r.inst} size={24} />
                  <span className={`text-[13px] font-bold w-24 shrink-0 truncate ${isCurrent ? "text-green-600 dark:text-green-400" : "text-gray-900 dark:text-gray-100"}`}>
                    {r.inst.ticker}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
                    {r.custom
                      ? t(r.inst.source === "moex" ? "shell.symbol.openMoex" : "shell.symbol.openBybit", { ticker: r.inst.ticker })
                      : it
                        ? it.name
                        : instName(r.inst, t)}
                  </span>
                  {it?.group === "future" && !it.auto && it.kind && <ContractBadge c={{ kind: it.kind, order: it.order ?? 0, badge: badgeText }} />}
                  {it?.group === "future" && it.auto && (it.contracts ?? 0) > 1 && (
                    <span className="text-[10px] text-gray-400 shrink-0">{t("ct.contracts", { n: it.contracts ?? 0 })}</span>
                  )}
                  {it?.unit === "%" && <span className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 shrink-0">%</span>}
                  <span className="text-[11px] text-gray-400 shrink-0">{exchangeLabel(r.inst.source)}</span>
                  {r.expand && <ExpandButton open={isOpen} onToggle={() => setExpanded((e) => ({ ...e, [r.expand as string]: !e[r.expand as string] }))} />}
                </button>
                {isOpen && r.expand && (
                  <ContractSubRows
                    asset={r.expand}
                    base={r.inst}
                    autoTicker={r.expand}
                    autoName={it ? it.name : r.inst.name}
                    mark={(tk) => !!current && current.source === "moex" && current.ticker === tk}
                    onPick={(inst) => {
                      onPick(inst);
                      onClose();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="px-3 h-8 flex items-center text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800 shrink-0">
          {t("shell.symbol.hint")}
        </div>
      </div>
    </div>
  );
}
