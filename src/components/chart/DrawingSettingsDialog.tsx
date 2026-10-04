"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DrawingsControllerLike } from "@/lib/chart/contracts";
import { getToolDef } from "@/lib/chart/drawings/tools";
import { getPropSchema, propPatch, readProp, schemaFromUi, textSections, type Control, type PropRow, type PropSchema, type PropSection, type Ref } from "@/lib/chart/drawings/props";
import { getVis, intervalUnit, levelColor, sanitizeLevels, VIS_LIMITS, VIS_UNITS, type FibLevel, type VisUnit } from "@/lib/chart/drawings/render";
import type { DPoint, Drawing, DrawingPatch } from "@/lib/chart/drawings/types";
import { useT } from "@/lib/i18n/client";
import ColorPicker, { composeColor, parseColor } from "./ColorPicker";
import { btnCls, clone, inputCls, LinePreview, Menu, NumInput, TemplateMenu } from "./DrawingControls";
import { IND_ICONS } from "./icons";
import { Segmented, Toggle } from "./tv3-ui";

/* TradingView-like "Properties" modal of a drawing: Style and Text tabs are generated from the tool's property schema
   (drawings/props.ts), Coordinates edits the anchors, Visibility switches the drawing per timeframe.
   Edits apply live; Cancel / Esc restore what the drawing looked like when the dialog opened. */

type Tab = "style" | "text" | "coords" | "vis";

interface Snapshot {
  style: Drawing["style"];
  extra: Record<string, unknown> | undefined;
  points: DPoint[];
  locked: boolean;
}

function useLive(c: DrawingsControllerLike, id: string): Drawing | null {
  const ver = useRef(0);
  const sub = useCallback(
    (cb: () => void) =>
      c.subscribe(() => {
        ver.current += 1;
        cb();
      }),
    [c]
  );
  useSyncExternalStore(
    sub,
    () => ver.current,
    () => 0
  );
  return c.getById(id);
}

/* ───────────── small controls ───────────── */

/* ───────────── generated controls ───────────── */

interface Ctx {
  d: Drawing;
  apply: (p: DrawingPatch) => void;
  t: (k: string, v?: Record<string, string | number>) => string;
}

