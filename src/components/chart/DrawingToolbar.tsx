"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
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

// Terminal v3 / iOS rail: 48px-wide rounded-xl buttons (size rules in terminal-v3.css: design 36px, +15%, +15%) on a 66px card;
// active = tinted green rounded square with the FILLED glyph variant (iOS tab-bar convention)
const btnBase =
  "tv3-rbtn tv3-press tv3-hov relative flex shrink-0 cursor-pointer items-center justify-center text-[var(--tv3-text2)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";
const btnActive = "bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)] hover:!bg-[var(--tv3-accent-soft)] active:!bg-[var(--tv3-accent-soft)]";
const ICON = 26; // glyph size (the CSS of .tv3-rbtn svg wins: 26px, 23px on short screens)
const GAP = <span className="tv3-rgap" />;

/** Rail order of the design: cursor, trend, horizontal line, fib, (extra pattern / forecast groups), rectangle, brush, text, ruler, star, then the actions.
 *  `fixed` = a slot bound to one tool (its group flyout opens from the caret / right click), otherwise the slot shows the last tool used of the group. */
const RAIL: { key: string; group: string; fixed?: string; noMenu?: boolean }[] = [
  { key: "cursors", group: "cursors" },
  { key: "lines", group: "lines" },
  { key: "hline", group: "lines", fixed: "hline" },
  { key: "fib", group: "fib" },
  { key: "patterns", group: "patterns" },
  { key: "forecast", group: "forecast" },
  { key: "rect", group: "shapes", fixed: "rect" },
  { key: "brush", group: "shapes", fixed: "brush" },
  { key: "text", group: "text" },
  { key: "measure", group: "forecast", fixed: "measure", noMenu: true },
  { key: "stamps", group: "stamps" },
];

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
    // anchored to the right edge of the rail card (the rail is wider than its buttons)
    const rail = el.closest('[role="toolbar"]')?.getBoundingClientRect();
    setFlyout({ groupId, left: Math.max(r.right, rail?.right ?? 0) + 6, top: r.top });
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

  // tools that own a rail slot of their own (design: horizontal line, rectangle, brush, ruler); their group slot is not lit for them
  const slotTools = new Set(RAIL.filter((r) => r.fixed).map((r) => r.fixed as string));
  const groupOf = (id: string) => DRAWING_GROUPS.find((g) => g.id === id);

  return (
    <div
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("draw.toolbar")}
      className={`flex w-[66px] shrink-0 select-none flex-col items-center overflow-y-auto overflow-x-hidden rounded-2xl bg-[var(--tv3-card)] py-1.5 ${className ?? ""}`}
      style={{ scrollbarWidth: "none" }}
    >
      {/* icons are spread evenly over the card height: flexible spacers shrink to 2px on short screens and the rail scrolls */}
      {GAP}
      {RAIL.map((slot) => {
        const g = groupOf(slot.group);
        if (!g) return null;
        const lastId = last[g.id] ?? g.tools[0].id;
        const lastTool = g.tools.find((x) => x.id === lastId) ?? g.tools[0];
        const shown = slot.fixed ?? lastTool.id;
        const toolDef = slot.fixed ? { id: slot.fixed, labelKey: `draw.tool.${slot.fixed}` } : lastTool;
        const active = slot.fixed
          ? activeTool === slot.fixed
          : g.id === "cursors"
            ? activeTool === null
            : activeTool !== null && g.tools.some((x) => x.id === activeTool) && !slotTools.has(activeTool);
        const title = slot.fixed ? t(toolDef.labelKey) : `${t(g.labelKey)}: ${t(lastTool.labelKey)}`;
        // the star slot (design: favourites) shows the outlined star until another stamp is picked
        const iconId = slot.group === "stamps" && !slot.fixed ? (lastTool.id === g.tools[0].id ? "stamp_star" : lastTool.id) : shown;
        return (
          <Fragment key={slot.key}>
          <div className="group/slot relative flex shrink-0 items-center">
            <button
              type="button"
              title={title}
              aria-label={title}
              aria-pressed={active}
              className={`${btnBase} ${active ? btnActive : ""}`}
              onClick={() => {
                const inGroup = slot.fixed ? activeTool === slot.fixed : activeTool !== null && g.tools.some((x) => x.id === activeTool) && !slotTools.has(activeTool);
                if (g.id !== "cursors" && inGroup) controller.setTool(null);
                else controller.setTool(shown);
                setFlyout(null);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                openFlyout(g.id, e.currentTarget);
              }}
            >
              <DrawIcon id={iconId} size={ICON} filled={active} />
            </button>
            {!slot.noMenu && (
              <button
                type="button"
                data-draw-caret
                title={t("draw.moreTools")}
                aria-label={`${t(g.labelKey)}: ${t("draw.moreTools")}`}
                aria-haspopup="menu"
                aria-expanded={flyout?.groupId === g.id}
                className="absolute -bottom-px -right-1 flex h-4 w-3.5 items-center justify-center rounded-md text-[var(--tv3-muted)] opacity-0 transition-opacity hover:bg-[var(--tv3-fill2)] hover:text-[var(--tv3-text)] focus-visible:opacity-100 group-hover/slot:opacity-100"
                onClick={(e) => openFlyout(g.id, e.currentTarget.parentElement ?? e.currentTarget)}
              >
                <svg viewBox="0 0 8 8" width="7" height="7" aria-hidden="true">
                  <path d="M1 2.5h6L4 6z" fill="currentColor" />
                </svg>
              </button>
            )}
          </div>
          {GAP}
          </Fragment>
        );
      })}

      <button
        type="button"
        title={magnetTitle}
        aria-label={magnetTitle}
        aria-pressed={magnet !== "off"}
        className={`${btnBase} ${magnet !== "off" ? btnActive : ""}`}
        onClick={() => controller.setMagnet(nextMagnet)}
      >
        <DrawIcon id="magnet" size={ICON} filled={magnet !== "off"} />
        {magnet !== "off" && (
          <span className="pointer-events-none absolute bottom-1 right-1.5 flex gap-px">
            <span className="h-1 w-1 rounded-full bg-current" />
            {magnet === "strong" && <span className="h-1 w-1 rounded-full bg-current" />}
          </span>
        )}
      </button>
      {GAP}
      <button
        type="button"
        title={stay ? t("draw.act.stay.on") : t("draw.act.stay")}
        aria-label={t("draw.act.stay")}
        aria-pressed={stay}
        className={`${btnBase} ${stay ? btnActive : ""}`}
        onClick={() => controller.setStayInDrawing(!stay)}
      >
        <DrawIcon id="stay" size={ICON} filled={stay} />
      </button>
      {GAP}
      <button
        type="button"
        title={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-label={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-pressed={lockedAll}
        className={`${btnBase} ${lockedAll ? btnActive : ""}`}
        onClick={() => controller.setLockedAll(!lockedAll)}
      >
        <DrawIcon id={lockedAll ? "lock" : "unlock"} size={ICON} filled={lockedAll} />
      </button>
      {GAP}
      <button
        type="button"
        title={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-label={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-pressed={hidden}
        className={`${btnBase} ${hidden ? btnActive : ""}`}
        onClick={() => controller.setHidden(!hidden)}
      >
        <DrawIcon id={hidden ? "eyeOff" : "eye"} size={ICON} filled={hidden} />
      </button>
      {GAP}
      <button
        type="button"
        title={t("draw.act.removeAll")}
        aria-label={t("draw.act.removeAll")}
        className={`${btnBase} hover:!text-[var(--tv3-red)]`}
        onClick={() => {
          if (window.confirm(t("draw.act.removeConfirm"))) controller.removeAll();
        }}
      >
        <DrawIcon id="trash" size={ICON} />
      </button>
      {GAP}

      <button type="button" title={t("draw.act.undo")} aria-label={t("draw.act.undo")} disabled={!controller.canUndo()} className={btnBase} onClick={() => controller.undo()}>
        <DrawIcon id="undo" size={ICON} />
      </button>
      {GAP}
      <button type="button" title={t("draw.act.redo")} aria-label={t("draw.act.redo")} disabled={!controller.canRedo()} className={btnBase} onClick={() => controller.redo()}>
        <DrawIcon id="redo" size={ICON} />
      </button>
      {GAP}

      {flyout && flyGroup && (
        <div
          ref={flyRef}
          role="menu"
          aria-label={t(flyGroup.labelKey)}
          style={{ position: "fixed", left: flyout.left, top: flyout.top }}
          onKeyDown={onMenuKey}
          className="tv3-pop z-[100] max-h-[calc(100vh-16px)] min-w-[276px] overflow-y-auto rounded-2xl py-1.5 text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        >
          <div className="px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]">{t(flyGroup.labelKey)}</div>
          {(flyGroup.sections ?? [{ id: "all", labelKey: flyGroup.labelKey, tools: flyGroup.tools }]).map((sec, si, all) => (
            <div key={sec.id} role="group" aria-label={t(sec.labelKey)}>
              {all.length > 1 && (
                <div className={`px-3.5 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)] ${si > 0 ? "mt-1 border-t border-[var(--tv3-hair2)]" : ""}`}>
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
                        className={`tv3-press tv3-hov flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl text-[var(--tv3-text2)] focus-visible:bg-[var(--tv3-fill)] ${
                          isActive ? "bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)]" : ""
                        }`}
                      >
                        <DrawIcon id={tool.id} size={25} filled={isActive} />
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
                      className={`tv3-press tv3-hov mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 text-left text-[14px] text-[var(--tv3-text2)] focus-visible:bg-[var(--tv3-fill)] ${
                        isActive ? "bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)]" : ""
                      }`}
                    >
                      <DrawIcon id={tool.id} size={25} filled={isActive} />
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
