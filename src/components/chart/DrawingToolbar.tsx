"use client";

import MacGlyph from "./MacGlyph";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { DRAWING_GROUPS, getToolDef } from "@/lib/chart/drawings/tools";
import { DRAW_TEXT_DEFAULTS, setDrawTexts } from "@/lib/chart/drawings/tools-kit";
import { useT } from "@/lib/i18n/client";
import { DrawIcon } from "./icons";
import { PopupPortal } from "./ModalPortal";

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
  zoomBy?: (factor: number) => void;
};

const LAST_KEY = "fomo-draw-last-v1";
const FAV_KEY = "fomo-draw-fav-v1";
const FAV_EVENT = "fomo-draw-fav-changed";
/** Only ONE toolbar of the page draws the favourites bar (a multi-chart layout has a toolbar in every pane). */
let favOwner: HTMLElement | null = null;

const starIcon = (on: boolean) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 3.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.8l6-.8z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

function loadLast(): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const g of DRAWING_GROUPS) defaults[g.id] = g.id === "forecast" ? "forecast" : g.tools[0].id;
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
const GAP = <span className="tv3-rgap" />;

/** Rail order of the design: cursor, line tools, fib, patterns, forecast / measurement, geometric tools, text, ruler, then the actions.
 *  `fixed` = a slot bound to one tool (its group flyout opens from the caret / right click), otherwise the slot shows the last tool used of the group. */
