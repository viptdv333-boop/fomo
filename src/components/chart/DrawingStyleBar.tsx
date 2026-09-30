"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { getPropSchema, schemaFromUi } from "@/lib/chart/drawings/props";
import { getToolDef } from "@/lib/chart/drawings/tools";
import { useT } from "@/lib/i18n/client";
import { ALERT_LINE_TOOLS } from "@/lib/alerts/evaluate";
import { DrawIcon } from "./DrawingToolbar";
import ColorPicker, { composeColor, parseColor } from "./ColorPicker";
import { btnCls, LinePreview, Menu, TemplateMenu } from "./DrawingControls";
import { IND_ICONS } from "./icons";

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
const btnOn = "bg-[#2962ff]/15 !text-[#2962ff]";
const sep = <div className="mx-0.5 hidden h-5 w-px shrink-0 bg-gray-200 dark:bg-gray-700 sm:block" />;

/** Drawings an alert can follow (a level that moves with the line). */
const ALERT_TOOLS = new Set<string>(ALERT_LINE_TOOLS);

const TEXT_SIZES = [10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48];
const STAMP_SIZES = [14, 18, 22, 30, 40, 60, 80];

/** Colour button with a glyph over a colour bar (line colour, text colour). */
function GlyphSwatch({ glyph, color }: { glyph: ReactNode; color: string }) {
  const p = parseColor(color);
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-[2px]">
      <span className="flex h-3.5 items-center text-gray-700 dark:text-gray-200">{glyph}</span>
      <span className="h-[3px] w-4 rounded-sm" style={{ background: composeColor(p.hex, Math.max(0.35, p.a)) }} />
    </span>
  );
}

const PEN = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 13.5l.6-3L11 2.6a1.3 1.3 0 011.8 0l.6.6a1.3 1.3 0 010 1.8L5.5 12.9z" />
  </svg>
);

