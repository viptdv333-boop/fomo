"use client";

import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import { ChartEngine } from "@/lib/chart/engine";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { MAIN_ID, MIN_AREA_H, MIN_AREA_W, dragRect, extraIds, isActive, rectFromPx, rectPx } from "@/lib/chart/windows-layout";
import type { DragMode, Rect, Workspace } from "@/lib/chart/windows-layout";
import IndicatorLegend from "./IndicatorLegend";
import { IND_ICONS } from "./icons";

/* Workspace of floating windows over the chart area: the price chart and the extra windows with indicators are all rectangles that can be moved by
   their header and resized by their edges. The model is lib/chart/windows-layout.ts, the indicators of a window live in IndicatorsController, one
   shared time view and crosshair come from ChartEngine.follow. With nothing added (the default) nothing here changes the classic single chart. */

/** The workspace of the controller as React state (a new object after every change, so the snapshot is stable). */
function useWorkspace(controller: IndicatorsController) {
  const subscribe = useCallback((cb: () => void) => controller.subscribeLayout(cb), [controller]);
  return useSyncExternalStore(subscribe, () => controller.getWorkspace(), () => null);
}

export interface WindowsGeo {
  /** The workspace while it is on screen (windows exist and the area is wide enough), else null: the classic single chart. */
  ws: Workspace | null;
  /** Rectangle of every window in px of the area, by id (the price chart included). */
  px: Record<string, Rect>;
  size: { w: number; h: number };
  /** The area is wide enough for windows (the toolbar button is shown then). */
  available: boolean;
}

/**
 * Tells the controller whether the chart area is wide enough for windows and returns where the windows are (ws null: one chart, or too narrow
 * for windows, then the indicators keep the one stack of panes under the price chart as before).
 */
export function useWindowsGeometry(controller: IndicatorsController, areaRef: RefObject<HTMLElement | null>, enabled: boolean): WindowsGeo {
  const stored = useWorkspace(controller);
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
  return useMemo(() => {
    const ws = available && isActive(stored) ? stored : null;
    const px: Record<string, Rect> = {};
    if (ws) for (const w of ws.wins) px[w.id] = rectPx(w, size.w, size.h);
    return { ws, px, size, available };
  }, [available, stored, size]);
}

/* ───────────── a window frame: header to move, edges to resize ───────────── */

const hbtn =
  "tv3-press flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md text-[var(--tv3-text2)] hover:bg-gray-500/15 hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";

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
  title: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}

/**
 * The frame of a window. With `rect` null it is a plain wrapper that fills the area (children stay mounted when the workspace switches on or
 * off, the price chart's canvas never gets re-created).
 */
export function WindowFrame({ id, controller, rect, size, z, title, actions, children }: FrameProps) {
  const startDrag = (e: ReactPointerEvent<HTMLElement>, mode: DragMode) => {
    if (e.button !== 0 || !rect) return;
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
  const style: CSSProperties | undefined = rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h, zIndex: 10 + z } : undefined;
  return (
    <div
      className={
        rect
          ? "absolute flex flex-col overflow-hidden rounded-lg border border-[var(--tv3-hair)] bg-[var(--tv3-card)] shadow-[0_6px_24px_rgba(0,0,0,.28)]"
          : "relative flex flex-col flex-1 min-h-0"
      }
      style={style}
      data-chart-window={rect ? id : undefined}
      // a click anywhere in an indicator window brings it to the front; the price chart (it fills the area) only by its header or edges, or it would bury the windows
      onPointerDownCapture={rect && id !== MAIN_ID ? () => controller.raise(id) : undefined}
    >
      {rect ? (
        <div
          className="flex h-[26px] shrink-0 cursor-move touch-none select-none items-center justify-between gap-2 border-b border-[var(--tv3-hair)] bg-[var(--tv3-fill)] pl-2.5 pr-1"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) return;
            startDrag(e, "move");
          }}
        >
          <span className="truncate text-[11.5px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{title}</span>
          <span className="flex shrink-0 items-center gap-0.5">{actions}</span>
        </div>
      ) : null}
      {children}
      {rect ? (
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
  /** The engine of the price chart (null until it exists). */
  leader: ChartEngine | null;
  geo: WindowsGeo;
  /** The «+» of a window: open the indicator catalog so that the next indicators land there. */
  onAddIndicator: (winId: string) => void;
  /** A window failed to render: the windows are switched off for this session (the chart and the saved layout stay), see the parent. */
  onBroken: () => void;
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

function Windows({ controller, leader, geo, onAddIndicator }: Props) {
  if (!geo.ws || !leader) return null;
  return (
    <>
      {extraIds(geo.ws).map((id) => {
        const rect = geo.px[id];
        const z = geo.ws?.wins.find((w) => w.id === id)?.z ?? 1;
        return rect ? <IndicatorWindow key={id} id={id} rect={rect} z={z} size={geo.size} controller={controller} leader={leader} onAddIndicator={onAddIndicator} /> : null;
      })}
    </>
  );
}

function IndicatorWindow({ id, rect, z, size, controller, leader, onAddIndicator }: { id: string; rect: Rect; z: number; size: { w: number; h: number }; controller: IndicatorsController; leader: ChartEngine; onAddIndicator: (winId: string) => void }) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const engRef = useRef<ChartEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const getEngine = useCallback(() => engRef.current, []);

  /* the engine of this window: indicators only, the bars / view / crosshair of the price chart */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
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
  return (
    <WindowFrame
      id={id}
      controller={controller}
      rect={rect}
      size={size}
      z={z}
      title={t("win.title", { n: controller.windowNumber(id) })}
      actions={
        <>
          <button type="button" className={hbtn} title={t("win.addInd")} aria-label={t("win.addInd")} onClick={() => onAddIndicator(id)}>
            {IND_ICONS.plus(15)}
          </button>
          <button type="button" className={`${hbtn} hover:!text-red-500`} title={t("win.close")} aria-label={t("win.close")} onClick={() => controller.closeWindow(id)}>
            {IND_ICONS.close(14)}
          </button>
        </>
      }
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
