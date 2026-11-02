"use client";

import { Fragment, useEffect, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n/client";
import type { ChartEngine } from "@/lib/chart/engine";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { WIN_PREFIX } from "@/lib/chart/windows-layout";
import { DRAWING_GROUPS } from "@/lib/chart/drawings/tools";
import { useBackLayer } from "@/components/app/useBackLayer";
import { DrawIcon } from "./icons";
import IndicatorSettingsDialog from "./IndicatorSettingsDialog";
import MacSvg from "./MacSvg";
import { RAIL_GLYPHS, type Glyph } from "./mac-glyph-data";

/* The bottom sheet «Инструменты и индикаторы» of the phone version of the macOS look (design "FOMO Terminal Mobile", screen 3). It runs the SAME
   controllers as the classic drawing rail and indicator legend (DrawingToolbar.tsx / IndicatorLegend.tsx): every tile does what its classic twin does. */

const LAST_KEY = "fomo-draw-last-v1"; // the classic rail's «last tool of each group» (shared, so both looks agree)

function readLast(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const g of DRAWING_GROUPS) out[g.id] = g.tools[0].id;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_KEY) || "null");
    if (parsed && typeof parsed === "object") {
      for (const g of DRAWING_GROUPS) {
        const v = (parsed as Record<string, unknown>)[g.id];
        if (typeof v === "string" && g.tools.some((x) => x.id === v)) out[g.id] = v;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

interface Slot {
  key: string; // RAIL_GLYPHS key
  label: string; // i18n key
  group: string;
  fixed?: string;
}

/** The twelve tools of the design, in its order, bound to the classic rail's slots. */
const SLOTS: Slot[] = [
  { key: "lines", label: "mac.t.line", group: "lines" },
  { key: "fib", label: "mac.t.levels", group: "fib" },
  { key: "patterns", label: "mac.t.patterns", group: "patterns" },
  { key: "text", label: "mac.t.text", group: "text" },
  { key: "rect", label: "mac.t.shapes", group: "shapes", fixed: "rect" },
  { key: "brush", label: "mac.t.brush", group: "shapes", fixed: "brush" },
  { key: "measure", label: "mac.t.ruler", group: "forecast", fixed: "measure" },
  { key: "stamps", label: "mac.t.fav", group: "stamps" },
];
/** What the design has no tile for but the classic rail has: a row of smaller buttons so nothing is lost. */
const EXTRA: Slot[] = [
  { key: "hline", label: "mac.t.hline", group: "lines", fixed: "hline" },
  { key: "forecast", label: "mac.t.forecast", group: "forecast" },
  { key: "cursors", label: "mac.t.cursor", group: "cursors" },
];

const glyph = (k: string): Glyph => RAIL_GLYPHS[k] ?? RAIL_GLYPHS.cursors;

function Svg({ k, size, alpha }: { k: string; size: number; alpha?: string }) {
  const [light, stroke, d, fl] = glyph(k);
  return <MacSvg d={d} fl={fl} light={light} stroke={stroke} size={size} alpha={alpha} width={size > 30 ? 1.6 : 1.7} />;
}

interface Props {
  seg: "tools" | "inds" | null;
  onSeg: (s: "tools" | "inds") => void;
  onClose: () => void;
  drawings: DrawingsControllerLike;
  indicators: IndicatorsController;
  getEngine: () => ChartEngine | null;
  onAddIndicator: () => void;
}

export default function AppMacSheet(props: Props) {
  if (props.seg === null || typeof document === "undefined") return null;
  return createPortal(<Sheet {...props} seg={props.seg} />, document.body);
}

function Sheet({ seg, onSeg, onClose, drawings, indicators, getEngine, onAddIndicator }: Omit<Props, "seg"> & { seg: "tools" | "inds" }) {
  const { t } = useT();
  useBackLayer(true, onClose);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const [last, setLast] = useState<Record<string, string>>(() => readLast());
  const [group, setGroup] = useState<string | null>(null);
  const [settingsUid, setSettingsUid] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ y: number; id: number } | null>(null);

  // the controllers change under the sheet (a tool picked, an indicator toggled, a value moved): redraw
  useEffect(() => {
    const a = drawings.subscribe(() => tick());
    const b = indicators.subscribe(() => tick());
    const c = indicators.subscribeData(() => tick());
    return () => {
      a();
      b();
      c();
    };
  }, [drawings, indicators]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !settingsUid) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, settingsUid]);

  const activeTool = drawings.getTool();
  const magnet = drawings.getMagnet();
  const stay = drawings.getStayInDrawing();
  const lockedAll = drawings.isLockedAll();
  const hidden = drawings.isHidden();
  const slotTools = new Set(SLOTS.concat(EXTRA).filter((s) => s.fixed).map((s) => s.fixed as string));
  const groupOf = (id: string) => DRAWING_GROUPS.find((g) => g.id === id);

  const remember = (gid: string, tid: string) => {
    setLast((prev) => {
      const next = { ...prev, [gid]: tid };
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const isActive = (s: Slot): boolean => {
    const g = groupOf(s.group);
    if (!g) return false;
    if (s.fixed) return activeTool === s.fixed;
    if (g.id === "cursors") return activeTool === null;
    return activeTool !== null && g.tools.some((x) => x.id === activeTool) && !slotTools.has(activeTool);
  };
  const press = (s: Slot) => {
    const g = groupOf(s.group);
    if (!g) return;
    const shown = s.fixed ?? last[g.id] ?? g.tools[0].id;
    if (g.id !== "cursors" && isActive(s)) {
      drawings.setTool(null);
      return;
    }
    drawings.setTool(shown);
    onClose(); // the tool is armed: the chart is free to draw on
  };
  const pickFromGroup = (gid: string, toolId: string) => {
    remember(gid, toolId);
    drawings.setTool(toolId);
    setGroup(null);
    onClose();
  };

  const info = indicators.list().filter((i) => !indicators.paneOf(i.uid).startsWith(WIN_PREFIX));
  const n = getEngine()?.getCandles().length ?? 0;
  const idx = Math.max(0, n - 1);

  const tile = (s: Slot, small = false) => {
    const on = isActive(s);
    const [, stroke] = glyph(s.key);
    const g = groupOf(s.group);
    const many = !s.fixed && !!g && g.tools.length > 1 && g.id !== "cursors";
    return (
      <div key={s.key} className="app-mac-tool" data-small={small ? "1" : undefined}>
        <button
          type="button"
          className="app-mac-tool-b"
          aria-pressed={on}
          aria-label={t(s.label)}
          style={{ background: on ? `${stroke}24` : undefined }}
          onClick={() => press(s)}
          onContextMenu={(e) => {
            if (!many) return;
            e.preventDefault();
            setGroup(s.group);
          }}
        >
          <Svg k={s.key} size={small ? 30 : 48} />
          {many && !small && (
            <span
              role="button"
              tabIndex={0}
              className="app-mac-caret"
              aria-label={`${t(s.label)}: ${t("mac.m.moreTools")}`}
              onClick={(e) => {
                e.stopPropagation();
                setGroup(s.group);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  setGroup(s.group);
                }
              }}
            >
              <svg viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
                <path d="M1 2.5h6L4 6z" fill="currentColor" />
              </svg>
            </span>
          )}
        </button>
        <span className="app-mac-tool-l">{t(s.label)}</span>
      </div>
    );
  };

  const act = (key: string, label: string, on: boolean, run: () => void, disabled = false) => {
    const [, stroke] = glyph(key);
    return (
      <div key={key} className="app-mac-tool">
        <button type="button" className="app-mac-tool-b" aria-pressed={on} aria-label={t(label)} disabled={disabled} style={{ background: on ? `${stroke}24` : undefined, opacity: disabled ? 0.4 : undefined }} onClick={run}>
          <Svg k={key} size={48} />
          {key === "magnet" && magnet !== "off" && (
            <span className="app-mac-dots" aria-hidden="true">
              <i />
              {magnet === "strong" && <i />}
            </span>
          )}
        </button>
        <span className="app-mac-tool-l">{t(label)}</span>
      </div>
    );
  };

  const indRows = (
    <div className="app-mac-inds">
      {info.length === 0 && <div className="app-mac-empty">{t("mac.m.noInds")}</div>}
      {info.map((inst) => {
        const li = indicators.legendInfo(inst.uid, idx);
        if (!li) return null;
        const col = li.items.find((it) => it.color)?.color ?? "var(--m-tx3)";
        const val = li.items[0]?.text ?? "";
        return (
          <div key={inst.uid} className="app-mac-ind" data-off={li.visible ? undefined : "1"}>
            <span className="app-mac-ind-dot" style={{ background: col }} />
            <button type="button" className="app-mac-ind-n" onClick={() => setSettingsUid(inst.uid)} title={t("ind.settings")}>
              {li.title}
            </button>
            <span className="app-mac-ind-v">{li.visible ? val : ""}</span>
            <button type="button" className="app-mac-sw" role="switch" aria-checked={li.visible} aria-label={li.visible ? t("ind.hide") : t("ind.show")} onClick={() => indicators.update(inst.uid, { visible: !li.visible })}>
              <i />
            </button>
            <button type="button" className="app-mac-ind-x" aria-label={t("ind.remove")} title={t("ind.remove")} onClick={() => indicators.remove(inst.uid)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
  const indTitle = <div className="app-mac-h">{t("mac.m.indsN", { n: info.length })}</div>;

  const flyGroup = group ? groupOf(group) : null;

  return (
    <div className="app-mac-sheet-wrap" role="dialog" aria-modal="true" aria-label={t("mac.m.sheet")} data-app-mac-sheet>
      <div className="app-mac-back" onClick={onClose} />
      <div className="app-mac-sheet" style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}>
        <div
          className="app-mac-grip"
          onPointerDown={(e) => {
            drag.current = { y: e.clientY, id: e.pointerId };
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* pointer already gone */
            }
          }}
          onPointerMove={(e) => {
            if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.y));
          }}
          onPointerUp={() => {
            const far = dragY > 90;
            drag.current = null;
            setDragY(0);
            if (far) onClose();
          }}
          onPointerCancel={() => {
            drag.current = null;
            setDragY(0);
          }}
        >
          <i />
        </div>
        <div className="app-mac-segc" role="tablist">
          <button type="button" role="tab" aria-selected={seg === "tools"} data-on={seg === "tools" ? "1" : undefined} onClick={() => onSeg("tools")}>
            {t("mac.m.segTools")}
          </button>
          <button type="button" role="tab" aria-selected={seg === "inds"} data-on={seg === "inds" ? "1" : undefined} onClick={() => onSeg("inds")}>
            {t("mac.m.segInds")}
          </button>
        </div>
        <div className="app-mac-sbody">
          {seg === "tools" && !flyGroup && (
            <Fragment>
              <div className="app-mac-grid">
                {SLOTS.map((s) => tile(s))}
                {act("magnet", "mac.t.magnet", magnet !== "off", () => drawings.setMagnet(magnet === "off" ? "weak" : magnet === "weak" ? "strong" : "off"))}
                {act("lock", "mac.t.lock", lockedAll, () => drawings.setLockedAll(!lockedAll))}
                {act("eye", "mac.t.eye", hidden, () => drawings.setHidden(!hidden))}
                {act("trash", "mac.t.trash", false, () => {
                  if (window.confirm(t("draw.act.removeConfirm"))) drawings.removeAll();
                })}
              </div>
              <div className="app-mac-xrow">
                {EXTRA.map((s) => tile(s, true))}
                <div className="app-mac-tool" data-small="1">
                  <button type="button" className="app-mac-tool-b" aria-pressed={stay} aria-label={t("mac.t.stay")} style={{ background: stay ? `${glyph("stay")[1]}24` : undefined }} onClick={() => drawings.setStayInDrawing(!stay)}>
                    <Svg k="stay" size={30} />
                  </button>
                  <span className="app-mac-tool-l">{t("mac.t.stay")}</span>
                </div>
                <div className="app-mac-tool" data-small="1">
                  <button type="button" className="app-mac-tool-b" aria-label={t("mac.lbl.back")} disabled={!drawings.canUndo()} onClick={() => drawings.undo()}>
                    <Svg k="undo" size={30} />
                  </button>
                  <span className="app-mac-tool-l">{t("mac.lbl.back")}</span>
                </div>
                <div className="app-mac-tool" data-small="1">
                  <button type="button" className="app-mac-tool-b" aria-label={t("mac.lbl.forward")} disabled={!drawings.canRedo()} onClick={() => drawings.redo()}>
                    <Svg k="redo" size={30} />
                  </button>
                  <span className="app-mac-tool-l">{t("mac.lbl.forward")}</span>
                </div>
              </div>
              {indTitle}
              {indRows}
            </Fragment>
          )}
          {seg === "tools" && flyGroup && (
            <div className="app-mac-fly" role="menu" aria-label={t(flyGroup.labelKey)}>
              <button type="button" className="app-mac-fly-back" onClick={() => setGroup(null)}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
                {t(flyGroup.labelKey)}
              </button>
              <div className="app-mac-fly-list">
                {(flyGroup.sections ?? [{ id: "all", labelKey: flyGroup.labelKey, tools: flyGroup.tools }]).map((sec, si, all) => (
                  <div key={sec.id} role="group" aria-label={t(sec.labelKey)}>
                    {all.length > 1 && <div className="app-mac-fly-sec">{t(sec.labelKey)}</div>}
                    <div className={flyGroup.grid ? "app-mac-fly-grid" : undefined}>
                      {sec.tools.map((tool) => {
                        const on = flyGroup.id === "cursors" ? activeTool === null && (last[flyGroup.id] ?? "") === tool.id : activeTool === tool.id;
                        return (
                          <button key={tool.id} type="button" role="menuitem" className="app-mac-fly-i" data-on={on ? "1" : undefined} aria-current={on ? "true" : undefined} title={t(tool.labelKey)} aria-label={t(tool.labelKey)} onClick={() => pickFromGroup(flyGroup.id, tool.id)}>
                            <DrawIcon id={tool.id} size={24} filled={on} />
                            {!flyGroup.grid && <span>{t(tool.labelKey)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {seg === "inds" && (
            <Fragment>
              {indTitle}
              {indRows}
              <button type="button" className="app-mac-add" onClick={onAddIndicator}>
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 6v12M6 12h12" />
                </svg>
                {t("mac.m.addInd")}
              </button>
            </Fragment>
          )}
        </div>
      </div>
      <IndicatorSettingsDialog controller={indicators} uid={settingsUid} onClose={() => setSettingsUid(null)} />
    </div>
  );
}
