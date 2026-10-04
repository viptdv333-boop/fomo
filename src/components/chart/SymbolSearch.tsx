"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ContractSubRows, ExpandButton, GroupTabs, iconFor, pickMarketItem, useMarketSearch, type GroupTab } from "./MarketRows";
import { ContractBadge } from "./ContractPicker";
import { autoToAsset, getLastContract, lookupSecid, itemToInstrument } from "@/lib/market-client";
import type { MarketItem } from "@/lib/market-types";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (inst: TerminalInstrument) => void;
  current?: { source: string; ticker: string };
  /** "compare": the «СРАВНИТЬ С» list of the design (caption + teal dot instead of the instrument icon) */
  variant?: "search" | "compare";
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

export default function SymbolSearch({ open, onClose, onPick, current, variant = "search" }: Props) {
  const { t } = useT();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [tab, setTab] = useState<GroupTab>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const market = useMarketSearch(q, tab, open);

  // design: the list hangs under its toolbar button (symbol chip / «Сравнить») as a popover; on a phone it stays a centred sheet
  const [anchorPos, setAnchorPos] = useState<{ left: number; top: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    if (window.innerWidth < 640) {
      setAnchorPos(null);
      return;
    }
    const sel = variant === "compare" ? `button[title="${t("cs.compare").replace(/"/g, '\\"')}"]` : `button[title="${t("shell.symbol.searchTitle").replace(/"/g, '\\"')}"]`;
    const r = document.querySelector<HTMLElement>(sel)?.getBoundingClientRect();
    if (!r) {
      setAnchorPos(null);
      return;
    }
    const width = 380;
    setAnchorPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6, width });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, variant]);

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
        // tabs: shares -> Акции, the other MOEX entries are futures, Bybit pairs -> Крипто
        // forex rows of the curated list: under the «Форекс» tab only (the exchange search ranks them for «Все»)
        if (inst.source === "forex" && tab !== "forex") continue;
        if (tab === "forex" ? inst.source !== "forex" : tab === "crypto" ? inst.source !== "bybit" : tab !== "all" && !(inst.source === "moex" && (tab === "stock" ? shares : tab === "future" ? !shares : false))) continue;
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
      const key = `${item.source}:${item.secid}`;
      if (seen.has(key)) continue;
      seen.add(key);
      marketHits++;
      out.push({
        inst: itemToInstrument(item, iconFor(item, ALL_INSTRUMENTS)),
        group: t(`ms.group.${item.group === "other" ? "stock" : item.group}`),
        item,
        expand: item.group === "future" && item.auto && (item.contracts ?? 0) > 1 ? item.secid : undefined,
      });
    }
    // Any other ticker can be opened directly on either exchange.
    const raw = q.trim();
    if (/^[A-Za-z0-9_.-]{2,24}$/.test(raw) && !ALL_INSTRUMENTS.some((i) => i.ticker.toLowerCase() === raw.toLowerCase()) && (tab === "all" || tab === "crypto")) {
      if (tab === "all" && !marketHits && !market.loading) out.push({ inst: adHocInstrument("moex", raw), group: "MOEX", custom: true });
      // perpetuals / dated contracts (BTCUSDT.P ...) are not in the spot list: still openable by the exact ticker
      if (!out.some((r) => r.inst.source === "bybit" && !r.custom)) out.push({ inst: adHocInstrument("bybit", raw.toUpperCase()), group: "Bybit", custom: true });
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
    <div className={anchorPos ? "fixed inset-0 z-[60]" : "fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-3 bg-black/30"} onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label={t("shell.symbol.searchTitle")}
        className={`flex flex-col rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] overflow-hidden ${anchorPos ? "absolute" : "w-full max-w-md max-h-[80vh]"}`}
        style={anchorPos ? { left: anchorPos.left, top: anchorPos.top, width: anchorPos.width, maxHeight: Math.max(240, window.innerHeight - anchorPos.top - 16) } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        {variant === "compare" && <div className="px-4 pt-3 pb-0.5 text-xs font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)] shrink-0">{t("sym.compareWith")}</div>}
        <div className="flex items-center gap-2 mx-2.5 mt-2.5 mb-1 px-3 h-10 rounded-[10px] bg-[var(--tv3-fill)] shrink-0">
          <svg className="w-4 h-4 text-[var(--tv3-muted)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("shell.symbol.placeholder")}
            className="flex-1 bg-transparent outline-none text-[15px] text-[var(--tv3-text)] placeholder:text-[var(--tv3-muted)]"
            autoComplete="off"
            spellCheck={false}
          />
          <button onClick={onClose} title={t("shell.close")} className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill2)]">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <GroupTabs value={tab} onChange={setTab} className="px-3 py-1.5 shrink-0" />

        <div ref={listRef} className="flex-1 overflow-y-auto py-1">
          {rows.length === 0 && !market.loading && <div className="px-4 py-8 text-center text-sm text-[var(--tv3-muted)]">{t("shell.symbol.empty")}</div>}
          {market.loading && <div className="px-4 pt-2 text-[11px] text-[var(--tv3-muted)]">{t("ms.searching")}</div>}
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
                  <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{r.group}</div>
                )}
                <button
                  data-i={i}
                  onMouseMove={() => setIdx(i)}
                  onClick={() => void pick(r)}
                  className={`mx-1.5 w-[calc(100%-12px)] flex items-center gap-3 px-2.5 h-11 rounded-[10px] text-left ${active ? "bg-[var(--tv3-fill)]" : ""}`}
                >
                  {variant === "compare" ? <span className="mx-1.5 h-2.5 w-2.5 rounded-full shrink-0" style={{ background: "var(--tv3-teal)" }} /> : <InstIcon inst={r.inst} size={24} />}
                  <span className={`text-[14px] font-semibold w-24 shrink-0 truncate ${isCurrent ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-text)]"}`}>
                    {r.inst.ticker}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-xs text-[var(--tv3-muted)]">
                    {r.custom
                      ? t(r.inst.source === "moex" ? "shell.symbol.openMoex" : "shell.symbol.openBybit", { ticker: r.inst.ticker })
                      : it
                        ? it.name
                        : instName(r.inst, t)}
                  </span>
                  {it?.group === "future" && !it.auto && it.kind && <ContractBadge c={{ kind: it.kind, order: it.order ?? 0, badge: badgeText }} />}
                  {it?.group === "future" && it.auto && (it.contracts ?? 0) > 1 && (
                    <span className="text-[10px] text-[var(--tv3-muted)] shrink-0">{t("ct.contracts", { n: it.contracts ?? 0 })}</span>
                  )}
                  {it?.unit === "%" && <span className="text-[10px] px-1 rounded bg-[var(--tv3-fill2)] text-[var(--tv3-text2)] shrink-0">%</span>}
                  <span className="text-[11px] text-[var(--tv3-muted)] shrink-0">{exchangeLabel(r.inst.source)}</span>
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
        <div className="px-3 h-8 flex items-center text-[11px] text-[var(--tv3-muted)] border-t border-[var(--tv3-hair)] shrink-0">
          {t("shell.symbol.hint")}
        </div>
      </div>
    </div>
  );
}
