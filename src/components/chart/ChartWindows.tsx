"use client";

import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import { ChartEngine } from "@/lib/chart/engine";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { DESIGN_PATHS } from "./icons";
import { DEFAULT_WORKSPACE, MAIN_ID, MAX_CHARTS, MIN_AREA_H, MIN_AREA_W, chartCount, chartIds, dragRect, hasWindow, rectFromPx, rectPx } from "@/lib/chart/windows-layout";
import type { DragMode, Rect, Workspace, WsWindow } from "@/lib/chart/windows-layout";
import IndicatorLegend from "./IndicatorLegend";
import { IND_ICONS } from "./icons";

/* Workspace of floating windows over the chart area: the price chart and the extra windows with indicators are all rectangles that can be moved by
   their header and resized by their edges. The model is lib/chart/windows-layout.ts, the indicators of a window live in IndicatorsController, one
   shared time view and crosshair come from ChartEngine.follow. With nothing added (the default) nothing here changes the classic single chart. */

const NO_STATE = { ws: DEFAULT_WORKSPACE, rev: 0, max: null };

/** The workspace of the controller (and the engines of its charts) as React state (a new object after every change, so the snapshot is stable). */
function useWorkspace(controller: IndicatorsController) {
  const subscribe = useCallback((cb: () => void) => controller.subscribeLayout(cb), [controller]);
  return useSyncExternalStore(subscribe, () => controller.getWinState(), () => NO_STATE);
}

export interface WindowsGeo {
  /** The workspace while it is on screen (the area is wide enough: always, even with one window), else null: the classic stack without windows. */
  ws: Workspace | null;
  /** Rectangle of every window in px of the area, by id (the price chart included). The maximized window has the whole area. */
  px: Record<string, Rect>;
  /** The window that fills the area right now. */
  maxId: string | null;
  size: { w: number; h: number };
  /** The area is wide enough for windows (the toolbar button is shown then). */
  available: boolean;
}

/**
 * Tells the controller whether the chart area is wide enough for windows and returns where the windows are (ws null: one chart, or too narrow
 * for windows, then the indicators keep the one stack of panes under the price chart as before).
 */