function ControlView({ ctl, ctx }: { ctl: Control; ctx: Ctx }) {
  const { d, apply, t } = ctx;
  const cpLabels = { opacity: t("dp.opacity"), custom: t("draw.style.custom"), recent: t("dp.recent") };
  switch (ctl.type) {
    case "color": {
      const v = String(readProp(d, ctl, ctl.def) ?? "#2962ff");
      return <ColorPicker value={v} size={28} opacity={ctl.alpha !== false} labels={cpLabels} title={t("draw.style.color")} onChange={(c) => apply(propPatch(ctl, c))} />;
    }
    case "fill": {
      const base = d.style.fill ?? d.style.color;
      const a = d.style.fillOpacity ?? 0.15;
      const value = composeColor(parseColor(base).hex, a);
      return (
        <ColorPicker
          value={value}
          size={28}
          labels={cpLabels}
          title={t("draw.style.fill")}
          onChange={(c) => {
            const p = parseColor(c);
            apply({ style: { fill: p.hex, fillOpacity: Math.round(p.a * 100) / 100 } });
          }}
        />
      );
    }
    case "width": {
      const cur = Number(readProp(d, ctl, ctl.def ?? 1)) || 1;
      const max = ctl.max ?? 4;
      const opts = Array.from({ length: max }, (_, i) => i + 1);
      return (
        <Menu title={t("draw.style.width")} trigger={<span className="flex items-center gap-1"><LinePreview width={Math.min(cur, 6)} dash="solid" /><span className="text-[11px] opacity-70">{cur}px</span></span>}>
          {(close) => (
            <>
              {opts.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    apply(propPatch(ctl, w));
                    close();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-[var(--tv3-fill)] ${w === Math.round(cur) ? "bg-[var(--tv3-fill)]" : ""}`}
                >
                  <LinePreview width={w} dash="solid" />
                  <span>{w}px</span>
                </button>
              ))}
            </>
          )}
        </Menu>
      );
    }
    case "dash": {
      const cur = String(readProp(d, ctl, ctl.def ?? "solid"));
      return (
        <Menu title={t("draw.style.dash")} trigger={<LinePreview width={2} dash={cur} />}>
          {(close) => (
            <>
              {(["solid", "dashed", "dotted"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    apply(propPatch(ctl, k));
                    close();
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] hover:bg-[var(--tv3-fill)] ${k === cur ? "bg-[var(--tv3-fill)]" : ""}`}
                >
                  <LinePreview width={2} dash={k} />
                  <span>{t(`draw.style.${k}`)}</span>
                </button>
              ))}
            </>
          )}
        </Menu>
      );
    }
    case "number": {
      const v = Number(readProp(d, ctl, ctl.def));
      return <NumInput value={Number.isFinite(v) ? v : 0} min={ctl.min} max={ctl.max} step={ctl.step} suffix={ctl.suffix} onChange={(n) => apply(propPatch(ctl, n))} />;
    }
    case "slider": {
      const v = Number(readProp(d, ctl, ctl.def));
      return (
        <span className="flex items-center gap-2">
          <input type="range" min={ctl.min} max={ctl.max} step={ctl.step ?? 1} value={v} onChange={(e) => apply(propPatch(ctl, Number(e.target.value)))} className="w-28 accent-[var(--tv3-accent)]" />
          <span className="w-5 text-[12px] tabular-nums text-[var(--tv3-muted)]">{v}</span>
        </span>
      );
    }
    case "select": {
      const v = String(readProp(d, ctl, ctl.def));
      return (
        <select value={v} onChange={(e) => apply(propPatch(ctl, e.target.value))} className={`${inputCls} min-w-[96px] pr-1`}>
          {ctl.options.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      );
    }
    case "bool": {
      const v = !!readProp(d, ctl, ctl.def);
      return <Toggle sm checked={v} onChange={(c) => apply(propPatch(ctl, c))} />;
    }
    case "toggle": {
      const v = !!readProp(d, ctl, ctl.def);
      return (
        <button
          type="button"
          title={t(ctl.titleKey)}
          aria-pressed={v}
          onClick={() => apply(propPatch(ctl, !v))}
          className={`${btnCls} w-7 !px-0 ${ctl.glyph === "B" ? "font-bold" : "italic"} ${v ? "!border-[var(--tv3-accent)] bg-[var(--tv3-accent-soft)] text-[var(--tv3-accent)]" : ""}`}
        >
          {ctl.glyph}
        </button>
      );
    }
    case "segment": {
      const v = String(readProp(d, ctl, ctl.def));
      return (
        <Segmented size="sm" value={v} options={ctl.options.map((o) => ({ id: o.value, label: t(o.labelKey) }))} onChange={(x) => apply(propPatch(ctl, x))} />
      );
    }
    case "text": {
      const v = String(readProp(d, ctl, ctl.def ?? ""));
      const ph = ctl.placeholder ? t(ctl.placeholder) : undefined;
      return ctl.multiline ? (
        <textarea value={v} maxLength={500} rows={3} placeholder={ph} onChange={(e) => apply(propPatch(ctl, e.target.value))} className={`${inputCls} h-auto w-full resize-y py-1`} />
      ) : (
        <input type="text" value={v} maxLength={500} placeholder={ph} onChange={(e) => apply(propPatch(ctl, e.target.value))} className={`${inputCls} w-full`} />
      );
    }
    case "levels":
      return <LevelsEditor kind={ctl.kind} ctx={ctx} />;
  }
}

