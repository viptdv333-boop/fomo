"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { findInstrument, type TerminalInstrument } from "@/lib/terminal-data";
import type { ContractInfo, ContractsResponse } from "@/lib/market-types";
import { contractToInstrument, fetchContracts, getLastContract, setLastContract, syncContractPrefs } from "@/lib/market-client";

/** Days before expiry from which the roll hint is shown. */
export const ROLL_DAYS = 7;

const KIND_COLOR: Record<string, string> = {
  perpetual: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  spot: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  quarterly: "bg-green-600/15 text-green-700 dark:text-green-400",
  monthly: "bg-green-600/15 text-green-700 dark:text-green-400",
  weekly: "bg-green-600/15 text-green-700 dark:text-green-400",
};

export function ContractBadge({ c, current }: { c: Pick<ContractInfo, "kind" | "order" | "badge">; current?: boolean }) {
  const cls = c.kind === "perpetual" || c.kind === "spot" ? KIND_COLOR[c.kind] : c.order === 1 ? KIND_COLOR.quarterly : "bg-gray-200/70 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300";
  return <span className={`px-1.5 rounded text-[10px] leading-4 font-medium whitespace-nowrap ${cls} ${current ? "ring-1 ring-current" : ""}`}>{c.badge}</span>;
}

/**
 * Compact chip next to the symbol button: the exact contract of a futures underlying (current / next / further / perpetual;
 * crypto: spot / perpetual / dated). Hidden for instruments with fewer than two contracts. Also shows the roll hint when the
 * contract expires soon, with a one-click switch to the next one.
 */
export default function ContractPicker({
  instrument,
  onPick,
  btn,
}: {
  instrument: TerminalInstrument;
  onPick: (inst: TerminalInstrument) => void;
  btn: string;
}) {
  const { t, locale } = useT();
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const source = instrument.source === "bybit" ? "bybit" : instrument.source === "moex" ? "moex" : null;
  const ticker = instrument.dataTicker;

  useEffect(() => {
    setData(null);
    if (!source) return;
    let cancelled = false;
    void syncContractPrefs();
    void fetchContracts(source, ticker, locale).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [source, ticker, locale]);

  const all = data?.contracts ?? [];
  const isAuto = source === "moex" && data !== null && (ticker === data.auto || !all.some((c) => c.ticker === ticker));
  // what the chart is showing right now: the exact contract, or the front one for the auto ticker
  const shown = useMemo(() => all.find((c) => c.ticker === ticker) ?? (source === "moex" ? all.find((c) => c.order === 1) ?? all[0] : all[0]), [all, ticker, source]);
  const icon = useMemo(() => (data ? findInstrument(instrument.source, data.auto)?.emoji ?? instrument.emoji : instrument.emoji), [data, instrument.source, instrument.emoji]);

  if (!source || !data || all.length < 2) return null;

  const pick = (c: ContractInfo | null) => {
    setOpen(false);
    const base: TerminalInstrument = { ...instrument, emoji: icon };
    if (c === null) {
      // auto front month: the generic ticker (curated entry when there is one)
      const curated = findInstrument("moex", data.auto);
      onPick(curated ?? { ticker: data.auto, name: data.name, source: "moex", dataTicker: data.auto, emoji: icon, group: "future" });
      setLastContract(data.asset, null);
    } else {
      onPick(contractToInstrument(c, base, data.name));
      setLastContract(data.asset, c.ticker);
    }
  };

  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - 340 - 4)) });
    setOpen((o) => !o);
  };

  const last = getLastContract(data.asset);
  const dated = all.filter((c) => c.expiry && c.kind !== "perpetual");
  const next = shown && shown.expiry ? dated.find((c) => (c.expiry as string) > (shown.expiry as string)) : undefined;
  const roll = shown && shown.daysLeft !== null && shown.daysLeft <= ROLL_DAYS && next ? shown.daysLeft : null;
  const chipLabel = shown?.ticker ?? ticker;

  return (
    <>
      <button
        ref={ref}
        onClick={toggle}
        title={t("ct.pick")}
        aria-label={t("ct.pick")}
        aria-expanded={open}
        className={`${btn} gap-1.5 px-2 border border-gray-200 dark:border-gray-700`}
      >
        {isAuto && source === "moex" && <span className="hidden sm:inline text-[10px] font-normal text-gray-400">{t("ct.auto").split(" ")[0]}</span>}
        <span className="font-semibold text-[13px]">{chipLabel}</span>
        {shown && <span className="hidden md:inline"><ContractBadge c={shown} /></span>}
        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {roll !== null && next && (
        <button
          onClick={() => pick(next)}
          title={t("ct.roll.title")}
          className="h-7 px-2 inline-flex items-center gap-1.5 rounded-md shrink-0 text-[11px] font-medium cursor-pointer bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
        >
          <span>{roll === 0 ? t("ct.roll.today") : t("ct.roll.warn", { n: roll })}</span>
          <span className="underline decoration-dotted">{t("ct.roll.to", { ticker: next.ticker })}</span>
        </button>
      )}

      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label={t("ct.title")}
            className="fixed z-[56] py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl max-h-[calc(100vh-90px)] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: 340, maxWidth: "calc(100vw - 8px)" }}
          >
            {source === "moex" && (
              <button
                role="option"
                aria-selected={isAuto}
                onClick={() => pick(null)}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${isAuto ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold">{t("ct.auto")}</span>
                  <span className="block text-[10px] text-gray-400 truncate">{t("ct.autoHint")}</span>
                </span>
                {isAuto && <span className="text-xs">✓</span>}
              </button>
            )}
            {all.map((c) => {
              const cur = c.ticker === shown?.ticker && !isAuto;
              return (
                <button
                  key={c.ticker}
                  role="option"
                  aria-selected={cur}
                  onClick={() => pick(c)}
                  className={`w-full px-3 py-1.5 flex items-center gap-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${cur ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}
                >
                  <span className="w-[70px] shrink-0">
                    <ContractBadge c={c} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-semibold truncate">
                      {c.ticker}
                      {last === c.ticker && <span title={t("ct.last")} className="ml-1 text-amber-500">★</span>}
                    </span>
                    <span className="block text-[10px] text-gray-400 truncate">{c.kind === "spot" ? t("ct.spot") : c.shortname}</span>
                  </span>
                  <span className="text-right leading-tight shrink-0">
                    <span className="block text-[11px] tabular-nums text-gray-600 dark:text-gray-300">{c.expiry ?? t("ct.noExpiry")}</span>
                    {c.daysLeft !== null && (
                      <span className={`block text-[10px] tabular-nums ${c.daysLeft <= ROLL_DAYS ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>{t("ct.left", { n: c.daysLeft })}</span>
                    )}
                  </span>
                  {cur && <span className="text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
