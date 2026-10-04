"use client";

/* Shared building blocks of the "Terminal v3" design language for popovers / dialogs (see design/SPEC.md).
   Colours come from the `--tv3-*` variables (terminal-v3.css) which follow the site's light/dark mode. */

import type { ReactNode } from "react";

/** Class recipes. */
export const TV3 = {
  /** white 16px-radius sheet / popover with the design shadow (no hard border) */
  sheet: "rounded-2xl bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] outline-none",
  /** popover list container */
  popover: "tv3-pop rounded-2xl text-[var(--tv3-text)] shadow-[var(--tv3-shadow-pop)] outline-none",
  /** dimmed backdrop behind dialogs */
  backdrop: "bg-black/40",
  hair: "border-[var(--tv3-hair)]",
  /** text input / select: 9px radius, #E5E5EA border */
  input:
    "rounded-[9px] border border-[#e5e5ea] bg-[var(--tv3-card)] text-[var(--tv3-text)] outline-none placeholder:text-[var(--tv3-muted)] focus:border-[var(--tv3-accent)] focus:ring-1 focus:ring-[var(--tv3-accent)] dark:border-[#3a3a3c]",
  /** quiet grey fill button */
  btn: "tv3-press rounded-[10px] bg-[var(--tv3-fill)] text-[var(--tv3-text)] hover:bg-[var(--tv3-fill2)] cursor-pointer",
  /** green primary button */
  primary: "tv3-press rounded-[10px] bg-[var(--tv3-accent)] text-white hover:bg-[var(--tv3-accent-hover)] cursor-pointer disabled:opacity-50 active:!bg-[var(--tv3-accent-hover)]",
  /** outlined secondary button */
  outline:
    "tv3-press rounded-[10px] border border-[#e5e5ea] text-[var(--tv3-text)] hover:bg-[var(--tv3-fill)] cursor-pointer dark:border-[#3a3a3c]",
  /** small uppercase caption above a group (design: 12px / 600 / muted) */
  caption: "text-[11px] font-semibold uppercase tracking-[0.3px] text-[var(--tv3-muted)]",
  /** icon button inside a dialog header */
  iconBtn: "tv3-press inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[var(--tv3-text2)] hover:bg-[var(--tv3-fill)] cursor-pointer",
} as const;

/** iOS-style switch (design: 42x26 track, 22px white knob; green when on). `sm` = 34x20 for dense lists. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  sm,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  sm?: boolean;
  className?: string;
}) {
  const w = sm ? 34 : 42;
  const h = sm ? 20 : 26;
  const k = h - 4;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40 ${disabled ? "" : "cursor-pointer"} ${className}`}
      style={{ width: w, height: h, background: checked ? "var(--tv3-on)" : "var(--tv3-fill2)" }}
    >
      <span
        className="absolute rounded-full bg-white transition-[left] duration-200 ease-out motion-reduce:transition-none"
        style={{ top: 2, left: checked ? w - k - 2 : 2, width: k, height: k, boxShadow: "var(--tv3-shadow-tiny)" }}
      />
    </button>
  );
}

/** Segmented control (design: grey rail, white selected segment with a tiny shadow). */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
  size = "md",
}: {
  value: T;
  options: { id: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" className={`inline-flex rounded-[10px] bg-[var(--tv3-fill2)] p-0.5 ${className}`}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            title={o.title}
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={`tv3-press cursor-pointer rounded-[8px] font-semibold ${size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-[13px]"} ${
              on ? "bg-[var(--tv3-card)] text-[var(--tv3-text)] shadow-[0_1px_3px_rgba(0,0,0,0.18)]" : "text-[var(--tv3-text2)]"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
