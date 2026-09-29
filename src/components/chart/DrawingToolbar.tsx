"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { DRAWING_GROUPS, getToolDef } from "@/lib/chart/drawings/tools";
import { useT } from "@/lib/i18n/client";

/* Own inline SVG icon set: simple geometric line icons, 24x24, stroke = currentColor. */

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={20} height={20} className={className} aria-hidden="true" focusable="false" {...S}>
      {children}
    </svg>
  );
}

const Dot = ({ x, y, r = 1.9 }: { x: number; y: number; r?: number }) => <circle cx={x} cy={y} r={r} />;

const ICONS: Record<string, ReactNode> = {
  cursor_cross: <path d="M12 3v7M12 14v7M3 12h7M14 12h7" />,
  cursor_dot: <circle cx="12" cy="12" r="3" fill="currentColor" />,
  cursor_arrow: <path d="M5 3l14 8-6 2-2 6z" />,

  trend: (
    <>
      <path d="M5 19L19 5" />
      <Dot x={5} y={19} />
      <Dot x={19} y={5} />
    </>
  ),
  ray: (
    <>
      <path d="M5 19L21 3" />
      <path d="M16 3h5v5" />
      <Dot x={5} y={19} />
    </>
  ),
  info: (
    <>
      <path d="M4 20L14 10" />
      <rect x="12" y="3" width="9" height="7" rx="1.5" />
      <Dot x={4} y={20} />
    </>
  ),
  extended: (
    <>
      <path d="M3 21L21 3" />
      <Dot x={9} y={15} />
      <Dot x={16} y={8} />
    </>
  ),
  hline: (
    <>
      <path d="M3 12h18" />
      <Dot x={12} y={12} />
    </>
  ),
  hray: (
    <>
      <path d="M6 12h15" />
      <path d="M17 8l4 4-4 4" />
      <Dot x={6} y={12} />
    </>
  ),
  vline: (
    <>
      <path d="M12 3v18" />
      <Dot x={12} y={12} />
    </>
  ),
  crossline: (
    <>
      <path d="M12 3v18M3 12h18" />
      <Dot x={12} y={12} />
    </>
  ),
  channel: (
    <>
      <path d="M4 14L17 4M7 20L20 10" />
      <path d="M5.5 17L18.5 7" strokeDasharray="2 3" />
    </>
  ),
  pitchfork: (
    <>
      <path d="M4 20L20 4" />
      <path d="M4 9l10-6M11 21l10-8" />
      <path d="M4 9l7 12" strokeDasharray="2 3" />
    </>
  ),

  fib_retr: (
    <>
      <path d="M4 5h16M4 9.5h16M4 14h16M4 19h16" />
      <path d="M7 19L17 5" strokeDasharray="2 3" />
    </>
  ),
  fib_ext: (
    <>
      <path d="M13 6h7M13 10h7M13 14h7M13 18h7" />
      <path d="M4 20l4-10 4 6" />
    </>
  ),
  fib_channel: (
    <>
      <path d="M3 17L13 4M6 20L16 7M10 22L21 8" />
    </>
  ),

  long: (
    <>
      <rect x="4" y="3" width="16" height="11" />
      <rect x="4" y="14" width="16" height="6" />
      <path d="M12 9V6M10 8l2-2 2 2" />
    </>
  ),
  short: (
    <>
      <rect x="4" y="4" width="16" height="6" />
      <rect x="4" y="10" width="16" height="11" />
      <path d="M12 15v3M10 16l2 2 2-2" />
    </>
  ),
  price_range: (
    <>
      <path d="M5 5h14M5 19h14" />
      <path d="M12 6v12M9.5 8.5L12 6l2.5 2.5M9.5 15.5L12 18l2.5-2.5" />
    </>
  ),
  date_range: (
    <>
      <path d="M5 4v16M19 4v16" />
      <path d="M6 12h12M8.5 9.5L6 12l2.5 2.5M15.5 9.5L18 12l-2.5 2.5" />
    </>
  ),
  datprice_range: (
    <>
      <rect x="4" y="5" width="16" height="14" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  measure: (
    <>
      <path d="M3 16L16 3l5 5L8 21z" />
      <path d="M7 12l2 2M10 9l2 2M13 6l2 2" />
    </>
  ),

  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" />,
  triangle: <path d="M12 4l8.5 15h-17z" />,
  brush: <path d="M3 17c3-9 5 1 8-6s6-3 10-5" />,
  arrow: (
    <>
      <path d="M4 20L19 5" />
      <path d="M11 5h8v8" />
    </>
  ),

  text: <path d="M6 6h12M12 6v13M9 19h6" />,
  note: <path d="M5 4h14v11h-6l-4 4v-4H5z" />,
  price_label: (
    <>
      <path d="M3 12l4-5h14v10H7z" />
      <path d="M11 12h6" />
    </>
  ),
  flag: <path d="M6 21V4M6 5h12l-3 4 3 4H6" />,

  measureBtn: (
    <>
      <path d="M3 16L16 3l5 5L8 21z" />
      <path d="M7 12l2 2M10 9l2 2M13 6l2 2" />
    </>
  ),
  magnet: <path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4" />,
  stay: (
    <>
      <path d="M4 17l-1 4 4-1L18 9l-3-3z" />
      <path d="M13 8l3 3" />
      <path d="M14 20h7" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.3-2.2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      <path d="M4 4l16 16" />
    </>
  ),
  trash: <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" />,
  undo: <path d="M8 6L3 11l5 5M3 11h11a5 5 0 0 1 0 10H9" />,
  redo: <path d="M16 6l5 5-5 5M21 11H10a5 5 0 0 0 0 10h5" />,
  clone: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </>
  ),
  dashSolid: <path d="M3 12h18" />,
  dashDashed: <path d="M3 12h4M10 12h4M17 12h4" />,
  dashDotted: <path d="M3 12h1M7.5 12h1M12 12h1M16.5 12h1M20 12h1" />,
};

