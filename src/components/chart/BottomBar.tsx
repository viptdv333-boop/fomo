"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";

export type RangeId = "1d" | "5d" | "1m" | "3m" | "6m" | "ytd" | "1y" | "5y" | "all";

export const RANGES: RangeId[] = ["1d", "5d", "1m", "3m", "6m", "ytd", "1y", "5y", "all"];

interface Props {
  source: string;
  autoScale: boolean;
  logScale: boolean;
  onAuto: () => void;
  onLog: () => void;
  onRange: (r: RangeId) => void;
  rangeBusy: boolean;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function utcLabel(offsetMin: number) {
  const sign = offsetMin >= 0 ? "+" : "-";
  const a = Math.abs(offsetMin);
  return `UTC${sign}${Math.floor(a / 60)}${a % 60 ? `:${pad(a % 60)}` : ""}`;
}

/** Wall clock of the exchange, ticking every second. */
function useExchangeClock(source: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return { time: "", zone: "" };
  const offsetMin = source === "moex" ? 180 : -new Date(now).getTimezoneOffset();
  const d = new Date(now + offsetMin * 60_000);
  return { time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`, zone: utcLabel(offsetMin) };
}

export default function BottomBar({ source, autoScale, logScale, onAuto, onLog, onRange, rangeBusy }: Props) {
  const { t } = useT();
  const clock = useExchangeClock(source);

  const btn = "h-6 px-2 rounded text-[11px] font-medium shrink-0 transition cursor-pointer text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800";
  const on = "bg-green-600/10 text-green-700 dark:text-green-400";

  return (
    <div className="flex items-center gap-0.5 h-8 px-2 shrink-0 overflow-x-auto whitespace-nowrap border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {RANGES.map((r) => (
        <button key={r} onClick={() => onRange(r)} disabled={rangeBusy} title={t("shell.range.tip")} className={`${btn} disabled:opacity-50 disabled:cursor-wait`}>
          {t(`shell.range.${r}`)}
        </button>
      ))}
      {rangeBusy && <span className="ml-1 inline-block w-3 h-3 border-2 border-gray-300 border-t-green-600 rounded-full animate-spin shrink-0" title={t("shell.loadingHistory")} />}

      <span className="flex-1 min-w-2" />

      <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 shrink-0 px-2" title={source === "moex" ? t("shell.tz.moscow") : t("shell.tz.local")}>
        {clock.time}
        {clock.zone && <span className="ml-1.5 text-gray-400 dark:text-gray-500">{clock.zone}</span>}
      </span>
      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
      <button onClick={onLog} title={t("chart.log")} aria-pressed={logScale} className={`${btn} ${logScale ? on : ""}`}>
        {t("chart.logShort")}
      </button>
      <button onClick={onAuto} title={t("shell.autoTip")} aria-pressed={autoScale} className={`${btn} ${autoScale ? on : ""}`}>
        {t("chart.auto")}
      </button>
    </div>
  );
}
