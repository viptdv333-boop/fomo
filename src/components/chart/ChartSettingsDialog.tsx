"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "./ModalPortal";
import ColorPicker from "./ColorPicker";
import { CS_ICONS } from "./icons-cs";
import { tzLabel } from "./tz";
import { TIME_ZONES, applyPreset, defaultGradient, resetSettings, type ChartSettings, type ColorOverrides, type ThemePreset } from "@/lib/chart/settings";
import type { ChartTheme, PriceSource, ScaleMode } from "@/lib/chart/types";
import type { ChartSettingsApi } from "./useChartSettings";

export type SettingsTab = "symbol" | "status" | "scales" | "canvas";
export type SettingsToggleKey = "showVolume" | "showGrid" | "showWatermark";

interface Props {
  open: boolean;
  onClose: () => void;
  api: ChartSettingsApi;
  /** The theme actually in use (settings resolved over the preset), to show current colours. */
  theme: ChartTheme;
  autoScale: boolean;
  onAutoScale: (auto: boolean) => void;
  toggles: Record<SettingsToggleKey, boolean>;
  onToggle: (k: SettingsToggleKey, v: boolean) => void;
  initialTab?: SettingsTab;
}

const TABS: { id: SettingsTab; key: string }[] = [
  { id: "symbol", key: "cs.tab.symbol" },
  { id: "status", key: "cs.tab.status" },
  { id: "scales", key: "cs.tab.scales" },
  { id: "canvas", key: "cs.tab.canvas" },
];

const inputCls =
  "h-8 rounded border border-gray-300 dark:border-[#363a45] bg-white dark:bg-[#131722] px-2 text-[13px] text-gray-900 dark:text-gray-100 outline-none focus:border-[#2962ff] focus:ring-1 focus:ring-[#2962ff]";

/* ───────────── small controls ───────────── */