export function DrawIcon({ id, className }: { id: string; className?: string }) {
  const def = getToolDef(id);
  if (def?.glyph) {
    return (
      <span className={`inline-flex h-5 w-5 items-center justify-center text-[15px] leading-none ${className ?? ""}`} aria-hidden="true">
        {def.glyph}
      </span>
    );
  }
  return <Svg className={className}>{ICONS[id] ?? <circle cx="12" cy="12" r="4" />}</Svg>;
}

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
  "relative flex h-8 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent dark:disabled:hover:bg-transparent";
const btnActive = "bg-green-600/10 !text-green-600 dark:!text-green-500";

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
      className={`flex w-11 shrink-0 select-none flex-col items-center gap-0.5 overflow-y-auto overflow-x-hidden border-r border-gray-200 bg-white py-1 dark:border-gray-700 dark:bg-gray-900 ${className ?? ""}`}
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
              <DrawIcon id={lastTool.id} />
            </button>
            <button
              type="button"
              data-draw-caret
              title={t("draw.moreTools")}
              aria-label={`${t(g.labelKey)}: ${t("draw.moreTools")}`}
              aria-haspopup="menu"
              aria-expanded={flyout?.groupId === g.id}
              className="absolute -right-0.5 bottom-0 flex h-4 w-3 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
              onClick={(e) => openFlyout(g.id, e.currentTarget.parentElement ?? e.currentTarget)}
            >
              <svg viewBox="0 0 8 8" width="6" height="6" aria-hidden="true">
                <path d="M1 2.5h6L4 6z" fill="currentColor" />
              </svg>
            </button>
          </div>
        );
      })}

      <div className="my-1 h-px w-6 shrink-0 bg-gray-200 dark:bg-gray-700" />

      <button
        type="button"
        title={t("draw.tool.measure")}
        aria-label={t("draw.tool.measure")}
        aria-pressed={activeTool === "measure"}
        className={`${btnBase} ${activeTool === "measure" ? btnActive : ""}`}
        onClick={() => controller.setTool(activeTool === "measure" ? null : "measure")}
      >
        <DrawIcon id="measureBtn" />
      </button>
      <button
        type="button"
        title={magnetTitle}
        aria-label={magnetTitle}
        aria-pressed={magnet !== "off"}
        className={`${btnBase} ${magnet !== "off" ? btnActive : ""}`}
        onClick={() => controller.setMagnet(nextMagnet)}
      >
        <DrawIcon id="magnet" />
        {magnet !== "off" && (
          <span className="pointer-events-none absolute bottom-0.5 right-1 flex gap-px">
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
        <DrawIcon id="stay" />
      </button>
      <button
        type="button"
        title={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-label={lockedAll ? t("draw.act.unlockAll") : t("draw.act.lockAll")}
        aria-pressed={lockedAll}
        className={`${btnBase} ${lockedAll ? btnActive : ""}`}
        onClick={() => controller.setLockedAll(!lockedAll)}
      >
        <DrawIcon id={lockedAll ? "lock" : "unlock"} />
      </button>
      <button
        type="button"
        title={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-label={hidden ? t("draw.act.showAll") : t("draw.act.hideAll")}
        aria-pressed={hidden}
        className={`${btnBase} ${hidden ? btnActive : ""}`}
        onClick={() => controller.setHidden(!hidden)}
      >
        <DrawIcon id={hidden ? "eyeOff" : "eye"} />
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
        <DrawIcon id="trash" />
      </button>

      <div className="mt-auto flex flex-col items-center gap-0.5 pt-1">
        <div className="mb-1 h-px w-6 shrink-0 bg-gray-200 dark:bg-gray-700" />
        <button type="button" title={t("draw.act.undo")} aria-label={t("draw.act.undo")} disabled={!controller.canUndo()} className={btnBase} onClick={() => controller.undo()}>
          <DrawIcon id="undo" />
        </button>
        <button type="button" title={t("draw.act.redo")} aria-label={t("draw.act.redo")} disabled={!controller.canRedo()} className={btnBase} onClick={() => controller.redo()}>
          <DrawIcon id="redo" />
        </button>
      </div>

      {flyout && flyGroup && (
        <div
          ref={flyRef}
          role="menu"
          aria-label={t(flyGroup.labelKey)}
          style={{ position: "fixed", left: flyout.left, top: flyout.top }}
          className="z-[100] max-h-[calc(100vh-16px)] min-w-[230px] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl dark:border-gray-700 dark:bg-gray-900"
        >
          <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{t(flyGroup.labelKey)}</div>
          {flyGroup.tools.map((tool) => {
            const isActive = flyGroup.id === "cursors" ? activeTool === null && (last[flyGroup.id] ?? "") === tool.id : activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                onClick={() => pickTool(flyGroup.id, tool.id)}
                className={`flex w-full items-center gap-3 px-3 py-1.5 text-left text-[13px] text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 ${
                  isActive ? "bg-green-600/10 !text-green-600 dark:!text-green-500" : ""
                }`}
              >
                <DrawIcon id={tool.id} />
                <span className="truncate">{t(tool.labelKey)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