function LevelsEditor({ kind, ctx }: { kind: "retr" | "ext" | "channel" | "pitch"; ctx: Ctx }) {
  const { d, apply, t } = ctx;
  const levels = sanitizeLevels(d.extra?.levels, kind);
  const set = (next: FibLevel[]) => apply({ extra: { levels: next } });
  const edit = (i: number, patch: Partial<FibLevel>) => set(levels.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const cpLabels = { opacity: t("dp.opacity"), custom: t("draw.style.custom"), recent: t("dp.recent") };
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
        {levels.map((l, i) => (
          <div key={i} className="flex items-center gap-1.5 py-[3px]">
            <Toggle sm checked={l.on} onChange={(c) => edit(i, { on: c })} label={t("dp.levelOn")} />
            <NumInput value={l.v} min={-1000} max={1000} step={0.1} className="w-[64px]" onChange={(n) => edit(i, { v: n })} />
            <ColorPicker value={l.color || d.style.color} size={24} labels={cpLabels} onChange={(c) => edit(i, { color: c })} />
            <button type="button" title={t("draw.style.delete")} aria-label={t("draw.style.delete")} onClick={() => set(levels.filter((_, k) => k !== i))} className="flex h-6 w-6 items-center justify-center rounded-lg text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] hover:text-[var(--tv3-down)]">
              {IND_ICONS.close(12)}
            </button>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          className={`${btnCls} gap-1`}
          onClick={() => {
            const last = levels.length ? Math.max(...levels.map((l) => l.v)) : 0;
            const v = Math.round((last + (kind === "pitch" ? 0.25 : 0.5)) * 1000) / 1000;
            set([...levels, { v, on: true, color: kind === "pitch" ? d.style.color : levelColor(v) }]);
          }}
        >
          {IND_ICONS.plus(12)} {t("dp.addLevel")}
        </button>
        <button type="button" className={btnCls} onClick={() => apply({ extra: { levels: undefined } })}>
          {t("dp.resetLevels")}
        </button>
      </div>
    </div>
  );
}

function RowView({ row, ctx }: { row: PropRow; ctx: Ctx }) {
  const { d, apply, t } = ctx;
  if (row.showIf && readProp(d, row.showIf) !== row.showIf.eq) return null;
  const checked = row.check ? !!readProp(d, row.check, row.check.def) : true;
  const full = row.controls?.some((c) => c.type === "levels" || (c.type === "text" && c.multiline));
  return (
    <div className={`flex ${full ? "flex-col items-stretch gap-1" : "items-center gap-2"} min-h-[34px] py-0.5`}>
      {(row.check || row.labelKey) && (
        <label className={`flex shrink-0 items-center gap-2 ${full ? "" : "w-[108px] sm:w-[150px]"} text-[13px] text-[var(--tv3-text)]`}>
          {row.check && (
            <Toggle sm checked={checked} onChange={(c) => apply(propPatch(row.check as Ref, c))} />
          )}
          <span className="leading-tight">{row.labelKey ? t(row.labelKey) : ""}</span>
        </label>
      )}
      {row.controls && row.controls.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1.5 ${full ? "w-full" : ""} ${row.check && !checked ? "opacity-45" : ""}`}>
          {row.controls.map((c, i) => (
            <ControlView key={i} ctl={c} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sections({ sections, ctx }: { sections: PropSection[]; ctx: Ctx }) {
  return (
    <div className="flex flex-col gap-1">
      {sections.map((s, i) => (
        <div key={i} className={i > 0 || s.titleKey ? "mt-2 border-t border-[var(--tv3-hair)] pt-2" : ""}>
          {s.titleKey && <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tv3-muted)]">{ctx.t(s.titleKey)}</div>}
          {s.rows.map((r, k) => (
            <RowView key={k} row={r} ctx={ctx} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ───────────── coordinates ───────────── */

const p2 = (n: number) => String(n).padStart(2, "0");

/** Chart time is already shifted to the exchange clock, so UTC getters give the wall time shown on the axis. */
function toInput(t: number, seconds: boolean): string {
  const x = new Date(t);
  const base = `${x.getUTCFullYear()}-${p2(x.getUTCMonth() + 1)}-${p2(x.getUTCDate())}T${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}`;
  return seconds ? `${base}:${p2(x.getUTCSeconds())}` : base;
}
function fromInput(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?/);
  if (!m) return null;
  const v = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return Number.isFinite(v) ? v : null;
}

function CoordsTab({ controller, ctx, schema }: { controller: DrawingsControllerLike; ctx: Ctx; schema: PropSchema }) {
  const { d, apply, t } = ctx;
  const info = controller.getViewInfo();
  const prec = Math.max(0, Math.min(8, info.precision));
  const secs = info.intervalMs < 60_000;
  const setPoint = (i: number, patch: Partial<DPoint>) => {
    const pts = d.points.map((q, k) => (k === i ? { ...q, ...patch } : { ...q }));
    apply({ points: pts });
  };
  const shown = d.points.slice(0, 12);
  return (
    <div className="flex flex-col gap-2">
      {shown.map((pt, i) => {
        const lk = schema.pointLabels?.[i];
        return (
          <div key={i} className="rounded-lg border border-[var(--tv3-hair)] p-2">
            <div className="mb-1.5 text-[12px] font-medium text-[var(--tv3-muted)]">{lk ? t(lk) : t("dp.point", { n: i + 1 })}</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-[11px] text-[var(--tv3-muted)]">
                {t("dp.price")}
                <NumInput value={Number(pt.p.toFixed(prec))} min={-1e15} max={1e15} step={Math.pow(10, -prec)} className="w-full" onChange={(n) => setPoint(i, { p: n })} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] text-[var(--tv3-muted)]">
                {t("dp.bar")}
                <NumInput value={Math.round(controller.barIndexOf(pt.t))} min={-1e7} max={1e7} step={1} className="w-full" onChange={(n) => setPoint(i, { t: controller.timeOfBar(n) })} />
              </label>
              <label className="col-span-2 flex flex-col gap-0.5 text-[11px] text-[var(--tv3-muted)]">
                {t("dp.datetime")}
                <input
                  type="datetime-local"
                  step={secs ? 1 : 60}
                  value={toInput(pt.t, secs)}
                  onChange={(e) => {
                    const v = fromInput(e.target.value);
                    if (v !== null) setPoint(i, { t: v });
                  }}
                  className={`${inputCls} w-full`}
                />
              </label>
            </div>
          </div>
        );
      })}
      {d.points.length > shown.length && <div className="text-[12px] text-[var(--tv3-muted)]">{t("dp.morePoints", { n: d.points.length - shown.length })}</div>}
    </div>
  );
}

/* ───────────── visibility ───────────── */

const THUMB =
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--tv3-accent)] [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-white dark:[&::-webkit-slider-thumb]:ring-[#1e222d] [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[var(--tv3-accent)]";

function VisTab({ controller, ctx }: { controller: DrawingsControllerLike; ctx: Ctx }) {
  const { d, apply, t } = ctx;
  const vis = getVis(d);
  const cur = intervalUnit(controller.getViewInfo().intervalMs).unit;
  const set = (u: VisUnit, patch: Partial<{ on: boolean; min: number; max: number }>) => {
    const next = { ...vis, [u]: { ...vis[u], ...patch } };
    apply({ extra: { vis: next } });
  };
  return (
    <div className="flex flex-col gap-1">
      {VIS_UNITS.map((u) => {
        const [lo, hi] = VIS_LIMITS[u];
        const r = vis[u];
        const span = Math.max(1, hi - lo);
        const left = ((r.min - lo) / span) * 100;
        const right = ((r.max - lo) / span) * 100;
        return (
          <div key={u} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 ${u === cur ? "bg-[var(--tv3-accent-soft)]" : ""}`}>
            <label className="flex w-[110px] shrink-0 items-center gap-2 text-[13px] text-[var(--tv3-text)]">
              <Toggle sm checked={r.on} onChange={(c) => set(u, { on: c })} />
              {t(`dp.vis.${u}`)}
            </label>
            <div className={`flex min-w-[220px] flex-1 items-center gap-2 ${r.on ? "" : "opacity-45"}`}>
              <NumInput value={r.min} min={lo} max={r.max} className="w-[52px]" onChange={(n) => set(u, { min: Math.min(n, r.max) })} />
              <div className="relative h-5 min-w-[80px] flex-1">
                <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded bg-[var(--tv3-fill2)]" />
                <div className="absolute top-1/2 h-1 -translate-y-1/2 rounded-lg bg-[var(--tv3-accent)]" style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }} />
                <input type="range" min={lo} max={hi} value={r.min} aria-label={t("dp.min")} onChange={(e) => set(u, { min: Math.min(Number(e.target.value), r.max) })} className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB}`} />
                <input type="range" min={lo} max={hi} value={r.max} aria-label={t("dp.max")} onChange={(e) => set(u, { max: Math.max(Number(e.target.value), r.min) })} className={`pointer-events-none absolute inset-0 h-5 w-full appearance-none bg-transparent ${THUMB}`} />
              </div>
              <NumInput value={r.max} min={r.min} max={hi} className="w-[52px]" onChange={(n) => set(u, { max: Math.max(n, r.min) })} />
            </div>
          </div>
        );
      })}
      <p className="mt-1 px-2 text-[11px] text-[var(--tv3-muted)]">{t("dp.vis.hint")}</p>
    </div>
  );
}

/* ───────────── the dialog ───────────── */

export default function DrawingSettingsDialog({ controller, id, onClose }: { controller: DrawingsControllerLike; id: string | null; onClose: () => void }) {
  if (!id) return null;
  return <Dialog key={id} controller={controller} id={id} onClose={onClose} />;
}

function Dialog({ controller, id, onClose }: { controller: DrawingsControllerLike; id: string; onClose: () => void }) {
  const { t } = useT();
  const d = useLive(controller, id);
  const orig = useRef<Snapshot | null>(null);
  const committed = useRef(false);
  if (!orig.current && d) orig.current = { style: clone(d.style), extra: d.extra ? clone(d.extra) : undefined, points: clone(d.points), locked: d.locked };

  const def = d ? getToolDef(d.tool) : undefined;
  const schema: PropSchema | null = d && def ? getPropSchema(d.tool) ?? schemaFromUi(def.ui) : null;
  const styleSections = schema?.style.filter((s) => s.rows.length) ?? [];
  const tabs: Tab[] = [];
  if (schema) {
    if (styleSections.length) tabs.push("style");
    if (schema.text) tabs.push("text");
    if (!schema.noCoords) tabs.push("coords");
    tabs.push("vis");
  }
  const [tab, setTab] = useState<Tab | null>(null);
  const activeTab: Tab = tab && tabs.includes(tab) ? tab : schema?.primary === "text" && tabs.includes("text") ? "text" : tabs[0] ?? "style";

  const [mobile, setMobile] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const on = () => setMobile(window.innerWidth < 640);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    if (pos || mobile) return;
    const w = Math.min(430, window.innerWidth - 16);
    setPos({ x: Math.max(8, (window.innerWidth - w) / 2), y: Math.max(12, Math.round(window.innerHeight * 0.1)) });
  }, [pos, mobile]);

  const apply = useCallback(
    (patch: DrawingPatch) => {
      controller.updateById(id, patch, { commit: !committed.current });
      committed.current = true;
    },
    [controller, id]
  );

  const cancel = useCallback(() => {
    const o = orig.current;
    if (o && controller.getById(id)) controller.updateById(id, { style: o.style, extra: o.extra ?? {}, points: o.points, locked: o.locked }, { replace: true, dropUndo: committed.current });
    onClose();
  }, [controller, id, onClose]);

  // the drawing was deleted while the dialog is open
  useEffect(() => {
    if (!d) onClose();
  }, [d, onClose]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [cancel]);

  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const onHeaderDown = (e: React.PointerEvent) => {
    if (mobile || !pos || (e.target as HTMLElement).closest("button")) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHeaderMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const w = panel.current?.offsetWidth ?? 430;
    setPos({ x: Math.max(-w + 80, Math.min(window.innerWidth - 80, e.clientX - g.dx)), y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - g.dy)) });
  };
  const onHeaderUp = () => {
    drag.current = null;
  };

  if (!d || !def || !schema) return null;
  const ctx: Ctx = { d, apply, t };
  const tabLabel: Record<Tab, string> = { style: t("dp.tab.style"), text: t("dp.tab.text"), coords: t("dp.tab.coords"), vis: t("dp.tab.vis") };

  return (
    <div className="pointer-events-none fixed inset-0 z-[70]">
      <div
        ref={panel}
        role="dialog"
        aria-label={t("dp.title", { tool: t(def.labelKey) })}
        className={
          mobile
            ? "pointer-events-auto absolute inset-x-0 bottom-0 flex max-h-[72vh] flex-col rounded-t-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
            : "pointer-events-auto absolute flex max-h-[80vh] w-[430px] max-w-[calc(100vw-16px)] flex-col rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)]"
        }
        style={mobile ? undefined : { left: pos?.x ?? -9999, top: pos?.y ?? -9999 }}
      >
        <div
          onPointerDown={onHeaderDown}
          onPointerMove={onHeaderMove}
          onPointerUp={onHeaderUp}
          onPointerCancel={onHeaderUp}
          className={`flex shrink-0 items-center justify-between gap-2 px-4 pb-1 pt-3 ${mobile ? "" : "cursor-move select-none"}`}
        >
          <h2 className="truncate text-[15px] font-semibold">{t(def.labelKey)}</h2>
          <button type="button" onClick={cancel} title={t("dp.cancel")} aria-label={t("dp.cancel")} className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)]">
            {IND_ICONS.close(16)}
          </button>
        </div>

        <div role="tablist" className="flex shrink-0 gap-4 overflow-x-auto border-b border-[var(--tv3-hair)] px-4 [scrollbar-width:none]">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={activeTab === k}
              onClick={() => setTab(k)}
              className={`-mb-px whitespace-nowrap border-b-2 py-2 text-[13px] ${activeTab === k ? "border-[var(--tv3-accent)] font-medium text-[var(--tv3-text)]" : "border-transparent text-[var(--tv3-muted)] hover:text-[var(--tv3-text)]"}`}
            >
              {tabLabel[k]}
            </button>
          ))}
        </div>

        <div className="min-h-[120px] flex-1 overflow-y-auto px-4 py-3">
          {activeTab === "style" && <Sections sections={styleSections} ctx={ctx} />}
          {activeTab === "text" && schema.text && <Sections sections={textSections(schema.text)} ctx={ctx} />}
          {activeTab === "coords" && <CoordsTab controller={controller} ctx={ctx} schema={schema} />}
          {activeTab === "vis" && <VisTab controller={controller} ctx={ctx} />}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--tv3-hair)] px-4 py-3">
          <TemplateMenu d={d} controller={controller} apply={apply} t={t} factory={def.style} />
          <div className="flex gap-2">
            <button type="button" onClick={cancel} className={`${btnCls} px-3`}>
              {t("dp.cancel")}
            </button>
            <button type="button" onClick={onClose} className="h-7 rounded-lg bg-[var(--tv3-accent)] px-4 text-[13px] font-medium text-white hover:bg-[var(--tv3-accent-hover)]">
              {t("dp.ok")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
