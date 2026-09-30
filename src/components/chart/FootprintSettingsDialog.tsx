"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import ModalPortal from "./ModalPortal";
import ColorPicker from "./ColorPicker";
import { CS_ICONS } from "./icons-cs";
import { UI_ICONS } from "./icons";
import { DEFAULT_FOOTPRINT, type FootprintColors, type FootprintMode, type FootprintSettings } from "@/lib/chart/orderflow/types";
import type { ChartSettingsApi } from "./useChartSettings";

const field = "h-8 rounded border border-gray-300 dark:border-[#363a45] bg-white dark:bg-[#131722] px-2 text-[13px] outline-none focus:border-[#2962ff]";

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 min-h-9" title={hint}>
      <span className="text-[13px] text-gray-700 dark:text-gray-300">{label}</span>
      <span className="flex items-center gap-2 shrink-0">{children}</span>
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 min-h-9 cursor-pointer text-[13px] text-gray-700 dark:text-gray-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-[#2962ff] cursor-pointer" />
      {label}
    </label>
  );
}

function Num({ value, onChange, min, max, step = 1, w = "w-20" }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; w?: string }) {
  // typing "1." or an empty field must not be overwritten while editing
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value);
        if (isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
      onBlur={() => setText(String(value))}
      className={`${field} ${w} text-right`}
    />
  );
}

/** Gear next to the chart type when it is the footprint: opens the footprint settings dialog. */
export default function FootprintSettingsButton({ api, btn, source }: { api: ChartSettingsApi; btn: string; source?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title={t("of.fp.title")} aria-label={t("of.fp.title")} className={`${btn} px-1.5`}>
        <span className="scale-[0.8] inline-flex">{UI_ICONS.gear}</span>
      </button>
      {open && <FootprintSettingsDialog api={api} source={source} onClose={() => setOpen(false)} />}
    </>
  );
}

