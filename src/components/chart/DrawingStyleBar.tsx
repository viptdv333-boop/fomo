"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { getToolDef } from "@/lib/chart/drawings/tools";
import { useT } from "@/lib/i18n/client";
import { ALERT_LINE_TOOLS } from "@/lib/alerts/evaluate";
import { DrawIcon } from "./DrawingToolbar";

const PALETTE = [
  "#2962ff",
  "#f23645",
  "#089981",
  "#ff9800",
  "#9c27b0",
  "#00bcd4",
  "#e91e63",
  "#4caf50",
  "#3f51b5",
  "#fdd835",
  "#795548",
  "#787b86",
  "#000000",
  "#ffffff",
];

const HEX = /^#[0-9a-fA-F]{6}$/;

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

const btn =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800";
const btnOn = "bg-green-600/10 !text-green-600 dark:!text-green-500";
const sep = <div className="mx-0.5 h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700" />;

function ColorButton({ value, title, onChange, children }: { value: string; title: string; onChange: (c: string) => void; children?: ReactNode }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button type="button" title={title} aria-label={title} aria-expanded={open} className={btn} onClick={() => setOpen((o) => !o)}>
        {children ?? <span className="h-4 w-4 rounded border border-gray-300 dark:border-gray-600" style={{ background: value }} />}
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-40 mt-1.5 w-[170px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="grid grid-cols-7 gap-1">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                }}
                className={`h-5 w-5 rounded border ${value.toLowerCase() === c ? "border-green-600 ring-1 ring-green-600" : "border-gray-300 dark:border-gray-600"}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <span>{t("draw.style.custom")}</span>
            <input
              type="color"
              value={HEX.test(value) ? value : "#2962ff"}
              onChange={(e) => onChange(e.target.value)}
              className="h-6 w-8 cursor-pointer rounded border border-gray-300 bg-transparent p-0 dark:border-gray-600"
            />
          </label>
        </div>
      )}
    </div>
  );
}

/** Drawings an alert can follow (a level that moves with the line). */
const ALERT_TOOLS = new Set<string>(ALERT_LINE_TOOLS);

export default function DrawingStyleBar({ controller, onCreateAlert }: { controller: DrawingsControllerLike; onCreateAlert?: () => void }) {
  const { t } = useT();
  useController(controller);
  const sel = controller.getSelection();
  const textRef = useRef<HTMLInputElement | null>(null);
  const focusedFor = useRef<string | null>(null);

  const def = sel ? getToolDef(sel.tool) : undefined;
  const selId = sel?.id ?? null;
  const wantsText = !!def?.ui.text;
  const emptyText = (sel?.style.text ?? "") === "";

  // a text drawing that was just placed is empty: jump straight into typing
  useEffect(() => {
    if (!selId) {
      focusedFor.current = null;
      return;
    }
    if (wantsText && emptyText && focusedFor.current !== selId) {
      focusedFor.current = selId;
      textRef.current?.focus();
    }
  }, [selId, wantsText, emptyText]);

  if (!sel || !def) return null;
  const ui = def.ui;
  const st = sel.style;
  const patch = (p: Parameters<DrawingsControllerLike["updateSelectedStyle"]>[0]) => controller.updateSelectedStyle(p);
  const isSizeOnly = !ui.dash && !ui.fill && (def.id === "text" || def.id.startsWith("stamp_"));
  const widthTitle = isSizeOnly ? t("draw.style.size") : t("draw.style.width");
  const widths = [1, 2, 3, 4];
  const dashes: { id: string; icon: string; key: string }[] = [
    { id: "solid", icon: "dashSolid", key: "draw.style.solid" },
    { id: "dashed", icon: "dashDashed", key: "draw.style.dashed" },
    { id: "dotted", icon: "dashDotted", key: "draw.style.dotted" },
  ];
  const fillColor = st.fill ?? st.color;
  const opacityPct = Math.round((st.fillOpacity ?? 0.15) * 100);

  return (
    <div
      role="toolbar"
      aria-label={t("draw.style.bar")}
      className="pointer-events-auto absolute left-1/2 top-2 z-30 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
    >
      {ui.color && <ColorButton value={st.color} title={t("draw.style.color")} onChange={(c) => patch({ color: c })} />}

      {ui.width && (
        <>
          {sep}
          <div className="flex items-center" role="group" aria-label={widthTitle}>
            {widths.map((w) => {
              const on = Math.round(st.width) === w || (w === 4 && st.width > 4);
              return (
                <button key={w} type="button" title={`${widthTitle}: ${w}`} aria-label={`${widthTitle}: ${w}`} aria-pressed={on} onClick={() => patch({ width: w })} className={`${btn} w-6 ${on ? btnOn : ""}`}>
                  {isSizeOnly ? (
                    <span className="font-semibold leading-none" style={{ fontSize: 9 + w * 2 }}>
                      A
                    </span>
                  ) : (
                    <span className="block w-4 rounded-full bg-current" style={{ height: w }} />
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}

      {ui.dash && (
        <>
          {sep}
          <div className="flex items-center" role="group" aria-label={t("draw.style.dash")}>
            {dashes.map((d) => (
              <button key={d.id} type="button" title={t(d.key)} aria-label={t(d.key)} aria-pressed={st.dash === d.id} onClick={() => patch({ dash: d.id })} className={`${btn} w-6 ${st.dash === d.id ? btnOn : ""}`}>
                <DrawIcon id={d.icon} />
              </button>
            ))}
          </div>
        </>
      )}

      {ui.fill && (
        <>
          {sep}
          <ColorButton value={fillColor} title={t("draw.style.fill")} onChange={(c) => patch({ fill: c })}>
            <span className="relative h-4 w-4 rounded border border-gray-300 dark:border-gray-600" style={{ background: fillColor, opacity: Math.max(0.35, st.fillOpacity ?? 0.15) }} />
          </ColorButton>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={opacityPct}
            title={`${t("draw.style.opacity")}: ${opacityPct}%`}
            aria-label={t("draw.style.opacity")}
            onChange={(e) => patch({ fillOpacity: Number(e.target.value) / 100 })}
            className="mx-1 h-1 w-16 cursor-pointer accent-green-600"
          />
        </>
      )}

      {ui.text && (
        <>
          {sep}
          <input
            ref={textRef}
            type="text"
            value={st.text ?? ""}
            maxLength={500}
            placeholder={t("draw.style.textPlaceholder")}
            aria-label={t("draw.style.text")}
            onChange={(e) => patch({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape") e.currentTarget.blur();
              e.stopPropagation();
            }}
            className="h-7 w-36 rounded-md border border-gray-200 bg-transparent px-2 text-[13px] text-gray-800 outline-none focus:border-green-600 dark:border-gray-700 dark:text-gray-100"
          />
        </>
      )}

      {onCreateAlert && ALERT_TOOLS.has(sel.tool) && (
        <>
          {sep}
          <button
            type="button"
            title={t("alerts.createFromLine")}
            aria-label={t("alerts.createFromLine")}
            onClick={onCreateAlert}
            className="h-7 shrink-0 rounded-md px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {t("alerts.create")}
          </button>
        </>
      )}

      {sep}
      <button
        type="button"
        title={sel.locked ? t("draw.style.unlock") : t("draw.style.lock")}
        aria-label={sel.locked ? t("draw.style.unlock") : t("draw.style.lock")}
        aria-pressed={sel.locked}
        onClick={() => controller.toggleSelectedLock()}
        className={`${btn} ${sel.locked ? btnOn : ""}`}
      >
        <DrawIcon id={sel.locked ? "lock" : "unlock"} />
      </button>
      <button type="button" title={t("draw.style.clone")} aria-label={t("draw.style.clone")} onClick={() => controller.cloneSelected()} className={btn}>
        <DrawIcon id="clone" />
      </button>
      <button type="button" title={t("draw.style.delete")} aria-label={t("draw.style.delete")} onClick={() => controller.removeSelected()} className={`${btn} hover:!text-red-500`}>
        <DrawIcon id="trash" />
      </button>
    </div>
  );
}
