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
  /** Px from the right edge of the chart (leave room for the price scale). */
  right: number;
}

/** Chips for the symbols compared with the main one: colour, visibility, own scale, remove. */
export default function CompareLegend({ items, onToggle, onRemove, onColor, onMode, right }: Props) {
  const { t } = useT();
  if (items.length === 0) return null;
  const labels = { opacity: t("cs.color.opacity"), custom: t("cs.color.custom"), recent: t("cs.color.recent") };
  return (
    <div className="absolute top-2 z-10 flex flex-col items-end gap-1 pointer-events-none" style={{ right }}>
      {items.map((c) => (
        <div
          key={c.id}
          className={`pointer-events-auto flex items-center gap-1 h-7 pl-1.5 pr-1 rounded-md border border-gray-200 dark:border-[#2a2e39] bg-white/90 dark:bg-[#1e222d]/90 backdrop-blur text-[12px] ${c.visible ? "" : "opacity-60"}`}
        >
          <ColorPicker value={c.color} onChange={(col) => onColor(c.id, col)} opacity={false} size={16} title={t("cs.cmp.color")} labels={labels} />
          <span className="font-semibold text-gray-800 dark:text-gray-100 max-w-[110px] truncate">{c.label}</span>
          {c.loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-[#2962ff] rounded-full animate-spin" />}
          {c.failed && <span className="text-red-500" title={t("cs.cmp.failed")}>!</span>}
          <button
            onClick={() => onMode(c.id, c.mode === "percent" ? "own" : "percent")}
            title={c.mode === "percent" ? t("cs.cmp.toOwn") : t("cs.cmp.toPercent")}
            className="h-5 px-1 rounded text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer"
          >
            {c.mode === "percent" ? "%" : t("cs.cmp.own")}
          </button>
          <button onClick={() => onToggle(c.id)} title={t("cs.cmp.toggle")} className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
            {c.visible ? CS_ICONS.eye : CS_ICONS.eyeOff}
          </button>
          <button onClick={() => onRemove(c.id)} title={t("cs.cmp.remove")} className="w-6 h-6 inline-flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-[#2a2e39] cursor-pointer">
            {CS_ICONS.close}
          </button>
        </div>
      ))}
    </div>
  );
}
