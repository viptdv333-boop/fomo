"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { ContractInfo, ContractsResponse, FutAsset, MarketItem } from "@/lib/market-types";
import { contractToInstrument, fetchContracts, getLastContract, lookupSecid, itemToInstrument } from "@/lib/market-client";
import { rememberInstrument, type TerminalInstrument } from "@/lib/terminal-data";
import { coinIcon } from "@/lib/bybit-spot-search";
import { fxIcon } from "@/lib/forex-meta";
import { usFutureBySymbol } from "@/lib/us-futures";
import { ContractBadge, ROLL_DAYS } from "./ContractPicker";

/** terminal artwork of the metals / energy classes: the icon of a futures row that has none of its own (BRM, GOLDM, SILVM ...) */
const FUT_ASSET_ICON: Partial<Record<FutAsset, string>> = {
  oil: "oil",
  gas: "gas",
  gold: "gold",
  silver: "silver",
  copper: "copper",
  platinum: "platinum",
  palladium: "palladium",
};
const INDEX_ICON: Record<string, string> = { IMOEX: "moex-index", RTSI: "rts-index" };

/** The icon of a row of the market search, when the terminal has one. */
export function iconFor(item: MarketItem, curated: TerminalInstrument[]): string {
  if (item.group === "forex") return fxIcon(item.secid);
  if (item.group === "crypto") return coinIcon(item.asset ?? "") || (curated.find((i) => i.source === "bybit" && i.dataTicker === item.secid)?.emoji ?? "");
  if (item.source === "fmp") return usFutureBySymbol(item.secid)?.icon ?? "";
  if (item.group === "index") return INDEX_ICON[item.secid] ? `/icons/instruments/${INDEX_ICON[item.secid]}.svg` : "";
  // shares the terminal has artwork for (SBER, GAZP ...)
  if (item.group === "stock") return curated.find((i) => i.source === item.source && i.dataTicker === item.secid)?.emoji ?? "";
  if (item.group !== "future") return "";
  const own = curated.find((i) => i.source === "moex" && (i.dataTicker === item.secid || i.dataTicker === item.asset))?.emoji;
  const byClass = item.fgroup ? FUT_ASSET_ICON[item.fgroup] : undefined;
  return own || (byClass ? `/icons/instruments/${byClass}.svg` : "");
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

  if (data === undefined) return <div className="pl-[52px] pr-3 py-2 text-[11px] text-[var(--tv3-muted)] sm:pl-[60px]">{t("ct.loading")}</div>;
  if (!data || data.contracts.length === 0) return <div className="pl-[52px] pr-3 py-2 text-[11px] text-[var(--tv3-muted)] sm:pl-[60px]">{t("ct.unavailable")}</div>;

  const rowCls = "w-full flex items-center gap-2 pl-[52px] pr-3 sm:pl-[60px] sm:pr-5 h-9 text-left cursor-pointer hover:bg-[var(--tv3-fill)]";
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