const RAIL: { key: string; group: string; fixed?: string; noMenu?: boolean; titleKey?: string }[] = [
  { key: "cursors", group: "cursors" },
  { key: "lines", group: "lines" },
  { key: "fib", group: "fib" },
  { key: "patterns", group: "patterns" },
  { key: "forecast", group: "forecast", titleKey: "draw.group.forecast" },
  { key: "shapes", group: "shapes" },
  { key: "text", group: "text" },
  { key: "stamps", group: "stamps" },
  { key: "measure", group: "forecast", fixed: "measure", noMenu: true },
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
    for (const g of DRAWING_GROUPS) d[g.id] = g.id === "forecast" ? "forecast" : g.tools[0].id;
    return d;
  });
  const [flyout, setFlyout] = useState<FlyoutState | null>(null);
  const flyRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // favourite tools: a floating bar the user drags anywhere over the chart (like TradingView's favourites toolbar)
  const [favs, setFavs] = useState<string[]>([]);
  const [favOn, setFavOn] = useState(true);
  const [favPos, setFavPos] = useState<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 80, y: 60 });
  // the terminal skin zooms the rail (CSS `zoom`): left / top of a fixed child are multiplied by it, while the pointer and getBoundingClientRect are not
  const [zoom, setZoom] = useState(1);
  // a rail with a filter / backdrop-filter / transform becomes the containing block of its `fixed` children: the bar is then offset by the rail's own position;
  // the offset is measured after each paint and cancelled, so the bar stands exactly under the pointer wherever it is dragged
  const [fixOff, setFixOff] = useState({ x: 0, y: 0 });
  const favRef = useRef<HTMLDivElement | null>(null);
  const favsRef = useRef<string[]>([]);
  favsRef.current = favs;
  const saveFav = (ids: string[], on: boolean, pos: { x: number; y: number } | null) => {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify({ ids, on, pos }));
      // the other panes of a multi-chart layout have a toolbar each: they re-read it
      window.dispatchEvent(new Event(FAV_EVENT));
    } catch {
      /* storage unavailable */
    }
  };
  const toggleFav = (id: string) => {
    const next = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(next);
    saveFav(next, favOn || !favs.includes(id), favPos);
    if (!favs.includes(id)) setFavOn(true);
  };
  const setFavVisible = (on: boolean) => {
    setFavOn(on);
    saveFav(favs, on, favPos);
  };
  const startFavDrag = (e: React.PointerEvent<HTMLElement>) => {
    const bar = e.currentTarget.parentElement;
    if (!bar) return;
    e.preventDefault();
    const r = bar.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    let cur = { x: r.left, y: r.top };
    const move = (ev: PointerEvent) => {
      cur = {
        x: Math.max(0, Math.min(window.innerWidth - r.width, ev.clientX - dx)),
        y: Math.max(0, Math.min(window.innerHeight - r.height, ev.clientY - dy)),
      };
      setFavPos(cur);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      saveFav(favsRef.current, true, cur);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // default place of the bar: right of the rail, near its top
  useLayoutEffect(() => {
    const place = () => {
      const root = rootRef.current;
      const r = root?.getBoundingClientRect();
      if (r) setAnchor({ x: r.right + 12, y: r.top + 8 });
      const z = root ? parseFloat(getComputedStyle(root).zoom) : 1;
      setZoom(Number.isFinite(z) && z > 0 ? z : 1);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  // at most a few corrections per position: a bar that cannot be placed exactly (a hidden / transformed host) must never loop the render
  const fixTries = useRef({ key: "", n: 0 });
  useLayoutEffect(() => {
    const r = favRef.current?.getBoundingClientRect();
    if (!r) return;
    const want = favPos ?? anchor;
    const key = `${want.x}|${want.y}|${zoom}`;
    if (fixTries.current.key !== key) fixTries.current = { key, n: 0 };
    const ex = r.left - want.x;
    const ey = r.top - want.y;
    if (!Number.isFinite(ex) || !Number.isFinite(ey)) return;
    if ((Math.abs(ex) > 0.5 || Math.abs(ey) > 0.5) && fixTries.current.n < 3) {
      fixTries.current.n++;
      setFixOff((o) => ({ x: o.x + ex, y: o.y + ey }));
    }
  });

  const [favMine, setFavMine] = useState(false);
  useEffect(() => {
    const me = rootRef.current;
    if (!favOwner || !favOwner.isConnected) {
      favOwner = me;
      setFavMine(true);
    }
    return () => {
      if (favOwner === me) favOwner = null;
    };
  }, []);

  // stored preferences are read after mount so server and client markup match (and again when another pane's toolbar changes them)
  useEffect(() => {
    const readFav = () => {
      try {
        const raw = localStorage.getItem(FAV_KEY);
        if (raw) {
          const p = JSON.parse(raw) as { ids?: unknown; on?: unknown; pos?: { x?: unknown; y?: unknown } | null };
          if (Array.isArray(p.ids)) setFavs(p.ids.filter((x): x is string => typeof x === "string" && !!getToolDef(x)));
          setFavOn(p.on !== false);
          if (p.pos && typeof p.pos.x === "number" && typeof p.pos.y === "number") setFavPos({ x: p.pos.x, y: p.pos.y });
        }
      } catch {
        /* storage unavailable */
      }
    };
    readFav();
    window.addEventListener(FAV_EVENT, readFav);
    const stored = loadLast();
    const cs = ctl.getCursorStyle?.();
    if (cs && DRAWING_GROUPS[0].tools.some((x) => x.id === cs)) stored[DRAWING_GROUPS[0].id] = cs;
    setLast(stored);
    return () => window.removeEventListener(FAV_EVENT, readFav);
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

  // tools that own a rail slot of their own (for example, the ruler); their group slot is not lit for them
  const slotTools = new Set(RAIL.filter((r) => r.fixed).map((r) => r.fixed as string));
  const groupOf = (id: string) => DRAWING_GROUPS.find((g) => g.id === id);

  const favTools = favs.map((id) => ({ id, groupId: DRAWING_GROUPS.find((g) => g.tools.some((x) => x.id === id))?.id ?? "", labelKey: getToolDef(id)?.labelKey ?? `draw.tool.${id}` }));
  const favPlace = favPos ?? anchor;

  return (
    <div
      ref={rootRef}
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("draw.toolbar")}
      data-tv="tools"
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
        const shown = slot.fixed ?? (slot.group === "forecast" ? "forecast" : lastTool.id);
        const shownTool = g.tools.find((x) => x.id === shown) ?? lastTool;
        const toolDef = slot.fixed ? { id: slot.fixed, labelKey: `draw.tool.${slot.fixed}` } : shownTool;
        const active = slot.fixed
          ? activeTool === slot.fixed
          : g.id === "cursors"
            ? activeTool === null
            : activeTool !== null && g.tools.some((x) => x.id === activeTool) && !slotTools.has(activeTool);
        const title = slot.fixed ? t(toolDef.labelKey) : slot.titleKey ? t(slot.titleKey) : `${t(g.labelKey)}: ${t(shownTool.labelKey)}`;
        return (
          <Fragment key={slot.key}>
          <div data-rk={slot.key} className="group/slot relative flex shrink-0 items-center">
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
              <MacGlyph set="rail" k={slot.key} />
            </button>
            {!slot.noMenu && (
              <button
                type="button"
                data-draw-caret
                title={t("draw.moreTools")}
                aria-label={`${t(g.labelKey)}: ${t("draw.moreTools")}`}
                aria-haspopup="menu"
                aria-expanded={flyout?.groupId === g.id}
                className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-[var(--tv3-accent)]/25 bg-[var(--tv3-card)] text-[var(--tv3-accent)] shadow-sm transition-colors hover:bg-[var(--tv3-accent-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--tv3-accent)]"
                onClick={(e) => openFlyout(g.id, e.currentTarget.parentElement ?? e.currentTarget)}
              >
                <svg viewBox="0 0 12 12" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m2.5 4.5 3.5 3 3.5-3" />
                </svg>
              </button>
            )}
          </div>
          {GAP}
          </Fragment>
        );
      })}

      <button type="button" title={t("draw.act.zoomIn")} aria-label={t("draw.act.zoomIn")} data-rk="zoomIn" className={btnBase} onClick={() => ctl.zoomBy?.(1.25)}>
        <MacGlyph set="rail" k="zoomIn" />
      </button>
      {GAP}
      <button
        type="button"
        title={magnetTitle}
        aria-label={magnetTitle}
        aria-pressed={magnet !== "off"}
        data-rk="magnet" className={`${btnBase} ${magnet !== "off" ? btnActive : ""}`}
        onClick={() => controller.setMagnet(nextMagnet)}
      >
        <MacGlyph set="rail" k="magnet" />
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
        data-rk="stay" className={`${btnBase} ${stay ? btnActive : ""}`}
        onClick={() => controller.setStayInDrawing(!stay)}
      >
        <MacGlyph set="rail" k="stay" />
      </button>
      {GAP}
      <button
        type="button"
        title={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-label={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-pressed={lockedAll}
        data-rk="lock" className={`${btnBase} ${lockedAll ? btnActive : ""}`}
        onClick={() => controller.setLockedAll(!lockedAll)}
      >
        <MacGlyph set="rail" k={lockedAll ? "lock" : "unlock"} />
      </button>
      {GAP}
      <button
        type="button"
        title={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-label={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-pressed={hidden}
        data-rk="eye" className={`${btnBase} ${hidden ? btnActive : ""}`}
        onClick={() => controller.setHidden(!hidden)}
      >
        <MacGlyph set="rail" k={hidden ? "eyeOff" : "eye"} />
      </button>
      {GAP}
      <button
        type="button"
        title={t("draw.act.removeAll")}
        aria-label={t("draw.act.removeAll")}
        data-rk="trash" className={`${btnBase} hover:!text-[var(--tv3-red)]`}
        onClick={() => {
          if (window.confirm(t("draw.act.removeConfirm"))) controller.removeAll();
        }}
      >
        <MacGlyph set="rail" k="trash" />
      </button>
      {GAP}

      <button type="button" title={t("draw.act.undo")} aria-label={t("draw.act.undo")} disabled={!controller.canUndo()} data-rk="undo" className={btnBase} onClick={() => controller.undo()}>
        <MacGlyph set="rail" k="undo" />
      </button>
      {GAP}
      <button type="button" title={t("draw.act.redo")} aria-label={t("draw.act.redo")} disabled={!controller.canRedo()} data-rk="redo" className={btnBase} onClick={() => controller.redo()}>
        <MacGlyph set="rail" k="redo" />
      </button>
      {GAP}

      {favTools.length > 0 && favOn && favMine && (
        <div
          role="toolbar"
          aria-label={t("draw.fav.panel")}
          data-tv="fav-tools"
          data-fav-bar
          ref={favRef}
          style={{ position: "fixed", left: (favPlace.x - fixOff.x) / zoom, top: (favPlace.y - fixOff.y) / zoom, cursor: "default" }}
          className="z-[60] flex select-none items-center gap-0.5 rounded-xl bg-[var(--tv3-fill)]/95 p-1 shadow-[0_4px_18px_rgba(0,0,0,.12)] dark:shadow-[0_4px_18px_rgba(0,0,0,.5)]"
        >
          <span
            title={t("draw.fav.drag")}
            aria-label={t("draw.fav.drag")}
            onPointerDown={startFavDrag}
            style={{ cursor: "grab" }}
            className="fav-grip flex h-8 w-4 shrink-0 touch-none items-center justify-center text-[var(--tv3-muted)]"
          >
            <svg viewBox="0 0 8 14" width="7" height="12" aria-hidden="true" fill="currentColor">
              <circle cx="2" cy="2" r="1.1" /><circle cx="6" cy="2" r="1.1" /><circle cx="2" cy="7" r="1.1" /><circle cx="6" cy="7" r="1.1" /><circle cx="2" cy="12" r="1.1" /><circle cx="6" cy="12" r="1.1" />
            </svg>
          </span>
          {favTools.map((f, fi) => {
            const on = activeTool === f.id;
            return (
              <button
                key={f.id}
                type="button"
                data-c={fi % 6}
                style={{ cursor: "pointer" }}
                title={t(f.labelKey)}
                aria-label={t(f.labelKey)}
                aria-pressed={on}
                onClick={() => {
                  if (on) {
                    controller.setTool(null);
                    return;
                  }
                  if (f.groupId) rememberTool(f.groupId, f.id);
                  controller.setTool(f.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  toggleFav(f.id);
                }}
                className={`fav-b tv3-press tv3-hov flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--tv3-text2)] ${on ? "bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)]" : ""}`}
              >
                <DrawIcon id={f.id} size={22} filled={on} />
                <MacGlyph set="cur" k={f.id} />
              </button>
            );
          })}
          <button
            type="button"
            title={t("draw.fav.hide")}
            aria-label={t("draw.fav.hide")}
            onClick={() => setFavVisible(false)}
            style={{ cursor: "pointer" }}
            className="fav-x tv3-press tv3-hov flex h-8 w-5 shrink-0 items-center justify-center rounded-lg text-[var(--tv3-muted)]"
          >
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </button>
        </div>
      )}

      {flyout && flyGroup && (
        <PopupPortal>
        <div
          ref={flyRef}
          role="menu"
          data-fly={flyGroup.id}
          aria-label={t(flyGroup.labelKey)}
          style={{ position: "fixed", left: flyout.left, top: flyout.top }}
          onKeyDown={onMenuKey}
          className="tv3-pop z-[100] max-h-[calc(100vh-16px)] min-w-[276px] overflow-y-auto rounded-2xl py-1.5 text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        >
          <div data-fly-title className="flex items-center justify-between px-3.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]">
            <span>{t(flyGroup.labelKey)}</span>
            {favs.length > 0 && !favOn && (
              <button type="button" onClick={() => setFavVisible(true)} className="cursor-pointer normal-case tracking-normal text-[var(--tv3-accent)] hover:underline">
                {t("draw.fav.show")}
              </button>
            )}
          </div>
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
                    const isFav = favs.includes(tool.id);
                    return (
                      <div key={tool.id} className="group/fi relative">
                        <button
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
                        <button
                          type="button"
                          title={isFav ? t("draw.fav.remove") : t("draw.fav.add")}
                          aria-label={isFav ? t("draw.fav.remove") : t("draw.fav.add")}
                          aria-pressed={isFav}
                          onClick={() => toggleFav(tool.id)}
                          className={`absolute -right-0.5 -top-0.5 flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-[var(--tv3-card)] [&>svg]:h-3 [&>svg]:w-3 ${
                            isFav ? "text-[#f5b301]" : "text-[var(--tv3-text2)] opacity-60 hover:opacity-100 hover:text-[#f5b301]"
                          }`}
                        >
                          {starIcon(isFav)}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                sec.tools.map((tool) => {
                  const isActive = flyGroup.id === "cursors" ? activeTool === null && (last[flyGroup.id] ?? "") === tool.id : activeTool === tool.id;
                  const isFav = favs.includes(tool.id);
                  return (
                    <div key={tool.id} className="group/fi relative">
                      <button
                        type="button"
                        role="menuitem"
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => pickTool(flyGroup.id, tool.id)}
                        className={`tv3-press tv3-hov mx-1.5 flex w-[calc(100%-12px)] cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 pr-9 text-left text-[14px] text-[var(--tv3-text2)] focus-visible:bg-[var(--tv3-fill)] ${
                          isActive ? "bg-[var(--tv3-accent-soft)] !text-[var(--tv3-accent)]" : ""
                        }`}
                      >
                        <DrawIcon id={tool.id} size={25} filled={isActive} />
                        <MacGlyph set="cur" k={tool.id} />
                        {flyGroup.id === "lines" && <MacGlyph set="line" k={String((flyGroup.sections ?? []).flatMap((x) => x.tools).findIndex((x) => x.id === tool.id))} />}
                        <span className="truncate">{t(tool.labelKey)}</span>
                      </button>
                      <button
                        type="button"
                        title={isFav ? t("draw.fav.remove") : t("draw.fav.add")}
                        aria-label={isFav ? t("draw.fav.remove") : t("draw.fav.add")}
                        aria-pressed={isFav}
                        onClick={() => toggleFav(tool.id)}
                        className={`absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--tv3-fill)] ${
                          isFav ? "text-[#f5b301]" : "text-[var(--tv3-text2)] opacity-60 hover:opacity-100 hover:text-[#f5b301]"
                        }`}
                      >
                        {starIcon(isFav)}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
        </PopupPortal>
      )}
    </div>
  );
}
