"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { ChartType } from "@/lib/chart/types";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import type { ReplayApi } from "./ReplayControls";
import InstIcon from "./InstIcon";
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
  { id: "Y", key: "inst.period.Y" },
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
            className="tv3-pop fixed z-[56] py-1.5 rounded-2xl text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] max-h-[calc(100vh-70px)] overflow-y-auto"
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

  // design v3: grey rounded buttons on the white card, the "on" state is a darker grey (not green)
  // iOS look: 31px-high rounded-[11px] buttons (design 27px +15%), press = scale .96 + tint, hover = tint (see terminal-v3.css)
  const btn =
    "tv3-press min-h-[31px] min-w-[31px] px-3 py-[5px] inline-flex items-center justify-center gap-1.5 rounded-[11px] bg-[var(--tv3-fill)] text-[13.5px] font-semibold shrink-0 cursor-pointer text-[var(--tv3-text)] hover:brightness-95 dark:hover:brightness-125 disabled:opacity-40 disabled:cursor-default disabled:hover:brightness-100";
  const btnOn = "!bg-[var(--tv3-fill-on)]";
  // icon-only square buttons on the right (design 32px +15% = 37px)
  const ibtn = `${btn} !h-[37px] !w-[37px] !px-0 !py-0`;
  // text labels hide progressively as the toolbar gets narrow (container width, not the viewport)
  const lbl = "hidden @[780px]:inline"; // compare / indicators keep their label longest
  const lbl2 = "hidden @[1000px]:inline"; // alerts / simulator labels go first
  const badge = (n: number) => (
    <span className="min-w-[17px] h-[17px] px-[3px] rounded-full bg-[var(--tv3-text)] text-[var(--tv3-card)] text-[11px] font-semibold leading-none inline-flex items-center justify-center box-border">{n}</span>
  );

  const replayOn = p.replay.mode !== "off";
  const onReplay = () => {
    if (p.replay.mode === "off") p.replay.start();
    else if (p.replay.mode === "pick") p.replay.cancelPick();
    else p.replay.exit(true);
  };

  const currentType = CHART_TYPES.find((c) => c.id === p.chartType) ?? CHART_TYPES[0];

  return (
    <div className="@container flex items-center gap-x-2 gap-y-1.5 px-2.5 py-[7px] shrink-0 overflow-x-auto md:overflow-visible md:flex-wrap border-b-[0.5px] border-[var(--tv3-hair)] bg-[var(--tv3-card)] whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button onClick={p.onToggleTools} title={t("shell.drawTools")} aria-label={t("shell.drawTools")} aria-pressed={p.toolsOpen} className={`${btn} md:hidden ${p.toolsOpen ? btnOn : ""}`}>
        {I.tools}
      </button>

      <button onClick={p.onOpenSearch} title={t("shell.symbol.searchTitle")} className={`${btn} !h-auto !gap-2 !rounded-xl !py-1 !pl-[5px] !pr-3`}>
        <InstIcon inst={p.instrument} size={28} />
        <span className="font-bold text-[16px]">{p.instrument.ticker}</span>
        <span className="hidden sm:inline text-xs font-normal text-[var(--tv3-muted)] max-w-[110px] truncate">{exchangeLabel(p.instrument.source)}</span>
        <span className="text-[var(--tv3-text2)] inline-flex">{I.search}</span>
      </button>
      {p.onPickInstrument && <ContractPicker instrument={p.instrument} onPick={p.onPickInstrument} btn={btn} />}

      {p.favIntervals && p.onFavIntervals ? (
        <IntervalControl interval={p.interval} onInterval={p.onInterval} favorites={p.favIntervals} onFavorites={p.onFavIntervals} btn={btn} btnOn={btnOn} />
      ) : (
        <div className="flex items-center shrink-0 rounded-[11px] bg-[var(--tv3-fill2)] p-0.5">
          {INTERVALS.map((i) => (
            <button
              key={i.id}
              onClick={() => p.onInterval(i.id)}
              aria-pressed={p.interval === i.id}
              className={`tv3-press px-[10px] py-[5.5px] text-[13.5px] font-semibold rounded-[9px] cursor-pointer ${p.interval === i.id ? "bg-[var(--tv3-card)] shadow-[0_1px_3px_rgba(0,0,0,.18)]" : ""}`}
            >
              {t(i.key)}
            </button>
          ))}
        </div>
      )}

      <Menu title={t("shell.chartType")} className={`${btn}`} width={220} trigger={<>{typeIcon[currentType.id]}</>}>
        {(close) =>
          CHART_TYPES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                p.onChartType(c.id);
                close();
              }}
              className={`tv3-press tv3-hov mx-1 h-10 w-[calc(100%-8px)] rounded-[10px] px-3 flex items-center gap-2.5 text-sm text-left cursor-pointer ${
                p.chartType === c.id ? "text-[var(--tv3-accent)] font-semibold bg-[var(--tv3-accent-soft)]" : "font-medium text-[var(--tv3-text)]"
              }`}
            >
              {typeIcon[c.id]}
              {t(c.key)}
            </button>
          ))
        }
      </Menu>
      {p.settingsApi && <ChartTypeSettings type={p.chartType} api={p.settingsApi} box={p.transformBox ?? 0} btn={btn} source={p.instrument.source} />}

      {p.onOpenCompare && (
        <button onClick={p.onOpenCompare} title={t("cs.compare")} className={btn}>
          {CS_ICONS.compare}
          <span className={lbl}>{t("cs.compareShort")}</span>
          {(p.compareCount ?? 0) > 0 && badge(p.compareCount ?? 0)}
        </button>
      )}
      <button onClick={p.onOpenIndicators} title={t("shell.indicators")} data-tv3-anchor="indicators" className={btn}>
        {I.indicators}
        <span className={lbl}>{t("shell.indicators")}</span>
        {p.indicatorCount > 0 && badge(p.indicatorCount)}
      </button>
      <button onClick={p.onOpenAlerts} disabled={!p.onOpenAlerts} title={t("shell.alerts")} className={btn}>
        {(p.alertCount ?? 0) > 0 ? I.alertOn : I.alert}
        <span className={lbl2}>{t("shell.alerts")}</span>
        {(p.alertCount ?? 0) > 0 && badge(p.alertCount ?? 0)}
      </button>
      <ChartEventsButton className={btn} onClassName={btnOn} />
      <button onClick={onReplay} title={t("shell.replay")} aria-pressed={replayOn} className={`${btn} ${replayOn ? btnOn : ""}`}>
        {I.replay}
        <span className={lbl2}>{t("shell.replay")}</span>
      </button>

      <button onClick={() => p.drawings.undo()} disabled={!p.drawings.canUndo()} title={t("shell.undo")} aria-label={t("shell.undo")} className={btn}>
        {I.undo}
      </button>
      <button onClick={() => p.drawings.redo()} disabled={!p.drawings.canRedo()} title={t("shell.redo")} aria-label={t("shell.redo")} className={btn}>
        {I.redo}
      </button>

      <span className="flex-1 min-w-2 hidden md:block" />

      {p.extra}
      {p.templates && <TemplatesMenu btn={btn} {...p.templates} />}
      {p.onOpenSettings ? (
        <button onClick={p.onOpenSettings} title={t("chart.settings")} aria-label={t("chart.settings")} className={ibtn}>
          {I.gear}
        </button>
      ) : (
      <Menu title={t("chart.settings")} className={ibtn} width={220} trigger={I.gear}>
        {(close) => (
          <div className="px-1 text-[13px] text-[var(--tv3-text)]">
            {(
              [
                ["showVolume", "chart.volume"],
                ["showGrid", "chart.grid"],
                ["showWatermark", "chart.watermark"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 h-8 px-2 rounded-lg cursor-pointer hover:bg-[var(--tv3-fill)]">
                <input type="checkbox" className="accent-green-600" checked={p.toggles[k]} onChange={(e) => p.onToggle(k, e.target.checked)} />
                {t(label)}
              </label>
            ))}
            <button
              onClick={() => {
                p.onResetView();
                close();
              }}
              className="w-full h-8 px-2 rounded-lg text-left cursor-pointer hover:bg-[var(--tv3-fill)]"
            >
              {t("shell.settings.resetView")}
            </button>
          </div>
        )}
      </Menu>
      )}
      {p.onOpenShortcuts && (
        <button onClick={p.onOpenShortcuts} title={t("shortcuts.title")} aria-label={t("shortcuts.title")} className={`${ibtn} hidden lg:inline-flex`}>
          {CS_ICONS.keyboard}
        </button>
      )}
      <button onClick={p.onFullscreen} title={t("chart.fullscreen")} aria-label={t("chart.fullscreen")} aria-pressed={p.fullscreen} className={`${ibtn} ${p.fullscreen ? btnOn : ""}`}>
        {I.fullscreen}
      </button>
      {p.onScreenshotCopy ? (
        <Menu title={t("chart.screenshot")} className={ibtn} width={220} trigger={I.camera}>
          {(close) => (
            <>
              <button
                onClick={() => {
                  p.onScreenshot();
                  close();
                }}
                className="w-full h-9 px-3.5 flex items-center gap-2.5 text-sm font-medium text-left cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]"
              >
                {CS_ICONS.download}
                {t("cs.snap.download")}
              </button>
              <button
                onClick={() => {
                  p.onScreenshotCopy?.();
                  close();
                }}
                className="w-full h-9 px-3.5 flex items-center gap-2.5 text-sm font-medium text-left cursor-pointer text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)]"
              >
                {CS_ICONS.copy}
                {t("cs.snap.copy")}
              </button>
            </>
          )}
        </Menu>
      ) : (
        <button onClick={p.onScreenshot} title={t("chart.screenshot")} aria-label={t("chart.screenshot")} className={ibtn}>
          {I.camera}
        </button>
      )}
      <button onClick={p.onTogglePanel} title={t("shell.panel")} aria-label={t("shell.panel")} aria-pressed={p.panelOpen} className={`${btn} md:hidden ${p.panelOpen ? btnOn : ""}`}>
        {I.panel}
      </button>
    </div>
  );
}
