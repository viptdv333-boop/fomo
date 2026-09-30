"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import type { FillStyle, IndicatorInstance, IndicatorStyle, LevelStyle, ParamValue, PlotStyle } from "@/lib/chart/contracts";
import type { IndicatorsController, PlotDesc, StyleDesc } from "@/lib/chart/indicators/controller";
import { defaultParams, getIndicatorDef } from "@/lib/chart/indicators/registry";
import type { IndicatorDef, NumberParam, ParamDef } from "@/lib/chart/indicators/registry";
import { TF_GROUPS, cloneStyle } from "@/lib/chart/indicators/style";
import { deleteUserData, isSignedInForUserData, listUserData, saveUserData } from "@/lib/chart/userdata";
import ColorPicker from "./ColorPicker";
import { IND_ICONS } from "./icons";

/* TradingView-like indicator settings: Inputs / Style / Visibility tabs, live preview on the chart,
   Defaults, Template (save / apply) and OK / Cancel (Cancel restores what was there when the dialog opened). */

const TEMPLATE_KIND = "indicator_template";

const fieldCls =
  "h-7 rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-900 outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff] dark:border-[#2a2e39] dark:bg-[#131722] dark:text-gray-100";
const checkCls = "h-3.5 w-3.5 shrink-0 cursor-pointer rounded accent-[#2962ff]";

type Tab = "inputs" | "style" | "visibility";

interface Template {
  key: string;
  name: string;
  params: Record<string, ParamValue>;
  style?: IndicatorStyle;
}

interface Props {
  controller: IndicatorsController;
  /** Instance to edit; null = closed. */
  uid: string | null;
  onClose: () => void;
}

export default function IndicatorSettingsDialog({ controller, uid, onClose }: Props) {
  if (!uid) return null;
  return <Body key={uid} controller={controller} uid={uid} onClose={onClose} />;
}

/* ───────────── small controls ───────────── */

