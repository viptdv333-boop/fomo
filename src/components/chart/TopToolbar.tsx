"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { ChartType } from "@/lib/chart/types";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import type { ReplayApi } from "./ReplayControls";
import { InstIcon } from "./RightPanel";
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
];

export type ToggleKey = "showVolume" | "showGrid" | "showWatermark";

interface Props {
  instrument: TerminalInstrument;
  interval: string;
  onInterval: (id: string) => void;
  chartType: ChartType;
  onChartType: (t: ChartType) => void;
  onOpenSearch: () => void;
  onOpenIndicators: () => void;
  indicatorCount: number;
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
}

/* ───────────── icons ───────────── */

const sv = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const I = {
  search: sv(<><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>),
  indicators: sv(<path d="M3 17l5-6 4 3 4-7 5 5" />),
  alert: sv(<><path d="M6 17V11a6 6 0 1112 0v6l1.5 2h-15z" /><path d="M10 21a2 2 0 004 0" /></>),
  replay: sv(<><path d="M5 12a7 7 0 107-7H8" /><path d="M10.5 2.5L7.5 5l3 2.5" /><path d="M11 9.5v5l4-2.5z" fill="currentColor" stroke="none" /></>),
  undo: sv(<><path d="M9 5L4 10l5 5" /><path d="M4 10h9a6 6 0 016 6v2" /></>),
  redo: sv(<><path d="M15 5l5 5-5 5" /><path d="M20 10h-9a6 6 0 00-6 6v2" /></>),
  gear: sv(<><circle cx="12" cy="12" r="3" /><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" /></>),
  fullscreen: sv(<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />),
  camera: sv(<><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.2" /></>),
  tools: sv(<><path d="M4 20l4-1 10.5-10.5a2 2 0 00-2.8-2.8L5.2 16.2z" /><path d="M14.5 7.5l2 2" /></>),
  panel: sv(<><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M15 4.5v15" /></>),
  chevron: (
    <svg viewBox="0 0 24 24" className="w-3 h-3 shrink-0 opacity-60" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
};

const typeIcon: Record<ChartType, ReactNode> = {
  candles: sv(<><path d="M8 4v16M16 6v13" /><rect x="6" y="8" width="4" height="7" fill="currentColor" /><rect x="14" y="10" width="4" height="6" fill="currentColor" /></>),
  hollow: sv(<><path d="M8 4v16M16 6v13" /><rect x="6" y="8" width="4" height="7" /><rect x="14" y="10" width="4" height="6" /></>),
  bars: sv(<><path d="M8 4v16M5 8h3M8 16h3M16 6v13M13 10h3M16 15h3" /></>),
  line: sv(<path d="M3 16l5-6 4 3 4-7 5 4" />),
  area: sv(<><path d="M3 16l5-6 4 3 4-7 5 4v8H3z" fill="currentColor" fillOpacity={0.25} /><path d="M3 16l5-6 4 3 4-7 5 4" /></>),
  heikin: sv(<><path d="M8 3v18M16 5v15" /><rect x="6" y="7" width="4" height="9" fill="currentColor" fillOpacity={0.4} /><rect x="14" y="9" width="4" height="7" fill="currentColor" fillOpacity={0.4} /></>),
};

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
            className="fixed z-[56] py-1 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl"
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
    "h-8 min-w-8 px-2 inline-flex items-center justify-center gap-1.5 rounded text-xs font-medium shrink-0 transition cursor-pointer text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-35 disabled:cursor-default disabled:hover:bg-transparent";
  const btnOn = "bg-green-600/10 text-green-700 dark:text-green-400 hover:bg-green-600/15 dark:hover:bg-green-600/15";
  const sep = <span className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1 shrink-0" />;

  const replayOn = p.replay.mode !== "off";
  const onReplay = () => {
    if (p.replay.mode === "off") p.replay.start();
    else if (p.replay.mode === "pick") p.replay.cancelPick();
    else p.replay.exit(true);
  };

  const currentType = CHART_TYPES.find((c) => c.id === p.chartType) ?? CHART_TYPES[0];

  return (
    <div className="flex items-center gap-0.5 h-10 px-1.5 shrink-0 overflow-x-auto border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <button onClick={p.onToggleTools} title={t("shell.drawTools")} aria-pressed={p.toolsOpen} className={`${btn} md:hidden ${p.toolsOpen ? btnOn : ""}`}>
        {I.tools}
      </button>

      <button onClick={p.onOpenSearch} title={t("shell.symbol.searchTitle")} className={`${btn} gap-2 pr-3`}>
        <InstIcon inst={p.instrument} size={20} />
        <span className="font-bold text-[13px]">{p.instrument.ticker}</span>
        <span className="hidden xl:inline text-[11px] font-normal text-gray-400 max-w-[110px] truncate">{exchangeLabel(p.instrument.source)}</span>
        <span className="text-gray-400">{I.search}</span>
      </button>
      {sep}

      {INTERVALS.map((i) => (
        <button key={i.id} onClick={() => p.onInterval(i.id)} aria-pressed={p.interval === i.id} className={`${btn} px-2.5 ${p.interval === i.id ? btnOn : ""}`}>
          {t(i.key)}
        </button>
      ))}
      {sep}

      <Menu title={t("shell.chartType")} className={`${btn}`} width={190} trigger={<>{typeIcon[currentType.id]}{I.chevron}</>}>
        {(close) =>
          CHART_TYPES.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                p.onChartType(c.id);
                close();
              }}
              className={`w-full h-8 px-3 flex items-center gap-2.5 text-xs text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
                p.chartType === c.id ? "text-green-600 dark:text-green-400 font-medium" : "text-gray-800 dark:text-gray-200"
              }`}
            >
              {typeIcon[c.id]}
              {t(c.key)}
            </button>
          ))
        }
      </Menu>
      {sep}

      <button onClick={p.onOpenIndicators} title={t("shell.indicators")} className={btn}>
        {I.indicators}
        <span className="hidden lg:inline">{t("shell.indicators")}</span>
        {p.indicatorCount > 0 && <span className="text-[10px] px-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{p.indicatorCount}</span>}
      </button>
      <button disabled title={`${t("shell.alerts")} (${t("shell.soon")})`} className={btn}>
        {I.alert}
        <span className="hidden lg:inline">{t("shell.alerts")}</span>
      </button>
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
      <button onClick={p.onFullscreen} title={t("chart.fullscreen")} aria-pressed={p.fullscreen} className={`${btn} ${p.fullscreen ? btnOn : ""}`}>
        {I.fullscreen}
      </button>
      <button onClick={p.onScreenshot} title={t("chart.screenshot")} className={btn}>
        {I.camera}
      </button>
      <button onClick={p.onTogglePanel} title={t("shell.panel")} aria-pressed={p.panelOpen} className={`${btn} md:hidden ${p.panelOpen ? btnOn : ""}`}>
        {I.panel}
      </button>
    </div>
  );
}
