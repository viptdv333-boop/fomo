"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { DRAWING_GROUPS, getToolDef } from "@/lib/chart/drawings/tools";
import { DRAW_TEXT_DEFAULTS, setDrawTexts } from "@/lib/chart/drawings/tools-kit";
import { useT } from "@/lib/i18n/client";
import { DrawIcon } from "./icons";

export { DrawIcon };

/* ───────────── store hook ───────────── */

function useController(c: DrawingsControllerLike) {
  const ver = useRef(0);
  const subscribe = useCallback(
    (cb: () => void) =>
      c.subscribe(() => {
        ver.current += 1;
        cb();
      }),
    [c]
  );
  return useSyncExternalStore(
    subscribe,
    () => ver.current,
    () => 0
  );
}

type WithExtras = DrawingsControllerLike & {
  setLabels?: (l: Record<string, string>) => void;
  getCursorStyle?: () => string;
};

const LAST_KEY = "fomo-draw-last-v1";

function loadLast(): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const g of DRAWING_GROUPS) defaults[g.id] = g.tools[0].id;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    for (const g of DRAWING_GROUPS) {
      const v = (parsed as Record<string, unknown>)[g.id];
      if (typeof v === "string" && g.tools.some((t) => t.id === v)) defaults[g.id] = v;
    }
  } catch {
    /* storage unavailable */
  }
  return defaults;
}

const btnBase =
  "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent";
const btnActive = "bg-green-600/10 !text-green-600 dark:!text-green-500";
const ICON = 28; // glyph size on the 44px hit area

interface FlyoutState {
  groupId: string;
  left: number;
  top: number;
}

