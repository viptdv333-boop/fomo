"use client";

import { useEffect, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import MenuPopover from "./MenuPopover";
import { CS_ICONS } from "./icons-cs";
import { tzLabel } from "./tz";
import { TIME_ZONES } from "@/lib/chart/settings";
import { zoneOffsetMs } from "@/lib/chart/format";
import type { ScaleMode } from "@/lib/chart/types";

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
  /* optional: time zone, go to date and the % scale toggle */
  scaleMode?: ScaleMode;
  onScaleMode?: (m: ScaleMode) => void;
  tz?: string;
  /** IANA zone the tz setting resolves to (for the clock). */
  zone?: string;
  onTz?: (tz: string) => void;
  onGoToDate?: (isoDate: string) => void;
  /** Increment to open the go-to-date popover from a hotkey. */
  gotoSignal?: number;
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
function useExchangeClock(source: string, zone?: string) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return { time: "", zone: "" };
  const offsetMin = zone ? Math.round(zoneOffsetMs(zone, now) / 60_000) : source === "moex" ? 180 : -new Date(now).getTimezoneOffset();
  const d = new Date(now + offsetMin * 60_000);
  return { time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`, zone: utcLabel(offsetMin) };
}

function GoToDate({ btn, onGo, signal }: { btn: string; onGo: (d: string) => void; signal?: number }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [pos, setPos] = useState({ bottom: 40, left: 8 });
  const ref = useRef<HTMLButtonElement>(null);
  const openIt = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ bottom: window.innerHeight - r.top + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - 240)) });
    setOpen(true);
  };
  useEffect(() => {
    if (signal) openIt();
  }, [signal]);
  const go = () => {
    if (!val) return;
    onGo(val);
    setOpen(false);
  };
  return (
    <span className="inline-flex">
      <button ref={ref} onClick={() => (open ? setOpen(false) : openIt())} title={t("cs.goto")} aria-label={t("cs.goto")} aria-expanded={open} className={`${btn} inline-flex items-center gap-1`}>
        <span className="scale-[0.72] inline-flex -mx-1">{CS_ICONS.calendar}</span>
        <span className="hidden sm:inline">{t("cs.gotoShort")}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={() => setOpen(false)} />
          <div style={pos} className="fixed z-[56] w-[230px] rounded-lg bg-white dark:bg-[#1e222d] border border-gray-200 dark:border-[#2a2e39] shadow-xl p-3">
            <div className="text-[12px] text-gray-500 dark:text-gray-400 mb-1.5">{t("cs.gotoTitle")}</div>
            <input
              type="date"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go();
                if (e.key === "Escape") setOpen(false);
              }}
              className="w-full h-8 rounded border border-gray-300 dark:border-[#363a45] bg-white dark:bg-[#131722] px-2 text-[13px] text-gray-900 dark:text-gray-100 outline-none focus:border-[#2962ff]"
            />
            <button onClick={go} disabled={!val} className="mt-2 w-full h-8 rounded bg-[#2962ff] text-white text-[13px] cursor-pointer hover:bg-[#1e53e5] disabled:opacity-40 disabled:cursor-default">
              {t("cs.gotoGo")}
            </button>
          </div>
        </>
      )}
    </span>
  );
}

export default function BottomBar({ source, autoScale, logScale, onAuto, onLog, onRange, rangeBusy, scaleMode, onScaleMode, tz, zone, onTz, onGoToDate, gotoSignal }: Props) {
  const { t, locale } = useT();
  const clock = useExchangeClock(source, zone);

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
      {onGoToDate && (
        <>
          <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
          <GoToDate btn={btn} onGo={onGoToDate} signal={gotoSignal} />
        </>
      )}

      <span className="flex-1 min-w-2" />

      {onTz && tz !== undefined ? (
        <MenuPopover
          title={t("cs.timezone")}
          className="h-6 px-2 rounded text-[11px] tabular-nums shrink-0 cursor-pointer text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
          width={250}
          align="right"
          up
          trigger={
            <span className="inline-flex items-center gap-1.5">
              {clock.time}
              {clock.zone && <span className="text-gray-400 dark:text-gray-500">{clock.zone}</span>}
            </span>
          }
        >
          {(close) => (
            <div className="text-[13px]">
              {["auto", "exchange", "local", ...TIME_ZONES.map((z) => z.id)].map((id) => (
                <button
                  key={id}
                  onClick={() => {
                    onTz(id);
                    close();
                  }}
                  className={`w-full h-8 pl-3 pr-3 flex items-center gap-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-[#2a2e39] ${
                    tz === id ? "text-[#2962ff] dark:text-[#6f95ff] font-medium" : "text-gray-800 dark:text-gray-200"
                  }`}
                >
                  <span className="w-4">{tz === id ? CS_ICONS.check : null}</span>
                  {tzLabel(id, t, locale)}
                </button>
              ))}
            </div>
          )}
        </MenuPopover>
      ) : (
        <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400 shrink-0 px-2" title={source === "moex" ? t("shell.tz.moscow") : t("shell.tz.local")}>
          {clock.time}
          {clock.zone && <span className="ml-1.5 text-gray-400 dark:text-gray-500">{clock.zone}</span>}
        </span>
      )}
      <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />
      {onScaleMode && (
        <button
          onClick={() => onScaleMode(scaleMode === "percent" ? "regular" : "percent")}
          title={t("cs.mode.percent")}
          aria-pressed={scaleMode === "percent"}
          className={`${btn} ${scaleMode === "percent" ? on : ""}`}
        >
          %
        </button>
      )}
      <button onClick={onLog} title={t("chart.log")} aria-pressed={logScale} className={`${btn} ${logScale ? on : ""}`}>
        {t("chart.logShort")}
      </button>
      <button onClick={onAuto} title={t("shell.autoTip")} aria-pressed={autoScale} className={`${btn} ${autoScale ? on : ""}`}>
        {t("chart.auto")}
      </button>
    </div>
  );
}
