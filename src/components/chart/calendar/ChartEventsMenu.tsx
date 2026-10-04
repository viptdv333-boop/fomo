"use client";

import { useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { useCalPrefs } from "@/lib/calendar/prefs";
import { EC_ICONS } from "../icons-econ";
import FloatingPanel, { anchorOf, type Anchor } from "./FloatingPanel";
import { ImpactDots } from "./parts";

/** Button + small menu that switches the economic events on the chart on/off and picks their importance. */
export default function ChartEventsButton({ className, onClassName = "", label = false }: { className: string; onClassName?: string; label?: boolean }) {
  const { t } = useT();
  const [prefs, update] = useCalPrefs();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const ref = useRef<HTMLButtonElement>(null);
  const on = prefs.chart.on;

  const toggleImpact = (lv: number) =>
    update((p) => {
      const has = p.chart.impacts.includes(lv);
      const next = has ? p.chart.impacts.filter((x) => x !== lv) : [...p.chart.impacts, lv];
      return next.length ? { ...p, chart: { ...p.chart, impacts: next } } : p;
    });

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setAnchor(anchor ? null : anchorOf(ref.current!))}
        title={t("ec.chart.title")}
        aria-label={t("ec.chart.title")}
        aria-pressed={on}
        className={`${className} ${on ? onClassName : ""}`}
      >
        {EC_ICONS.onChart}
        {label && <span className="hidden lg:inline">{t("ec.chart.short")}</span>}
      </button>
      {anchor && (
        <FloatingPanel anchor={anchor} onClose={() => setAnchor(null)} width={260} label={t("ec.chart.title")}>
          <div className="p-3 text-[13px]">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input type="checkbox" className="accent-green-600" checked={on} onChange={(e) => update((p) => ({ ...p, chart: { ...p.chart, on: e.target.checked } }))} />
              <span className="font-medium">{t("ec.chart.show")}</span>
            </label>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-gray-400">{t("ec.chart.impact")}</div>
            <div className="mt-1 flex flex-col">
              {[3, 2, 1].map((lv) => (
                <label key={lv} className="flex h-8 cursor-pointer items-center gap-2.5 rounded px-1 hover:bg-gray-100 dark:hover:bg-[#2a2e39]">
                  <input type="checkbox" className="accent-green-600" checked={prefs.chart.impacts.includes(lv)} onChange={() => toggleImpact(lv)} />
                  <ImpactDots level={lv} />
                  <span>{t(`ec.impact.${lv}`)}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-gray-400">
              {prefs.countries.length === 0 ? t("ec.chart.countriesAll") : t("ec.chart.countriesN", { n: prefs.countries.length })}
            </p>
          </div>
        </FloatingPanel>
      )}
    </>
  );
}
