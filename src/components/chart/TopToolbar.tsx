"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { ChartType } from "@/lib/chart/types";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import type { ReplayApi } from "./ReplayControls";
import { InstIcon } from "./RightPanel";
import { CHART_TYPE_ICONS, UI_ICONS } from "./icons";
import { CHART_TYPE_ICONS_EXTRA, CS_ICONS } from "./icons-cs";
import IntervalControl from "./IntervalControl";
import ContractPicker from "./ContractPicker";
import ChartTypeSettings from "./ChartTypeSettings";
import TemplatesMenu from "./TemplatesMenu";
import ChartEventsButton from "./calendar/ChartEventsMenu";
import type { ChartSettingsApi } from "./useChartSettings";
import type { ChartLayoutData, ChartTemplateData } from "@/lib/chart/templates";
import { exchangeLabel, type TerminalInstrument } from "@/lib/terminal-data";

export const INTERVALS: { id: string; key: string }[] = [
  { id: "1", key: "inst.period.1m" },
  { id: "5", key: "inst.period.5m" },
  { id: "15", key: "inst.period.15m" },
  { id: "60", key: "inst.period.1h" },
  { id: "240", key: "inst.period.4h" },
  { id: "D", key: "inst.period.D" },
  { id: "W", key: "inst.period.W" },
  { id: "M", key: "inst.period.M" },
];

export const CHART_TYPES: { id: ChartType; key: string }[] = [
  { id: "candles", key: "chart.type.candles" },
  { id: "hollow", key: "chart.type.hollow" },
  { id: "bars", key: "chart.type.bars" },
  { id: "line", key: "chart.type.line" },
  { id: "area", key: "chart.type.area" },
  { id: "heikin", key: "chart.type.heikin" },
  { id: "columns", key: "chart.type.columns" },
  { id: "highlow", key: "chart.type.highlow" },
  { id: "linemarkers", key: "chart.type.linemarkers" },
  { id: "step", key: "chart.type.step" },
  { id: "baseline", key: "chart.type.baseline" },
  { id: "volcandles", key: "chart.type.volcandles" },
  { id: "renko", key: "chart.type.renko" },
  { id: "kagi", key: "chart.type.kagi" },
  { id: "linebreak", key: "chart.type.linebreak" },
  { id: "range", key: "chart.type.range" },
  { id: "pnf", key: "chart.type.pnf" },
  { id: "footprint", key: "chart.type.footprint" },
];

export type ToggleKey = "showVolume" | "showGrid" | "showWatermark";

interface Props {
  instrument: TerminalInstrument;
  interval: string;
  onInterval: (id: string) => void;
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  onOpenSearch: () => void;
  /** Switches to another instrument (exact contract chosen in the contract chip). Without it the chip is not shown. */
  onPickInstrument?: (inst: TerminalInstrument) => void;
  onOpenIndicators: () => void;
  indicatorCount: number;
  onOpenAlerts?: () => void;
  alertCount?: number;
  replay: ReplayApi;
  drawings: DrawingsControllerLike;
  toggles: Record<ToggleKey, boolean>;
  onToggle: (k: ToggleKey, v: boolean) => void;
  onResetView: () => void;
  onScreenshot: () => void;
  onFullscreen: () => void;
  fullscreen: boolean;
  onToggleTools: () => void;
  toolsOpen: boolean;
  onTogglePanel: () => void;
  panelOpen: boolean;
  /* chart settings, intervals, compare, layouts (all optional: the toolbar works without them) */
  favIntervals?: string[];
  onFavIntervals?: (list: string[]) => void;
  onOpenSettings?: () => void;
  onOpenCompare?: () => void;
  compareCount?: number;
  settingsApi?: ChartSettingsApi;
  transformBox?: number;
  templates?: {
    getTemplate: (withDrawings: boolean) => ChartTemplateData;
    applyTemplate: (d: ChartTemplateData) => void;
    getLayout: () => ChartLayoutData;
    applyLayout: (d: ChartLayoutData) => void;
  };
  onScreenshotCopy?: () => void;
  onOpenShortcuts?: () => void;
  /** Extra buttons (the multi-chart layout picker). */
  extra?: ReactNode;
}