function FootprintSettingsDialog({ api, source, onClose }: { api: ChartSettingsApi; source?: string; onClose: () => void }) {
  const { t } = useT();
  const fp = api.settings.footprint;
  const set = (patch: Partial<FootprintSettings>) => api.update((x) => ({ ...x, footprint: { ...x.footprint, ...patch } }));
  const setColor = (k: keyof FootprintColors, v: string) => api.update((x) => ({ ...x, footprint: { ...x.footprint, colors: { ...x.footprint.colors, [k]: v } } }));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const srcKey = source === "bybit" ? "of.src.bybit" : source === "moex" ? "of.src.moex" : "of.src.none";
  const cpLabels = { opacity: t("ind2.color.opacity"), custom: t("ind2.color.custom"), recent: t("ind2.color.recent") };
  const modes: FootprintMode[] = ["bidask", "delta", "volume", "deltavol"];
  const colorRows: [keyof FootprintColors, string, string][] = [
    ["buy", "of.fp.c.buy", "#089981"],
    ["sell", "of.fp.c.sell", "#f23645"],
    ["poc", "of.fp.c.poc", DEFAULT_FOOTPRINT.colors.poc],
    ["imbBuy", "of.fp.c.imbBuy", "#089981"],
    ["imbSell", "of.fp.c.imbSell", "#f23645"],
    ["stacked", "of.fp.c.stacked", DEFAULT_FOOTPRINT.colors.stacked],
    ["valueArea", "of.fp.c.va", DEFAULT_FOOTPRINT.colors.valueArea],
    ["text", "of.fp.c.text", "#d1d4dc"],
  ];

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[70] flex items-stretch sm:items-center justify-center bg-black/50 sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div role="dialog" aria-modal="true" aria-label={t("of.fp.title")} className="flex flex-col w-full sm:w-[560px] sm:max-w-full h-full sm:h-auto sm:max-h-[88vh] sm:rounded-xl overflow-hidden bg-white dark:bg-[#1e222d] border border-gray-200 dark:border-[#2a2e39] shadow-2xl text-gray-900 dark:text-gray-100">
          <div className="flex items-center justify-between h-12 px-4 shrink-0 border-b border-gray-200 dark:border-[#2a2e39]">
            <h2 className="text-base font-semibold">{t("of.fp.title")}</h2>
            <button onClick={onClose} aria-label={t("shell.close")} className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
              {CS_ICONS.close}
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-2">
            <p className={`mb-2 rounded-md px-2.5 py-1.5 text-[12px] ${srcKey === "of.src.none" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>{t(srcKey)}</p>

            <Row label={t("of.fp.mode")}>
              <select value={fp.mode} onChange={(e) => set({ mode: e.target.value as FootprintMode })} className={`${field} cursor-pointer max-w-[250px]`}>
                {modes.map((m) => (
                  <option key={m} value={m}>
                    {t(`of.fp.mode.${m}`)}
                  </option>
                ))}
              </select>
            </Row>
            <Row label={t("of.fp.step")}>
              <select value={fp.stepTicks === 0 ? "auto" : "n"} onChange={(e) => set({ stepTicks: e.target.value === "auto" ? 0 : Math.max(1, fp.stepTicks || 1) })} className={`${field} cursor-pointer`}>
                <option value="auto">{t("of.fp.step.auto")}</option>
                <option value="n">{t("of.fp.step.ticks")}</option>
              </select>
              {fp.stepTicks > 0 && <Num value={fp.stepTicks} min={1} max={100000} onChange={(v) => set({ stepTicks: Math.round(v) })} />}
            </Row>

            <div className="mt-2 grid sm:grid-cols-2 gap-x-6">
              <Check checked={fp.poc} onChange={(v) => set({ poc: v })} label={t("of.fp.poc")} />
              <Check checked={fp.unfinished} onChange={(v) => set({ unfinished: v })} label={t("of.fp.unfinished")} />
              <Check checked={fp.totals} onChange={(v) => set({ totals: v })} label={t("of.fp.totals")} />
              <Check checked={fp.candleBody} onChange={(v) => set({ candleBody: v })} label={t("of.fp.body")} />
              <Check checked={fp.valueArea} onChange={(v) => set({ valueArea: v })} label={t("of.fp.va")} />
              {fp.valueArea && (
                <Row label={t("of.fp.vaPct")}>
                  <Num value={fp.valueAreaPct} min={10} max={100} onChange={(v) => set({ valueAreaPct: Math.round(v) })} />
                </Row>
              )}
            </div>

            <div className="mt-2 border-t border-gray-200 dark:border-[#2a2e39] pt-1">
              <Check checked={fp.imbalance} onChange={(v) => set({ imbalance: v })} label={t("of.fp.imb")} />
              {fp.imbalance && (
                <div className="pl-6">
                  <Row label={t("of.fp.imbRatio")}>
                    <Num value={fp.imbalanceRatio} min={1.1} max={100} step={0.5} onChange={(v) => set({ imbalanceRatio: v })} />
                  </Row>
                  <Row label={t("of.fp.imbMin")}>
                    <Num value={fp.imbalanceMinVol} min={0} max={1e12} step={1} w="w-24" onChange={(v) => set({ imbalanceMinVol: v })} />
                  </Row>
                  <Check checked={fp.diagonal} onChange={(v) => set({ diagonal: v })} label={t("of.fp.diag")} />
                  <Check checked={fp.stacked} onChange={(v) => set({ stacked: v })} label={t("of.fp.stacked")} />
                  {fp.stacked && (
                    <Row label={t("of.fp.stackedN")}>
                      <Num value={fp.stackedCount} min={2} max={12} onChange={(v) => set({ stackedCount: Math.round(v) })} />
                    </Row>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 border-t border-gray-200 dark:border-[#2a2e39] pt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t("of.fp.colors")}</div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                {colorRows.map(([k, label, shown]) => (
                  <div key={k} className="flex items-center justify-between gap-2 min-h-9">
                    <span className="text-[13px] text-gray-700 dark:text-gray-300">{t(label)}</span>
                    <span className="flex items-center gap-1.5">
                      <ColorPicker value={fp.colors[k] || shown} onChange={(c) => setColor(k, c)} opacity={false} labels={cpLabels} size={26} title={t(label)} />
                      {(k === "buy" || k === "sell" || k === "imbBuy" || k === "imbSell" || k === "text") && (
                        <button
                          type="button"
                          onClick={() => setColor(k, "")}
                          disabled={!fp.colors[k]}
                          title={t("cs.reset")}
                          className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                        >
                          ↺
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 h-12 shrink-0 border-t border-gray-200 dark:border-[#2a2e39]">
            <button type="button" onClick={() => api.update((x) => ({ ...x, footprint: DEFAULT_FOOTPRINT }))} className="h-8 px-3 rounded text-[13px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
              {t("of.fp.reset")}
            </button>
            <button type="button" onClick={onClose} className="h-8 px-4 rounded bg-[#2962ff] text-white text-[13px] font-medium hover:bg-[#1e53e5] cursor-pointer">
              OK
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