export default function DrawingStyleBar({ controller, onCreateAlert }: { controller: DrawingsControllerLike; onCreateAlert?: () => void }) {
  const { t } = useT();
  useController(controller);
  const sel = controller.getSelection();
  const [textOpen, setTextOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const textWrap = useRef<HTMLDivElement | null>(null);
  const focusedFor = useRef<string | null>(null);

  const def = sel ? getToolDef(sel.tool) : undefined;
  const schema = sel && def ? getPropSchema(sel.tool) ?? schemaFromUi(def.ui) : undefined;
  const selId = sel?.id ?? null;
  const wantsText = !!def?.ui.text;
  const emptyText = (sel?.style.text ?? "") === "";

  // a text drawing that was just placed is empty: jump straight into typing
  useEffect(() => {
    if (!selId) {
      focusedFor.current = null;
      setTextOpen(false);
      return;
    }
    if (wantsText && emptyText && focusedFor.current !== selId) {
      focusedFor.current = selId;
      setTextOpen(true);
    }
  }, [selId, wantsText, emptyText]);

  useEffect(() => {
    if (!textOpen) return;
    const t0 = setTimeout(() => textRef.current?.focus(), 30);
    const onDown = (e: PointerEvent) => {
      if (textWrap.current && e.target instanceof Node && textWrap.current.contains(e.target)) return;
      setTextOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      clearTimeout(t0);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [textOpen]);

  if (!sel || !def || !schema) return null;
  const d = controller.getById(sel.id);
  const ui = def.ui;
  const st = sel.style;
  const multi = (sel.count ?? 1) > 1;
  const patch = (p: Parameters<DrawingsControllerLike["updateSelectedStyle"]>[0]) => controller.updateSelectedStyle(p);
  const cpLabels = { opacity: t("dp.opacity"), custom: t("draw.style.custom"), recent: t("dp.recent") };
  const isText = def.id === "text";
  const isStamp = def.id.startsWith("stamp_");
  const sizeOnly = isText || isStamp;
  const sizes = isStamp ? STAMP_SIZES : TEXT_SIZES;
  const curSize = st.fontSize ?? (isStamp ? 14 + Math.round(Math.max(1, st.width)) * 4 : 11 + Math.round(Math.max(1, st.width)) * 2);
  const hasTextColor = !!schema.text && schema.text.colorKey !== "color";
  const fillColor = st.fill ?? st.color;
  const hideFn = (controller as unknown as { toggleSelectedHidden?: () => void }).toggleSelectedHidden;
  const openSettings = () => controller.requestSettings(sel.id);
  const textVal = (hasTextColor ? st.textColor : undefined) ?? st.color;

  const lockBtn = (
    <button type="button" title={sel.locked ? t("draw.style.unlock") : t("draw.style.lock")} aria-label={sel.locked ? t("draw.style.unlock") : t("draw.style.lock")} aria-pressed={sel.locked} onClick={() => controller.toggleSelectedLock()} className={`${btn} ${sel.locked ? btnOn : ""}`}>
      <DrawIcon id={sel.locked ? "lock" : "unlock"} />
    </button>
  );
  const cloneBtn = (
    <button type="button" title={t("draw.style.clone")} aria-label={t("draw.style.clone")} onClick={() => controller.cloneSelected()} className={btn}>
      <DrawIcon id="clone" />
    </button>
  );
  const hideBtn = hideFn ? (
    <button type="button" title={sel.hidden ? t("dp.show") : t("dp.hide")} aria-label={sel.hidden ? t("dp.show") : t("dp.hide")} aria-pressed={!!sel.hidden} onClick={() => hideFn.call(controller)} className={`${btn} ${sel.hidden ? btnOn : ""}`}>
      <DrawIcon id={sel.hidden ? "eyeOff" : "eye"} />
    </button>
  ) : null;
  const delBtn = (
    <button type="button" title={t("draw.style.delete")} aria-label={t("draw.style.delete")} onClick={() => controller.removeSelected()} className={`${btn} hover:!text-red-500`}>
      <DrawIcon id="trash" />
    </button>
  );

  return (
    <div
      role="toolbar"
      aria-label={t("draw.style.bar")}
      className="pointer-events-auto absolute inset-x-2 top-2 z-30 mx-auto flex w-fit max-w-[calc(100%-16px)] flex-wrap items-center justify-center gap-0.5 rounded-2xl border border-gray-200 bg-white px-2 py-1 shadow-lg dark:border-[#2a2e39] dark:bg-[#1e222d]"
    >
      {ui.color && (
        <ColorPicker value={st.color} size={28} labels={cpLabels} title={isText ? t("dp.textColor") : t("draw.style.color")} onChange={(c) => patch({ color: c })}>
          <GlyphSwatch glyph={isText ? <span className="text-[13px] font-bold leading-none">A</span> : PEN} color={st.color} />
        </ColorPicker>
      )}

      {ui.fill && (
        <ColorPicker
          value={composeColor(parseColor(fillColor).hex, st.fillOpacity ?? 0.15)}
          size={28}
          labels={cpLabels}
          title={t("draw.style.fill")}
          onChange={(c) => {
            const p = parseColor(c);
            patch({ fill: p.hex, fillOpacity: Math.round(p.a * 100) / 100 });
          }}
        />
      )}

      {hasTextColor && (
        <ColorPicker value={textVal} size={28} labels={cpLabels} title={t("dp.textColor")} onChange={(c) => patch({ textColor: c })}>
          <GlyphSwatch glyph={<span className="text-[13px] font-bold leading-none">A</span>} color={textVal} />
        </ColorPicker>
      )}

      {ui.width && (
        <>
          {sep}
          {sizeOnly ? (
            <Menu title={t("draw.style.size")} trigger={<span className="text-[12px] tabular-nums">{curSize}px</span>}>
              {(close) => (
                <div className="max-h-56 overflow-y-auto">
                  {sizes.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        patch({ fontSize: s });
                        close();
                      }}
                      className={`flex w-full items-center rounded px-2 py-1 text-[12px] hover:bg-gray-100 dark:hover:bg-[#2a2e39] ${s === curSize ? "bg-gray-100 dark:bg-[#2a2e39]" : ""}`}
                    >
                      {s}px
                    </button>
                  ))}
                </div>
              )}
            </Menu>
          ) : (
            <Menu
              title={t("draw.style.width")}
              trigger={
                <span className="flex items-center gap-1">
                  <LinePreview width={Math.min(6, st.width)} dash="solid" />
                  <span className="hidden text-[11px] opacity-70 sm:inline">{Math.round(st.width)}px</span>
                </span>
              }
            >
              {(close) => (
                <>
                  {[1, 2, 3, 4].map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        patch({ width: w });
                        close();
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-gray-100 dark:hover:bg-[#2a2e39] ${Math.round(st.width) === w ? "bg-gray-100 dark:bg-[#2a2e39]" : ""}`}
                    >
                      <LinePreview width={w} dash="solid" />
                      <span>{w}px</span>
                    </button>
                  ))}
                </>
              )}
            </Menu>
          )}
        </>
      )}

      {ui.dash && (
        <Menu title={t("draw.style.dash")} trigger={<LinePreview width={2} dash={st.dash} />}>
          {(close) => (
            <>
              {(["solid", "dashed", "dotted"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    patch({ dash: k });
                    close();
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-[12px] hover:bg-gray-100 dark:hover:bg-[#2a2e39] ${st.dash === k ? "bg-gray-100 dark:bg-[#2a2e39]" : ""}`}
                >
                  <LinePreview width={2} dash={k} />
                  <span>{t(`draw.style.${k}`)}</span>
                </button>
              ))}
            </>
          )}
        </Menu>
      )}

      {ui.text && (
        <>
          {sep}
          <div ref={textWrap} className="relative">
            <button type="button" title={t("draw.style.text")} aria-label={t("draw.style.text")} aria-expanded={textOpen} onClick={() => setTextOpen((o) => !o)} className={`${btn} ${textOpen ? btnOn : ""}`}>
              <DrawIcon id="text" size={18} />
            </button>
            {textOpen && (
              <div className="absolute left-1/2 top-full z-40 mt-1.5 w-[240px] -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-[#363a45] dark:bg-[#1e222d]">
                <textarea
                  ref={textRef}
                  value={st.text ?? ""}
                  maxLength={500}
                  rows={3}
                  placeholder={t("draw.style.textPlaceholder")}
                  aria-label={t("draw.style.text")}
                  onChange={(e) => patch({ text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
                      e.preventDefault();
                      setTextOpen(false);
                    }
                    e.stopPropagation();
                  }}
                  className="w-full resize-none rounded border border-gray-300 bg-transparent px-2 py-1 text-[13px] text-gray-800 outline-none focus:border-[#2962ff] dark:border-[#363a45] dark:text-gray-100"
                />
              </div>
            )}
          </div>
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
      {d && !multi && (
        <span className="hidden sm:inline-flex">
          <TemplateMenu d={d} controller={controller} t={t} factory={def.style} compact down apply={(p) => controller.updateById(d.id, p)} />
        </span>
      )}
      {!multi && (
        <button type="button" title={t("dp.settings")} aria-label={t("dp.settings")} onClick={openSettings} className={btn}>
          {IND_ICONS.gear(17)}
        </button>
      )}

      {/* lock / clone / hide sit in the row on wide screens and in the "more" menu on narrow ones */}
      <span className="hidden items-center gap-0.5 sm:flex">
        {lockBtn}
        {cloneBtn}
        {hideBtn}
      </span>
      <span className="sm:hidden">
        <MoreMenu>
          {lockBtn}
          {cloneBtn}
          {hideBtn}
        </MoreMenu>
      </span>
      {delBtn}
    </div>
  );
}

/** "..." popover for the actions that do not fit on a phone-width bar. */
function MoreMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", down, true);
    return () => document.removeEventListener("pointerdown", down, true);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${btnCls} !border-0 w-7 !px-0`}>
        {IND_ICONS.more(16)}
      </button>
      {open && <div className="absolute right-0 top-full z-40 mt-1.5 flex gap-0.5 rounded-lg border border-gray-200 bg-white p-1 shadow-xl dark:border-[#363a45] dark:bg-[#1e222d]">{children}</div>}
    </div>
  );
}
