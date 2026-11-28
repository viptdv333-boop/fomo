"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PopupPortal } from "./ModalPortal";
import { useT } from "@/lib/i18n/client";
import { findInstrument, type TerminalInstrument } from "@/lib/terminal-data";
import type { ContractInfo, ContractsResponse } from "@/lib/market-types";
import { contractToInstrument, fetchContracts, getLastContract, setLastContract, syncContractPrefs } from "@/lib/market-client";
import { futuresIcon } from "@/lib/instrument-icons";
import { continuousSymbol } from "@/lib/continuous-futures";
import { instrumentFamily } from "@/lib/instrument-family";
import AssetMarketPicker from "./AssetMarketPicker";

/** Days before expiry from which the roll hint is shown. */
export const ROLL_DAYS = 7;

const KIND_COLOR: Record<string, string> = {
  continuous: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  perpetual: "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  spot: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  quarterly: "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]",
  monthly: "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]",
  weekly: "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]",
};

export function ContractBadge({ c, current }: { c: Pick<ContractInfo, "kind" | "order" | "badge">; current?: boolean }) {
  if (c.kind === "continuous") return null;
  if (c.kind !== "perpetual" && c.kind !== "spot" && c.order <= 0) return null;
  const cls = c.kind === "perpetual" || c.kind === "spot" ? KIND_COLOR[c.kind] : c.order === 1 ? KIND_COLOR.quarterly : "bg-[var(--tv3-fill2)] text-[var(--tv3-text2)]";
  return <span className={`px-1.5 rounded text-[10px] leading-4 font-medium whitespace-nowrap ${cls} ${current ? "ring-1 ring-current" : ""}`}>{c.badge}</span>;
}

/**
 * Compact chip next to the symbol button: the exact contract of a futures underlying (current / next / further / perpetual;
 * crypto: spot / perpetual / dated). Hidden for instruments with fewer than two contracts. Also shows the roll hint when the
 * contract expires soon, with a one-click switch to the next one.
 */
