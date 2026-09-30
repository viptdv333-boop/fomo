"use client";

import { useT } from "@/lib/i18n/client";
import MenuPopover from "./MenuPopover";
import { UI_ICONS } from "./icons";
import type { ChartType, TransformParams } from "@/lib/chart/types";
import type { ChartSettingsApi } from "./useChartSettings";

const WITH_SETTINGS: ChartType[] = ["baseline", "renko", "kagi", "linebreak", "range", "pnf"];

const field = "h-8 rounded border border-gray-300 dark:border-[#363a45] bg-white dark:bg-[#131722] px-2 text-[13px] outline-none focus:border-[#2962ff]";

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 min-h-9">
      <span className="text-[13px] text-gray-700 dark:text-gray-300">{label}</span>
      {children}
    </div>
  );
}

/** Gear next to the chart type: base level of the baseline chart, box / reversal settings of Renko, Kagi, P&F ... */
export default function ChartTypeSettings({ type, api, box, btn }: { type: ChartType; api: ChartSettingsApi; box: number; btn: string }) {
  const { t } = useT();
  if (!WITH_SETTINGS.includes(type)) return null;
  const s = api.settings;
  const tr = s.transform;
  const setTr = (patch: Partial<TransformParams>) => api.update((x) => ({ ...x, transform: { ...x.transform, ...patch } }));
  const num = (v: string, min: number, max: number, fallback: number) => {
    const n = parseFloat(v);
    return isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };

  return (
    <MenuPopover title={t("cs.type.settings")} className={`${btn} px-1.5`} width={260} trigger={<span className="scale-[0.8] inline-flex">{UI_ICONS.gear}</span>}>
      {() => (
        <div className="px-3 py-1.5">
          {type === "baseline" && (
            <>
              <Line label={t("cs.baselineLevel")}>
                <span className="text-xs tabular-nums text-gray-500">{Math.round(s.baselinePercent)}%</span>
              </Line>
              <input type="range" min={5} max={95} value={s.baselinePercent} onChange={(e) => api.update((x) => ({ ...x, baselinePercent: +e.target.value }))} className="w-full accent-[#2962ff]" />
              <p className="mt-1 text-[11px] text-gray-400">{t("cs.baselineHint")}</p>
            </>
          )}
          {type === "linebreak" && (
            <Line label={t("cs.tr.lines")}>
              <input type="number" min={2} max={8} value={tr.breakLines} onChange={(e) => setTr({ breakLines: Math.round(num(e.target.value, 2, 8, 3)) })} className={`${field} w-20 text-right`} />
            </Line>
          )}
          {(type === "renko" || type === "kagi" || type === "range" || type === "pnf") && (
            <>
              <Line label={type === "kagi" ? t("cs.tr.reversalSize") : type === "range" ? t("cs.tr.rangeSize") : t("cs.tr.boxSize")}>
                <select value={tr.method} onChange={(e) => setTr({ method: e.target.value as TransformParams["method"] })} className={`${field} cursor-pointer`}>
                  <option value="atr">ATR</option>
                  <option value="fixed">{t("cs.tr.fixed")}</option>
                  <option value="percent">{t("cs.tr.percent")}</option>
                </select>
              </Line>
              {tr.method === "atr" && (
                <Line label={t("cs.tr.atrPeriod")}>
                  <input type="number" min={1} max={200} value={tr.atrPeriod} onChange={(e) => setTr({ atrPeriod: Math.round(num(e.target.value, 1, 200, 14)) })} className={`${field} w-20 text-right`} />
                </Line>
              )}
              {tr.method === "fixed" && (
                <Line label={t("cs.tr.value")}>
                  <input type="number" min={0} step="any" value={tr.box} onChange={(e) => setTr({ box: num(e.target.value, 0, 1e12, 1) })} className={`${field} w-24 text-right`} />
                </Line>
              )}
              {tr.method === "percent" && (
                <Line label={t("cs.tr.percentValue")}>
                  <input type="number" min={0.01} max={50} step={0.1} value={tr.percent} onChange={(e) => setTr({ percent: num(e.target.value, 0.01, 50, 1) })} className={`${field} w-24 text-right`} />
                </Line>
              )}
              {type === "pnf" && (
                <Line label={t("cs.tr.reversal")}>
                  <input type="number" min={1} max={9} value={tr.reversal} onChange={(e) => setTr({ reversal: Math.round(num(e.target.value, 1, 9, 3)) })} className={`${field} w-20 text-right`} />
                </Line>
              )}
              {box > 0 && (
                <p className="mt-1 text-[11px] text-gray-400">
                  {t("cs.tr.current")}: {box >= 1 ? box.toFixed(2) : box.toPrecision(3)}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </MenuPopover>
  );
}
