"use client";

import { useT } from "@/lib/i18n/client";
import ColorPicker from "./ColorPicker";
import { CS_ICONS } from "./icons-cs";

export interface CompareItem {
  id: string;
  label: string;
  color: string;
  mode: "percent" | "own";
  visible: boolean;
  loading?: boolean;
  failed?: boolean;
}

interface Props {
  items: CompareItem[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onColor: (id: string, color: string) => void;
  onMode: (id: string, mode: "percent" | "own") => void;
  /** Open the symbol as a candlestick chart in a window of its own (undefined: not possible now). */
  onWindow?: (id: string) => void;
  /** Px from the right edge of the chart (leave room for the price scale). */
  right: number;
  /** Only the chips (no corner of their own): the caller puts them in its own row (next to the indicators pill). */
  inline?: boolean;
}

/** A candlestick in a window: «open as a chart of its own». */
export function CompareWindowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 8v8M15 8v8M7.5 10.5h3v3h-3zM13.5 9.5h3v4h-3z" />
    </svg>
  );
}

/** Chips for the symbols compared with the main one: colour, visibility, own scale, remove. */
export default function CompareLegend({ items, onToggle, onRemove, onColor, onMode, onWindow, right, inline = false }: Props) {
  const { t } = useT();
  if (items.length === 0) return null;
  const labels = { opacity: t("cs.color.opacity"), custom: t("cs.color.custom"), recent: t("cs.color.recent") };
  const chips = (
    <>
      {items.map((c) => (
        <div
          key={c.id}
          className={`pointer-events-auto flex items-center gap-1 h-7 pl-1.5 pr-1 rounded-md border border-[var(--tv3-hair)] bg-[var(--tv3-glass)] backdrop-blur text-[12px] ${c.visible ? "" : "opacity-60"}`}
        >
          <ColorPicker value={c.color} onChange={(col) => onColor(c.id, col)} opacity={false} size={16} title={t("cs.cmp.color")} labels={labels} />
          <span className="font-semibold text-[var(--tv3-text)] max-w-[110px] truncate">{c.label}</span>
          {c.loading && <span className="inline-block w-3 h-3 border-2 border-[var(--tv3-fill2)] border-t-[var(--tv3-accent)] rounded-full animate-spin" />}
          {c.failed && <span className="text-red-500" title={t("cs.cmp.failed")}>!</span>}
          <button
            onClick={() => onMode(c.id, c.mode === "percent" ? "own" : "percent")}
            title={c.mode === "percent" ? t("cs.cmp.toOwn") : t("cs.cmp.toPercent")}
            className="h-5 px-1 rounded text-[10px] font-medium text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] cursor-pointer"
          >
            {c.mode === "percent" ? "%" : t("cs.cmp.own")}
          </button>
          <button onClick={() => onToggle(c.id)} title={t("cs.cmp.toggle")} className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] cursor-pointer">
            {c.visible ? CS_ICONS.eye : CS_ICONS.eyeOff}
          </button>
          {onWindow && (
            <button onClick={() => onWindow(c.id)} title={t("cs.cmp.window")} className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] cursor-pointer">
              <CompareWindowIcon />
            </button>
          )}
          <button onClick={() => onRemove(c.id)} title={t("cs.cmp.remove")} className="w-6 h-6 inline-flex items-center justify-center rounded text-[var(--tv3-muted)] hover:bg-[var(--tv3-fill)] cursor-pointer">
            {CS_ICONS.close}
          </button>
        </div>
      ))}
    </>
  );
  if (inline) return chips;
  return (
    <div className="absolute top-2 z-10 flex flex-col items-end gap-1 pointer-events-none" style={{ right }}>
      {chips}
    </div>
  );
}
