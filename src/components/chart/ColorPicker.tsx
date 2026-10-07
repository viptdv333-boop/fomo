"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./terminal-v3.css";

/* Shared colour picker for the terminal (drawing settings, indicator styles, chart settings).
   TradingView-like popover: grey ramp + hue ramps in 10 columns, recently used, custom colour, opacity slider.
   Values are CSS colours ("#rrggbb" or "rgba(r,g,b,a)"); the picker keeps opacity inside the value.
   The popover is portaled to the page top level and positioned against the VIEWPORT (clamped, flipped above the swatch when there
   is no room below, scrollable when taller than the screen). Inside a dialog's scrolling body an absolute popover was clipped by the
   body: on a phone only a narrow strip of it showed at the bottom / the right edge and could not be opened up. */

const PICKER_W = 226;
const EDGE = 8;

/** Where the popover goes: below the swatch if it fits, else above, else pinned to the top with its own scroll; always inside the screen. */
export function placePicker(
  anchor: { left: number; right: number; top: number; bottom: number },
  panel: { w: number; h: number },
  vw: number,
  vh: number,
): { left: number; top: number; maxHeight: number } {
  const maxHeight = Math.max(120, vh - EDGE * 2);
  const h = Math.min(panel.h, maxHeight);
  let left = anchor.left;
  if (left + panel.w > vw - EDGE) left = anchor.right - panel.w; // the swatch sits at the right edge: open leftwards
  left = Math.max(EDGE, Math.min(left, vw - panel.w - EDGE));
  let top: number;
  if (anchor.bottom + 4 + h <= vh - EDGE) top = anchor.bottom + 4;
  else if (anchor.top - 4 - h >= EDGE) top = anchor.top - 4 - h;
  else top = Math.max(EDGE, Math.min(anchor.bottom + 4, vh - EDGE - h));
  return { left, top, maxHeight };
}

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
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; maxHeight: number } | null>(null);
  const { hex, a } = parseColor(value);
  const L = labels ?? { opacity: "Opacity", custom: "Custom", recent: "Recent" };

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    const close = (e: MouseEvent | TouchEvent) => {
      const n = e.target as Node;
      if (root.current?.contains(n) || panelRef.current?.contains(n)) return;
      setOpen(false);
    };
    // Escape closes only the picker, not the dialog under it
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  // place the popover against the viewport, and again when the screen or a scrolled ancestor moves the swatch
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const b = btnRef.current?.getBoundingClientRect();
      const p = panelRef.current;
      if (!b || !p) return;
      const next = placePicker(b, { w: p.offsetWidth || PICKER_W, h: p.scrollHeight || p.offsetHeight }, window.innerWidth, window.innerHeight);
      setPos((o) => (o && o.left === next.left && o.top === next.top && o.maxHeight === next.maxHeight ? o : next));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, recent.length, opacity]);

  const pick = (h: string) => {
    pushRecent(h);
    onChange(composeColor(h, a));
  };

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        type="button"
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg border border-[var(--tv3-fill2)] p-[3px] hover:border-[var(--tv3-fill2)] transition-colors"
        style={{ width: size, height: size }}
      >
        {children ?? (
          <span
            className="block w-full h-full rounded-[3px]"
            style={{ background: `linear-gradient(${composeColor(hex, a)}, ${composeColor(hex, a)}), repeating-conic-gradient(#8884 0% 25%, transparent 0% 50%) 50% / 8px 8px` }}
          />
        )}
      </button>
      {open &&
        createPortal(
        <div className="tv3" style={{ display: "contents" }}>
        <div
          ref={panelRef}
          className="fixed z-[100] w-[226px] max-w-[calc(100vw-16px)] overflow-y-auto overscroll-contain rounded-xl bg-[var(--tv3-card)] shadow-[var(--tv3-shadow-pop)] p-2.5 text-[var(--tv3-text2)]"
          style={{ left: pos?.left ?? EDGE, top: pos?.top ?? EDGE, maxHeight: pos?.maxHeight, visibility: pos ? "visible" : "hidden" } as CSSProperties}
        >
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
              <div className="text-[10px] uppercase tracking-wide text-[var(--tv3-muted)] mb-1">{L.recent}</div>
              <div className="flex gap-[3px] flex-wrap">
                {recent.map((c) => (
                  <button key={c} type="button" onClick={() => onChange(composeColor(parseColor(c).hex, a))} title={c} className="w-[18px] h-[18px] rounded-[3px] border border-black/10 dark:border-white/10" style={{ background: c }} />
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex items-center gap-2">
            <label className="relative w-[18px] h-[18px] rounded-[3px] border border-[var(--tv3-fill2)] overflow-hidden cursor-pointer text-center text-[13px] leading-[16px]" title={L.custom}>
              +
              <input type="color" value={hex} onChange={(e) => pick(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
            <input
              value={hex}
              onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && pick(e.target.value.toLowerCase())}
              spellCheck={false}
              className="flex-1 min-w-0 h-6 px-1.5 rounded-[9px] border border-[var(--tv3-fill2)] bg-transparent text-[12px] font-mono"
            />
          </div>
          {opacity && (
            <div className="mt-2">
              <div className="flex justify-between text-[11px] text-[var(--tv3-muted)]">
                <span>{L.opacity}</span>
                <span>{Math.round(a * 100)}%</span>
              </div>
              <input type="range" min={0} max={100} value={Math.round(a * 100)} onChange={(e) => onChange(composeColor(hex, +e.target.value / 100))} className="w-full accent-blue-500" />
            </div>
          )}
        </div>
        </div>,
        document.fullscreenElement ?? document.body,
        )}
    </div>
  );
}
