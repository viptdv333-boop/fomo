"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { useT } from "@/lib/i18n/client";
import type { ChartEngine } from "@/lib/chart/engine";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { getIndicatorDef } from "@/lib/chart/indicators/registry";
import { setIndTranslator } from "@/lib/chart/indicators/ind-text";
import IndicatorEditor from "./IndicatorEditor";
import IndicatorSettingsDialog from "./IndicatorSettingsDialog";
import { IND_ICONS } from "./icons";

/* TradingView-like indicator legend: a React overlay at the top-left of the chart (under the symbol status line)
   and at the top of every indicator pane. Values follow the crosshair; row actions appear on hover (or on tap). */

const COLLAPSED_KEY = "fomo-ind-legend-collapsed";

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface Props {
  controller: IndicatorsController;
  getEngine: () => ChartEngine | null;
  /** The element the chart engine is mounted in (pointer events are read from it). */
  hostRef: RefObject<HTMLElement | null>;
  /** Distance from the top of the chart to the first indicator row, below the symbol / OHLC status line. */
  mainTop?: number;
}

export default function IndicatorLegend({ controller, getEngine, hostRef, mainTop = 46 }: Props) {
  const { t } = useT();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [menuUid, setMenuUid] = useState<string | null>(null);
  const [settingsUid, setSettingsUid] = useState<string | null>(null);
  const [editScript, setEditScript] = useState<string | null>(null);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [tops, setTops] = useState<Record<string, number>>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => setCollapsed(readCollapsed()), []);

  /* the canvas legend steps aside for the whole lifetime of this overlay */
  useEffect(() => {
    controller.setExternalLegend(true);
    return () => controller.setExternalLegend(false);
  }, [controller]);

  /* canvas / legend texts of the pattern indicators (Elliott waves) are translated through the same dictionary */
  useEffect(() => {
    setIndTranslator(t);
    getEngine()?.requestRedraw();
    tick();
  }, [t, getEngine]);

  /* pane positions */
  const measure = useCallback(() => {
    const eng = getEngine();
    if (!eng) return;
    const next: Record<string, number> = {};
    for (const inst of controller.list()) {
      const pid = controller.paneOf(inst.uid);
      if (pid === "main" || next[pid] !== undefined) continue;
      const r = eng.getPaneRect(pid);
      if (r) next[pid] = r.top;
    }
    setTops((prev) => {
      const a = Object.keys(prev);
      const b = Object.keys(next);
      if (a.length === b.length && b.every((k) => prev[k] === next[k])) return prev;
      return next;
    });
  }, [controller, getEngine]);

  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(raf.current);
    // two frames: the engine lays its panes out in its own animation frame
    raf.current = requestAnimationFrame(() => {
      raf.current = requestAnimationFrame(measure);
    });
  }, [measure]);

  /* redraw on structure changes and when the values change */
  useEffect(() => {
    let pending = 0;
    const onData = () => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        tick();
      });
    };
    const offA = controller.subscribe(() => {
      onData();
      scheduleMeasure();
    });
    const offB = controller.subscribeData(onData);
    scheduleMeasure();
    return () => {
      offA();
      offB();
      cancelAnimationFrame(pending);
      cancelAnimationFrame(raf.current);
    };
  }, [controller, scheduleMeasure]);

  /* crosshair bar + geometry changes, read from the chart host's pointer events */
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const idxAt = (e: PointerEvent): number | null => {
      const eng = getEngine();
      if (!eng) return null;
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left - eng.getPlotOffsetX();
      const y = e.clientY - r.top;
      const { width, height } = eng.getPlotSize();
      if (x < 0 || y < 0 || x > width || y > height) return null;
      const n = eng.getCandles().length;
      if (n === 0) return null;
      return Math.max(0, Math.min(n - 1, Math.round(eng.xToIndex(x))));
    };
    const onMove = (e: PointerEvent) => {
      setHoverIdx(idxAt(e));
      if (e.buttons) scheduleMeasure();
    };
    const onLeave = (e: PointerEvent) => {
      const rt = e.relatedTarget as Node | null;
      if (rt && rootRef.current?.contains(rt)) return;
      setHoverIdx(null);
    };
    const onUp = () => scheduleMeasure();
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerleave", onLeave);
    host.addEventListener("pointerup", onUp);
    host.addEventListener("wheel", onUp, { passive: true });
    const ro = new ResizeObserver(scheduleMeasure);
    ro.observe(host);
    return () => {
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerup", onUp);
      host.removeEventListener("wheel", onUp);
      ro.disconnect();
    };
  }, [hostRef, getEngine, scheduleMeasure]);

  /* close the "more" menu on outside click / Escape */
  useEffect(() => {
    if (!menuUid) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuUid(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenuUid(null);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", key);
    };
  }, [menuUid]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  const eng = getEngine();
  const n = eng ? eng.getCandles().length : 0;
  const index = n === 0 ? 0 : hoverIdx === null ? n - 1 : Math.min(n - 1, hoverIdx);
  const list = controller.list();

  const groups = new Map<string, string[]>();
  for (const inst of list) {
    const pid = controller.paneOf(inst.uid);
    const arr = groups.get(pid);
    if (arr) arr.push(inst.uid);
    else groups.set(pid, [inst.uid]);
  }

  const btn =
    "flex h-[18px] w-[18px] items-center justify-center rounded text-gray-500 hover:bg-gray-500/15 hover:text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff] dark:text-gray-400 dark:hover:text-white";

  const renderRow = (uid: string) => {
    const info = controller.legendInfo(uid, index);
    const inst = list.find((i) => i.uid === uid);
    if (!info || !inst) return null;
    const dim = !info.visible || info.tfHidden;
    const active = activeUid === uid || menuUid === uid;
    const move = controller.canMove(uid);
    const inOwn = info.pane !== "main";
    return (
      <div key={uid} className="relative pointer-events-auto">
        <div
          className={`group inline-flex max-w-full flex-wrap items-center gap-x-1.5 rounded px-1 py-[1px] text-[12px] leading-[16px] hover:bg-white/70 dark:hover:bg-[#1e222d]/80 ${dim ? "opacity-55" : ""}`}
          onClick={(e) => {
            // tap on touch screens reveals the actions
            if ((e.target as HTMLElement).closest("button")) return;
            setActiveUid((a) => (a === uid ? null : uid));
          }}
          title={info.tfHidden ? t("ind2.lg.tfHidden") : info.tip}
        >
          <span className="truncate font-medium" style={{ color: "var(--ind-legend-title, #787b86)" }}>
            {info.title}
          </span>
          {info.error && (
            <span
              className="inline-flex h-[14px] w-[14px] shrink-0 cursor-help items-center justify-center rounded-full bg-red-500 text-[10px] font-bold leading-none text-white"
              title={`${t("isc.badge.error")}: ${info.error}`}
              role="img"
              aria-label={`${t("isc.badge.error")}: ${info.error}`}
            >
              !
            </span>
          )}
          {info.pending && !info.error && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" title={t("isc.badge.pending")} aria-label={t("isc.badge.pending")} />}
          {!dim &&
            info.items.map((it, i) => (
              <span key={i} className="whitespace-nowrap tabular-nums" style={{ color: it.color }}>
                {it.text}
              </span>
            ))}
          <span className={`items-center gap-0.5 ${active ? "flex" : "hidden group-hover:flex group-focus-within:flex"}`}>
            <button type="button" className={btn} title={info.visible ? t("ind.hide") : t("ind.show")} aria-label={info.visible ? t("ind.hide") : t("ind.show")} onClick={() => controller.update(uid, { visible: !info.visible })}>
              {info.visible ? IND_ICONS.eye(14) : IND_ICONS.eyeOff(14)}
            </button>
            <button type="button" className={btn} title={t("ind.settings")} aria-label={t("ind.settings")} onClick={() => setSettingsUid(uid)}>
              {IND_ICONS.gear(14)}
            </button>
            <button
              type="button"
              className={`${btn} ${menuUid === uid ? "bg-gray-500/15" : ""}`}
              title={t("ind2.lg.more")}
              aria-label={t("ind2.lg.more")}
              aria-expanded={menuUid === uid}
              onClick={() => setMenuUid((m) => (m === uid ? null : uid))}
            >
              {IND_ICONS.more(14)}
            </button>
            <button type="button" className={`${btn} hover:!text-red-500`} title={t("ind.remove")} aria-label={t("ind.remove")} onClick={() => controller.remove(uid)}>
              {IND_ICONS.close(13)}
            </button>
          </span>
        </div>
        {menuUid === uid && (
          <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 text-xs text-gray-800 shadow-xl dark:border-[#2a2e39] dark:bg-[#1e222d] dark:text-gray-200">
            <MenuItem
              icon={IND_ICONS.gear(14)}
              label={t("ind2.lg.settings")}
              onClick={() => {
                setMenuUid(null);
                setSettingsUid(uid);
              }}
            />
            <MenuItem
              icon={IND_ICONS.copy(14)}
              label={t("ind2.lg.clone")}
              onClick={() => {
                setMenuUid(null);
                controller.clone(uid);
              }}
            />
            {move && (
              <MenuItem
                icon={IND_ICONS.pane(14)}
                label={inOwn ? t("ind2.lg.moveMain") : t("ind2.lg.moveOwn")}
                onClick={() => {
                  setMenuUid(null);
                  controller.move(uid, inOwn ? "main" : "own");
                }}
              />
            )}
            {getIndicatorDef(inst.id)?.script && (
              <MenuItem
                icon={IND_ICONS.template(14)}
                label={t("isc.editSource")}
                onClick={() => {
                  setMenuUid(null);
                  setEditScript(inst.id);
                }}
              />
            )}
            <MenuItem
              icon={info.visible ? IND_ICONS.eyeOff(14) : IND_ICONS.eye(14)}
              label={info.visible ? t("ind.hide") : t("ind.show")}
              onClick={() => {
                setMenuUid(null);
                controller.update(uid, { visible: !info.visible });
              }}
            />
            <div className="my-1 h-px bg-gray-200 dark:bg-[#2a2e39]" />
            <MenuItem
              icon={IND_ICONS.trash(14)}
              label={t("ind.remove")}
              danger
              onClick={() => {
                setMenuUid(null);
                controller.remove(uid);
              }}
            />
          </div>
        )}
      </div>
    );
  };

  const mainUids = groups.get("main") ?? [];
  const others = Array.from(groups.entries()).filter(([pid]) => pid !== "main");

  return (
    <>
      <div ref={rootRef} className="pointer-events-none absolute inset-0 z-20 select-none overflow-hidden text-gray-700 dark:text-gray-300 [--ind-legend-title:#787b86]">
        {mainUids.length > 0 && (
          <div className="absolute left-2 flex max-w-[calc(100%-80px)] flex-col items-start gap-[1px]" style={{ top: mainTop }}>
            {!collapsed && mainUids.map(renderRow)}
            {/* TradingView style: the arrow sits under the list; collapsed it shows how many indicators are hidden */}
            <div className="pointer-events-auto mt-0.5 flex items-center">
              <button
                type="button"
                onClick={toggleCollapsed}
                className="flex h-[22px] items-center gap-1 rounded-md border border-gray-300 bg-white/85 px-1.5 text-[11px] text-gray-600 shadow-sm hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#2962ff] dark:border-[#2a2e39] dark:bg-[#1e222d]/90 dark:text-gray-300 dark:hover:bg-[#2a2e39] dark:hover:text-white"
                aria-expanded={!collapsed}
                title={collapsed ? t("ind2.lg.expand") : t("ind2.lg.collapse")}
                aria-label={collapsed ? t("ind2.lg.expand") : t("ind2.lg.collapse")}
              >
                {collapsed ? IND_ICONS.chevronDown(14) : IND_ICONS.chevronUp(14)}
                {collapsed && <span>{t("ind2.lg.count", { n: mainUids.length })}</span>}
              </button>
            </div>
          </div>
        )}
        {others.map(([pid, uids]) =>
          tops[pid] === undefined ? null : (
            <div key={pid} className="absolute left-2 flex max-w-[calc(100%-80px)] flex-col items-start gap-[1px]" style={{ top: tops[pid] + 5 }}>
              {uids.map(renderRow)}
            </div>
          ),
        )}
      </div>
      <IndicatorSettingsDialog controller={controller} uid={settingsUid} onClose={() => setSettingsUid(null)} onEditSource={setEditScript} />
      <IndicatorEditor controller={controller} scriptId={editScript} onClose={() => setEditScript(null)} />
    </>
  );
}

function MenuItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-gray-100 focus:bg-gray-100 focus:outline-none dark:hover:bg-[#2a2e39] dark:focus:bg-[#2a2e39] ${danger ? "text-red-600 dark:text-red-400" : ""}`}
    >
      <span className="text-gray-500 dark:text-gray-400">{icon}</span>
      {label}
    </button>
  );
}