function NumField({ min, max, step, value, onCommit, className = "w-full" }: { min: number; max: number; step: number; value: number; onCommit: (v: number) => void; className?: string }) {
  const [draft, setDraft] = useState(String(value));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(String(value));
  }, [value]);
  return (
    <input
      ref={ref}
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      className={`${fieldCls} ${className}`}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseFloat(e.target.value);
        if (isFinite(n) && n >= min && n <= max) onCommit(n);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

function Check({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; title?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300" title={title}>
      <input type="checkbox" className={checkCls} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/* ───────────── dialog body ───────────── */

function Body({ controller, uid, onClose }: { controller: IndicatorsController; uid: string; onClose: () => void }) {
  const { t } = useT();
  const [, force] = useState(0);
  const [tab, setTab] = useState<Tab>("inputs");
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller]);

  const inst: IndicatorInstance | undefined = controller.list().find((i) => i.uid === uid);
  const def: IndicatorDef | undefined = inst ? getIndicatorDef(inst.id) : undefined;

  // what to restore on Cancel
  const initial = useRef<{ params: Record<string, ParamValue>; style: IndicatorStyle | undefined } | null>(null);
  if (!initial.current && inst) initial.current = { params: { ...inst.params }, style: cloneStyle(inst.style) };

  // the instance vanished (removed elsewhere): close
  useEffect(() => {
    if (!inst) onClose();
  }, [inst, onClose]);

  const [style, setStyleState] = useState<IndicatorStyle>(() => cloneStyle(inst?.style) ?? {});
  const desc: StyleDesc = useMemo(
    () => controller.describe(uid),
    // re-describe when params change (plot list can depend on them: ribbon count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [controller, uid, inst?.params],
  );

  const pushStyle = useCallback(
    (next: IndicatorStyle) => {
      setStyleState(next);
      controller.update(uid, { style: Object.keys(next).length ? next : null });
    },
    [controller, uid],
  );

  const cancel = useCallback(() => {
    const ini = initial.current;
    if (ini && controller.list().some((i) => i.uid === uid)) controller.update(uid, { params: ini.params, style: ini.style ?? null });
    onClose();
  }, [controller, uid, onClose]);

  // focus management
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prev?.focus?.();
  }, []);

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "checkbox" && !(e.target as HTMLElement).closest("form")) {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Tab" && panelRef.current) {
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const cur = document.activeElement;
      if (e.shiftKey && (cur === first || cur === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && cur === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!inst || !def) return null;

  const setParam = (key: string, value: ParamValue) => controller.update(uid, { params: { [key]: value } });
  const name = t(`ind.${def.id}.name`);

  const resetDefaults = () => {
    controller.update(uid, { params: defaultParams(def), style: null });
    setStyleState({});
  };

  const applyTemplate = (tpl: Template) => {
    const st = cloneStyle(tpl.style) ?? {};
    controller.update(uid, { params: tpl.params, style: Object.keys(st).length ? st : null });
    setStyleState(st);
  };

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`relative px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] ${
        tab === id ? "text-gray-900 dark:text-white" : "text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
      }`}
    >
      {label}
      {tab === id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-[#2962ff]" />}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-2 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("ind2.set.title", { name })}
        className="flex h-[min(640px,92vh)] w-full max-w-[480px] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-2xl outline-none dark:border-[#2a2e39] dark:bg-[#1e222d] dark:text-gray-100"
      >
        <div className="flex items-start gap-2 px-4 pb-1 pt-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">{name}</h2>
            <p className="truncate font-mono text-[11px] text-gray-500 dark:text-gray-400">{def.title(inst.params)}</p>
          </div>
          <button
            type="button"
            onClick={cancel}
            aria-label={t("ind2.set.close")}
            title={t("ind2.set.close")}
            className="-mr-1 rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] dark:text-gray-400 dark:hover:bg-[#2a2e39] dark:hover:text-white"
          >
            {IND_ICONS.close(16)}
          </button>
        </div>

        <div role="tablist" className="flex gap-1 border-b border-gray-200 px-2 dark:border-[#2a2e39]">
          {tabBtn("inputs", t("ind2.set.inputs"))}
          {tabBtn("style", t("ind2.set.style"))}
          {tabBtn("visibility", t("ind2.set.visibility"))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3" role="tabpanel">
          {tab === "inputs" && <InputsTab def={def} params={inst.params} onSet={setParam} uid={uid} />}
          {tab === "style" && (
            <StyleTab
              controller={controller}
              uid={uid}
              def={def}
              params={inst.params}
              desc={desc}
              style={style}
              onStyle={pushStyle}
              onParam={setParam}
            />
          )}
          {tab === "visibility" && <VisibilityTab style={style} onStyle={pushStyle} />}
        </div>

        <div className="flex items-center gap-2 border-t border-gray-200 px-3 py-2.5 dark:border-[#2a2e39]">
          <button
            type="button"
            onClick={resetDefaults}
            className="flex h-8 items-center gap-1.5 rounded px-2 text-xs text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] dark:text-gray-300 dark:hover:bg-[#2a2e39]"
          >
            {IND_ICONS.reset(14)}
            {t("ind2.set.defaults")}
          </button>
          <TemplateMenu defId={def.id} params={inst.params} style={style} onApply={applyTemplate} />
          <span className="flex-1" />
          <button
            type="button"
            onClick={cancel}
            className="h-8 rounded border border-gray-300 px-3 text-xs font-medium text-gray-800 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] dark:border-[#2a2e39] dark:text-gray-200 dark:hover:bg-[#2a2e39]"
          >
            {t("ind2.set.cancel")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded bg-[#2962ff] px-4 text-xs font-semibold text-white hover:bg-[#1e53e5] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#1e222d]"
          >
            {t("ind2.set.ok")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── inputs ───────────── */

function InputsTab({ def, params, onSet, uid }: { def: IndicatorDef; params: Record<string, ParamValue>; onSet: (k: string, v: ParamValue) => void; uid: string }) {
  const { t } = useT();
  const list = def.params.filter((p) => p.type !== "color" && !(def.hiddenParams ?? []).includes(p.key));
  if (list.length === 0) return <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("ind2.set.noInputs")}</p>;
  const idOf = (k: string) => `indset-${uid}-${k}`;
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((p: ParamDef) => {
        const v = params[p.key] ?? p.default;
        if (p.type === "boolean") {
          return (
            <div key={p.key} className="flex items-center gap-2">
              <input id={idOf(p.key)} type="checkbox" className={checkCls} checked={Boolean(v)} onChange={(e) => onSet(p.key, e.target.checked)} />
              <label htmlFor={idOf(p.key)} className="cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                {t(`ind.p.${p.key}`)}
              </label>
            </div>
          );
        }
        return (
          <div key={p.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
            <label htmlFor={idOf(p.key)} className="text-xs text-gray-700 dark:text-gray-300">
              {t(`ind.p.${p.key}`)}
            </label>
            {p.type === "number" ? (
              <NumField min={(p as NumberParam).min} max={(p as NumberParam).max} step={(p as NumberParam).step} value={Number(v)} onCommit={(n) => onSet(p.key, n)} />
            ) : p.type === "select" ? (
              <select id={idOf(p.key)} value={String(v)} onChange={(e) => onSet(p.key, e.target.value)} className={`${fieldCls} w-full`}>
                {p.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label.startsWith("ind") ? t(o.label) : o.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ───────────── style ───────────── */

const PLOT_TYPES = ["line", "step", "area", "histogram", "columns", "circles"] as const;
const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
const WIDTHS = [1, 2, 3, 4];

function StyleTab({
  controller,
  uid,
  def,
  params,
  desc,
  style,
  onStyle,
  onParam,
}: {
  controller: IndicatorsController;
  uid: string;
  def: IndicatorDef;
  params: Record<string, ParamValue>;
  desc: StyleDesc;
  style: IndicatorStyle;
  onStyle: (s: IndicatorStyle) => void;
  onParam: (k: string, v: ParamValue) => void;
}) {
  const { t } = useT();
  const labels = { opacity: t("ind2.color.opacity"), custom: t("ind2.color.custom"), recent: t("ind2.color.recent") };
  const patchPlot = (key: string, patch: PlotStyle) => onStyle({ ...style, plots: { ...style.plots, [key]: { ...style.plots?.[key], ...patch } } });
  const patchFill = (i: number, patch: FillStyle) => onStyle({ ...style, fills: { ...style.fills, [String(i)]: { ...style.fills?.[String(i)], ...patch } } });
  const patchLevel = (i: number, patch: LevelStyle) => onStyle({ ...style, levels: { ...style.levels, [String(i)]: { ...style.levels?.[String(i)], ...patch } } });
  const patchBand = (patch: FillStyle) => onStyle({ ...style, band: { ...style.band, ...patch } });

  const nothing = desc.plots.length === 0 && desc.fills.length === 0 && desc.levels.length === 0 && !(def.styleParams && def.styleParams.length);
  const canMove = controller.canMove(uid);
  const pane = style.pane === "own" ? "own" : "main";

  const section = (title: string, children: ReactNode) => (
    <section className="mb-4 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );

  return (
    <div className="pb-40">
      {nothing && !canMove && <p className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t("ind2.set.noStyle")}</p>}

      {desc.plots.length > 0 &&
        section(
          t("ind2.st.plots"),
          desc.plots.map((pd) => (
            <PlotRow key={pd.key} pd={pd} st={style.plots?.[pd.key] ?? {}} params={params} onPatch={(patch) => patchPlot(pd.key, patch)} onParam={onParam} labels={labels} />
          )),
        )}

      {def.styleParams &&
        def.styleParams.length > 0 &&
        section(
          t("ind2.st.colors"),
          def.styleParams.map((k) => (
            <div key={k} className="flex items-center gap-2">
              <ColorPicker value={String(params[k] ?? "#2962ff")} onChange={(c) => onParam(k, c)} opacity={false} title={t(`ind.p.${k}`)} labels={labels} />
              <span className="text-xs text-gray-700 dark:text-gray-300">{t(`ind.p.${k}`)}</span>
            </div>
          )),
        )}

      {desc.fills.length > 0 &&
        section(
          t("ind2.st.fills"),
          desc.fills.map((fd) => {
            const st = style.fills?.[String(fd.index)] ?? {};
            return (
              <div key={fd.index} className="flex items-center gap-2">
                <Check checked={st.visible !== false} onChange={(v) => patchFill(fd.index, { visible: v })} />
                <ColorPicker value={st.color ?? fd.color} onChange={(c) => patchFill(fd.index, { color: c })} title={fd.name} labels={labels} />
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700 dark:text-gray-300">{fd.name.startsWith("ind") ? t(fd.name) : fd.name}</span>
              </div>
            );
          }),
        )}

      {desc.levels.length > 0 &&
        section(
          t("ind2.st.levels"),
          desc.levels.map((ld) => {
            const st = style.levels?.[String(ld.index)] ?? {};
            return (
              <div key={ld.index} className="flex flex-wrap items-center gap-2">
                <Check checked={st.visible !== false} onChange={(v) => patchLevel(ld.index, { visible: v })} />
                <span className="w-24 min-w-0 truncate text-xs text-gray-700 dark:text-gray-300">{ld.name.startsWith("ind") ? t(ld.name) : ld.name}</span>
                <NumField
                  min={-1e9}
                  max={1e9}
                  step={def.fmt === "price" ? 0.01 : 1}
                  value={st.value ?? ld.value}
                  onCommit={(n) => patchLevel(ld.index, { value: n })}
                  className="w-20"
                />
                <ColorPicker value={st.color ?? ld.color} onChange={(c) => patchLevel(ld.index, { color: c })} title={t("ind2.st.lineStyle")} labels={labels} />
                <select
                  value={st.lineStyle ?? ld.lineStyle}
                  onChange={(e) => patchLevel(ld.index, { lineStyle: e.target.value as LevelStyle["lineStyle"] })}
                  className={`${fieldCls} w-24`}
                  aria-label={t("ind2.st.lineStyle")}
                >
                  {LINE_STYLES.map((s) => (
                    <option key={s} value={s}>
                      {t(`ind2.ls.${s}`)}
                    </option>
                  ))}
                </select>
              </div>
            );
          }),
        )}

      {desc.band &&
        section(
          t("ind2.st.bg"),
          <div className="flex items-center gap-2">
            <Check checked={style.band?.visible !== false} onChange={(v) => patchBand({ visible: v })} />
            <ColorPicker value={style.band?.color ?? desc.band.color} onChange={(c) => patchBand({ color: c })} title={t("ind2.st.bg")} labels={labels} />
            <span className="text-xs text-gray-700 dark:text-gray-300">{t("ind2.st.bg")}</span>
          </div>,
        )}

      {canMove &&
        section(
          t("ind2.st.pane"),
          <select
            value={pane}
            onChange={(e) => {
              const next: IndicatorStyle = { ...style };
              if (e.target.value === "own") next.pane = "own";
              else delete next.pane;
              onStyle(next);
            }}
            className={`${fieldCls} w-full`}
            aria-label={t("ind2.st.pane")}
          >
            <option value="main">{t("ind2.st.paneMain")}</option>
            <option value="own">{t("ind2.st.paneOwn")}</option>
          </select>,
        )}
    </div>
  );
}

function PlotRow({
  pd,
  st,
  params,
  onPatch,
  onParam,
  labels,
}: {
  pd: PlotDesc;
  st: PlotStyle;
  params: Record<string, ParamValue>;
  onPatch: (p: PlotStyle) => void;
  onParam: (k: string, v: ParamValue) => void;
  labels: { opacity: string; custom: string; recent: string };
}) {
  const { t } = useT();
  const type = st.type ?? pd.shape;
  const isLineish = type === "line" || type === "step" || type === "area";
  const color = st.color ?? pd.color;
  return (
    <div className="rounded border border-transparent px-1 py-1 hover:border-gray-200 dark:hover:border-[#2a2e39]">
      <div className="flex flex-wrap items-center gap-2">
        <Check checked={st.visible !== false} onChange={(v) => onPatch({ visible: v })} />
        <span className="w-20 min-w-0 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={pd.key}>
          {pd.key}
        </span>
        {pd.perBar && pd.colorParams ? (
          <span className="flex items-center gap-1">
            {pd.colorParams.map((k, i) => (
              <ColorPicker key={k} value={String(params[k] ?? pd.color)} onChange={(c) => onParam(k, c)} opacity={false} title={t(i === 0 ? "ind2.st.up" : "ind2.st.down")} labels={labels} />
            ))}
          </span>
        ) : pd.perBar ? null : (
          <ColorPicker value={color} onChange={(c) => onPatch({ color: c })} title={pd.key} labels={labels} />
        )}
        <select value={type} onChange={(e) => onPatch({ type: e.target.value as PlotStyle["type"] })} className={`${fieldCls} w-[112px]`} aria-label={t("ind2.st.type")} title={t("ind2.st.type")}>
          {PLOT_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`ind2.type.${k}`)}
            </option>
          ))}
        </select>
        {isLineish && (
          <>
            <select
              value={Math.round(st.width ?? pd.width) > 4 ? 4 : Math.max(1, Math.round(st.width ?? pd.width))}
              onChange={(e) => onPatch({ width: +e.target.value })}
              className={`${fieldCls} w-14`}
              aria-label={t("ind2.st.width")}
              title={t("ind2.st.width")}
            >
              {WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {w}px
                </option>
              ))}
            </select>
            <select
              value={st.lineStyle ?? pd.lineStyle}
              onChange={(e) => onPatch({ lineStyle: e.target.value as PlotStyle["lineStyle"] })}
              className={`${fieldCls} w-[92px]`}
              aria-label={t("ind2.st.lineStyle")}
              title={t("ind2.st.lineStyle")}
            >
              {LINE_STYLES.map((s) => (
                <option key={s} value={s}>
                  {t(`ind2.ls.${s}`)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 pl-6">
        <Check checked={st.priceLine ?? pd.priceLine} onChange={(v) => onPatch({ priceLine: v })} label={t("ind2.st.priceLine")} />
        <Check checked={st.lastValue ?? pd.lastValue} onChange={(v) => onPatch({ lastValue: v })} label={t("ind2.st.lastValue")} />
        <Check checked={st.legendValue ?? pd.legendValue} onChange={(v) => onPatch({ legendValue: v })} label={t("ind2.st.legendValue")} />
      </div>
    </div>
  );
}

/* ───────────── visibility ───────────── */

function VisibilityTab({ style, onStyle }: { style: IndicatorStyle; onStyle: (s: IndicatorStyle) => void }) {
  const { t } = useT();
  const setGroup = (g: (typeof TF_GROUPS)[number], on: boolean) => {
    const tf = { ...(style.tf ?? {}) };
    if (on) delete tf[g];
    else tf[g] = false;
    const next: IndicatorStyle = { ...style, tf };
    if (Object.keys(tf).length === 0) delete next.tf;
    onStyle(next);
  };
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("ind2.vis.title")}</h3>
      <div className="flex flex-col gap-2.5">
        {TF_GROUPS.map((g) => (
          <Check key={g} checked={style.tf?.[g] !== false} onChange={(v) => setGroup(g, v)} label={t(`ind2.vis.${g}`)} />
        ))}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">{t("ind2.vis.hint")}</p>
    </div>
  );
}

/* ───────────── templates ───────────── */

function TemplateMenu({ defId, params, style, onApply }: { defId: string; params: Record<string, ParamValue>; style: IndicatorStyle; onApply: (t: Template) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const all = await listUserData<{ id?: string; name?: string; params?: Record<string, ParamValue>; style?: IndicatorStyle }>(TEMPLATE_KIND);
    const mine: Template[] = [];
    for (const it of all) {
      const d = it.data;
      if (!d || d.id !== defId || typeof d.name !== "string" || !d.params) continue;
      mine.push({ key: it.key, name: d.name, params: d.params, style: d.style });
    }
    mine.sort((a, b) => a.name.localeCompare(b.name));
    setItems(mine);
  }, [defId]);

  useEffect(() => {
    if (!open) return;
    void load();
    const close = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open, load]);

  const save = async () => {
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const ok = await saveUserData(TEMPLATE_KIND, `${defId}::${n}`, { id: defId, name: n, params, style: Object.keys(style).length ? style : undefined });
    setNote(ok ? t("ind2.tpl.saved") : t("ind2.tpl.failed"));
    if (ok) {
      setName("");
      await load();
    }
  };

  const remove = async (key: string) => {
    await deleteUserData(TEMPLATE_KIND, key);
    await load();
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setNote(null);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2962ff] ${
          open ? "bg-gray-100 dark:bg-[#2a2e39]" : "hover:bg-gray-100 dark:hover:bg-[#2a2e39]"
        } text-gray-700 dark:text-gray-300`}
      >
        {IND_ICONS.template(14)}
        {t("ind2.set.template")}
        {IND_ICONS.chevronUp(12)}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-[80] mb-1 w-64 rounded-lg border border-gray-200 bg-white p-2 text-gray-800 shadow-xl dark:border-[#2a2e39] dark:bg-[#1e222d] dark:text-gray-200">
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t("ind2.tpl.name")} aria-label={t("ind2.tpl.name")} className={`${fieldCls} min-w-0 flex-1`} />
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-7 shrink-0 rounded bg-[#2962ff] px-2.5 text-xs font-medium text-white hover:bg-[#1e53e5] disabled:opacity-40"
            >
              {t("ind2.tpl.save")}
            </button>
          </form>
          {note && <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">{note}</p>}
          <div className="mt-2 max-h-48 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-gray-500 dark:text-gray-400">{t("ind2.tpl.none")}</p>
            ) : (
              items.map((tpl) => (
                <div key={tpl.key} className="group flex items-center rounded hover:bg-gray-100 dark:hover:bg-[#2a2e39]">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(tpl);
                      setOpen(false);
                    }}
                    className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs"
                  >
                    {tpl.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(tpl.key)}
                    title={t("ind2.tpl.delete")}
                    aria-label={t("ind2.tpl.delete")}
                    className="mr-1 rounded p-1 text-gray-400 opacity-0 hover:text-red-500 focus:opacity-100 group-hover:opacity-100"
                  >
                    {IND_ICONS.trash(13)}
                  </button>
                </div>
              ))
            )}
          </div>
          {isSignedInForUserData() === false && <p className="mt-2 border-t border-gray-200 pt-2 text-[10px] text-gray-500 dark:border-[#2a2e39] dark:text-gray-400">{t("ind2.tpl.local")}</p>}
        </div>
      )}
    </div>
  );
}
