"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n/client";
import type { IndicatorsController } from "@/lib/chart/indicators/controller";
import { getIndicatorDef } from "@/lib/chart/indicators/registry";
import { TV3, Toggle } from "./tv3-ui";

/* Compact «ИНДИКАТОРЫ» popover of the Terminal v3 design: colour dot + name + muted description + iOS switch per row
   (indicators that are on the chart first, then the popular ones), and a green «All indicators…» button that opens the
   full searchable catalog (IndicatorsDialog). */

// design order: averages, VWAP, ZigZag, Elliott, regression channel, volume profile, volumes, CVD, RSI; then the extra ones
const POPULAR = ["sma", "ema", "vwap", "zigzag", "elliott_auto", "linreg", "vprofile", "volume", "cvd", "rsi", "bb", "macd", "atr", "supertrend"];
const WIDTH = 320;

function colorOf(id: string): string {
  const def = getIndicatorDef(id);
  const sw = def?.params.find((p) => p.type === "color");
  return sw && sw.type === "color" ? sw.default : "#8e8e93";
}

interface Props {
  controller: IndicatorsController;
  onClose: () => void;
  /** open the full catalog dialog */
  onOpenCatalog: () => void;
  /** the toolbar button the popover hangs under (optional: falls back to the top-left of the chart area) */
  anchor?: HTMLElement | null;
}

export default function IndicatorsPopover({ controller, onClose, onOpenCatalog, anchor }: Props) {
  const { t } = useT();
  const [, force] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 12, top: 96 });

  useEffect(() => controller.subscribe(() => force((n) => n + 1)), [controller]);

  useLayoutEffect(() => {
    // no wiring needed: the top toolbar button is found by its data attribute or (today) by its tooltip
    const title = t("shell.indicators").replace(/"/g, '\\"');
    const el = anchor ?? document.querySelector<HTMLElement>(`[data-tv3-anchor="indicators"], button[title="${title}"]`);
    const r = el?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - WIDTH - 8));
    setPos({ left, top: r.bottom + 6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const active = controller.list();
  // stable order while toggling: on-chart indicators that are not in the popular list first, then the popular ones
  const rows = useMemo(() => {
    const ids: string[] = [];
    for (const i of active) if (!POPULAR.includes(i.id) && !ids.includes(i.id)) ids.push(i.id);
    for (const id of POPULAR) if (getIndicatorDef(id)) ids.push(id);
    return ids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const countOf = (id: string) => active.filter((i) => i.id === id).length;
  const toggle = (id: string, on: boolean) => {
    if (on) controller.add(id);
    else for (const i of controller.list()) if (i.id === id) controller.remove(i.uid);
  };

  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-label={t("ind.title")}
        onMouseDown={(e) => e.stopPropagation()}
        className={`absolute flex max-h-[min(70vh,640px)] flex-col overflow-hidden py-1.5 ${TV3.sheet}`}
        style={{ left: pos.left, top: pos.top, width: Math.min(WIDTH, typeof window !== "undefined" ? window.innerWidth - 16 : WIDTH) }}
      >
        <div className="px-3.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]">{t("ind.title")}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((id, i) => {
            const n = countOf(id);
            const on = n > 0;
            const def = getIndicatorDef(id);
            const nk = `ind.${id}.name`;
            const dk = `ind.${id}.desc`;
            const name = def?.label ?? (t(nk) === nk ? id : t(nk));
            const rawDesc = t(dk) === dk ? "" : t(dk);
            // «Простая скользящая средняя (SMA)» -> primary "SMA", secondary the spelled-out name (design: short name + muted line)
            const abbr = name.match(/^(.*?)\s*\(([A-Za-z0-9 .+/-]{2,14})\)\s*$/);
            // «VWAP (средневзвешенная по объёму)» -> "VWAP" + the spelled-out part
            const lead = !abbr ? name.match(/^([A-Za-z0-9 .+/-]{2,14}?)\s*\((.+)\)\s*$/) : null;
            const title = abbr ? abbr[2] : lead ? lead[1] : name;
            const desc = abbr && abbr[1] ? abbr[1] : lead ? lead[2] : rawDesc;
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(id, !on)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(id, !on);
                  }
                }}
                className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2 hover:bg-[var(--tv3-fill3)] focus:bg-[var(--tv3-fill3)] focus:outline-none ${i > 0 ? "border-t-[0.5px] border-[var(--tv3-hair)]" : ""}`}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(id) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--tv3-text)]">
                    {title}
                    {n > 1 && <span className="ml-1.5 text-xs font-semibold text-[var(--tv3-muted)]">×{n}</span>}
                  </span>
                  <span className="block truncate text-xs text-[var(--tv3-muted)]">{desc}</span>
                </span>
                <Toggle checked={on} onChange={(v) => toggle(id, v)} label={name} />
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onOpenCatalog}
          className={`mx-2.5 mb-1 mt-1.5 shrink-0 px-3 py-2 text-sm font-semibold ${TV3.primary}`}
        >
          {t("ind.pop.all")}
        </button>
      </div>
    </div>
  );
}