function Row({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-9 py-0.5" title={hint}>
      <span className="text-[13px] text-gray-800 dark:text-gray-200 min-w-0">{label}</span>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

function Check({ checked, onChange, label, children }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-9 py-0.5">
      <label className="flex items-center gap-2.5 cursor-pointer text-[13px] text-gray-800 dark:text-gray-200 min-w-0">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#2962ff] shrink-0" />
        <span className="min-w-0">{label}</span>
      </label>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

function Sel<T extends string | number>({ value, options, onChange, width = 150 }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; width?: number }) {
  return (
    <select
      value={String(value)}
      onChange={(e) => {
        const o = options.find((x) => String(x.id) === e.target.value);
        if (o) onChange(o.id);
      }}
      className={`${inputCls} cursor-pointer`}
      style={{ width }}
    >
      {options.map((o) => (
        <option key={String(o.id)} value={String(o.id)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Num({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className={`${inputCls} w-[72px] text-right`}
      />
      {suffix && <span className="text-xs text-gray-500 dark:text-gray-400 w-4">{suffix}</span>}
    </span>
  );
}

function Section({ children }: { children: ReactNode }) {
  return <div className="mt-4 mb-1 first:mt-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{children}</div>;
}

/* ───────────── dialog ───────────── */

export default function ChartSettingsDialog({ open, onClose, api, theme, autoScale, onAutoScale, toggles, onToggle, initialTab }: Props) {
  const { t, locale } = useT();
  const { settings: s, update } = api;
  const [tab, setTab] = useState<SettingsTab>("symbol");
  const initial = useRef<{ s: ChartSettings; toggles: Record<SettingsToggleKey, boolean> } | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cpLabels = { opacity: t("cs.color.opacity"), custom: t("cs.color.custom"), recent: t("cs.color.recent") };

  useEffect(() => {
    if (!open) return;
    initial.current = { s: api.settings, toggles };
    setTab(initialTab ?? "symbol");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const cancel = () => {
    const i = initial.current;
    if (i) {
      api.replace(i.s);
      (Object.keys(i.toggles) as SettingsToggleKey[]).forEach((k) => {
        if (toggles[k] !== i.toggles[k]) onToggle(k, i.toggles[k]);
      });
    }
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const set = (fn: (x: ChartSettings) => ChartSettings) => update(fn);
  const col = (key: keyof ColorOverrides, value: string) => set((x) => ({ ...x, colors: { ...x.colors, [key]: value } }));
  const sw = (value: string, onChange: (c: string) => void, opacity = true) => <ColorPicker value={value} onChange={onChange} opacity={opacity} labels={cpLabels} size={26} />;

  const [gradTop, gradBottom] = defaultGradient(theme.bg);
  const stat = s.status;
  const setStatus = (k: keyof typeof stat, v: boolean) => set((x) => ({ ...x, status: { ...x.status, [k]: v } }));
  const sc = s.scale;
  const setScale = <K extends keyof typeof sc>(k: K, v: (typeof sc)[K]) => set((x) => ({ ...x, scale: { ...x.scale, [k]: v } }));
  const cs = s.candle;
  const setCandle = <K extends keyof typeof cs>(k: K, v: (typeof cs)[K]) => set((x) => ({ ...x, candle: { ...x.candle, [k]: v } }));
  const ch = s.crosshair;

  const precisionOpts: { id: string; label: string }[] = [{ id: "auto", label: t("cs.auto") }].concat(
    Array.from({ length: 9 }, (_, i) => ({ id: String(i), label: i === 0 ? "1" : "0." + "0".repeat(i - 1) + "1" }))
  );
  const srcOpts: { id: PriceSource; label: string }[] = (["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"] as PriceSource[]).map((id) => ({ id, label: t(`cs.src.${id}`) }));
  const modeOpts: { id: ScaleMode; label: string }[] = (["regular", "percent", "indexed", "log"] as ScaleMode[]).map((id) => ({ id, label: t(`cs.mode.${id}`) }));
  const tzOpts = [
    { id: "auto", label: tzLabel("auto", t, locale) },
    { id: "exchange", label: tzLabel("exchange", t, locale) },
    { id: "local", label: tzLabel("local", t, locale) },
    ...TIME_ZONES.map((z) => ({ id: z.id, label: tzLabel(z.id, t, locale) })),
  ];
  if (!tzOpts.some((o) => o.id === s.tz)) tzOpts.push({ id: s.tz, label: tzLabel(s.tz, t, locale) });

  const eff = (o: string, base: string) => o || base;

  const symbolTab = (
    <>
      <Section>{t("cs.sec.candles")}</Section>
      <Check checked={cs.byPrevClose} onChange={(v) => setCandle("byPrevClose", v)} label={t("cs.byPrevClose")} />
      <Check checked={cs.bodyOn} onChange={(v) => setCandle("bodyOn", v)} label={t("cs.body")}>
        {sw(eff(cs.upBody, theme.up), (c) => setCandle("upBody", c), false)}
        {sw(eff(cs.downBody, theme.down), (c) => setCandle("downBody", c), false)}
      </Check>
      <Check checked={cs.borderOn} onChange={(v) => setCandle("borderOn", v)} label={t("cs.border")}>
        {sw(eff(cs.upBorder, eff(cs.upBody, theme.up)), (c) => setCandle("upBorder", c), false)}
        {sw(eff(cs.downBorder, eff(cs.downBody, theme.down)), (c) => setCandle("downBorder", c), false)}
      </Check>
      <Check checked={cs.wickOn} onChange={(v) => setCandle("wickOn", v)} label={t("cs.wick")}>
        {sw(eff(cs.upWick, eff(cs.upBody, theme.up)), (c) => setCandle("upWick", c), false)}
        {sw(eff(cs.downWick, eff(cs.downBody, theme.down)), (c) => setCandle("downWick", c), false)}
      </Check>

      <Section>{t("cs.sec.data")}</Section>
      <Row label={t("cs.precision")}>
        <Sel
          value={s.precision === "auto" ? "auto" : String(s.precision)}
          options={precisionOpts}
          onChange={(v) => set((x) => ({ ...x, precision: v === "auto" ? "auto" : Number(v) }))}
        />
      </Row>
      <Row label={t("cs.priceSource")} hint={t("cs.priceSourceHint")}>
        <Sel value={s.priceSource} options={srcOpts} onChange={(v) => set((x) => ({ ...x, priceSource: v }))} />
      </Row>
      <Row label={t("cs.lineWidth")}>
        <Sel value={s.lineWidth} options={[1, 2, 3, 4].map((n) => ({ id: n, label: `${n} px` }))} onChange={(v) => set((x) => ({ ...x, lineWidth: Number(v) }))} width={90} />
      </Row>
      <Row label={t("cs.lineColor")}>
        {sw(theme.line, (c) => col("line", c))}
      </Row>
      <Row label={t("cs.baselineLevel")}>
        <Num value={Math.round(s.baselinePercent)} min={5} max={95} onChange={(v) => set((x) => ({ ...x, baselinePercent: v }))} suffix="%" />
      </Row>
      <Check checked={toggles.showVolume} onChange={(v) => onToggle("showVolume", v)} label={t("chart.volume")} />

      <Section>{t("cs.sec.time")}</Section>
      <Row label={t("cs.timezone")}>
        <Sel value={s.tz} options={tzOpts} onChange={(v) => set((x) => ({ ...x, tz: String(v) }))} width={210} />
      </Row>
    </>
  );

  const statusTab = (
    <>
      <Section>{t("cs.sec.statusLine")}</Section>
      <Check checked={stat.symbol} onChange={(v) => setStatus("symbol", v)} label={t("cs.st.symbol")} />
      <Check checked={stat.ohlc} onChange={(v) => setStatus("ohlc", v)} label={t("cs.st.ohlc")} />
      <Check checked={stat.barChange} onChange={(v) => setStatus("barChange", v)} label={t("cs.st.barChange")} />
      <Check checked={stat.change} onChange={(v) => setStatus("change", v)} label={t("cs.st.change")} />
      <Check checked={stat.volume} onChange={(v) => setStatus("volume", v)} label={t("cs.st.volume")} />
      <Check checked={stat.indTitles} onChange={(v) => setStatus("indTitles", v)} label={t("cs.st.indTitles")} />
      <Check checked={stat.indValues} onChange={(v) => setStatus("indValues", v)} label={t("cs.st.indValues")} />
    </>
  );

  const scalesTab = (
    <>
      <Section>{t("cs.sec.scale")}</Section>
      <Row label={t("cs.scaleMode")}>
        <Sel value={sc.mode} options={modeOpts} onChange={(v) => setScale("mode", v)} width={170} />
      </Row>
      <Check checked={autoScale} onChange={onAutoScale} label={t("cs.autoScale")} />
      <Check checked={sc.lock} onChange={(v) => setScale("lock", v)} label={t("cs.lockScale")} />
      <Check checked={sc.invert} onChange={(v) => setScale("invert", v)} label={t("cs.invertScale")} />
      <Row label={t("cs.scaleSide")}>
        <Sel value={sc.side} options={[{ id: "right", label: t("cs.side.right") }, { id: "left", label: t("cs.side.left") }]} onChange={(v) => setScale("side", v)} width={130} />
      </Row>

      <Section>{t("cs.sec.labels")}</Section>
      <Check checked={sc.symbolLabel} onChange={(v) => setScale("symbolLabel", v)} label={t("cs.lbl.symbol")} />
      <Check checked={sc.lastPriceLabel} onChange={(v) => setScale("lastPriceLabel", v)} label={t("cs.lbl.lastPrice")} />
      <Check checked={sc.priceLine} onChange={(v) => setScale("priceLine", v)} label={t("cs.lbl.priceLine")} />
      <Check checked={sc.prevCloseLine} onChange={(v) => setScale("prevCloseLine", v)} label={t("cs.lbl.prevClose")} />
      <Check checked={sc.countdown} onChange={(v) => setScale("countdown", v)} label={t("cs.lbl.countdown")} />
      <Check checked={sc.highLow} onChange={(v) => setScale("highLow", v)} label={t("cs.lbl.highLow")} />

      <Section>{t("cs.sec.sizes")}</Section>
      <Row label={t("cs.fontSize")}>
        <Sel value={sc.fontSize} options={[10, 11, 12, 13, 14, 16].map((n) => ({ id: n, label: `${n} px` }))} onChange={(v) => setScale("fontSize", Number(v))} width={90} />
      </Row>
      <Row label={t("cs.marginTop")}>
        <Num value={sc.marginTop} min={0} max={40} onChange={(v) => setScale("marginTop", v)} suffix="%" />
      </Row>
      <Row label={t("cs.marginBottom")}>
        <Num value={sc.marginBottom} min={0} max={40} onChange={(v) => setScale("marginBottom", v)} suffix="%" />
      </Row>
      <Row label={t("cs.rightOffset")}>
        <Num value={sc.rightOffset} min={0} max={200} onChange={(v) => setScale("rightOffset", v)} />
      </Row>
    </>
  );

  const canvasTab = (
    <>
      <Section>{t("cs.sec.background")}</Section>
      <Row label={t("cs.bgType")}>
        <Sel
          value={s.bgType}
          options={[{ id: "solid", label: t("cs.bg.solid") }, { id: "gradient", label: t("cs.bg.gradient") }]}
          onChange={(v) => set((x) => ({ ...x, bgType: v }))}
          width={150}
        />
        {s.bgType === "solid" ? (
          sw(theme.bg, (c) => col("bg", c), false)
        ) : (
          <>
            {sw(theme.bgTop ?? gradTop, (c) => col("gradTop", c), false)}
            {sw(theme.bgBottom ?? gradBottom, (c) => col("gradBottom", c), false)}
          </>
        )}
      </Row>
      <Row label={t("cs.textColor")}>
        {sw(theme.text, (c) => col("text", c), false)}
      </Row>
      <Row label={t("cs.scaleTextColor")}>
        {sw(theme.textMuted, (c) => col("textMuted", c), false)}
      </Row>

      <Section>{t("cs.sec.grid")}</Section>
      <Check checked={toggles.showGrid} onChange={(v) => onToggle("showGrid", v)} label={t("cs.grid.all")} />
      <Check checked={s.gridV} onChange={(v) => set((x) => ({ ...x, gridV: v }))} label={t("cs.grid.v")} />
      <Check checked={s.gridH} onChange={(v) => set((x) => ({ ...x, gridH: v }))} label={t("cs.grid.h")} />
      <Row label={t("cs.grid.color")}>
        {sw(theme.grid, (c) => col("grid", c))}
      </Row>

      <Section>{t("cs.sec.crosshair")}</Section>
      <Row label={t("cs.ch.color")}>
        {sw(theme.crosshair, (c) => col("crosshair", c))}
      </Row>
      <Row label={t("cs.ch.width")}>
        <Sel value={ch.width} options={[1, 2, 3].map((n) => ({ id: n, label: `${n} px` }))} onChange={(v) => set((x) => ({ ...x, crosshair: { ...x.crosshair, width: Number(v) } }))} width={90} />
      </Row>
      <Row label={t("cs.ch.style")}>
        <Sel
          value={ch.style}
          options={[{ id: "solid", label: t("cs.line.solid") }, { id: "dashed", label: t("cs.line.dashed") }, { id: "dotted", label: t("cs.line.dotted") }]}
          onChange={(v) => set((x) => ({ ...x, crosshair: { ...x.crosshair, style: v } }))}
          width={130}
        />
      </Row>
      <Check checked={ch.priceLabel} onChange={(v) => set((x) => ({ ...x, crosshair: { ...x.crosshair, priceLabel: v } }))} label={t("cs.ch.priceLabel")} />
      <Check checked={ch.timeLabel} onChange={(v) => set((x) => ({ ...x, crosshair: { ...x.crosshair, timeLabel: v } }))} label={t("cs.ch.timeLabel")} />

      <Section>{t("cs.sec.watermark")}</Section>
      <Check checked={toggles.showWatermark} onChange={(v) => onToggle("showWatermark", v)} label={t("cs.wm.symbol")}>
        {sw(theme.watermark, (c) => col("watermark", c))}
      </Check>

      <Section>{t("cs.sec.other")}</Section>
      <Row label={t("cs.paneSeparators")}>
        {sw(theme.paneBorder, (c) => col("paneBorder", c))}
      </Row>
      <Row label={t("cs.scaleBorder")}>
        {sw(theme.axisBorder, (c) => col("axisBorder", c))}
      </Row>
      <Check checked={s.sessionBreaks} onChange={(v) => set((x) => ({ ...x, sessionBreaks: v }))} label={t("cs.sessionBreaks")} />
      <Row label={t("cs.navButtons")}>
        <Sel
          value={s.navButtons}
          options={[{ id: "always", label: t("cs.nav.always") }, { id: "hover", label: t("cs.nav.hover") }, { id: "never", label: t("cs.nav.never") }]}
          onChange={(v) => set((x) => ({ ...x, navButtons: v }))}
          width={150}
        />
      </Row>
    </>
  );

  const presetOpts: { id: ThemePreset; label: string }[] = [
    { id: "classic", label: t("cs.preset.classic") },
    { id: "tvdark", label: t("cs.preset.tvdark") },
    { id: "tvlight", label: t("cs.preset.tvlight") },
  ];

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[70] flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && cancel()}>
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("cs.title")}
        className="flex flex-col w-full sm:w-[720px] sm:max-w-full h-full sm:h-[600px] sm:max-h-full sm:rounded-xl overflow-hidden bg-white dark:bg-[#1e222d] text-gray-900 dark:text-gray-100 shadow-2xl border border-gray-200 dark:border-[#2a2e39] outline-none"
      >
        <div className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-gray-200 dark:border-[#2a2e39]">
          <h2 className="text-base font-semibold">{t("cs.title")}</h2>
          <button onClick={cancel} aria-label={t("shell.close")} className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
            {CS_ICONS.close}
          </button>
        </div>

        <div className="flex flex-col sm:flex-row flex-1 min-h-0">
          <div className="flex sm:flex-col shrink-0 gap-0.5 p-2 overflow-x-auto sm:w-[170px] sm:border-r border-b sm:border-b-0 border-gray-200 dark:border-[#2a2e39] [scrollbar-width:none]">
            {TABS.map((x) => (
              <button
                key={x.id}
                onClick={() => setTab(x.id)}
                aria-pressed={tab === x.id}
                className={`h-9 px-3 rounded-md text-[13px] text-left whitespace-nowrap cursor-pointer transition ${
                  tab === x.id ? "bg-[#2962ff]/10 text-[#2962ff] dark:text-[#6f95ff] font-medium" : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2e39]"
                }`}
              >
                {t(x.key)}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto px-4 py-3">
            {tab === "symbol" && symbolTab}
            {tab === "status" && statusTab}
            {tab === "scales" && scalesTab}
            {tab === "canvas" && canvasTab}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 shrink-0 border-t border-gray-200 dark:border-[#2a2e39]">
          <div className="flex items-center gap-2 min-w-0">
            <Sel
              value={s.preset}
              options={presetOpts}
              onChange={(v) => api.replace(applyPreset(s, v))}
              width={160}
            />
            <button
              onClick={() => api.replace(resetSettings(s))}
              className="h-8 px-3 rounded-md text-[13px] border border-gray-300 dark:border-[#363a45] hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer whitespace-nowrap"
            >
              {t("cs.reset")}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={cancel} className="h-8 px-3.5 rounded-md text-[13px] border border-gray-300 dark:border-[#363a45] hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
              {t("cs.cancel")}
            </button>
            <button onClick={onClose} className="h-8 px-4 rounded-md text-[13px] font-medium bg-[#2962ff] text-white hover:bg-[#1e53e5] cursor-pointer">
              {t("cs.ok")}
            </button>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
