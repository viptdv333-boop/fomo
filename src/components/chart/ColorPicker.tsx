"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* Shared colour picker for the terminal (drawing settings, indicator styles, chart settings).
   TradingView-like popover: grey ramp + hue ramps in 10 columns, recently used, custom colour, opacity slider.
   Values are CSS colours ("#rrggbb" or "rgba(r,g,b,a)"); the picker keeps opacity inside the value. */

const GRAYS = ["#ffffff", "#d1d4dc", "#b2b5be", "#9598a1", "#787b86", "#5d606b", "#434651", "#2a2e39", "#131722", "#000000"];
const HUES = ["#f23645", "#ff9800", "#ffeb3b", "#4caf50", "#089981", "#00bcd4", "#2962ff", "#673ab7", "#9c27b0", "#e91e63"];
// lighter → darker tints of each hue, generated once
function mix(hex: string, to: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (to - v) * amount));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}
const TINTS = [0.85, 0.7, 0.5, 0.25, 0, -0.25, -0.5].map((a) => HUES.map((h) => (a >= 0 ? mix(h, 255, a) : mix(h, 0, -a))));
const PALETTE_ROWS: string[][] = [GRAYS, ...TINTS];

const RECENT_KEY = "fomo-chart-recent-colors";

export function parseColor(input: string | undefined | null): { hex: string; a: number } {
  const s = (input || "").trim();
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) {
    const h = "#" + [m[1], m[2], m[3]].map((v) => Math.min(255, +v).toString(16).padStart(2, "0")).join("");
    return { hex: h, a: m[4] === undefined ? 1 : Math.max(0, Math.min(1, +m[4])) };
  }
  if (/^#[0-9a-f]{6}$/i.test(s)) return { hex: s.toLowerCase(), a: 1 };
  if (/^#[0-9a-f]{3}$/i.test(s)) return { hex: "#" + s.slice(1).split("").map((c) => c + c).join("").toLowerCase(), a: 1 };
  if (/^#[0-9a-f]{8}$/i.test(s)) return { hex: s.slice(0, 7).toLowerCase(), a: parseInt(s.slice(7), 16) / 255 };
  return { hex: "#2962ff", a: 1 };
}

export function composeColor(hex: string, a: number): string {
  if (a >= 0.999) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.round(a * 100) / 100})`;
}

function readRecent(): string[] {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(r) ? r.filter((x) => typeof x === "string").slice(0, 10) : [];
  } catch {
    return [];
  }
}
function pushRecent(c: string) {
  try {
    const next = [c, ...readRecent().filter((x) => x !== c)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

interface Props {
  value: string;
  onChange: (color: string) => void;
  /** Show the opacity slider (default true). */
  opacity?: boolean;
  title?: string;
  /** Swatch button size in px (default 24). */
  size?: number;
  /** Custom trigger content instead of the plain swatch. */
  children?: ReactNode;
  className?: string;
  labels?: { opacity: string; custom: string; recent: string };
}

export default function ColorPicker({ value, onChange, opacity = true, title, size = 24, children, className = "", labels }: Props) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const { hex, a } = parseColor(value);
  const L = labels ?? { opacity: "Opacity", custom: "Custom", recent: "Recent" };

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    const close = (e: MouseEvent | TouchEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const pick = (h: string) => {
    pushRecent(h);
    onChange(composeColor(h, a));
  };

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="rounded-md border border-gray-300 dark:border-gray-600 p-[3px] hover:border-gray-400 dark:hover:border-gray-400 transition-colors"
        style={{ width: size, height: size }}
      >
        {children ?? (
          <span
            className="block w-full h-full rounded-[3px]"
            style={{ background: `linear-gradient(${composeColor(hex, a)}, ${composeColor(hex, a)}), repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 8px 8px` }}
          />
        )}
      </button>
      {open && (
        <div className="absolute z-[80] mt-1 left-0 w-[226px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e222d] shadow-xl p-2.5 text-gray-700 dark:text-gray-200">
          <div className="flex flex-col gap-[3px]">
            {PALETTE_ROWS.map((row, ri) => (
              <div key={ri} className={`flex gap-[3px] ${ri === 0 ? "mb-1" : ""}`}>
                {row.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => pick(c)}
                    title={c}
                    className={`w-[18px] h-[18px] rounded-[3px] border ${c.toLowerCase() === hex ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-white dark:ring-offset-[#1e222d]" : "border-black/10 dark:border-white/10"}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            ))}
          </div>
          {recent.length > 0 && (
            <div className="mt-2">
              <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{L.recent}</div>
              <div className="flex gap-[3px] flex-wrap">
                {recent.map((c) => (
                  <button key={c} type="button" onClick={() => onChange(composeColor(parseColor(c).hex, a))} title={c} className="w-[18px] h-[18px] rounded-[3px] border border-black/10 dark:border-white/10" style={{ background: c }} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <label className="relative w-[18px] h-[18px] rounded-[3px] border border-gray-300 dark:border-gray-600 overflow-hidden cursor-pointer text-center text-[13px] leading-[16px]" title={L.custom}>
              +
              <input type="color" value={hex} onChange={(e) => pick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <input
              value={hex}
              onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && pick(e.target.value.toLowerCase())}
              spellCheck={false}
              className="flex-1 min-w-0 h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 bg-transparent text-[12px] font-mono"
            />
          </div>
          {opacity && (
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400">
                <span>{L.opacity}</span>
                <span>{Math.round(a * 100)}%</span>
              </div>
              <input type="range" min={0} max={100} value={Math.round(a * 100)} onChange={(e) => onChange(composeColor(hex, +e.target.value / 100))} className="w-full accent-blue-500" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