export default function DrawingToolbar({ controller, className }: { controller: DrawingsControllerLike; className?: string }) {
  const { t } = useT();
  useController(controller);
  const ctl = controller as WithExtras;

  const [last, setLast] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const g of DRAWING_GROUPS) d[g.id] = g.tools[0].id;
    return d;
  });
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const flyRef = useRef<HTMLDivElement | null>(null);

  // stored preferences are read after mount so server and client markup match
  useEffect(() => {
    const stored = loadLast();
    const cs = ctl.getCursorStyle?.();
    if (cs && DRAWING_GROUPS[0].tools.some((x) => x.id === cs)) stored[DRAWING_GROUPS[0].id] = cs;
    setLast(stored);
  }, [ctl]);

  // translated strings that drawings paint themselves (measure labels etc.)
  useEffect(() => {
    // strings painted by the extended tools (pattern captions, VWAP, POC ...)
    const texts: Record<string, string> = {};
    for (const k of Object.keys(DRAW_TEXT_DEFAULTS)) {
      const v = t(k);
      if (v && v !== k) texts[k] = v;
    }
    setDrawTexts(texts);
    ctl.setLabels?.({
      bars: t("draw.lbl.bars"),
      d: t("draw.lbl.d"),
      h: t("draw.lbl.h"),
      m: t("draw.lbl.m"),
      rr: t("draw.lbl.rr"),
      entry: t("draw.lbl.entry"),
      stop: t("draw.lbl.stop"),
      target: t("draw.lbl.target"),
      price: t("draw.lbl.price"),
      empty: t("draw.lbl.empty"),
    });
  }, [ctl, t]);

  // flyout: close on outside press and Escape
  useEffect(() => {
    if (!flyout) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (flyRef.current && target && flyRef.current.contains(target)) return;
      if (target instanceof Element && target.closest("[data-draw-caret]")) return;
      setFlyout(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFlyout(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [flyout]);

  useEffect(() => {
    // keyboard: move focus into the menu (the active tool when there is one)
    if (!flyout) return;
    const el = flyRef.current;
    if (!el) return;
    const target = el.querySelector<HTMLElement>('[aria-current="true"]') ?? el.querySelector<HTMLElement>('[role="menuitem"]');
    target?.focus({ preventScroll: false });
  }, [flyout]);

  useLayoutEffect(() => {
    // keep the flyout inside the viewport
    const el = flyRef.current;
    if (!flyout || !el) return;
    const r = el.getBoundingClientRect();
    const maxTop = window.innerHeight - r.height - 8;
    if (r.top > maxTop && maxTop > 0) el.style.top = `${maxTop}px`;
  }, [flyout]);

  const rememberTool = (groupId: string, toolId: string) => {
    setLast((prev) => {
      const next = { ...prev, [groupId]: toolId };
      try {
        localStorage.setItem(LAST_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const pickTool = (groupId: string, toolId: string) => {
    rememberTool(groupId, toolId);
    controller.setTool(toolId);
    setFlyout(null);
  };

  const openFlyout = (groupId: string, el: HTMLElement) => {
    if (flyout?.groupId === groupId) {
      setFlyout(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setFlyout({ groupId, left: r.right + 6, top: r.top });
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const items = Array.from(flyRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    let n = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") n = i < 0 ? 0 : (i + 1) % items.length;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") n = i <= 0 ? items.length - 1 : i - 1;
    else if (e.key === "Home") n = 0;
    else n = items.length - 1;
    e.preventDefault();
    items[n].focus();
  };

  const activeTool = controller.getTool();
  const magnet = controller.getMagnet();
  const stay = controller.getStayInDrawing();
  const lockedAll = controller.isLockedAll();
  const hidden = controller.isHidden();
  const flyGroup = flyout ? DRAWING_GROUPS.find((g) => g.id === flyout.groupId) : null;

  const nextMagnet = magnet === "off" ? "weak" : magnet === "weak" ? "strong" : "off";
  const magnetTitle = t(`draw.act.magnet.${magnet}`);

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("draw.toolbar")}
      className={`flex w-[52px] shrink-0 select-none flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden border-r border-gray-200 bg-white py-1.5 dark:border-gray-700 dark:bg-gray-900 ${className ?? ""}`}
      style={{ scrollbarWidth: "none" }}
    >
      {DRAWING_GROUPS.map((g) => {
        const lastId = last[g.id] ?? g.tools[0].id;
        const lastTool = g.tools.find((x) => x.id === lastId) ?? g.tools[0];
        const active = g.id === "cursors" ? activeTool === null : activeTool !== null && g.tools.some((x) => x.id === activeTool);
        const title = `${t(g.labelKey)}: ${t(lastTool.labelKey)}`;
        return (
          <div key={g.id} className="relative flex items-center">
            <button
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={active}
              className={`${btnBase} ${active ? btnActive : ""}`}
              onClick={() => {
                if (g.id !== "cursors" && activeTool !== null && g.tools.some((x) => x.id === activeTool)) controller.setTool(null);
                else controller.setTool(lastTool.id);
                setFlyout(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openFlyout(g.id, e.currentTarget);
              }}
            >
              <DrawIcon id={lastTool.id} size={ICON} />
            </button>
            <button
              type="button"
              data-draw-caret
              title={t("draw.moreTools")}
              aria-label={`${t(g.labelKey)}: ${t("draw.moreTools")}`}
              aria-haspopup="menu"
              aria-expanded={flyout?.groupId === g.id}
              className="absolute bottom-0 right-0 flex h-5 w-4 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200/70 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-gray-100"
              onClick={(e) => openFlyout(g.id, e.currentTarget.parentElement ?? e.currentTarget)}
            >
              <svg viewBox="0 0 8 8" width="7" height="7" aria-hidden="true">
                <path d="M1 2.5h6L4 6z" fill="currentColor" />
              </svg>
            </button>
          </div>
        );
      })}

      <div className="my-1 h-px w-7 shrink-0 bg-gray-200 dark:bg-gray-700" />

      <button
        type="button"
        title={t("draw.tool.measure")}
        aria-label={t("draw.tool.measure")}
        aria-pressed={activeTool === "measure"}
        className={`${btnBase} ${activeTool === "measure" ? btnActive : ""}`}
        onClick={() => controller.setTool(activeTool === "measure" ? null : "measure")}
      >
        <DrawIcon id="measureBtn" size={ICON} />
      </button>
      <button
        type="button"
        title={magnetTitle}
        aria-label={magnetTitle}
        aria-pressed={magnet !== "off"}
        className={`${btnBase} ${magnet !== "off" ? btnActive : ""}`}
        onClick={() => controller.setMagnet(nextMagnet)}
      >
        <DrawIcon id="magnet" size={ICON} />
        {magnet !== "off" && (
          <span className="pointer-events-none absolute bottom-1 right-1.5 flex gap-px">
            <span className="h-1 w-1 rounded-full bg-current" />
            {magnet === "strong" && <span className="h-1 w-1 rounded-full bg-current" />}
          </span>
        )}
      </button>
      <button
        type="button"
        title={stay ? t("draw.act.stay.on") : t("draw.act.stay")}
        aria-label={t("draw.act.stay")}
        aria-pressed={stay}
        className={`${btnBase} ${stay ? btnActive : ""}`}
        onClick={() => controller.setStayInDrawing(!stay)}
      >
        <DrawIcon id="stay" size={ICON} />
      </button>
      <button
        type="button"
        title={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-label={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-pressed={lockedAll}
        className={`${btnBase} ${lockedAll ? btnActive : ""}`}
        onClick={() => controller.setLockedAll(!lockedAll)}
      >
        <DrawIcon id={lockedAll ? "lock" : "unlock"} size={ICON} />
      </button>
      <button
        type="button"
        title={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-label={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-pressed={hidden}
        className={`${btnBase} ${hidden ? btnActive : ""}`}
        onClick={() => controller.setHidden(!hidden)}
      >
        <DrawIcon id={hidden ? "eyeOff" : "eye"} size={ICON} />
      </button>
      <button
        type="button"
        title={t("draw.act.removeAll")}
        aria-label={t("draw.act.removeAll")}
        className={`${btnBase} hover:!text-red-500`}
        onClick={() => {
          if (window.confirm(t("draw.act.removeConfirm"))) controller.removeAll();
        }}
      >
        <DrawIcon id="trash" size={ICON} />
      </button>

      <div className="mt-auto flex flex-col items-center gap-0.5 pt-1">
        <div className="mb-1 h-px w-7 shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" title={t("draw.act.undo")} aria-label={t("draw.act.undo")} disabled={!controller.canUndo()} className={btnBase} onClick={() => controller.undo()}>
          <DrawIcon id="undo" size={ICON} />
        </button>
        <button type="button" title={t("draw.act.redo")} aria-label={t("draw.act.redo")} disabled={!controller.canRedo()} className={btnBase} onClick={() => controller.redo()}>
          <DrawIcon id="redo" size={ICON} />
        </button>
      </div>

      {flyout && flyGroup && (
        <div
          ref={flyRef}
          role="menu"
          aria-label={t(flyGroup.labelKey)}
          style={{ position: "fixed", left: flyout.left, top: flyout.top }}
          onKeyDown={onMenuKey}
          className="z-[100] max-h-[calc(100vh-16px)] min-w-[250px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t(flyGroup.labelKey)}</div>
          {(flyGroup.sections ?? [{ id: "all", labelKey: flyGroup.labelKey, tools: flyGroup.tools }]).map((sec, si, all) => (
            <div key={sec.id} role="group" aria-label={t(sec.labelKey)}>
              {all.length > 1 && (
                <div className={`px-3 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-gray-400 ${si > 0 ? "mt-1 border-t border-gray-100 dark:border-gray-800" : ""}`}>
                  {t(sec.labelKey)}
                </div>
              )}
              {flyGroup.grid ? (
                <div className="grid grid-cols-6 gap-1 px-2 py-1.5">
                  {sec.tools.map((tool) => {
                    const isActive = activeTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        role="menuitem"
                        title={t(tool.labelKey)}
                        aria-label={t(tool.labelKey)}
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => pickTool(flyGroup.id, tool.id)}
                        className={`flex h-9 w-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 focus-visible:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800 ${
                          isActive ? "bg-green-600/10 !text-green-600 dark:!text-green-500" : ""
                        }`}
                      >
                        <DrawIcon id={tool.id} size={24} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                sec.tools.map((tool) => {
                  const isActive = flyGroup.id === "cursors" ? activeTool === null && (last[flyGroup.id] ?? "") === tool.id : activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      role="menuitem"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => pickTool(flyGroup.id, tool.id)}
                      className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-[13.5px] text-gray-700 hover:bg-gray-100 focus-visible:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800 ${
                        isActive ? "bg-green-600/10 !text-green-600 dark:!text-green-500" : ""
                      }`}
                    >
                      <DrawIcon id={tool.id} size={24} />
                      <span className="truncate">{t(tool.labelKey)}</span>
                    </button>
                  );
                })
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
