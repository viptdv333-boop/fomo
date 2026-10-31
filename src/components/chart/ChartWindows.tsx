"use client";

import { Component, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import { ChartEngine } from "@/lib/chart/engine";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { MIN_AREA_H, MIN_AREA_W, computeGeometry, isMulti, ratioAtPointer, windowIds, windowNumber } from "@/lib/chart/windows-layout";
import type { Divider, Geometry } from "@/lib/chart/windows-layout";
import IndicatorLegend from "./IndicatorLegend";
import { IND_ICONS } from "./icons";

/* Multi-window layout of the chart: the price chart plus any number of extra windows (tiles) with indicators. This file draws the extra tiles and
   the dividers between all tiles; the price chart keeps its own element in TradingChart and only gets its rectangle from here.
   Model: lib/chart/windows-layout.ts, indicators of a window: IndicatorsController, one shared time view and crosshair: ChartEngine.follow. */

/** Layout tree of the controller as React state (a new object after every change, so the snapshot is stable). */
function useLayout(controller: IndicatorsController) {
  const subscribe = useCallback((cb: () => void) => controller.subscribeLayout(cb), [controller]);
  return useSyncExternalStore(subscribe, () => controller.getLayout(), () => null);
}

/**
 * Tells the controller whether the chart area is wide enough for windows and returns where the tiles are (null: one chart, or too narrow for windows,
 * then the indicators keep the one stack of panes under the price chart as before).
 */
export function useWindowsGeometry(controller: IndicatorsController, areaRef: RefObject<HTMLElement | null>, enabled: boolean): { geo: Geometry | null; available: boolean } {
  const layout = useLayout(controller);
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
  const geo = useMemo(() => (available && layout && isMulti(layout) ? computeGeometry(layout, { x: 0, y: 0, w: size.w, h: size.h }) : null), [available, layout, size.w, size.h]);
  return { geo, available };
}

interface Props {
  controller: IndicatorsController;
  /** The engine of the price chart (null until it exists). */
  leader: ChartEngine | null;
  geo: Geometry | null;
  /** The «+» of a window: open the indicator catalog so that the next indicators land there. */
  onAddIndicator: (winId: string) => void;
  /** A tile failed to render: the windows are switched off for this session (the chart and the saved layout stay), see the parent. */
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
      <Tiles {...props} />
    </WindowsBoundary>
  );
}

function Tiles({ controller, leader, geo, onAddIndicator }: Props) {
  const layout = useLayout(controller);
  if (!geo || !leader || !layout) return null;
  return (
    <>
      {windowIds(layout).map((id) => {
        const rect = geo.tiles[id];
        return rect ? <WindowTile key={id} id={id} rect={rect} controller={controller} leader={leader} number={windowNumber(layout, id)} onAddIndicator={onAddIndicator} /> : null;
      })}
      {geo.dividers.map((d) => (
        <DividerBar key={d.path} d={d} controller={controller} />
      ))}
    </>
  );
}

/* ───────────── one extra window ───────────── */

const hbtn =
  "tv3-press pointer-events-auto flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-md text-[var(--tv3-text2)] hover:bg-gray-500/15 hover:text-[var(--tv3-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tv3-accent)]";

function svg(body: string) {
  return (
    <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={body} />
    </svg>
  );
}

function WindowTile({ id, rect, controller, leader, number, onAddIndicator }: { id: string; rect: { x: number; y: number; w: number; h: number }; controller: IndicatorsController; leader: ChartEngine; number: number; onAddIndicator: (winId: string) => void }) {
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
  const style: CSSProperties = { left: rect.x, top: rect.y, width: rect.w, height: rect.h };
  return (
    <div className="absolute z-[1] overflow-hidden bg-[var(--tv3-card)]" style={style} data-chart-window={id}>
      <div ref={hostRef} className="absolute inset-0" />
      <IndicatorLegend controller={controller} getEngine={getEngine} hostRef={hostRef} winId={id} ready={ready} />
      {empty && ready && <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-xs text-[var(--tv3-muted)]">{t("win.empty")}</div>}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-[26px] items-center justify-between pl-2.5 pr-1">
        <span className="select-none text-[11.5px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{t("win.title", { n: number })}</span>
        <span className="flex items-center gap-0.5 rounded-lg bg-[var(--tv3-glass)] px-[2px]">
          <button type="button" className={hbtn} title={t("win.addInd")} aria-label={t("win.addInd")} onClick={() => onAddIndicator(id)}>
            {IND_ICONS.plus(15)}
          </button>
          <button type="button" className={hbtn} title={t("win.splitRight")} aria-label={t("win.splitRight")} onClick={() => controller.addWindow("h", id)}>
            {svg("M4 5h16v14H4zM12 5v14")}
          </button>
          <button type="button" className={hbtn} title={t("win.splitDown")} aria-label={t("win.splitDown")} onClick={() => controller.addWindow("v", id)}>
            {svg("M4 5h16v14H4zM4 12h16")}
          </button>
          <button type="button" className={`${hbtn} hover:!text-red-500`} title={t("win.close")} aria-label={t("win.close")} onClick={() => controller.closeWindow(id)}>
            {IND_ICONS.close(14)}
          </button>
        </span>
      </div>
    </div>
  );
}

/* ───────────── divider between two tiles ───────────── */

function DividerBar({ d, controller }: { d: Divider; controller: IndicatorsController }) {
  const { t } = useT();
  const [active, setActive] = useState(false);
  const horiz = d.dir === "h";
  // the strip is thin, the grab area around it is wider (a finger needs more)
  const pad = 4;
  const style: CSSProperties = horiz
    ? { left: d.rect.x - pad, top: d.rect.y, width: d.rect.w + pad * 2, height: d.rect.h, cursor: "col-resize" }
    : { left: d.rect.x, top: d.rect.y - pad, width: d.rect.w, height: d.rect.h + pad * 2, cursor: "row-resize" };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    const area = (el.offsetParent ?? el.parentElement)?.getBoundingClientRect();
    if (!area) return;
    el.setPointerCapture(e.pointerId);
    setActive(true);
    // the whole chart re-lays out on every change: at most once per frame
    let raf = 0;
    let want = NaN;
    const move = (ev: PointerEvent) => {
      want = ratioAtPointer(d, horiz ? ev.clientX - area.left : ev.clientY - area.top);
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          controller.setSplitRatio(d.path, want, false);
        });
    };
    const done = () => {
      if (raf) cancelAnimationFrame(raf);
      if (isFinite(want)) controller.setSplitRatio(d.path, want, false);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", done);
      el.removeEventListener("pointercancel", done);
      setActive(false);
      controller.commitLayout();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", done);
    el.addEventListener("pointercancel", done);
  };

  return (
    <div
      role="separator"
      aria-orientation={horiz ? "vertical" : "horizontal"}
      title={t("win.resize")}
      className="group absolute z-[2] touch-none select-none"
      style={style}
      onPointerDown={onDown}
    >
      <div className={`absolute ${horiz ? "inset-y-0 left-1/2 w-[6px] -translate-x-1/2" : "inset-x-0 top-1/2 h-[6px] -translate-y-1/2"} transition-colors ${active ? "bg-[var(--tv3-accent)]" : "bg-[var(--tv3-fill2)] group-hover:bg-[var(--tv3-accent)]/60"}`} />
    </div>
  );
}