/* icons live in ./icons */
const I = UI_ICONS;
const typeIcon = { ...CHART_TYPE_ICONS, ...CHART_TYPE_ICONS_EXTRA } as Record<ChartType, ReactNode>;

/* ───────────── dropdown ───────────── */

function Menu({
  title,
  trigger,
  children,
  width = 200,
  className = "",
}: {
  title: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, window.innerWidth - width - 4)) });
    setOpen((o) => !o);
  };
  const close = () => setOpen(false);
  return (
    <>
      <button ref={ref} onClick={toggle} title={title} aria-label={title} aria-expanded={open} className={className}>
        {trigger}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[55]" onClick={close} />
          <div
            className="fixed z-[56] py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl max-h-[calc(100vh-70px)] overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width }}
          >
            {children(close)}
          </div>
        </>
      )}
    </>
  );
}

/* ───────────── toolbar ───────────── */

export default function TopToolbar(p: Props) {
  const { t } = useT();
  const [, setV] = useState(0);
  useEffect(() => p.drawings.subscribe(() => setV((v) => v + 1)), [p.drawings]);

  const btn =
    "h-9 min-w-9 px-2 inline-flex items-center justify-center gap-1.5 rounded-md text-[13px] font-medium shrink-0 transition cursor-pointer text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent";
  const btnOn = "bg-green-600/10 text-green-700 dark:text-green-400 hover:bg-green-600/15 dark:hover:bg-green-600/15";
  const sep = <span className="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />;

  const replayOn = p.replay.mode !== "off";
  const onReplay = () => {
    if (p.replay.mode === "off") p.replay.start();
    else if (p.replay.mode === "pick") p.replay.cancelPick();
    else p.replay.exit(true);
  };

  const currentType = CHART_TYPES.find((c) => c.id === p.chartType) ?? CHART_TYPES[0];

  return (
    <div className="flex items-center gap-0.5 h-12 px-2 shrink-0 overflow-x-auto border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button onClick={p.onToggleTools} title={t("shell.drawTools")} aria-pressed={p.toolsOpen} className={`${btn} md:hidden ${p.toolsOpen ? btnOn : ""}`}>
        {I.tools}
      </button>

      <button onClick={p.onOpenSearch} title={t("shell.symbol.searchTitle")} className={`${btn} gap-2 pr-3`}>
        <InstIcon inst={p.instrument} size={22} />
        <span className="font-bold text-sm">{p.instrument.ticker}</span>
        <span className="hidden xl:inline text-[11px] font-normal text-gray-400 max-w-[110px] truncate">{exchangeLabel(p.instrument.source)}</span>
        <span className="text-gray-400">{I.search}</span>
      </button>
      {p.onPickInstrument && <ContractPicker instrument={p.instrument} onPick={p.onPickInstrument} btn={btn} />}
      {sep}

      {p.favIntervals && p.onFavIntervals ? (
        <IntervalControl interval={p.interval} onInterval={p.onInterval} favorites={p.favIntervals} onFavorites={p.onFavIntervals} btn={btn} btnOn={btnOn} />
      ) : (
        INTERVALS.map((i) => (
          <button key={i.id} onClick={() => p.onInterval(i.id)} aria-pressed={p.interval === i.id} className={`${btn} px-2.5 ${p.interval === i.id ? btnOn : ""}`}>
            {t(i.key)}
          </button>
        ))
      )}
      {sep}

      <Menu title={t("shell.chartType")} className={`${btn}`} width={220} trigger={<>{typeIcon[currentType.id]}{I.chevron}</>}>
        {(close) =>
          CHART_TYPES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                p.onChartType(c.id);
                close();
              }}
              className={`w-full h-9 px-3 flex items-center gap-2.5 text-[13px] text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                p.chartType === c.id ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-800 dark:text-gray-200"
              }`}
            >
              {typeIcon[c.id]}
              {t(c.key)}
            </button>
          ))
        }
      </Menu>
      {p.settingsApi && <ChartTypeSettings type={p.chartType} api={p.settingsApi} box={p.transformBox ?? 0} btn={btn} source={p.instrument.source} />}
      {sep}

      {p.onOpenCompare && (
        <button onClick={p.onOpenCompare} title={t("cs.compare")} className={btn}>
          {CS_ICONS.compare}
          <span className="hidden xl:inline">{t("cs.compareShort")}</span>
          {(p.compareCount ?? 0) > 0 && <span className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p.compareCount}</span>}
        </button>
      )}
      <button onClick={p.onOpenIndicators} title={t("shell.indicators")} className={btn}>
        {I.indicators}
        <span className="hidden lg:inline">{t("shell.indicators")}</span>
        {p.indicatorCount > 0 && <span className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p.indicatorCount}</span>}
      </button>
      <button onClick={p.onOpenAlerts} disabled={!p.onOpenAlerts} title={t("shell.alerts")} className={btn}>
        {I.alert}
        <span className="hidden lg:inline">{t("shell.alerts")}</span>
        {(p.alertCount ?? 0) > 0 && <span className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p.alertCount}</span>}
      </button>
      <ChartEventsButton className={btn} onClassName={btnOn} />
      <button onClick={onReplay} title={t("shell.replay")} aria-pressed={replayOn} className={`${btn} ${replayOn ? btnOn : ""}`}>
        {I.replay}
        <span className="hidden lg:inline">{t("shell.replay")}</span>
      </button>
      {sep}

      <button onClick={() => p.drawings.undo()} disabled={!p.drawings.canUndo()} title={t("shell.undo")} className={btn}>
        {I.undo}
      </button>
      <button onClick={() => p.drawings.redo()} disabled={!p.drawings.canRedo()} title={t("shell.redo")} className={btn}>
        {I.redo}
      </button>

      <span className="flex-1 min-w-2" />

      {p.extra}
      {p.templates && <TemplatesMenu btn={btn} {...p.templates} />}
      {p.onOpenSettings ? (
        <button onClick={p.onOpenSettings} title={t("chart.settings")} className={btn}>
          {I.gear}
        </button>
      ) : (
      <Menu title={t("chart.settings")} className={btn} width={220} trigger={I.gear}>
        {(close) => (
          <div className="px-1 text-xs text-gray-800 dark:text-gray-200">
            {(
              [
                ["showVolume", "chart.volume"],
                ["showGrid", "chart.grid"],
                ["showWatermark", "chart.watermark"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 h-8 px-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                <input type="checkbox" className="accent-green-600" checked={p.toggles[k]} onChange={(e) => p.onToggle(k, e.target.checked)} />
                {t(label)}
              </label>
            ))}
            <button
              onClick={() => {
                p.onResetView();
                close();
              }}
              className="w-full h-8 px-2 rounded text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              {t("shell.settings.resetView")}
            </button>
          </div>
        )}
      </Menu>
      )}
      {p.onOpenShortcuts && (
        <button onClick={p.onOpenShortcuts} title={t("shortcuts.title")} className={`${btn} hidden lg:inline-flex`}>
          {CS_ICONS.keyboard}
        </button>
      )}
      <button onClick={p.onFullscreen} title={t("chart.fullscreen")} aria-pressed={p.fullscreen} className={`${btn} ${p.fullscreen ? btnOn : ""}`}>
        {I.fullscreen}
      </button>
      {p.onScreenshotCopy ? (
        <Menu title={t("chart.screenshot")} className={btn} width={220} trigger={I.camera}>
          {(close) => (
            <>
              <button
                onClick={() => {
                  p.onScreenshot();
                  close();
                }}
                className="w-full h-9 px-3 flex items-center gap-2.5 text-[13px] text-left cursor-pointer text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {CS_ICONS.download}
                {t("cs.snap.download")}
              </button>
              <button
                onClick={() => {
                  p.onScreenshotCopy?.();
                  close();
                }}
                className="w-full h-9 px-3 flex items-center gap-2.5 text-[13px] text-left cursor-pointer text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {CS_ICONS.copy}
                {t("cs.snap.copy")}
              </button>
            </>
          )}
        </Menu>
      ) : (
        <button onClick={p.onScreenshot} title={t("chart.screenshot")} className={btn}>
          {I.camera}
        </button>
      )}
      <button onClick={p.onTogglePanel} title={t("shell.panel")} aria-pressed={p.panelOpen} className={`${btn} md:hidden ${p.panelOpen ? btnOn : ""}`}>
        {I.panel}
      </button>
    </div>
  );
}