function LegacyContractPicker({
  instrument,
  onPick,
  btn,
  onShown,
  marketLabel = false,
}: {
  instrument: TerminalInstrument;
  onPick: (inst: TerminalInstrument) => void;
  btn: string;
  /** The exact contract on the chart (MXZ6 ...), for the symbol pill of the macOS look. */
  onShown?: (ticker: string | null) => void;
  /** Show spot / perpetual / futures beside the symbol. */
  marketLabel?: boolean;
}) {
  const { t, locale } = useT();
  const [data, setData] = useState<ContractsResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const source = instrument.source === "bybit" ? "bybit" : instrument.source === "moex" ? "moex" : null;
  const ticker = instrument.dataTicker;
  const chain = source === "moex" ? continuousSymbol(ticker) : null;
  const lookupTicker = chain?.asset ?? ticker;

  useEffect(() => {
    setData(null);
    if (!source) return;
    let cancelled = false;
    void syncContractPrefs();
    void fetchContracts(source, lookupTicker, locale).then((r) => {
      if (!cancelled) setData(r);
    });
    return () => {
      cancelled = true;
    };
  }, [source, lookupTicker, locale]);

  const all = data?.contracts ?? [];
  const isAuto = source === "moex" && data !== null && !chain && (ticker === data.auto || !all.some((c) => c.ticker === ticker));
  // what the chart is showing right now: the exact contract, or the front one for the auto ticker
  const shown = useMemo(() => all.find((c) => c.ticker === ticker) ?? (source === "moex" ? all.find((c) => c.order === 1) ?? all[0] : all[0]), [all, ticker, source]);
  const icon = useMemo(() => {
    // RUNTIME can contain an earlier ad-hoc entry with an empty icon. Treat that as missing and
    // keep the current contract's artwork instead of erasing it on the next contract change.
    const autoIcon = data ? findInstrument(instrument.source, data.auto)?.emoji : "";
    return autoIcon || instrument.emoji || (source === "moex" && data ? futuresIcon(data.asset) : "");
  }, [data, instrument.source, instrument.emoji, source]);

  const shownTicker = !chain && source && data && all.length >= 2 ? (shown?.ticker ?? null) : null;
  useEffect(() => {
    onShown?.(shownTicker);
  }, [onShown, shownTicker]);

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
  const marketLabelText = shown?.kind === "spot" ? t("ct.spot") : shown?.kind === "perpetual" ? t("ct.perpetual") : t("ct.futures");
  const marketTone = shown?.kind === "spot"
    ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
    : shown?.kind === "perpetual"
      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
      : "bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]";

  return (
    <>
      <button
        ref={ref}
        onClick={toggle}
        title={marketLabel ? `${t("ct.pick")}: ${marketLabelText}` : t("ct.pick")}
        aria-label={t("ct.pick")}
        aria-expanded={open}
        className={`${btn} gap-1.5 px-2 border border-[var(--tv3-hair)] !rounded-[9px]`}
      >
        {marketLabel ? (
          <span className={`tb-ct-label px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${marketTone}`}>{marketLabelText}</span>
        ) : (
          <>
            {isAuto && source === "moex" && <span className="hidden sm:inline text-[10px] font-normal text-[var(--tv3-muted)]">{t("ct.auto").split(" ")[0]}</span>}
            <span className="font-semibold text-[13px]">{chipLabel}</span>
            {shown && <span className="hidden md:inline"><ContractBadge c={shown} /></span>}
          </>
        )}
        <svg className="w-3 h-3 text-[var(--tv3-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {roll !== null && next && (
        <button
          onClick={() => pick(next)}
          title={t("ct.roll.title")}
          className="tb-roll h-7 px-2 inline-flex items-center gap-1.5 rounded-md shrink-0 text-[11px] font-medium cursor-pointer bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25"
        >
          <span>{roll === 0 ? t("ct.roll.today") : t("ct.roll.warn", { n: roll })}</span>
          <span className="underline decoration-dotted">{t("ct.roll.to", { ticker: next.ticker })}</span>
        </button>
      )}

      {open && (
        <PopupPortal>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label={t("ct.title")}
            className="fixed z-[56] py-1.5 rounded-2xl tv3-pop shadow-[var(--tv3-shadow-pop)] max-h-[calc(100vh-90px)] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: 340, maxWidth: "calc(100vw - 8px)" }}
          >
            {source === "moex" && (
              <button
                role="option"
                aria-selected={isAuto}
                onClick={() => pick(null)}
                className={`w-full px-3.5 py-2 flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--tv3-fill3)] ${isAuto ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-text)]"}`}
              >
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold">{t("ct.auto")}</span>
                  <span className="block text-[10px] text-[var(--tv3-muted)] truncate">{t("ct.autoHint")}</span>
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
                  className={`w-full px-3.5 py-2 flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--tv3-fill3)] ${cur ? "text-[var(--tv3-accent)]" : "text-[var(--tv3-text)]"}`}
                >
                  <span className="w-[70px] shrink-0">
                    <ContractBadge c={c} />
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block text-[13px] font-semibold truncate">
                      {c.ticker}
                      {last === c.ticker && <span title={t("ct.last")} className="ml-1 text-amber-500">★</span>}
                    </span>
                    <span className="block text-[10px] text-[var(--tv3-muted)] truncate">{c.kind === "spot" ? t("ct.spot") : c.shortname}</span>
                  </span>
                  <span className="text-right leading-tight shrink-0">
                    <span className="block text-[11px] tabular-nums text-[var(--tv3-text2)]">{c.expiry ?? t("ct.noExpiry")}</span>
                    {c.daysLeft !== null && (
                      <span className={`block text-[10px] tabular-nums ${c.daysLeft <= ROLL_DAYS ? "text-amber-600 dark:text-amber-400" : "text-[var(--tv3-muted)]"}`}>{t("ct.left", { n: c.daysLeft })}</span>
                    )}
                  </span>
                  {cur && <span className="text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        </PopupPortal>
      )}
    </>
  );
}

/** Same underlying in the first pill, venue and spot/futures in the adjacent picker. */
export default function ContractPicker(props: Parameters<typeof LegacyContractPicker>[0]) {
  const family = instrumentFamily(props.instrument);
  useEffect(() => { if (family) props.onShown?.(null); }, [family?.asset, props.onShown]);
  return family ? <AssetMarketPicker instrument={props.instrument} onPick={props.onPick} btn={props.btn} /> : <LegacyContractPicker {...props} />;
}