export function useWindowsGeometry(controller: IndicatorsController, areaRef: RefObject<HTMLElement | null>, enabled: boolean): WindowsGeo {
  const state = useWorkspace(controller);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      const h = Math.round(r.height);
      setSize((p) => (p.w === w && p.h === h ? p : { w, h }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [areaRef]);
  const available = enabled && size.w >= MIN_AREA_W && size.h >= MIN_AREA_H;
  useEffect(() => {
    controller.setWindowsAvailable(available);
  }, [controller, available]);
  useEffect(() => () => controller.setWindowsAvailable(false), [controller]);
  /* Esc puts a maximized window back (not while a dialog is open: it closes that first) */
  const maxNow = available ? state.max : null;
  useEffect(() => {
    if (!maxNow) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || [...document.querySelectorAll('[role="dialog"]')].some((d) => d.getClientRects().length > 0)) return;
      controller.toggleMaximize(maxNow);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [controller, maxNow]);
  return useMemo(() => {
    const ws = available ? state.ws : null;
    const px: Record<string, Rect> = {};
    if (ws) for (const w of ws.wins) px[w.id] = rectPx(w, size.w, size.h);
    const maxId = ws && state.max && ws.wins.some((w) => w.id === state.max) ? state.max : null;
    if (maxId) px[maxId] = { x: 0, y: 0, w: size.w, h: size.h };
    return { ws, px, size, available, maxId };
  }, [available, state, size]);
}

/* ───────────── a window frame: header to move, edges to resize ───────────── */

const hbtn =
  "tv3-press flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md text-[var(--tv3-text2)] hover:bg-gray-500/15 hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";

/* the icons the chart's fullscreen button uses: corners out to expand, corners in to put it back */
const expandIcon = (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d={DESIGN_PATHS.fullscreen} />
  </svg>
);
const shrinkIcon = (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true" focusable="false">
    <path d="M6 17h12" />
  </svg>
);
const collapseIcon = (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M9 4v2.5A2.5 2.5 0 016.5 9H4M15 4v2.5A2.5 2.5 0 0017.5 9H20M9 20v-2.5A2.5 2.5 0 006.5 15H4M15 20v-2.5a2.5 2.5 0 012.5-2.5H20" />
  </svg>
);

const HANDLES: [DragMode, string][] = [
  ["n", "inset-x-2 top-0 h-[5px] cursor-ns-resize"],
  ["s", "inset-x-2 bottom-0 h-[5px] cursor-ns-resize"],
  ["w", "inset-y-2 left-0 w-[5px] cursor-ew-resize"],
  ["e", "inset-y-2 right-0 w-[5px] cursor-ew-resize"],
  ["nw", "left-0 top-0 h-[10px] w-[10px] cursor-nwse-resize"],
  ["ne", "right-0 top-0 h-[10px] w-[10px] cursor-nesw-resize"],
  ["sw", "bottom-0 left-0 h-[10px] w-[10px] cursor-nesw-resize"],
  ["se", "bottom-0 right-0 h-[10px] w-[10px] cursor-nwse-resize"],
];

interface FrameProps {
  id: string;
  controller: IndicatorsController;
  /** Where the window is, in px of the area; null: the classic single chart (the frame is only a transparent wrapper). */
  rect: Rect | null;
  size: { w: number; h: number };
  z: number;
  /** The window fills the whole area (it is above the others and cannot be moved; the button puts it back). */
  maximized?: boolean;
  title: ReactNode;
  /** The whole title as text (tooltip: the title is cut with an ellipsis when it does not fit). */
  titleText?: string;
  /** The window is closed but its content stays alive (the price chart: the toolbar still drives it). */
  hidden?: boolean;
  /** The buttons of this kind of window (the title bar always ends with: collapse, fill the area, close). */
  actions: ReactNode;
  /** Close button; none for the price chart. */
  onClose?: () => void;
  closeTitle?: string;
  /** A click in the window: the id of the window whose chart now takes the keyboard (null: the price chart). */
  onFocus?: (id: string | null) => void;
  children: ReactNode;
}

/**
 * The frame of a window. With `rect` null it is a plain wrapper that fills the area (children stay mounted when the workspace switches on or
 * off, the price chart's canvas never gets re-created).
 */
export function WindowFrame({ id, controller, rect, size, z, maximized = false, title, titleText, hidden = false, actions, onClose, closeTitle, onFocus, children }: FrameProps) {
  const { t } = useT();
  const startDrag = (e: ReactPointerEvent<HTMLElement>, mode: DragMode) => {
    if (e.button !== 0 || !rect || maximized) return;
    e.preventDefault();
    e.stopPropagation();
    controller.raise(id);
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const { w: W, h: H } = size;
    const start = rect;
    const sx = e.clientX;
    const sy = e.clientY;
    // the whole chart lays out on every change: at most once per frame
    let raf = 0;
    let last: Rect | null = null;
    const flush = () => {
      raf = 0;
      if (last) controller.setRect(id, rectFromPx(last, W, H), false);
    };
    const move = (ev: PointerEvent) => {
      last = dragRect(start, mode, ev.clientX - sx, ev.clientY - sy, W, H);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const done = () => {
      if (raf) cancelAnimationFrame(raf);
      flush();
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", done);
      el.removeEventListener("pointercancel", done);
      controller.commitLayout();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", done);
    el.addEventListener("pointercancel", done);
  };

  // one element tree in both modes (null placeholders keep the slots): the children - the price chart's canvas host - are never re-created
  // «shrink» has nothing to do for a window that is a quarter of the area or less
  const small = !!rect && rect.w <= size.w * 0.5 + 1 && rect.h <= size.h * 0.5 + 1;
  // one window that fills the whole area: no frame, only the slim title bar
  const plain = !!rect && rect.x < 1 && rect.y < 1 && rect.w >= size.w - 1 && rect.h >= size.h - 1;
  const style: CSSProperties | undefined = rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: 10 + (maximized ? 9999 : z) } : undefined;
  return (
    <div
      className={
        hidden
          ? "hidden"
          : rect
            ? `absolute flex flex-col overflow-hidden bg-[var(--tv3-card)] ${plain ? "" : "rounded-lg border border-[var(--tv3-hair)] shadow-[0_6px_24px_rgba(0,0,0,.28)]"}`
            : "relative flex flex-col flex-1 min-h-0"
      }
      style={style}
      data-chart-window={rect ? id : undefined}
      // a click anywhere in an indicator window brings it to the front; the price chart (it fills the area) only by its header or edges, or it would bury the windows
      onPointerDownCapture={
        rect
          ? () => {
              onFocus?.(id === MAIN_ID ? null : id);
              if (id !== MAIN_ID) controller.raise(id);
            }
          : undefined
      }
    >
      {rect ? (
        <div
          className={`flex h-[24px] shrink-0 touch-none select-none items-center justify-between gap-2 border-b border-[var(--tv3-hair)] bg-[var(--tv3-fill)] pl-2.5 pr-1 ${maximized ? "" : "cursor-move"}`}
          onDoubleClick={(e) => {
            if (!(e.target as HTMLElement).closest("button")) controller.toggleMaximize(id);
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            startDrag(e, "move");
          }}
        >
          <span className="flex min-w-0 items-center gap-2 text-[11.5px] font-semibold text-[var(--tv3-muted)]" title={titleText}>
            {title}
          </span>
          <span className="flex shrink-0 items-center gap-0.5">
            {actions}
            <button type="button" className={`${hbtn} disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`} title={t("win.shrink")} aria-label={t("win.shrink")} disabled={small && !maximized} onClick={() => controller.shrinkWindow(id)}>
              {shrinkIcon}
            </button>
            <button type="button" className={hbtn} title={maximized ? t("win.restore") : t("win.maximize")} aria-label={maximized ? t("win.restore") : t("win.maximize")} aria-pressed={maximized} onClick={() => controller.toggleMaximize(id)}>
              {maximized ? collapseIcon : expandIcon}
            </button>
            {onClose && (
              <button type="button" className={`${hbtn} hover:!text-red-500`} title={closeTitle} aria-label={closeTitle} onClick={onClose}>
                {IND_ICONS.close(14)}
              </button>
            )}
          </span>
        </div>
      ) : null}
      {children}
      {rect && !maximized ? (
        <>
          {HANDLES.map(([mode, cls]) => (
            <div key={mode} className={`absolute z-40 touch-none ${cls}`} onPointerDown={(e) => startDrag(e, mode)} />
          ))}
        </>
      ) : null}
    </div>
  );
}

/* ───────────── the extra windows ───────────── */

interface Props {
  controller: IndicatorsController;
  geo: WindowsGeo;
  /** The «+» of an indicator window: open the indicator catalog so that the next indicators land there. */
  onAddIndicator: (winId: string) => void;
  /** A new window became a chart / an indicator window (the page knows the instrument and the catalog). */
  onPickChart: (winId: string) => void;
  onPickIndicator: (winId: string) => void;
  /** Open the instrument search of a chart window (the title of the window, or right after «Chart» was chosen). */
  onPickInstrument: (winId: string) => void;
  /** Back to the classic single chart. */
  onReset: () => void;
  /** A window failed to render: the windows are switched off for this session (the chart and the saved layout stay), see the parent. */
  onBroken: () => void;
  /** The chart of a chart window (a whole TradingChart with its own instrument, interval and indicators). */
  renderChart: (w: WsWindow) => ReactNode;
  onFocus: (id: string | null) => void;
}

/** A failing window must never take the price chart down with it: the windows are dropped, the indicators fall back to the stack under the chart. */
class WindowsBoundary extends Component<{ onBroken: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    try {
      console.error("[chart] windows failed:", error);
    } catch {}
    this.props.onBroken();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ChartWindows(props: Props) {
  return (
    <WindowsBoundary onBroken={props.onBroken}>
      <Windows {...props} />
    </WindowsBoundary>
  );
}

const swapIcon = (
  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />
  </svg>
);

function Windows(props: Props) {
  const { t } = useT();
  const { controller, geo } = props;
  const ws = geo.ws;
  if (!ws) return null;
  // the price chart is gone from the list: closed (the chooser can bring it back)
  const mainClosed = !hasWindow(ws, MAIN_ID);
  const others = ws.wins.length > 1 || mainClosed;
  return (
    <>
      {ws.wins.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="text-base font-semibold text-[var(--tv3-text)]">{t("win.emptyWs")}</div>
          <div className="max-w-[420px] text-sm text-[var(--tv3-muted)]">{t("win.emptyWsHint")}</div>
          <button type="button" onClick={() => controller.addWindow()} className="tv3-press cursor-pointer rounded-xl bg-[var(--tv3-accent)] px-5 py-2.5 text-[15px] font-bold text-white hover:brightness-110">
            {t("win.addWindow")}
          </button>
        </div>
      )}
      {ws.wins
        .filter((w) => w.id !== MAIN_ID)
        .map((w) => {
          const rect = geo.px[w.id];
          if (!rect) return null;
          const common = { rect, size: geo.size, controller, ws, maximized: geo.maxId === w.id };
          if (w.kind === "chart") return <ChartWindow key={w.id} win={w} {...common} renderChart={props.renderChart} onFocus={props.onFocus} onPickInstrument={props.onPickInstrument} />;
          if (w.kind === "new") return <NewWindow key={w.id} win={w} {...common} canChart={chartCount(ws) < MAX_CHARTS || mainClosed} hasOthers={others} onPickChart={props.onPickChart} onPickIndicator={props.onPickIndicator} onReset={props.onReset} />;
          return <IndicatorWindow key={w.id} win={w} {...common} leader={controller.chartEngine(w.link)} onAddIndicator={props.onAddIndicator} />;
        })}
    </>
  );
}

type Common = { rect: Rect; size: { w: number; h: number }; controller: IndicatorsController; ws: Workspace; maximized: boolean };

/**
 * Text that follows the charts: re-computed when a chart's instrument / timeframe changes or the indicators change (the title of a window,
 * the link chip). Returns the fresh text at every render.
 */
function useLive(controller: IndicatorsController, ws: Workspace, compute: () => string): string {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const ref = useRef(compute);
  ref.current = compute;
  const ids = chartIds(ws).join(",");
  // an engine that appears later (a chart window being built) needs a new subscription
  const present = ids.split(",").map((id) => (controller.chartEngine(id) ? "1" : "0")).join("");
  useEffect(() => {
    let last = ref.current();
    const check = () => {
      const now = ref.current();
      if (now !== last) {
        last = now;
        tick();
      }
    };
    const offs = ids
      .split(",")
      .map((id) => controller.chartEngine(id))
      .filter((e): e is ChartEngine => !!e)
      .map((e) => e.addViewListener(check));
    offs.push(controller.subscribe(check));
    check();
    return () => offs.forEach((off) => off());
  }, [controller, ids, present]);
  return compute();
}

/** Title of a chart window: its asset and timeframe, «Платина · 15м» (the display name of the instrument, the ticker as a fallback). */
function chartTitle(controller: IndicatorsController, ws: Workspace, id: string): string {
  const e = controller.chartEngine(id);
  const name = e ? e.opts.symbolLabel || e.opts.scaleSymbol : "";
  return [name || ws.wins.find((w) => w.id === id)?.tk, e?.opts.intervalLabel].filter(Boolean).join(" · ");
}

/** Label of a chart for the link chip: «NG · 15м» (what that chart shows right now). */
function chartLabel(controller: IndicatorsController, ws: Workspace, id: string): string {
  const e = controller.chartEngine(id);
  const tk = e ? e.opts.scaleSymbol || e.opts.symbolLabel : (ws.wins.find((w) => w.id === id)?.tk ?? "");
  return [tk, e?.opts.intervalLabel].filter(Boolean).join(" · ") || "—";
}

/** Which chart an indicator window belongs to: a chip in its header with a list of all charts. Changing it re-points the window (candles, time scale, crosshair, instrument, timeframe). */
function LinkChip({ win, ws, controller }: { win: WsWindow; ws: Workspace; controller: IndicatorsController }) {
  const { t } = useT();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ids = chartIds(ws);
  // the label follows the chart: another instrument / timeframe there changes the chip
  useLive(controller, ws, () => ids.map((id) => chartLabel(controller, ws, id)).join("|"));
  const label = (id: string) => chartLabel(controller, ws, id) + (id === MAIN_ID ? ` (${t("win.mainSuffix")})` : "");
  return (
    <>
      <button
        type="button"
        title={t("win.linkTitle")}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        className="tv3-press inline-flex min-w-0 max-w-[260px] cursor-pointer items-center gap-1 rounded-md bg-[var(--tv3-accent-soft)] px-1.5 py-[2px] text-[11.5px] font-semibold normal-case tracking-normal text-[var(--tv3-accent)] hover:brightness-110"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos(pos ? null : { left: Math.max(4, Math.min(r.left, window.innerWidth - 264)), top: r.bottom + 4 });
        }}
      >
        <span className="truncate">{t("win.link", { chart: chartLabel(controller, ws, win.link) })}</span>
        {IND_ICONS.chevronDown(12)}
      </button>
      {pos && (
        <>
          <div className="fixed inset-0 z-[79]" onPointerDown={() => setPos(null)} />
          <div role="menu" className="tv3-pop fixed z-[80] w-64 rounded-xl py-1 text-xs font-medium normal-case tracking-normal text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]" style={{ left: pos.left, top: pos.top }}>
            <div className="px-3 pb-1 pt-1.5 text-[11px] text-[var(--tv3-muted)]">{t("win.linkPick")}</div>
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                role="menuitemradio"
                aria-checked={id === win.link}
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--tv3-fill)] ${id === win.link ? "text-[var(--tv3-accent)]" : ""}`}
                onClick={() => {
                  setPos(null);
                  controller.setLink(win.id, id);
                }}
              >
                <span className="w-3 shrink-0">{id === win.link ? "✓" : ""}</span>
                <span className="truncate">{label(id)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/** A window nobody has decided about: two big choices. */
function NewWindow({ win, rect, size, controller, ws, maximized, canChart, hasOthers, onPickChart, onPickIndicator, onReset }: Common & { win: WsWindow; canChart: boolean; hasOthers: boolean; onPickChart: (id: string) => void; onPickIndicator: (id: string) => void; onReset: () => void }) {
  const { t } = useT();
  const big = "tv3-press flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-[var(--tv3-hair)] bg-[var(--tv3-fill)] px-3 py-4 text-center hover:border-[var(--tv3-accent)] hover:bg-[var(--tv3-accent-soft)] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[var(--tv3-hair)] disabled:hover:bg-[var(--tv3-fill)]";
  return (
    <WindowFrame
      id={win.id}
      controller={controller}
      rect={rect}
      size={size}
      z={win.z}
      maximized={maximized}
      title={t("win.new.title")}
      actions={null}
      onClose={() => controller.closeWindow(win.id)}
      closeTitle={t("win.closeNew")}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto p-4">
        <div className="text-sm font-semibold text-[var(--tv3-text)]">{t("win.new.q")}</div>
        <div className="flex w-full max-w-[380px] gap-3">
          <button type="button" className={big} disabled={!canChart} title={canChart ? undefined : t("win.max", { n: MAX_CHARTS })} onClick={() => onPickChart(win.id)}>
            <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--tv3-accent)]" aria-hidden="true">
              <path d="M7 4v16M7 8h0M5 8h4v7H5zM17 3v14M15 7h4v7h-4z" />
            </svg>
            <span className="text-[15px] font-bold text-[var(--tv3-text)]">{t("win.new.chart")}</span>
            <span className="text-[11.5px] leading-snug text-[var(--tv3-muted)]">{t("win.new.chartHint")}</span>
          </button>
          <button type="button" className={big} onClick={() => onPickIndicator(win.id)}>
            <svg viewBox="0 0 24 24" width={30} height={30} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="text-[var(--tv3-accent)]" aria-hidden="true">
              <path d="M3 16l4-6 4 4 4-9 6 11" />
            </svg>
            <span className="text-[15px] font-bold text-[var(--tv3-text)]">{t("win.new.ind")}</span>
            <span className="text-[11.5px] leading-snug text-[var(--tv3-muted)]">{t("win.new.indHint")}</span>
          </button>
        </div>
        <div className="max-w-[380px] text-center text-[11px] leading-snug text-[var(--tv3-muted)]">{t("win.hint")}</div>
        {hasOthers && (
          <button type="button" className="cursor-pointer text-[11.5px] text-[var(--tv3-muted)] underline hover:text-[var(--tv3-text)]" onClick={onReset}>
            {t("win.reset")}
          </button>
        )}
      </div>
    </WindowFrame>
  );
}

/** A window with a chart of its own: the same component as the panes of the multi-chart grid (own instrument picker, interval, indicators). */
function ChartWindow({ win, rect, size, controller, ws, maximized, renderChart, onFocus, onPickInstrument }: Common & { win: WsWindow; renderChart: (w: WsWindow) => ReactNode; onFocus: (id: string | null) => void; onPickInstrument: (winId: string) => void }) {
  const { t } = useT();
  const title = useLive(controller, ws, () => chartTitle(controller, ws, win.id));
  return (
    <WindowFrame
      id={win.id}
      controller={controller}
      rect={rect}
      size={size}
      z={win.z}
      maximized={maximized}
      title={
        // the title is the way to another instrument: it opens the same search the ticker button of the window's toolbar opens
        <button type="button" className="min-w-0 cursor-pointer truncate text-left hover:text-[var(--tv3-text)] hover:underline" title={t("win.pickInstrument")} aria-label={t("win.pickInstrument")} onClick={() => onPickInstrument(win.id)}>
          {title}
        </button>
      }
      titleText={title}
      onFocus={onFocus}
      actions={
        <>
          <button type="button" className={hbtn} title={t("win.switchType")} aria-label={t("win.switchType")} onClick={() => controller.resetKind(win.id)}>
            {swapIcon}
          </button>
        </>
      }
      onClose={() => controller.closeWindow(win.id)}
      closeTitle={t("win.closeChart")}
    >
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">{renderChart(win)}</div>
      </div>
    </WindowFrame>
  );
}

function IndicatorWindow({ win, ws, rect, size, controller, maximized, leader, onAddIndicator }: Common & { win: WsWindow; ws: Workspace; leader: ChartEngine | null; onAddIndicator: (winId: string) => void }) {
  const { t } = useT();
  const id = win.id;
  const hostRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<ChartEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const getEngine = useCallback(() => engRef.current, []);

  /* the engine of this window: indicators only, the bars / view / crosshair of the chart it is linked to (another chart: a new engine) */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !leader) return;
    const eng = new ChartEngine(host, { theme: leader.opts.theme });
    engRef.current = eng;
    eng.follow(leader);
    controller.attachWindow(id, eng);
    setReady(true);
    return () => {
      setReady(false);
      controller.detachWindow(id, eng);
      engRef.current = null;
      eng.destroy();
    };
  }, [id, leader, controller]);

  useEffect(() => controller.subscribe(tick), [controller]);

  const empty = !controller.usedWindows().has(id);
  const titleText = useLive(controller, ws, () => controller.windowTitle(id, t("win.indTitleEmpty")));
  return (
    <WindowFrame
      id={id}
      controller={controller}
      rect={rect}
      size={size}
      z={win.z}
      maximized={maximized}
      title={
        <>
          <span className="truncate">{titleText}</span>
          <LinkChip win={win} ws={ws} controller={controller} />
        </>
      }
      actions={
        <>
          <button type="button" className={hbtn} title={t("win.addInd")} aria-label={t("win.addInd")} onClick={() => onAddIndicator(id)}>
            {IND_ICONS.plus(15)}
          </button>
          <button type="button" className={hbtn} title={t("win.switchType")} aria-label={t("win.switchType")} onClick={() => controller.resetKind(id)}>
            {swapIcon}
          </button>
        </>
      }
      titleText={titleText}
      onClose={() => controller.closeWindow(id)}
      closeTitle={t("win.close")}
    >
      <div className="relative min-h-0 flex-1">
        <div ref={hostRef} className="absolute inset-0" />
        <IndicatorLegend controller={controller} getEngine={getEngine} hostRef={hostRef} winId={id} ready={ready} />
        {empty && ready && (
          <div className="pointer-events-none absolute inset-x-4 top-1/2 flex -translate-y-1/2 flex-col items-center gap-2 text-center text-xs text-[var(--tv3-muted)]">
            <span>{t("win.empty")}</span>
            <button
              type="button"
              onClick={() => onAddIndicator(id)}
              className="tv3-press pointer-events-auto cursor-pointer rounded-lg bg-[var(--tv3-accent)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:brightness-110"
            >
              {t("win.addIndBtn")}
            </button>
          </div>
        )}
      </div>
    </WindowFrame>
  );
}
