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
          <div style={pos} className="fixed z-[56] w-[240px] rounded-[14px] bg-[var(--tv3-card)] shadow-[var(--tv3-shadow-pop)] p-3">
            <div className="text-xs font-semibold text-[var(--tv3-muted)] mb-1.5">{t("cs.gotoTitle")}</div>
            <input
              type="date"
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go();
                if (e.key === "Escape") setOpen(false);
              }}
              className="w-full h-9 rounded-[9px] border-0 bg-[var(--tv3-fill2)] px-2.5 text-sm text-[var(--tv3-text)] outline-none focus:ring-2 focus:ring-[var(--tv3-accent)]"
            />
            <button onClick={go} disabled={!val} className="mt-2 w-full h-9 rounded-[9px] bg-[var(--tv3-accent)] text-white text-sm font-semibold cursor-pointer hover:bg-[var(--tv3-accent-hover)] disabled:opacity-40 disabled:cursor-default">
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

  // design v3: grey pills (segmented ranges + tiny buttons), the active toggle is tinted green
  const btn = "h-[26px] px-2.5 rounded-[7px] text-xs font-semibold shrink-0 transition cursor-pointer text-[var(--tv3-text)] bg-[var(--tv3-fill2)] hover:brightness-95 dark:hover:brightness-110";
  const seg = "h-[22px] px-2 rounded-[7px] text-xs font-semibold shrink-0 transition cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-card)] hover:shadow-[0_1px_3px_rgba(0,0,0,.18)]";
  const on = "!bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)]";

  return (
    <div className="flex items-center gap-2 min-h-[38px] px-2.5 py-1.5 shrink-0 overflow-x-auto whitespace-nowrap border-t-[0.5px] border-[var(--tv3-hair)] bg-[var(--tv3-card)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center rounded-[9px] bg-[var(--tv3-fill2)] p-0.5 shrink-0">
        {RANGES.map((r) => (
          <button key={r} onClick={() => onRange(r)} disabled={rangeBusy} title={t("shell.range.tip")} className={`${seg} disabled:opacity-50 disabled:cursor-wait`}>
            {t(`shell.range.${r}`)}
          </button>
        ))}
      </div>
      {rangeBusy && <span className="ml-1 inline-block w-3 h-3 border-2 border-[var(--tv3-fill2)] border-t-[var(--tv3-accent)] rounded-full animate-spin shrink-0" title={t("shell.loadingHistory")} />}
      {onGoToDate && (
        <>
          <GoToDate btn={`${btn} !rounded-lg !px-2.5`} onGo={onGoToDate} signal={gotoSignal} />
        </>
      )}

      <span className="flex-1 min-w-2" />

      {onTz && tz !== undefined ? (
        <MenuPopover
          title={t("cs.timezone")}
          className="h-[26px] px-2 rounded-[7px] text-xs tabular-nums shrink-0 cursor-pointer text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)]"
          width={250}
          align="right"
          up
          trigger={
            <span className="inline-flex items-center gap-1.5">
              {clock.time}
              {clock.zone && <span>{clock.zone}</span>}
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
                  className={`w-full h-8 pl-3 pr-3 flex items-center gap-2 text-left cursor-pointer hover:bg-[var(--tv3-fill)] ${
                    tz === id ? "text-[var(--tv3-accent)] font-medium" : "text-[var(--tv3-text)]"
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
        <span className="text-xs tabular-nums text-[var(--tv3-text2)] shrink-0 px-2" title={source === "moex" ? t("shell.tz.moscow") : t("shell.tz.local")}>
          {clock.time}
          {clock.zone && <span className="ml-1.5">{clock.zone}</span>}
        </span>
      )}
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
