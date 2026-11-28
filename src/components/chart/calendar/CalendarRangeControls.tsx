"use client";
import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useCalPrefs } from "@/lib/calendar/prefs";
import { addDays, type DateRange, type RangePreset } from "@/lib/calendar/time";
import FloatingPanel, { anchorOf, type Anchor } from "./FloatingPanel";
import { EC_ICONS } from "../icons-econ";

const TABS: { id: Exclude<RangePreset, "custom">; key: string }[] = [
  { id: "yesterday", key: "ec.tab.yesterday" },
  { id: "today", key: "ec.tab.today" },
  { id: "tomorrow", key: "ec.tab.tomorrow" },
  { id: "week", key: "ec.tab.week" },
  { id: "d30", key: "ec.tab.d30" },
  { id: "nextweek", key: "ec.tab.nextweek" },
];

/** One period picker shared by calendar squares, the event list and the side panel. */
export default function CalendarRangeControls({ range: rf, wide = false, embedded = false }: { range: DateRange; wide?: boolean; embedded?: boolean }) {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  const [rangeAnchor, setRangeAnchor] = useState<Anchor | null>(null);
  const rangeTabs = (
    <div className={`flex items-center ${wide ? "mx-3 my-2 w-fit overflow-x-auto rounded-[9px] bg-[var(--tv3-fill2)] p-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : `flex-wrap gap-y-0.5 rounded-[9px] bg-[var(--tv3-fill2)] p-0.5 ${embedded ? "mx-3 my-2" : ""}`}`} role="tablist" aria-label={t("ec.range")}>
      {TABS.map((tb) => {
        const on = prefs.preset === tb.id;
        return (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => update((p) => ({ ...p, preset: tb.id }))}
            className={`h-6 shrink-0 whitespace-nowrap rounded-[7px] px-1.5 text-[12px] font-semibold cursor-pointer transition ${wide ? "px-2.5" : "flex-auto"} ${on ? "bg-[var(--tv3-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" : "text-[var(--tv3-text2)]"}`}
          >
            {t(tb.key)}
          </button>
        );
      })}
      <button
        type="button"
        title={t("ec.tab.custom")}
        aria-label={t("ec.tab.custom")}
        aria-selected={prefs.preset === "custom"}
        onClick={(e) => setRangeAnchor(anchorOf(e.currentTarget))}
        className={`inline-flex h-6 shrink-0 items-center gap-1 rounded-[7px] px-1.5 text-[12px] font-semibold cursor-pointer transition ${prefs.preset === "custom" ? "bg-[var(--tv3-accent)] text-white shadow-[0_1px_3px_rgba(0,0,0,.25)]" : "text-[var(--tv3-text2)]"}`}
      >
        {EC_ICONS.calendarRange}
        {prefs.preset === "custom" && <span className="tabular-nums">{rf.from.slice(5)}{rf.to !== rf.from ? `…${rf.to.slice(5)}` : ""}</span>}
      </button>
    </div>
  );

  const rangePopover = rangeAnchor && (
    <FloatingPanel anchor={rangeAnchor} onClose={() => setRangeAnchor(null)} width={260} label={t("ec.tab.custom")}>
      <div className="space-y-2 p-3 text-[13px]">
        {(["from", "to"] as const).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3">
            <span className="text-[var(--tv3-muted)]">{t(k === "from" ? "ec.from" : "ec.to")}</span>
            <input
              type="date"
              value={rf[k]}
              onChange={(e) => {
                const v = e.target.value;
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return;
                let from = k === "from" ? v : rf.from;
                let to = k === "to" ? v : rf.to;
                if (to < from) [from, to] = [to, from];
                if (to > addDays(from, 30)) to = addDays(from, 30);
                update((p) => ({ ...p, preset: "custom", custom: { from, to } }));
              }}
              className="h-8 rounded-[9px] bg-[var(--tv3-fill)] px-2 text-[13px] text-[var(--tv3-text)] outline-none dark:[color-scheme:dark]"
            />
          </label>
        ))}
        <p className="text-[11px] text-[var(--tv3-muted)]">{t("ec.maxRange")}</p>
      </div>
    </FloatingPanel>
  );

  return <>{rangeTabs}{rangePopover}</>;
}
