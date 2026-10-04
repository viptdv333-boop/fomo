"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { formatValue, surprise, type Surprise } from "@/lib/calendar/surprise";
import type { CalEvent } from "@/lib/calendar/types";

export const IMPACT_COLOR: Record<number, string> = { 3: "#ef4444", 2: "#f59e0b", 1: "#9ca3af" };

/** Three dots, `level` of them filled in the importance colour. */
export function ImpactDots({ level, size = 6 }: { level: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[2px]" aria-label={`impact ${level}`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= level ? "" : "bg-gray-300 dark:bg-gray-600"} style={{ width: size, height: size, borderRadius: "50%", background: i <= level ? IMPACT_COLOR[level] : undefined }} />
      ))}
    </span>
  );
}

export const SURPRISE_CLASS: Record<Surprise, string> = {
  better: "text-green-600 dark:text-green-400",
  worse: "text-red-600 dark:text-red-400",
  inline: "text-gray-900 dark:text-gray-100",
};

/** The actual figure, coloured by the surprise against the forecast. */
export function ActualValue({ ev, locale }: { ev: CalEvent; locale: string }) {
  const s = surprise(ev);
  const text = formatValue(ev.actual, ev.unit, locale);
  if (!text) return <span className="text-gray-400">—</span>;
  return <span className={`font-semibold ${s ? SURPRISE_CLASS[s] : "text-gray-900 dark:text-gray-100"}`}>{text}</span>;
}

/** Re-renders every `ms` while mounted (clock for "now" markers and countdowns). */
export function useNow(ms: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}

/** True on a phone-width viewport (< 640 px); false on the server and before mount. */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return narrow;
}

/** "Source: TradingView · Moscow Exchange" and the note for sources without actual values. */
export function SourceFooter({ source, moex, className = "" }: { source: string; moex: boolean; className?: string }) {
  const { t } = useT();
  if (source === "none" && !moex) return null;
  const parts: string[] = [];
  if (source !== "none") parts.push(t(`ec.src.${source}`));
  if (moex) parts.push(t("ec.moex"));
  return (
    <div className={`px-3 py-1 text-[10.5px] leading-snug text-gray-400 dark:text-gray-500 ${className}`}>
      <span>{t("ec.src.label")} {parts.join(" · ")}</span>
      {source === "forexfactory" && <span className="block text-amber-600/90 dark:text-amber-400/80">{t("ec.src.noactual")}</span>}
    </div>
  );
}

/** Badge of the Moscow Exchange layer: events built from the exchange itself get their own colour. */
export function MoexMark({ title }: { title?: string }) {
  return (
    <span title={title} className="inline-flex h-[13px] shrink-0 items-center gap-[3px] rounded bg-sky-500/15 px-1 text-[9px] font-bold uppercase leading-none text-sky-600 dark:text-sky-300">
      <span className="inline-block h-[5px] w-[5px] rotate-45 bg-sky-500" />
      MOEX
    </span>
  );
}
